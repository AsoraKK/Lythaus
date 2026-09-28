import 'package:flutter/material.dart';

/// A fixed-size account image with an initial while loading or unavailable.
class LythAvatar extends StatelessWidget {
  /// Creates an avatar using an existing image and account display name.
  const LythAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.diameter = 64,
  });

  /// Accessible account name and source for the fallback initial.
  final String name;

  /// Optional existing account image; absent and failed images use the initial.
  final String? imageUrl;

  /// Reserved width and height in logical pixels.
  final double diameter;

  @override
  Widget build(BuildContext context) {
    final label = name.trim();
    final fallback = Center(
      child: Text(label.isEmpty ? '?' : String.fromCharCode(label.runes.first)),
    );
    final url = imageUrl?.trim();
    return Semantics(
      image: true,
      label: label.isEmpty ? 'Account avatar' : 'Avatar for $label',
      child: ExcludeSemantics(
        child: CircleAvatar(
          radius: diameter / 2,
          child: url == null || url.isEmpty
              ? fallback
              : ClipOval(
                  child: Image.network(
                    url,
                    width: diameter,
                    height: diameter,
                    fit: BoxFit.cover,
                    loadingBuilder: (_, child, progress) =>
                        progress == null ? child : fallback,
                    errorBuilder: (_, error, stack) => fallback,
                  ),
                ),
        ),
      ),
    );
  }
}
