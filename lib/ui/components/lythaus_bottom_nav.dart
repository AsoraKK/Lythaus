// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lythaus/state/providers/settings_providers.dart';

class LythausBottomNav extends ConsumerWidget {
  const LythausBottomNav({
    super.key,
    required this.currentIndex,
    required this.onTap,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;

  static const _destinations = [
    (0, 'Feed', Icons.home_outlined, Icons.home),
    (4, 'Search', Icons.search, Icons.search),
    (5, 'Notifications', Icons.notifications_outlined, Icons.notifications),
    (2, 'Profile', Icons.person_outline, Icons.person),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leftHanded = ref.watch(leftHandedModeProvider);
    final destinations = leftHanded
        ? _destinations.reversed.toList()
        : _destinations;
    final colors = Theme.of(context).colorScheme;
    final scale = MediaQuery.textScalerOf(context).scale(12) / 12;
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Semantics(
          container: true,
          explicitChildNodes: true,
          label: 'Main navigation',
          child: LayoutBuilder(
            builder: (context, constraints) {
              // At large text sizes, use two rows instead of truncating labels.
              final columns = constraints.maxWidth / scale < 300 ? 2 : 4;
              final width = constraints.maxWidth / columns;
              return Wrap(
                children: [
                  for (final item in destinations)
                    SizedBox(
                      width: width,
                      child: Semantics(
                        button: true,
                        selected: currentIndex == item.$1,
                        child: InkWell(
                          onTap: () => onTap(item.$1),
                          child: Container(
                            constraints: const BoxConstraints(minHeight: 64),
                            padding: const EdgeInsets.symmetric(vertical: 7),
                            color: currentIndex == item.$1
                                ? colors.surfaceContainer
                                : colors.surface,
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  currentIndex == item.$1 ? item.$4 : item.$3,
                                  color: currentIndex == item.$1
                                      ? colors.primary
                                      : colors.onSurface,
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  item.$2,
                                  textAlign: TextAlign.center,
                                  style: Theme.of(context).textTheme.labelMedium
                                      ?.copyWith(
                                        color: currentIndex == item.$1
                                            ? colors.primary
                                            : colors.onSurface,
                                      ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
