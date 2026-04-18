class FreighterException implements Exception {
  FreighterException(this.message);

  final String message;

  @override
  String toString() => message;
}

class FreighterUserRejectedException extends FreighterException {
  FreighterUserRejectedException(super.message);
}

class Freighter {
  static Future<String> connect() async {
    throw FreighterException('Freighter is only available in the browser.');
  }

  static Future<String> signTransaction(
    String xdrString, {
    String? networkPassphrase,
    String? address,
  }) async {
    throw FreighterException('Freighter is only available in the browser.');
  }
}
