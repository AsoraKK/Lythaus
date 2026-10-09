// ignore_for_file: public_member_api_docs

class PresentationPreferences {
  const PresentationPreferences({
    this.leftHandedMode = false,
    this.horizontalSwipeEnabled = true,
    this.version = 1,
  });

  final bool leftHandedMode;
  final bool horizontalSwipeEnabled;
  final int version;

  factory PresentationPreferences.fromJson(Map<String, dynamic> json) {
    final version = json['version'];
    if (json['leftHandedMode'] is! bool ||
        json['horizontalSwipeEnabled'] is! bool ||
        version is! int ||
        version < 1) {
      throw const FormatException('Invalid presentation preferences');
    }
    return PresentationPreferences(
      leftHandedMode: json['leftHandedMode'] as bool,
      horizontalSwipeEnabled: json['horizontalSwipeEnabled'] as bool,
      version: version,
    );
  }

  Map<String, dynamic> toJson() => {
    'leftHandedMode': leftHandedMode,
    'horizontalSwipeEnabled': horizontalSwipeEnabled,
    'version': version,
  };
}
