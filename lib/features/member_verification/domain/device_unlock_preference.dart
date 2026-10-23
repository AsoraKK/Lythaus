// ignore_for_file: public_member_api_docs

enum DeviceUnlockPreference {
  off('off', 'Off', null),
  everyReopen('every_reopen', 'Every reopen', Duration.zero),
  afterOneMinute('after_1_minute', 'After 1 minute away', Duration(minutes: 1)),
  afterFiveMinutes(
    'after_5_minutes',
    'After 5 minutes away',
    Duration(minutes: 5),
  ),
  afterFifteenMinutes(
    'after_15_minutes',
    'After 15 minutes away',
    Duration(minutes: 15),
  );

  const DeviceUnlockPreference(this.value, this.label, this.awayInterval);

  final String value;
  final String label;
  final Duration? awayInterval;

  static DeviceUnlockPreference parse(String value) => values.firstWhere(
    (preference) => preference.value == value,
    orElse: () =>
        throw const FormatException('Unknown draft unlock preference'),
  );
}
