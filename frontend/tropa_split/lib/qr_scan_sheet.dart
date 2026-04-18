import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class WalletQrScannerSheet extends StatefulWidget {
  const WalletQrScannerSheet({super.key});

  @override
  State<WalletQrScannerSheet> createState() => _WalletQrScannerSheetState();
}

class _WalletQrScannerSheetState extends State<WalletQrScannerSheet> {
  late final MobileScannerController _controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _didReturnResult = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleDetect(BarcodeCapture capture) {
    if (_didReturnResult) {
      return;
    }

    String? rawValue;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value != null && value.isNotEmpty) {
        rawValue = value;
        break;
      }
    }

    if (rawValue == null) {
      return;
    }

    _didReturnResult = true;
    unawaited(_controller.stop());
    if (!mounted) {
      return;
    }
    Navigator.of(context).pop(rawValue);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.82,
        child: Container(
          decoration: const BoxDecoration(
            color: Color(0xFFF4F7F5),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Scan a wallet QR',
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.close_rounded),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  'Point the camera at a Stellar wallet QR or a participant payload.',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: const Color(0xFF607775),
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        border: Border.all(color: const Color(0xFFDCE8E4)),
                        color: Colors.black,
                      ),
                      child: kIsWeb
                          ? Center(
                              child: Padding(
                                padding: const EdgeInsets.all(24),
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.camera_alt_outlined,
                                      color: Colors.white,
                                      size: 40,
                                    ),
                                    const SizedBox(height: 12),
                                    Text(
                                      'Browser camera scan is not enabled here.',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleMedium
                                          ?.copyWith(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                          ),
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Use Manual Import in the app to paste a split or wallet JSON payload when running in Arc.',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(color: Colors.white70),
                                    ),
                                  ],
                                ),
                              ),
                            )
                          : MobileScanner(
                              controller: _controller,
                              onDetect: _handleDetect,
                              errorBuilder: (context, error) {
                                return Center(
                                  child: Padding(
                                    padding: const EdgeInsets.all(20),
                                    child: Text(
                                      'Camera unavailable: ${error.errorCode}',
                                      textAlign: TextAlign.center,
                                      style: Theme.of(
                                        context,
                                      ).textTheme.bodyMedium,
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  'A raw Stellar wallet address works. JSON payloads with name and walletAddress also work.',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: const Color(0xFF607775),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
