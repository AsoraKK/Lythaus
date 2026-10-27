import 'package:flutter/material.dart';
import 'package:lythaus/design_system/tokens/semantic_colors.dart';

/// LYTHAUS CONTENT TYPE HELPER UTILITY
///
/// 🎯 Purpose: Helper functions for different content types
/// ✅ Features: Icons, labels, and metadata for content types
/// 🔧 Usage: Static methods for consistent content type handling
/// 📱 Platform: Flutter with Material Design icons

class ContentTypeHelper {
  /// Get appropriate icon for content type
  static IconData getIcon(String contentType) {
    switch (contentType.toLowerCase()) {
      case 'post':
        return Icons.article;
      case 'comment':
        return Icons.comment;
      case 'image':
        return Icons.image;
      case 'video':
        return Icons.videocam;
      case 'audio':
        return Icons.audiotrack;
      case 'link':
        return Icons.link;
      case 'poll':
        return Icons.poll;
      case 'event':
        return Icons.event;
      case 'group':
        return Icons.group;
      case 'message':
        return Icons.message;
      default:
        return Icons.help_outline;
    }
  }

  /// Get display label for content type
  static String getLabel(String contentType) {
    switch (contentType.toLowerCase()) {
      case 'post':
        return 'Post';
      case 'comment':
        return 'Comment';
      case 'image':
        return 'Image';
      case 'video':
        return 'Video';
      case 'audio':
        return 'Audio';
      case 'link':
        return 'Link';
      case 'poll':
        return 'Poll';
      case 'event':
        return 'Event';
      case 'group':
        return 'Group';
      case 'message':
        return 'Message';
      default:
        return 'Content';
    }
  }

  /// Get color for content type
  static Color getColor(String contentType) {
    switch (contentType.toLowerCase()) {
      case 'post':
        return LythSemanticColors.info;
      case 'comment':
        return LythSemanticColors.success;
      case 'image':
        return LythSemanticColors.accent;
      case 'video':
        return LythSemanticColors.danger;
      case 'audio':
        return LythSemanticColors.warning;
      case 'link':
        return LythSemanticColors.accent;
      case 'poll':
        return LythSemanticColors.accent;
      case 'event':
        return LythSemanticColors.warning;
      case 'group':
        return LythSemanticColors.accent;
      case 'message':
        return LythSemanticColors.accent;
      default:
        return LythSemanticColors.text;
    }
  }

  /// Check if content type supports preview
  static bool supportsPreview(String contentType) {
    switch (contentType.toLowerCase()) {
      case 'post':
      case 'comment':
      case 'message':
        return true;
      default:
        return false;
    }
  }

  /// Get all supported content types
  static List<String> getAllTypes() {
    return [
      'post',
      'comment',
      'image',
      'video',
      'audio',
      'link',
      'poll',
      'event',
      'group',
      'message',
    ];
  }
}
