//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/appeal_reviewer_assignments_items_inner.dart';
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'appeal_reviewer_assignments.g.dart';

/// AppealReviewerAssignments
///
/// Properties:
/// * [items]
@BuiltValue()
abstract class AppealReviewerAssignments implements Built<AppealReviewerAssignments, AppealReviewerAssignmentsBuilder> {
  @BuiltValueField(wireName: r'items')
  BuiltList<AppealReviewerAssignmentsItemsInner> get items;

  AppealReviewerAssignments._();

  factory AppealReviewerAssignments([void updates(AppealReviewerAssignmentsBuilder b)]) = _$AppealReviewerAssignments;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AppealReviewerAssignmentsBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AppealReviewerAssignments> get serializer => _$AppealReviewerAssignmentsSerializer();
}

class _$AppealReviewerAssignmentsSerializer implements PrimitiveSerializer<AppealReviewerAssignments> {
  @override
  final Iterable<Type> types = const [AppealReviewerAssignments, _$AppealReviewerAssignments];

  @override
  final String wireName = r'AppealReviewerAssignments';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AppealReviewerAssignments object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'items';
    yield serializers.serialize(
      object.items,
      specifiedType: const FullType(BuiltList, [FullType(AppealReviewerAssignmentsItemsInner)]),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AppealReviewerAssignments object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AppealReviewerAssignmentsBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'items':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(AppealReviewerAssignmentsItemsInner)]),
          ) as BuiltList<AppealReviewerAssignmentsItemsInner>;
          result.items.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AppealReviewerAssignments deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AppealReviewerAssignmentsBuilder();
    final serializedList = (serialized as Iterable<Object?>).toList();
    final unhandled = <Object?>[];
    _deserializeProperties(
      serializers,
      serialized,
      specifiedType: specifiedType,
      serializedList: serializedList,
      unhandled: unhandled,
      result: result,
    );
    return result.build();
  }
}
