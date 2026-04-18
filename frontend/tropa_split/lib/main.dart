import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'freighter_interop.dart';
import 'qr_image_decoder.dart';
import 'stellar_service.dart';
import 'qr_scan_sheet.dart';

void main() => runApp(const TropaSplitApp());

class TropaSplitApp extends StatelessWidget {
  const TropaSplitApp({super.key, this.enableLiveSync = true});

  final bool enableLiveSync;

  @override
  Widget build(BuildContext context) {
    final baseText = GoogleFonts.spaceGroteskTextTheme();

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0A8F8A),
          brightness: Brightness.light,
        ),
        textTheme: baseText,
        scaffoldBackgroundColor: const Color(0xFFF4F7F5),
        appBarTheme: AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          centerTitle: false,
          titleTextStyle: baseText.titleLarge?.copyWith(
            color: const Color(0xFF0F1F1D),
            fontWeight: FontWeight.w700,
          ),
        ),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
          ),
        ),
        useMaterial3: true,
      ),
      home: MainNavigation(enableLiveSync: enableLiveSync),
    );
  }
}

class MainNavigation extends StatefulWidget {
  const MainNavigation({super.key, this.enableLiveSync = true});

  final bool enableLiveSync;

  @override
  State<MainNavigation> createState() => _MainNavigationState();
}

class _MainNavigationState extends State<MainNavigation> {
  int _selectedIndex = 1;
  final StellarService _stellarService = StellarService();
  Timer? _pollingTimer;
  double _liveBalance = 0.0;
  String? _currentUserAddress;
  String? _payerJoinedSplitId;

  final List<SplitSession> _splits = [
    SplitSession(
      id: 'lunch-session',
      title: 'Lunch Split Session',
      description: 'A quick lunch split with a few wallets.',
      targetAmount: 30.0,
      accent: const Color(0xFF0A8F8A),
      isExpanded: true,
      hostAddress: '',
    ),
  ];

  int _activeSplitIndex = 0;

  Color get _roleAccent =>
      _isViewingAsHost ? const Color(0xFF0A8F8A) : const Color(0xFFE76F51);

  bool get _isViewingAsHost {
    final currentUserAddress = _currentUserAddress;
    if (currentUserAddress == null) {
      return false;
    }
    return _activeSplit.hostAddress == currentUserAddress;
  }

  String get _roleLabel => _currentUserAddress == null
      ? 'Guest'
      : (_isViewingAsHost ? 'Host' : 'Payer');

  String get _viewerWalletAddress => _currentUserAddress ?? '';

  SplitSession get _activeSplit =>
      _splits[_activeSplitIndex.clamp(0, _splits.length - 1)];

  List<SplitSession> get _visibleSplits {
    if (_currentUserAddress == null) {
      return _splits;
    }
    if (_isViewingAsHost) {
      return _splits
          .where((split) => split.hostAddress == _currentUserAddress)
          .toList();
    }
    if (_payerJoinedSplitId == null) {
      return [];
    }
    return _splits.where((split) => split.id == _payerJoinedSplitId).toList();
  }

  Iterable<Participant> get _allParticipants =>
      _splits.expand((split) => split.participants);

  double get totalTarget =>
      _allParticipants.fold(0, (sum, item) => sum + item.shareAmount);

  double get totalCollected => _allParticipants
      .where((participant) => participant.isPaid)
      .fold(0, (sum, participant) => sum + participant.shareAmount);

