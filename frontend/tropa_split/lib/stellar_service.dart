import 'package:flutter/foundation.dart';
import 'package:stellar_flutter_sdk/stellar_flutter_sdk.dart' as stellar;

import 'freighter_interop.dart';

class StellarService {
  // Setup for Testnet
  final stellar.Network network = stellar.Network.TESTNET;
  final stellar.SorobanServer sorobanServer = stellar.SorobanServer(
    'https://soroban-testnet.stellar.org',
  );
  final stellar.StellarSDK sdk = stellar.StellarSDK.TESTNET;
  final String contractId =
      "CAHMF6XTZPWDDMQ4PBMKP3ZHI4REAJC4R5SEQCHDF4U6PFY4QENHVU36";

  double _cachedBalance = 0.0;

  /// Fetches balance-like data for the split screen.
  Future<double> fetchAvailableBalance({
    required double fallbackPaidAmount,
  }) async {
    try {
      final health = await sorobanServer.getHealth();
      if (health.status == stellar.GetHealthResponse.HEALTHY) {
        _cachedBalance = fallbackPaidAmount;
      }
      return _cachedBalance;
    } catch (e) {
      debugPrint('Error fetching balance: $e');
      return _cachedBalance;
    }
  }

  /// Fetches native XLM balance for one wallet address.
  Future<double> fetchWalletBalance(String accountId) async {
    try {
      final account = await sdk.accounts.account(accountId);
      final native = account.balances.firstWhere(
        (balance) => balance.assetType == 'native',
      );
      return double.tryParse(native.balance) ?? 0.0;
    } catch (e) {
      debugPrint('Error fetching wallet balance for $accountId: $e');
      return 0.0;
    }
  }

  /// Returns a snapshot for display purposes so wallets can still show up
  /// even when they are not yet funded or the account does not exist.
  Future<WalletSnapshot> fetchWalletSnapshot(String accountId) async {
    try {
      final account = await sdk.accounts.account(accountId);
      final native = account.balances.firstWhere(
        (balance) => balance.assetType == 'native',
      );
      return WalletSnapshot(
        balanceXlm: double.tryParse(native.balance) ?? 0.0,
        exists: true,
      );
    } catch (e) {
      debugPrint('Wallet snapshot unavailable for $accountId: $e');
      return const WalletSnapshot(balanceXlm: 0.0, exists: false);
    }
  }

  /// Fetches native XLM balances for a list of wallet addresses.
  Future<Map<String, double>> fetchWalletBalances(
    List<String> accountIds,
  ) async {
    final valid = accountIds.where((id) => id.trim().isNotEmpty).toList();
    final entries = await Future.wait(
      valid.map((id) async {
        final value = await fetchWalletBalance(id);
        return MapEntry(id, value);
      }),
    );
    return Map.fromEntries(entries);
  }

  /// Submits a payment to the blockchain.
  Future<String> submitPayment({
    required String sourcePublicKey,
    required String destinationPublicKey,
    required double amount,
  }) async {
    final health = await sorobanServer.getHealth();
    if (health.status != stellar.GetHealthResponse.HEALTHY) {
      throw StateError('Soroban RPC is not healthy right now.');
    }

    final account = await sdk.accounts.account(sourcePublicKey);
    final transaction = stellar.TransactionBuilder(account)
        .addOperation(
          stellar.PaymentOperationBuilder(
            destinationPublicKey,
            stellar.AssetTypeNative(),
            amount.toStringAsFixed(7),
          ).build(),
        )
        .setMaxOperationFee(stellar.AbstractTransaction.MIN_BASE_FEE)
        .build();

    final unsignedXdr = transaction.toEnvelopeXdrBase64();
    final signedXdr = await Freighter.signTransaction(
      unsignedXdr,
      networkPassphrase: network.networkPassphrase,
      address: sourcePublicKey,
    );
    final signedTransaction = stellar.AbstractTransaction.fromEnvelopeXdrString(
      signedXdr,
    );

    if (signedTransaction is! stellar.Transaction) {
      throw StateError('Freighter returned an unsupported transaction type.');
    }

    final response = await sorobanServer.sendTransaction(signedTransaction);
    if (response.isErrorResponse) {
      throw StateError(
        response.error?.message ?? 'The network rejected the transaction.',
      );
    }

    _cachedBalance += amount;
    return signedXdr;
  }
}

class WalletSnapshot {
  const WalletSnapshot({required this.balanceXlm, required this.exists});

  final double balanceXlm;
  final bool exists;
}
