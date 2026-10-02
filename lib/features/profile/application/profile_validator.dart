// ignore_for_file: public_member_api_docs

// Lightweight client-side pre-check for profile text
class ProfileValidator {
  static const _badWords = {'fuck', 'shit', 'bitch', 'asshole', 'bastard'};
  static final _separators = RegExp(
    r'''[\s.,!?;:_@/\\|"'()[\]{}<>+=~`#$%^&*\-\u2010-\u2015\u2018-\u201f\u2022]+''',
    unicode: true,
  );
  static final _invisible = RegExp(
    r'[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]',
    unicode: true,
  );

  static bool _hasDisallowedWords(String value) {
    final folded = value
        .replaceAllMapped(
          RegExp(r'[\uff01-\uff5e]', unicode: true),
          (match) => String.fromCharCode(match[0]!.codeUnitAt(0) - 0xfee0),
        )
        .replaceAll(_invisible, '')
        .toLowerCase();
    return folded.split(_separators).any(_badWords.contains);
  }

  static String? validateDisplayName(String? value) {
    final v = (value ?? '').trim();
    if (v.isEmpty) return 'Display name is required';
    if (v.length > 160) return 'Use at most 160 characters';
    if (RegExp(r'[\u0000-\u001f\u007f-\u009f\u2028\u2029]').hasMatch(v) ||
        _hasDisallowedWords(v)) {
      return 'Please choose a different display name';
    }
    return null;
  }

  static String? validateBio(String? value) {
    final v = (value ?? '').trim();
    if (v.isEmpty) return null;
    if (v.length > 2000) return 'Use at most 2000 characters';
    if (_hasDisallowedWords(v)) return 'Please remove profane language';
    return null;
  }
}
