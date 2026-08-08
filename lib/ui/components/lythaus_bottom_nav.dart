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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final leftHanded = ref.watch(leftHandedModeProvider);

    final items = <BottomNavigationBarItem>[
      const BottomNavigationBarItem(
        icon: Icon(Icons.explore_outlined),
        label: 'Discover',
      ),
      const BottomNavigationBarItem(
        icon: Icon(Icons.add_circle_outline),
        label: 'Create',
      ),
      const BottomNavigationBarItem(
        icon: Icon(Icons.person_outline),
        label: 'Profile',
      ),
    ];

    final orderedItems = leftHanded ? items.reversed.toList() : items;
    final displayIndex = leftHanded
        ? orderedItems.length - 1 - currentIndex
        : currentIndex;

    return BottomNavigationBar(
      type: BottomNavigationBarType.fixed,
      currentIndex: displayIndex,
      onTap: (index) {
        final logicalIndex = leftHanded
            ? orderedItems.length - 1 - index
            : index;
        onTap(logicalIndex);
      },
      items: orderedItems,
    );
  }
}