  @override
  void initState() {
    super.initState();
    if (widget.enableLiveSync) {
      _refreshBalance();
      _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) {
        _refreshBalance();
      });
    }
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  Future<void> _connectWallet() async {
    try {
      final address = await Freighter.connect();
      if (!mounted) {
        return;
      }

      setState(() {
        _currentUserAddress = address;
        if (!_isViewingAsHost) {
          _payerJoinedSplitId ??= _activeSplit.id;
        }
      });
      await _refreshBalance();
    } on FreighterUserRejectedException catch (e) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not connect Freighter: $e')),
      );
    }
  }

  bool _requireConnectedWallet() {
    if (_currentUserAddress != null) {
      return true;
    }

    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Connect Freighter first.')));
    return false;
  }

  Future<void> _refreshBalance() async {
    final balance = await _stellarService.fetchAvailableBalance(
      fallbackPaidAmount: _allParticipants
          .where((participant) => participant.isPaid)
          .fold(0, (sum, participant) => sum + participant.shareAmount),
    );

    final participants = _allParticipants.toList(growable: false);
    final wallets = participants
        .map((participant) => participant.walletAddress)
        .where((wallet) => wallet.isNotEmpty)
        .toList(growable: false);
    final walletSnapshots = await Future.wait(
      wallets.map((wallet) => _stellarService.fetchWalletSnapshot(wallet)),
    );
    final walletSnapshotMap = <String, WalletSnapshot>{
      for (var i = 0; i < wallets.length; i++) wallets[i]: walletSnapshots[i],
    };

    if (!mounted) {
      return;
    }

    setState(() {
      _liveBalance = balance;
      for (final participant in participants) {
        final snapshot = walletSnapshotMap[participant.walletAddress];
        participant.walletBalance = snapshot?.balanceXlm ?? 0.0;
        participant.walletExists = snapshot?.exists ?? false;
      }
    });
  }

  String _shortenPublicKey(String key) {
    if (key.isEmpty || key.contains('...') || key.length <= 12) {
      return key;
    }
    final start = key.substring(0, 6);
    final end = key.substring(key.length - 4);
    return '$start...$end';
  }

  Future<void> handlePayment(
    Participant participant, {
    required String destinationPublicKey,
  }) async {
    if (participant.isPaid || participant.isProcessing) {
      return;
    }

    final sourcePublicKey = _currentUserAddress;
    if (sourcePublicKey == null) {
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Connect Freighter first.')));
      return;
    }

    setState(() {
      participant.isProcessing = true;
    });

    try {
      await _stellarService.submitPayment(
        sourcePublicKey: sourcePublicKey,
        destinationPublicKey: destinationPublicKey,
        amount: participant.shareAmount,
      );

      if (!mounted) {
        return;
      }

      setState(() {
        participant.isPaid = true;
        participant.isProcessing = false;
      });
      await _refreshBalance();
    } on FreighterUserRejectedException catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        participant.isProcessing = false;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        participant.isProcessing = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Payment failed on the blockchain: $e')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final screens = <Widget>[
      _buildPlaceholder(
        title: 'Home Dashboard',
        subtitle: 'Smart expense summaries will appear here.',
      ),
      _buildSplitScreen(),
      _buildPlaceholder(
        title: 'History',
        subtitle: 'Past split sessions will appear here.',
      ),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('TropaSplit'),
        actions: [
          TextButton.icon(
            onPressed: _connectWallet,
            icon: Icon(
              Icons.account_balance_wallet_rounded,
              color: _roleAccent,
            ),
            label: Text(
              _currentUserAddress == null
                  ? 'Connect Wallet'
                  : _shortenPublicKey(_currentUserAddress!),
              style: TextStyle(color: _roleAccent),
            ),
          ),
          if (_isViewingAsHost)
            IconButton(
              icon: Icon(Icons.person_add_alt_1_rounded, color: _roleAccent),
              onPressed: _showAddParticipantSheet,
            ),
          IconButton(
            icon: Icon(Icons.qr_code_scanner, color: _roleAccent),
            onPressed: _showQrActionsSheet,
          ),
          Padding(
            padding: const EdgeInsets.only(right: 16),
            child: CircleAvatar(
              radius: 16,
              backgroundColor: _roleAccent.withValues(alpha: 0.16),
              child: Icon(Icons.wallet_rounded, size: 18, color: _roleAccent),
            ),
          ),
        ],
      ),
      body: screens[_selectedIndex],
      floatingActionButton: _selectedIndex == 1
          ? FloatingActionButton.extended(
              onPressed: _showAddSplitSheet,
              backgroundColor: _roleAccent,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Add split'),
            )
          : null,
      bottomNavigationBar: NavigationBar(
        height: 68,
        indicatorColor: const Color(0xFFD4F0EA),
        selectedIndex: _selectedIndex,
        onDestinationSelected: (index) =>
            setState(() => _selectedIndex = index),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.restaurant_rounded),
            label: 'Split',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_rounded),
            label: 'History',
          ),
        ],
      ),
    );
  }

  Widget _buildPlaceholder({required String title, required String subtitle}) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          '$title\n$subtitle',
          textAlign: TextAlign.center,
          style: Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(color: const Color(0xFF4C6260)),
        ),
      ),
    );
  }

  Widget _buildSplitScreen() {
    final progress = totalTarget == 0 ? 0.0 : totalCollected / totalTarget;
    final activeSplit = _activeSplit;

    return Stack(
      children: [
        Positioned(
          top: -80,
          right: -30,
          child: Container(
            width: 220,
            height: 220,
            decoration: BoxDecoration(
              shape: BoxShape.circle, //
              gradient: LinearGradient(
                //
                colors: [
                  const Color(0xFF4DD9C8).withValues(alpha: 0.28),
                  const Color(0xFF4DD9C8).withValues(alpha: 0.05),
                ],
              ),
            ),
          ),
        ),
        Positioned(
          bottom: -90,
          left: -50,
          child: Container(
            width: 200,
            height: 200,
            decoration: BoxDecoration(
              shape: BoxShape.circle, //
              gradient: LinearGradient(
                //
                colors: [
                  const Color(0xFFFFC067).withValues(alpha: 0.22),
                  const Color(0xFFFFC067).withValues(alpha: 0.04),
                ],
              ),
            ),
          ),
        ),
        ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    _isViewingAsHost
                        ? const Color(0xFF053A42)
                        : const Color(0xFF4E1F14),
                    _roleAccent,
                  ],
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Multiple split sessions',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 260),
                    child: Text(
                      '${_splits.length} split cards',
                      key: ValueKey<int>(_splits.length),
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                          ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Active split: ${activeSplit.title} • ${_allParticipants.length} wallets total • Live wallet ${_liveBalance.toStringAsFixed(1)} XLM',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.white.withValues(alpha: 0.8),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      'Viewing as $_roleLabel',
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 9, //
                      backgroundColor: Colors.white.withValues(alpha: 0.24),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        Color(0xFFFFD166),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            Row(
              children: [
                Text(
                  'Your splits',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: const Color(0xFF0F1F1D),
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const Spacer(),
                TextButton.icon(
                  onPressed: _showAddSplitSheet,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Add split'),
                ),
              ],
            ),
            const SizedBox(height: 10),
            if (_visibleSplits.isEmpty)
              _buildEmptyParticipantsState(
                message: _isViewingAsHost
                    ? 'No splits yet. Add one to get started.'
                    : 'No joined split yet. Import the host QR image to join.',
              ),
            ..._visibleSplits.map((split) {
              final realIndex = _splits.indexOf(split);
              return _splitCard(realIndex, split);
            }),
          ],
        ),
      ],
    );
  }

  Widget _splitCard(int index, SplitSession split) {
    final paidCount = split.participants
        .where((participant) => participant.isPaid)
        .length;
    final paidTarget = split.participants
        .where((participant) => participant.isPaid)
        .fold(0.0, (sum, participant) => sum + participant.shareAmount);
    final progress = split.targetAmount == 0
        ? 0.0
        : paidTarget / split.targetAmount;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: const Color(0xFFDCE8E4)),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: ValueKey(split.id),
          initiallyExpanded: split.isExpanded,
          onExpansionChanged: (expanded) {
            setState(() {
              split.isExpanded = expanded;
              _activeSplitIndex = index;
            });
          },
          tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          leading: CircleAvatar(
            backgroundColor: split.accent.withValues(alpha: 0.16),
            child: Icon(Icons.restaurant_rounded, color: split.accent),
          ),
          title: Text(
            split.title,
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            '${split.participants.length} wallets • $paidCount/${split.participants.length} paid • Target ${split.targetAmount.toStringAsFixed(1)} XLM',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: const Color(0xFF607775)),
          ),
          children: [
            LinearProgressIndicator(
              value: progress,
              minHeight: 9,
              backgroundColor: split.accent.withValues(alpha: 0.15),
              valueColor: AlwaysStoppedAnimation<Color>(split.accent),
            ),
            const SizedBox(height: 14),
            Text(
              split.description,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: const Color(0xFF4C6260)),
            ),
            const SizedBox(height: 14),
            if (_isViewingAsHost)
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  OutlinedButton.icon(
                    onPressed: () => _showSplitQrSheet(split),
                    icon: const Icon(Icons.qr_code_rounded),
                    label: const Text('Share QR'),
                  ),
                  ElevatedButton.icon(
                    onPressed: () =>
                        _showAddParticipantSheet(splitIndex: index),
                    icon: const Icon(Icons.person_add_alt_1_rounded),
                    label: const Text('Add wallet'),
                  ),
                ],
              ),
            const SizedBox(height: 18),
            Text(
              'Wallets in this split',
              style: Theme.of(
                context,
              ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            if (split.participants.isEmpty)
              _buildEmptyParticipantsState(
                message: 'Add a wallet to this split to show it here.',
              )
            else
              ...split.participants.map((participant) {
                final canPay =
                    participant.walletAddress == _viewerWalletAddress &&
                    participant.walletAddress != split.hostAddress;
                return _participantTile(
                  participant,
                  canPay: canPay,
                  destinationPublicKey: split.hostAddress,
                );
              }),
          ],
        ),
      ),
    );
  }

  Widget _buildEmptyParticipantsState({required String message}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FBFA),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFDCE8E4)),
      ),
      child: Text(
        message,
        style: Theme.of(
          context,
        ).textTheme.bodySmall?.copyWith(color: const Color(0xFF607775)),
      ),
    );
  }

  Widget _participantTile(
    Participant participant, {
    required bool canPay,
    required String destinationPublicKey,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: participant.isPaid
                ? const Color(0xFF2A9D8F).withValues(alpha: 0.45)
                : const Color(0xFFDCE8E4),
          ),
        ),
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 8,
          ),
          leading: CircleAvatar(
            backgroundColor: participant.accent.withValues(alpha: 0.16),
            child: Text(
              participant.name.isNotEmpty ? participant.name[0] : '?',
              style: TextStyle(
                color: participant.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          title: Text(
            participant.name,
            style: Theme.of(
              context,
            ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(
            '${_shortenPublicKey(participant.walletAddress)} - Share ${participant.shareAmount.toStringAsFixed(1)} XLM - Wallet ${participant.walletBalance.toStringAsFixed(2)} XLM${participant.walletExists ? '' : ' • not funded yet'}',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: const Color(0xFF607775)),
          ),
          trailing: participant.isPaid
              ? Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFDAF4EC),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.check_circle,
                        size: 16,
                        color: Color(0xFF0E8C67),
                      ),
                      SizedBox(width: 5),
                      Text(
                        'Paid',
                        style: TextStyle(
                          color: Color(0xFF0E8C67),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                )
              : !canPay
              ? Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF3F6F6),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'Waiting',
                    style: TextStyle(
                      color: Color(0xFF607775),
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                )
              : ElevatedButton(
                  onPressed: participant.isProcessing
                      ? null //
                      : () {
                          handlePayment(
                            participant,
                            destinationPublicKey: destinationPublicKey,
                          );
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF0A8F8A),
                    foregroundColor: Colors.white,
                  ),
                  child: participant.isProcessing
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Pay'),
                ),
        ),
      ),
    );
  }

  Future<void> _showAddParticipantSheet({int? splitIndex}) async {
    if (!_isViewingAsHost) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Only the split host can add wallets.')),
      );
      return;
    }

    final targetSplitIndex = splitIndex ?? _activeSplitIndex;
    final nameController = TextEditingController();
    final walletController = TextEditingController();
    final amountController = TextEditingController(text: '10');

    final result = await showModalBottomSheet<Participant?>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(25.0)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Add wallet', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: 'Name'),
              ),
              TextField(
                controller: walletController,
                decoration: const InputDecoration(
                  labelText: 'Stellar wallet address',
                ),
              ),
              TextField(
                controller: amountController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Share amount (XLM)',
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    final name = nameController.text.trim();
                    final wallet = walletController.text.trim();
                    final amount =
                        double.tryParse(amountController.text.trim()) ?? 0.0;
                    Navigator.of(context).pop(
                      Participant(
                        name: name.isEmpty ? 'Unnamed wallet' : name,
                        walletAddress: wallet,
                        shareAmount: amount <= 0 ? 10.0 : amount,
                        accent: const Color(0xFF0A8F8A),
                      ),
                    );
                  },
                  child: const Text('Add wallet'),
                ),
              ),
            ],
          ),
        );
      },
    );

    nameController.dispose();
    walletController.dispose();
    amountController.dispose();

    if (result == null || !mounted) {
      return;
    }

    setState(() {
      _splits[targetSplitIndex].participants.add(result);
      _splits[targetSplitIndex].isExpanded = true;
      _activeSplitIndex = targetSplitIndex;
    });
    await _refreshBalance();
  }

  Future<void> _showAddSplitSheet() async {
    if (!_requireConnectedWallet()) {
      return;
    }

    final titleController = TextEditingController(text: 'New split');
    final descriptionController = TextEditingController(
      text: 'A fresh split session.',
    );
    final targetController = TextEditingController(text: '20');

    final result = await showModalBottomSheet<SplitSession?>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(25.0)),
      ),
      builder: (context) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Add split', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 12),
              TextField(
                controller: titleController,
                decoration: const InputDecoration(labelText: 'Split title'),
              ),
              TextField(
                controller: descriptionController,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              TextField(
                controller: targetController,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: 'Target amount (XLM)',
                ),
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    final title = titleController.text.trim();
                    final description = descriptionController.text.trim();
                    final targetAmount =
                        double.tryParse(targetController.text.trim()) ?? 20.0;
                    Navigator.of(context).pop(
                      SplitSession(
                        id: _generateSplitId(),
                        title: title.isEmpty ? 'New split' : title,
                        description: description.isEmpty
                            ? 'A fresh split session.'
                            : description,
                        targetAmount: targetAmount <= 0 ? 20.0 : targetAmount,
                        accent: _splitAccentForIndex(_splits.length),
                        isExpanded: true,
                        hostAddress: _currentUserAddress ?? '',
                        participants: _defaultParticipantsForTarget(
                          targetAmount <= 0 ? 20.0 : targetAmount,
                          hostAddress: _currentUserAddress ?? '',
                        ),
                      ),
                    );
                  },
                  child: const Text('Add split'),
                ),
              ),
            ],
          ),
        );
      },
    );

    titleController.dispose();
    descriptionController.dispose();
    targetController.dispose();

    if (result == null || !mounted) {
      return;
    }

    setState(() {
      _splits.add(result);
      _activeSplitIndex = _splits.length - 1;
    });
    await _refreshBalance();
  }

  Future<void> _showQrActionsSheet() async {
    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(25.0)),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'QR options',
                  style: Theme.of(sheetContext).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  'Share the active split QR or import a QR image to join a split.',
                  style: Theme.of(sheetContext).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF607775),
                  ),
                ),
                const SizedBox(height: 16),
                if (_isViewingAsHost)
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: () {
                        Navigator.of(sheetContext).pop();
                        _showSplitQrSheet(_activeSplit);
                      },
                      icon: const Icon(Icons.qr_code_rounded),
                      label: const Text('Show split QR'),
                    ),
                  ),
                if (_isViewingAsHost) const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: () async {
                      Navigator.of(sheetContext).pop();
                      await _importQrImage();
                    },
                    icon: const Icon(Icons.image_rounded),
                    label: const Text('Import QR Image'),
                  ),
                ),
                const SizedBox(height: 10),
                if (!kIsWeb)
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () async {
                        Navigator.of(sheetContext).pop();
                        final scannedValue = await showModalBottomSheet<String>(
                          context: context,
                          isScrollControlled: true,
                          useSafeArea: true,
                          backgroundColor: Colors.transparent,
                          builder: (context) => const WalletQrScannerSheet(),
                        );
                        if (scannedValue != null) {
                          await _handleScannedPayload(scannedValue);
                        }
                      },
                      icon: const Icon(Icons.qr_code_scanner_rounded),
                      label: const Text('Scan wallet QR'),
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Future<void> _showSplitQrSheet(SplitSession split) async {
    final payload = _splitInvitePayload(split);
    debugPrint('HOST_SPLIT_QR_JSON: $payload');
    await showModalBottomSheet<void>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(25.0)),
      ),
      builder: (context) => _buildJoinQRCodeBottomSheet(split),
    );
  }

  Future<void> _importQrImage() async {
    final picker = ImagePicker();
    final image = await picker.pickImage(source: ImageSource.gallery);
    if (image == null) {
      return;
    }

    try {
      final payload = await decodeQrFromImage(image);
      if (payload == null || payload.isEmpty) {
        if (!mounted) {
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('No QR code was found in that image.')),
        );
        return;
      }

      await _handleScannedPayload(payload);
    } catch (e) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not decode the QR image: $e')),
      );
    }
  }

  Future<void> _handleScannedPayload(String payload) async {
    final trimmedPayload = payload.trim();
    final scannedSplit = _splitSessionFromPayload(trimmedPayload);
    if (scannedSplit != null) {
      setState(() {
        final existingIndex = _splits.indexWhere(
          (split) => split.id == scannedSplit.id,
        );
        if (existingIndex >= 0) {
          _activeSplitIndex = existingIndex;
          _splits[existingIndex].isExpanded = true;
        } else {
          _splits.add(scannedSplit);
          _activeSplitIndex = _splits.length - 1;
        }
        if (_currentUserAddress != null &&
            !scannedSplit.participants.any(
              (participant) => participant.walletAddress == _currentUserAddress,
            )) {
          scannedSplit.participants.add(
            Participant(
              name: 'Connected wallet',
              walletAddress: _currentUserAddress!,
              shareAmount: (scannedSplit.targetAmount / 2).clamp(
                1.0,
                double.infinity,
              ),
              accent: const Color(0xFFE76F51),
            ),
          );
        }
        if (!_isViewingAsHost) {
          _payerJoinedSplitId = scannedSplit.id;
        }
      });
      await _refreshBalance();
      return;
    }

    final parsedParticipant = _participantFromPayload(trimmedPayload);
    if (parsedParticipant == null) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Could not use that QR code. Scan a wallet address or a participant payload.',
          ),
        ),
      );
      return;
    }

    setState(() {
      if (!_isViewingAsHost) {
        _payerJoinedSplitId = _activeSplit.id;
      }
      _activeSplit.participants.add(parsedParticipant);
      _activeSplit.isExpanded = true;
    });
    await _refreshBalance();
  }

  SplitSession? _splitSessionFromPayload(String payload) {
    final jsonPayload = _decodeJsonPayload(payload);
    if (jsonPayload == null) {
      return null;
    }

    final type = jsonPayload['type']?.toString();
    if (type != 'split-invite' && jsonPayload['splitId'] == null) {
      return null;
    }

    final splitId =
        (jsonPayload['splitId'] ?? jsonPayload['id'] ?? _generateSplitId())
            .toString()
            .trim();
    final title =
        (jsonPayload['title'] ?? jsonPayload['name'] ?? 'Scanned split')
            .toString()
            .trim();
    final description = (jsonPayload['description'] ?? 'Imported from QR code')
        .toString()
        .trim();
    final targetAmount =
        double.tryParse((jsonPayload['targetAmount'] ?? 20).toString()) ?? 20.0;
    final accentValue = jsonPayload['accent'];
    final accent = accentValue is int
        ? Color(accentValue)
        : const Color(0xFF0A8F8A);

    final participantsPayload = jsonPayload['participants'];
    final importedParticipants = <Participant>[];
    final hostAddress = (jsonPayload['hostAddress'] ?? '').toString().trim();
    if (participantsPayload is List) {
      for (final item in participantsPayload) {
        if (item is! Map) {
          continue;
        }
        final wallet = (item['walletAddress'] ?? item['address'] ?? '')
            .toString()
            .trim();
        if (!_looksLikeStellarAddress(wallet)) {
          continue;
        }
        final name = (item['name'] ?? 'Imported wallet').toString().trim();
        final amount =
            double.tryParse(
              (item['shareAmount'] ?? item['amount'] ?? 0).toString(),
            ) ??
            0.0;
        importedParticipants.add(
          Participant(
            name: name.isEmpty ? 'Imported wallet' : name,
            walletAddress: wallet,
            shareAmount: amount <= 0 ? 10.0 : amount,
            accent: accent,
            isPaid: (item['isPaid'] ?? false) == true,
          ),
        );
      }
    }

    if (importedParticipants.isEmpty) {
      if (_looksLikeStellarAddress(hostAddress)) {
        importedParticipants.add(
          Participant(
            name: 'Host',
            walletAddress: hostAddress,
            shareAmount: (targetAmount / 2)
                .clamp(1.0, double.infinity)
                .toDouble(),
            accent: accent,
          ),
        );
      } else {
        importedParticipants.addAll(
          _defaultParticipantsForTarget(targetAmount, hostAddress: hostAddress),
        );
      }
    }

    if (hostAddress.isNotEmpty &&
        !importedParticipants.any(
          (participant) => participant.walletAddress == hostAddress,
        )) {
      importedParticipants.insert(
        0,
        Participant(
          name: 'Host',
          walletAddress: hostAddress,
          shareAmount: (targetAmount / 2)
              .clamp(1.0, double.infinity)
              .toDouble(),
          accent: accent,
        ),
      );
    }

    if (_currentUserAddress != null &&
        !importedParticipants.any(
          (participant) => participant.walletAddress == _currentUserAddress,
        )) {
      importedParticipants.add(
        Participant(
          name: 'Connected wallet',
          walletAddress: _currentUserAddress!,
          shareAmount: (targetAmount / 2)
              .clamp(1.0, double.infinity)
              .toDouble(),
          accent: const Color(0xFFE76F51),
        ),
      );
    }

    return SplitSession(
      id: splitId.isEmpty ? _generateSplitId() : splitId,
      title: title.isEmpty ? 'Scanned split' : title,
      description: description.isEmpty ? 'Imported from QR code' : description,
      targetAmount: targetAmount <= 0 ? 20.0 : targetAmount,
      accent: accent,
      isExpanded: true,
      hostAddress: hostAddress,
      participants: importedParticipants,
    );
  }

  Map<String, dynamic>? _decodeJsonPayload(String payload) {
    if (!payload.startsWith('{')) {
      return null;
    }

    try {
      final decoded = jsonDecode(payload);
      if (decoded is Map<String, dynamic>) {
        return decoded;
      }
    } catch (_) {
      return null;
    }
    return null;
  }

  Participant? _participantFromPayload(String payload) {
    final jsonPayload = _decodeJsonPayload(payload);

    final walletAddress =
        (jsonPayload?['walletAddress'] ?? jsonPayload?['address'] ?? payload)
            .toString()
            .trim();
    if (!_looksLikeStellarAddress(walletAddress)) {
      return null;
    }

    final name =
        (jsonPayload?['name'] ??
                jsonPayload?['displayName'] ??
                'Scanned wallet')
            .toString()
            .trim();
    final shareAmount =
        double.tryParse(
          (jsonPayload?['shareAmount'] ?? jsonPayload?['amount'] ?? 10)
              .toString(),
        ) ??
        10.0;

    return Participant(
      name: name.isEmpty ? 'Scanned wallet' : name,
      walletAddress: walletAddress,
      shareAmount: shareAmount <= 0 ? 10.0 : shareAmount,
      accent: const Color(0xFF0A8F8A),
    );
  }

  bool _looksLikeStellarAddress(String value) {
    return RegExp(r'^G[A-Z2-7]{55}$').hasMatch(value);
  }

  Widget _buildJoinQRCodeBottomSheet(SplitSession split) {
    return SizedBox(height: 340, child: Center(child: _buildJoinQRCode(split)));
  }

  Widget _buildJoinQRCode(SplitSession split) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            'Share this split QR',
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Text(
            'People can scan this to join or import this split session.',
            textAlign: TextAlign.center,
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: const Color(0xFF607775)),
          ),
          const SizedBox(height: 14),
          QrImageView(
            data: _splitInvitePayload(split),
            version: QrVersions.auto,
            size: 200.0,
            eyeStyle: const QrEyeStyle(
              eyeShape: QrEyeShape.circle,
              color: Color(0xFF0A8F8A),
            ),
            dataModuleStyle: const QrDataModuleStyle(
              dataModuleShape: QrDataModuleShape.circle,
              color: Color(0xFF053A42),
            ),
          ),
        ],
      ),
    );
  }

  String _splitInvitePayload(SplitSession split) {
    return jsonEncode(<String, dynamic>{
      'type': 'split-invite',
      'splitId': split.id,
      'hostAddress': split.hostAddress,
      'title': split.title,
      'description': split.description,
      'targetAmount': split.targetAmount,
      'accent': split.accent.toARGB32(),
      'participants': split.participants
          .map(
            (participant) => <String, dynamic>{
              'name': participant.name,
              'walletAddress': participant.walletAddress,
              'shareAmount': participant.shareAmount,
              'isPaid': participant.isPaid,
            },
          )
          .toList(),
    });
  }

  List<Participant> _defaultParticipantsForTarget(
    double targetAmount, {
    required String hostAddress,
  }) {
    final safeTarget = targetAmount <= 0 ? 20.0 : targetAmount;
    final splitShare = safeTarget / 2;
    if (hostAddress.isEmpty) {
      return [];
    }
    return [
      Participant(
        name: 'Host',
        walletAddress: hostAddress,
        shareAmount: splitShare,
        accent: const Color(0xFF0A8F8A),
      ),
    ];
  }

  String _generateSplitId() {
    return DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  }

  Color _splitAccentForIndex(int index) {
    const colors = [
      Color(0xFF0A8F8A),
      Color(0xFF1C7C7A),
      Color(0xFFFFA62B),
      Color(0xFF6A8D92),
      Color(0xFFE76F51),
    ];
    return colors[index % colors.length];
  }
}

class Participant {
  Participant({
    required this.name,
    required this.walletAddress,
    required this.shareAmount,
    required this.accent,
    this.isPaid = false,
    this.isProcessing = false,
    this.walletBalance = 0.0,
    this.walletExists = false,
  });

  final String name;
  final String walletAddress;
  final double shareAmount;
  final Color accent;
  bool isPaid;
  bool isProcessing;
  double walletBalance;
  bool walletExists;
}

class SplitSession {
  SplitSession({
    required this.id,
    required this.title,
    required this.description,
    required this.targetAmount,
    required this.accent,
    required this.hostAddress,
    this.isExpanded = false,
    List<Participant>? participants,
  }) : participants = participants ?? [];

  final String id;
  final String title;
  final String description;
  final double targetAmount;
  final Color accent;
  final String hostAddress;
  final List<Participant> participants;
  bool isExpanded;
}
