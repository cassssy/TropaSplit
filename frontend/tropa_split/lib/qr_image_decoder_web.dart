// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter

import 'dart:async';
import 'dart:html' as html;
import 'dart:js_util' as js_util;

import 'package:image_picker/image_picker.dart';

Future<String?> decodeQrFromImageImpl(XFile imageFile) async {
  final detectorConstructor = js_util.getProperty(
    html.window,
    'BarcodeDetector',
  );
  if (detectorConstructor == null) {
    return null;
  }

  final bytes = await imageFile.readAsBytes();
  final blob = html.Blob([bytes]);
  final url = html.Url.createObjectUrlFromBlob(blob);

  try {
    final image = html.ImageElement(src: url);
    await image.onLoad.first.timeout(const Duration(seconds: 10));

    final detector = js_util.callConstructor(detectorConstructor, [
      <String>['qr_code'],
    ]);
    final results = await js_util.promiseToFuture<dynamic>(
      js_util.callMethod(detector, 'detect', [image]),
    );

    if (results is! List) {
      return null;
    }

    for (final item in results) {
      final rawValue = js_util.getProperty(item, 'rawValue');
      if (rawValue != null) {
        final value = rawValue.toString().trim();
        if (value.isNotEmpty) {
          return value;
        }
      }
    }

    return null;
  } finally {
    html.Url.revokeObjectUrl(url);
  }
}
