// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter_test/flutter_test.dart';

import 'package:tropa_split/main.dart';

void main() {
  testWidgets('renders split overview', (WidgetTester tester) async {
    await tester.pumpWidget(const TropaSplitApp(enableLiveSync: false));

    expect(find.text('TropaSplit'), findsOneWidget);
    expect(find.text('Multiple split sessions'), findsOneWidget);
    expect(find.text('Your splits'), findsOneWidget);
    expect(find.text('Lunch Split Session'), findsOneWidget);
    expect(find.text('Wallets in this split'), findsOneWidget);
  });
}
