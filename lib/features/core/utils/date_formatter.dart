// ignore_for_file: public_member_api_docs

/// LYTHAUS DATE FORMATTER UTILITY
///
/// 🎯 Purpose: Format dates for display in UI components
/// ✅ Features: Relative time formatting, human-readable dates
/// 🔧 Usage: Static methods for consistent date formatting
/// 📱 Platform: Flutter with localization support
library;

class DateFormatter {
  /// Format a DateTime as relative time (e.g., "2 hours ago", "Just now")
  static String formatRelative(DateTime dateTime, {DateTime? now}) {
    final current = now ?? DateTime.now();
    final difference = current.difference(dateTime);

    if (difference.inDays > 365) {
      final years = (difference.inDays / 365).floor();
      return '${years}y ago';
    } else if (difference.inDays > 30) {
      final months = (difference.inDays / 30).floor();
      return '${months}mo ago';
    } else if (difference.inDays > 0) {
      return '${difference.inDays}d ago';
    } else if (difference.inHours > 0) {
      return '${difference.inHours}h ago';
    } else if (difference.inMinutes > 0) {
      return '${difference.inMinutes}m ago';
    } else {
      return 'Just now';
    }
  }

  /// Format a DateTime as an absolute date string
  static String formatAbsolute(DateTime dateTime) {
    return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
  }

  /// Format a DateTime with time included
  static String formatWithTime(DateTime dateTime) {
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');
    return '${formatAbsolute(dateTime)} at $hour:$minute';
  }

  /// Format duration in human-readable format
  static String formatDuration(Duration duration) {
    if (duration.inDays > 0) {
      return '${duration.inDays} day${duration.inDays > 1 ? 's' : ''}';
    } else if (duration.inHours > 0) {
      return '${duration.inHours} hour${duration.inHours > 1 ? 's' : ''}';
    } else if (duration.inMinutes > 0) {
      return '${duration.inMinutes} minute${duration.inMinutes > 1 ? 's' : ''}';
    } else {
      return 'Less than a minute';
    }
  }
}
