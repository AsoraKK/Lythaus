//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'moderation_state.g.dart';

class ModerationState extends EnumClass {

  @BuiltValueEnumConst(wireName: r'under_review')
  static const ModerationState underReview = _$underReview;
  @BuiltValueEnumConst(wireName: r'allowed')
  static const ModerationState allowed = _$allowed;
  @BuiltValueEnumConst(wireName: r'blocked')
  static const ModerationState blocked = _$blocked;

  static Serializer<ModerationState> get serializer => _$moderationStateSerializer;

  const ModerationState._(String name): super(name);

  static BuiltSet<ModerationState> get values => _$values;
  static ModerationState valueOf(String name) => _$valueOf(name);
}

/// Optionally, enum_class can generate a mixin to go with your enum for use
/// with Angular. It exposes your enum constants as getters. So, if you mix it
/// in to your Dart component class, the values become available to the
/// corresponding Angular template.
///
/// Trigger mixin generation by writing a line like this one next to your enum.
abstract class ModerationStateMixin = Object with _$ModerationStateMixin;
