// ignore_for_file: public_member_api_docs
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class FeedNavigationRail extends StatefulWidget {
  const FeedNavigationRail({
    super.key,
    required this.ids,
    required this.labels,
    required this.selectedId,
    required this.onSelect,
    required this.onCreate,
    this.onRefresh,
  });
  final List<String> ids;
  final List<String> labels;
  final String selectedId;
  final ValueChanged<String> onSelect;
  final VoidCallback onCreate;
  final VoidCallback? onRefresh;

  @override
  State<FeedNavigationRail> createState() => _FeedNavigationRailState();
}

class _FeedNavigationRailState extends State<FeedNavigationRail> {
  final _keys = <String, GlobalKey>{};

  @override
  void didUpdateWidget(FeedNavigationRail oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.selectedId != widget.selectedId) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final selected = _keys[widget.selectedId]?.currentContext;
        if (mounted && selected != null) {
          Scrollable.ensureVisible(
            selected,
            alignment: 0.5,
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 180),
          );
        }
      });
    }
  }

  void _move(int offset) {
    final index = widget.ids.indexOf(widget.selectedId);
    widget.onSelect(
      widget.ids[(index + offset).clamp(0, widget.ids.length - 1)],
    );
  }

  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Feeds',
    container: true,
    child: CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.arrowRight): () => _move(1),
        const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _move(-1),
        const SingleActivator(LogicalKeyboardKey.home): () =>
            widget.onSelect(widget.ids.first),
        const SingleActivator(LogicalKeyboardKey.end): () =>
            widget.onSelect(widget.ids.last),
      },
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
              child: Row(
                children: [
                  for (var index = 0; index < widget.ids.length; index++)
                    Padding(
                      key: _keys.putIfAbsent(widget.ids[index], GlobalKey.new),
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                        showCheckmark: true,
                        side: BorderSide.none,
                        shape: const StadiumBorder(),
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        label: Text(widget.labels[index]),
                        tooltip: widget.ids[index] == 'discover'
                            ? 'Public posts, newest first.'
                            : null,
                        selected: widget.ids[index] == widget.selectedId,
                        onSelected: (_) => widget.onSelect(widget.ids[index]),
                      ),
                    ),
                  IconButton(
                    tooltip: 'Create custom feed',
                    onPressed: widget.onCreate,
                    style: IconButton.styleFrom(
                      minimumSize: const Size(48, 48),
                    ),
                    icon: const Icon(Icons.add),
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            tooltip: 'Refresh feed',
            onPressed: widget.onRefresh,
            icon: const Icon(Icons.refresh, size: 20),
          ),
          const SizedBox(width: 8),
        ],
      ),
    ),
  );
}
