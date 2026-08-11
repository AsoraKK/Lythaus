//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'reviewer_qualification_state.g.dart';

class ReviewerQualificationState extends EnumClass {

  /// Reviewer training is a distinct governance qualification; reputation level, including L5, is insufficient on its own.
  @BuiltValueEnumConst(wireName: r'none')
  static const ReviewerQualificationState none = _$none;
  /// Reviewer training is a distinct governance qualification; reputation level, including L5, is insufficient on its own.
  @BuiltValueEnumConst(wireName: r'eligible')
  static const ReviewerQualificationState eligible = _$eligible;
  /// Reviewer training is a distinct governance qualification; reputation level, including L5, is insufficient on its own.
  @BuiltValueEnumConst(wireName: r'trained')
  static const ReviewerQualificationState trained = _$trained;
  /// Reviewer training is a distinct governance qualification; reputation level, including L5, is insufficient on its own.
  @BuiltValueEnumConst(wireName: r'suspended')
  static const ReviewerQualificationState suspended = _$suspended;

  static Serializer<ReviewerQualificationState> get serializer => _$reviewerQualificationStateSerializer;

  const ReviewerQualificationState._(String name): super(name);

  static BuiltSet<ReviewerQualificationState> get values => _$values;
  static ReviewerQualificationState valueOf(String name) => _$valueOf(name);
}

/// Optionally, enum_class can generate a mixin to go with your enum for use
/// with Angular. It exposes your enum constants as getters. So, if you mix it
/// in to your Dart component class, the values become available to the
/// corresponding Angular template.
///
/// Trigger mixin generation by writing a line like this one next to your enum.
abstract class ReviewerQualificationStateMixin = Object with _$ReviewerQualificationStateMixin;
