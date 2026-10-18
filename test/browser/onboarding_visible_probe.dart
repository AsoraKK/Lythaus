// Fixture-only navigation and read-only state. No frame or focus requests.
// ignore_for_file: public_member_api_docs
import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/core/network/pending_authenticated_operations.dart';
import 'package:lythaus/features/auth/application/auth_providers.dart';
import 'package:lythaus/features/auth/presentation/auth_choice_screen.dart';
import 'package:lythaus/ui/screens/onboarding/onboarding_intro.dart';

import 'onboarding_visible_route.dart';

@JS('globalThis.__readVisibleHostState')
external set stateReader(JSFunction reader);
@JS('globalThis.__presentOnboardingComponent')
external set componentPresenter(JSFunction presenter);

void installVisibleOnboardingProbe() {
  var presented = false;
  PageRoute<void>? componentRoute;
  final events = <Map<String, Object?>>[];

  List<Element> currentElements(bool Function(Widget) matches) {
    final found = <Element>[];
    void visit(Element element) {
      final widget = element.widget;
      if (widget is Offstage && widget.offstage) return;
      if (matches(widget)) {
        found.add(element);
      }
      element.visitChildElements(visit);
    }

    final root = WidgetsBinding.instance.rootElement;
    if (root != null) visit(root);
    return found;
  }

  Map<String, Object?> readState() {
    final login = currentElements((widget) => widget is AuthChoiceScreen);
    final onboarding = currentElements(
      (widget) => widget is OnboardingIntroScreen,
    );
    final marker = currentElements(
      (widget) =>
          widget is Text && widget.data == 'Synthetic continuation completed',
    );
    final candidates = [...login, ...onboarding, ...marker];
    final context = candidates.isEmpty ? null : candidates.first;
    final navigator = context == null ? null : Navigator.of(context);
    var materialApps = 0;
    var navigators = 0;
    void count(Element element) {
      if (element.widget is MaterialApp) materialApps++;
      if (element.widget is Navigator) navigators++;
      element.visitChildElements(count);
    }

    final root = WidgetsBinding.instance.rootElement;
    if (root != null) count(root);
    final container = context == null
        ? null
        : ProviderScope.containerOf(context, listen: false);
    final auth = container?.read(authStateProvider);
    final focus = FocusManager.instance.primaryFocus;
    return {
      'visibleLogin': login.length,
      'visibleOnboarding': onboarding.length,
      'visibleMarker': marker.length,
      'materialApps': materialApps,
      'navigators': navigators,
      'navigatorId': navigator == null ? null : identityHashCode(navigator),
      'configuredPageNames': navigator?.widget.pages
          .map((page) => page.name)
          .toList(),
      'componentRouteName': componentRoute?.settings.name,
      'componentRouteCurrent': componentRoute?.isCurrent,
      'componentRouteFirst': componentRoute?.isFirst,
      'canPop': navigator?.canPop(),
      'auth': auth == null
          ? 'unavailable'
          : auth.isLoading
          ? 'loading'
          : auth.hasError
          ? 'error'
          : auth.valueOrNull == null
          ? 'signed-out'
          : 'signed-in',
      'guest': container?.read(guestModeProvider),
      'pendingAuthenticatedWork': container
          ?.read(pendingAuthenticatedOperationsProvider)
          .hasPending,
      'semanticsEnabled': WidgetsBinding.instance.semanticsEnabled,
      'focusedEditable':
          focus?.context?.findAncestorWidgetOfExactType<EditableText>() != null,
      'presented': presented,
      'events': List<Map<String, Object?>>.of(events),
    };
  }

  stateReader = (() => jsonEncode(readState()).toJS).toJS;
  componentPresenter = (() {
    final before = readState();
    if (presented) {
      return jsonEncode({
        'accepted': false,
        'reason': 'already-presented',
      }).toJS;
    }
    if (before['visibleLogin'] != 1 ||
        before['visibleOnboarding'] != 0 ||
        before['auth'] != 'signed-out' ||
        before['guest'] != false ||
        before['pendingAuthenticatedWork'] != false ||
        before['semanticsEnabled'] != false ||
        before['focusedEditable'] != false ||
        before['materialApps'] != 1 ||
        before['navigators'] != 1) {
      return jsonEncode({
        'accepted': false,
        'reason': 'host-is-not-settled-visible-signed-out-login',
        'before': before,
      }).toJS;
    }
    final navigator = Navigator.of(
      currentElements((widget) => widget is AuthChoiceScreen).single,
    );
    presented = true;
    events.add({
      'event': 'presentation-request',
      'epochMs': DateTime.now().microsecondsSinceEpoch / 1000,
      'navigatorId': identityHashCode(navigator),
      'routeName': onboardingComponentRouteName,
      'transitionMilliseconds': 0,
      'requestFocus': false,
    });
    componentRoute = onboardingComponentRoute();
    unawaited(navigator.push(componentRoute!));
    return jsonEncode({'accepted': true, 'before': before}).toJS;
  }).toJS;
}
