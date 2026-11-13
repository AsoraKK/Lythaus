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
    this.onCreate,
    this.onRefresh,
    this.selectedFocusNode,
  });
  final List<String> ids;
  final List<String> labels;
  final String selectedId;
  final ValueChanged<String> onSelect;
  final VoidCallback? onCreate;
  final VoidCallback? onRefresh;
  final FocusNode? selectedFocusNode;

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
            alignment: .5,
            duration: MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 180),
          );
        }
      });
    }
  }

  void _select(String id) {
    if (id != widget.selectedId) widget.onSelect(id);
  }

  void _move(int offset) {
    if (widget.ids.isEmpty) return;
    final index = widget.ids.indexOf(widget.selectedId);
    _select(widget.ids[(index + offset).clamp(0, widget.ids.length - 1)]);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Semantics(
      label: 'Feeds',
      container: true,
      child: CallbackShortcuts(
        bindings: {
          const SingleActivator(LogicalKeyboardKey.arrowRight): () => _move(1),
          const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _move(-1),
          if (widget.ids.isNotEmpty) ...{
            const SingleActivator(LogicalKeyboardKey.home): () =>
                _select(widget.ids.first),
            const SingleActivator(LogicalKeyboardKey.end): () =>
                _select(widget.ids.last),
          },
        },
        child: DecoratedBox(
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.outlineVariant)),
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Row(
              children: [
                for (var index = 0; index < widget.ids.length; index++)
                  Padding(
                    key: _keys.putIfAbsent(widget.ids[index], GlobalKey.new),
                    padding: const EdgeInsets.only(right: 20),
                    child: Semantics(
                      selected: widget.ids[index] == widget.selectedId,
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          border: Border(
                            bottom: BorderSide(
                              color: widget.ids[index] == widget.selectedId
                                  ? colors.primary
                                  : colors.surface,
                              width: 2,
                            ),
                          ),
                        ),
                        child: Tooltip(
                          message: widget.ids[index] == widget.selectedId
                              ? '${widget.labels[index]} · Feed controls'
                              : widget.labels[index],
                          child: TextButton(
                            focusNode: widget.ids[index] == widget.selectedId
                                ? widget.selectedFocusNode
                                : null,
                            style: TextButton.styleFrom(
                              minimumSize: const Size(48, 48),
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              foregroundColor:
                                  widget.ids[index] == widget.selectedId
                                  ? colors.primary
                                  : colors.onSurface,
                              shape: const RoundedRectangleBorder(),
                            ),
                            onPressed: () => widget.onSelect(widget.ids[index]),
                            child: ConstrainedBox(
                              constraints: BoxConstraints(
                                maxWidth:
                                    (MediaQuery.sizeOf(context).width - 72)
                                        .clamp(160, 320),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Flexible(
                                    child: Text(
                                      widget.labels[index],
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  if (widget.ids[index] ==
                                      widget.selectedId) ...[
                                    const SizedBox(width: 6),
                                    const Icon(Icons.tune, size: 16),
                                  ],
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
