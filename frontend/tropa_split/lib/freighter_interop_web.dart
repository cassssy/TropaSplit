// ignore_for_file: deprecated_member_use, avoid_web_libraries_in_flutter

import 'dart:js_util' as js_util;

import 'package:js/js.dart';

@JS('freighterApi')
external _FreighterApi? get _freighterApi;

@JS()
@anonymous
class _FreighterApi {
  external dynamic requestAccess();
  external dynamic getAddress();
  external dynamic signTransaction(String xdr, [dynamic options]);
}

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
    final api = _freighterApi;
    if (api == null) {
      throw FreighterException('Freighter is not available in this browser.');
    }

    final accessResponse = await js_util.promiseToFuture<dynamic>(
      api.requestAccess(),
    );
    final error = _readError(accessResponse);
    if (error != null) {
      throw _toFreighterException(error);
    }

    final connectedAddress = _readAddress(accessResponse);
    if (connectedAddress.isEmpty) {
      final addressResponse = await js_util.promiseToFuture<dynamic>(
        api.getAddress(),
      );
      final addressError = _readError(addressResponse);
      if (addressError != null) {
        throw _toFreighterException(addressError);
      }

      final address = _readAddress(addressResponse);
      if (address.isEmpty) {
        throw FreighterException('Freighter returned an empty public key.');
      }
      return address;
    }

    return connectedAddress;
  }

  static Future<String> signTransaction(
    String xdrString, {
    String? networkPassphrase,
    String? address,
  }) async {
    final api = _freighterApi;
    if (api == null) {
      throw FreighterException('Freighter is not available in this browser.');
    }

    final options = <String, dynamic>{
      if (networkPassphrase != null && networkPassphrase.isNotEmpty)
        'networkPassphrase': networkPassphrase,
      if (address != null && address.isNotEmpty) 'address': address,
    };

    final signResponse = await js_util.promiseToFuture<dynamic>(
      api.signTransaction(xdrString, options.isEmpty ? null : options),
    );
    final error = _readError(signResponse);
    if (error != null) {
      throw _toFreighterException(error);
    }

    final signedTransaction = _readSignedTransaction(signResponse);
    if (signedTransaction.isEmpty) {
      throw FreighterException('Freighter did not return a signed XDR.');
    }

    return signedTransaction;
  }

  static String _readAddress(dynamic response) {
    if (response == null) {
      return '';
    }

    final publicKey = _readStringProperty(response, 'publicKey');
    if (publicKey.isNotEmpty) {
      return publicKey;
    }

    final address = _readStringProperty(response, 'address');
    if (address.isNotEmpty) {
      return address;
    }

    return '';
  }

  static String _readSignedTransaction(dynamic response) {
    if (response == null) {
      return '';
    }

    final signedTxXdr = _readStringProperty(response, 'signedTxXdr');
    if (signedTxXdr.isNotEmpty) {
      return signedTxXdr;
    }

    final signedTransaction = _readStringProperty(
      response,
      'signedTransaction',
    );
    if (signedTransaction.isNotEmpty) {
      return signedTransaction;
    }

    return '';
  }

  static String? _readError(dynamic response) {
    if (response == null) {
      return null;
    }

    final errorValue = js_util.getProperty(response, 'error');
    if (errorValue == null) {
      return null;
    }

    if (errorValue is String) {
      return errorValue.trim().isEmpty ? null : errorValue;
    }

    final message = _readStringProperty(errorValue, 'message');
    if (message.isNotEmpty) {
      return message;
    }

    return errorValue.toString();
  }

  static String _readStringProperty(dynamic response, String key) {
    if (response == null) {
      return '';
    }

    try {
      final value = js_util.getProperty(response, key);
      if (value == null) {
        return '';
      }
      return value.toString().trim();
    } catch (_) {
      return '';
    }
  }

  static FreighterException _toFreighterException(String message) {
    final lowerMessage = message.toLowerCase();
    if (lowerMessage.contains('reject') ||
        lowerMessage.contains('declin') ||
        lowerMessage.contains('cancel')) {
      return FreighterUserRejectedException(message);
    }
    return FreighterException(message);
  }
}
