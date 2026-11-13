import 'package:flutter_test/flutter_test.dart';
import 'package:lythaus/core/routing/invite_location.dart';

void main() {
  test(
    'invite fragments and legacy path codes are removed from browser history',
    () {
      expect(
        inviteLocationWithoutCode(
          Uri.parse('https://app.lythaus.co/invite#token=one-time-secret'),
        ),
        '/invite',
      );
      expect(
        inviteLocationWithoutCode(
          Uri.parse('https://app.lythaus.co/invite/legacy-secret?source=email'),
        ),
        '/invite',
      );
    },
  );

  test('non-invite locations are preserved', () {
    const location = 'https://app.lythaus.co/login?next=%2Ffeed#section';
    expect(inviteLocationWithoutCode(Uri.parse(location)), location);
  });
}
