import 'package:image_picker/image_picker.dart';

import 'qr_image_decoder_native.dart'
    if (dart.library.html) 'qr_image_decoder_web.dart';

Future<String?> decodeQrFromImage(XFile imageFile) {
  return decodeQrFromImageImpl(imageFile);
}
