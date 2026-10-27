// ignore_for_file: public_member_api_docs

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lythaus/features/media/application/private_image_upload.dart';

class PrivateImageUploadCard extends ConsumerStatefulWidget {
  const PrivateImageUploadCard({super.key, required this.canEdit});
  final bool canEdit;

  @override
  ConsumerState<PrivateImageUploadCard> createState() =>
      _PrivateImageUploadCardState();
}

class _PrivateImageUploadCardState extends ConsumerState<PrivateImageUploadCard>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    ref
        .read(privateImageUploadProvider.notifier)
        .setForeground(state == AppLifecycleState.resumed);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(privateImageUploadProvider);
    final controller = ref.read(privateImageUploadProvider.notifier);
    final status = state.status?.status;
    final description = switch (status) {
      'review' =>
        'Image processing finished. Safety and authenticity checks have not run.',
      'queued' =>
        'Private image processing is queued. Safety and authenticity checks have not run.',
      'pending' =>
        'The private upload is pending. Safety and authenticity checks have not run.',
      'rejected' =>
        'This image could not be processed. No authenticity result is available.',
      'expired' => 'This upload expired. No authenticity result is available.',
      'cancelled' =>
        'This upload was cancelled. No authenticity result is available.',
      _ =>
        state.hasImage
            ? 'Image selected on this device.'
            : 'Choose a PNG or JPEG image up to 10 MiB.',
    };
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Private image upload',
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 8),
            const Text(
              'Images cannot be attached to posts yet. Uploading keeps the image private and does not certify it as safe or human-authored. Image selections are not saved when you leave this composer.',
            ),
            const SizedBox(height: 8),
            Semantics(liveRegion: true, child: Text(description)),
            if (state.busy) ...[
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: state.progress,
                semanticsLabel: 'Private image upload in progress',
              ),
            ],
            if (state.error != null) ...[
              const SizedBox(height: 8),
              Semantics(liveRegion: true, child: Text(state.error!)),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (!state.started)
                  OutlinedButton.icon(
                    onPressed: widget.canEdit && !state.busy
                        ? () => controller.choose(
                            ref.read(privateImagePickerProvider),
                          )
                        : null,
                    icon: const Icon(Icons.add_photo_alternate_outlined),
                    label: Text(
                      state.hasImage ? 'Choose another image' : 'Choose image',
                    ),
                  ),
                if (state.hasImage &&
                    (status == null ||
                        state.status!.isPending ||
                        state.error != null))
                  FilledButton(
                    onPressed: widget.canEdit && !state.busy
                        ? controller.upload
                        : null,
                    child: Text(
                      state.error != null
                          ? 'Retry same upload'
                          : state.started
                          ? 'Check image status'
                          : 'Upload privately',
                    ),
                  ),
                if (state.hasImage)
                  TextButton(
                    onPressed: !state.busy ? controller.clear : null,
                    child: const Text('Clear selection'),
                  ),
              ],
            ),
            if (state.hasImage)
              Text(
                state.started
                    ? 'Clear the selection to submit text only. Clearing it does not delete an uploaded image.'
                    : 'Clear the image selection to submit text only.',
              ),
          ],
        ),
      ),
    );
  }
}
