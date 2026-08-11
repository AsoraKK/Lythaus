// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';

import 'package:lythaus/ui/screens/profile/reputation_ledger_screen.dart';

/// Entry point for appeal history under the current private activity contract.
///
/// The API does not expose a stand-alone appeal list. Appeal records and their
/// outcomes are shown in account activity, and a new appeal starts only from
/// an eligible resolved moderation case.
class AppealHistoryScreen extends StatelessWidget {
  const AppealHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Appeals')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Semantics(
            liveRegion: true,
            label: 'Appeal records are available in account activity',
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.gavel_outlined, size: 48),
                const SizedBox(height: 16),
                Text(
                  'Appeal records live in account activity',
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Lythaus records appeal state and outcomes. New appeals are '
                  'available only from an eligible resolved moderation case.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ReputationLedgerScreen(),
                    ),
                  ),
                  icon: const Icon(Icons.history_outlined),
                  label: const Text('View account activity'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
