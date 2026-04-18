import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

Future<String?> decodeQrFromImageImpl(XFile imageFile) async {
  final controller = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  try {
    final capture = await controller.analyzeImage(imageFile.path);
    if (capture == null) {
      return null;
    }

    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value != null && value.isNotEmpty) {
        return value;
      }
    }
    return null;
  } finally {
    controller.dispose();
  }
}
