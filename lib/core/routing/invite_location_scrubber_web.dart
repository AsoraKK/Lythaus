// ignore_for_file: public_member_api_docs

import 'package:web/web.dart' as web;

import 'package:lythaus/core/routing/invite_location.dart';

String? inviteCodeFromBrowserLocation() {
  final current = Uri.tryParse(web.window.location.href);
  if (current == null ||
      current.path != '/invite' ||
      current.fragment.isEmpty) {
    return null;
  }
  try {
    final token = Uri.splitQueryString(current.fragment)['token'];
    return token == null || token.isEmpty ? null : token;
  } on FormatException {
    return null;
  }
}

bool browserInvitePathNeedsScrubbing() {
  final current = Uri.tryParse(web.window.location.href);
  return current?.path.startsWith('/invite/') == true;
}

void scrubInviteCodeFromBrowserUrl() {
  final current = Uri.parse(web.window.location.href);
  final safeLocation = inviteLocationWithoutCode(current);
  if (safeLocation == current.toString()) return;
  web.window.history.replaceState(web.window.history.state, '', safeLocation);
}
