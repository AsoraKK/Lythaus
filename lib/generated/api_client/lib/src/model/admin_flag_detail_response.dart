//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/admin_moderation_summary.dart';
import 'package:lythaus_api_client/src/model/admin_flag_detail_appeal.dart';
import 'package:lythaus_api_client/src/model/admin_flag_detail_content.dart';
import 'package:lythaus_api_client/src/model/admin_flag_history.dart';
import 'package:lythaus_api_client/src/model/admin_flag_detail_flags.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_flag_detail_response.g.dart';

/// AdminFlagDetailResponse
///
/// Properties:
/// * [content]
/// * [flags]
/// * [moderation]
/// * [appeal]
/// * [history]
@BuiltValue()
abstract class AdminFlagDetailResponse implements Built<AdminFlagDetailResponse, AdminFlagDetailResponseBuilder> {
  @BuiltValueField(wireName: r'content')
  AdminFlagDetailContent? get content;

  @BuiltValueField(wireName: r'flags')
  AdminFlagDetailFlags? get flags;

  @BuiltValueField(wireName: r'moderation')
  AdminModerationSummary? get moderation;

  @BuiltValueField(wireName: r'appeal')
  AdminFlagDetailAppeal? get appeal;

  @BuiltValueField(wireName: r'history')
  AdminFlagHistory? get history;

  AdminFlagDetailResponse._();

  factory AdminFlagDetailResponse([void updates(AdminFlagDetailResponseBuilder b)]) = _$AdminFlagDetailResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminFlagDetailResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminFlagDetailResponse> get serializer => _$AdminFlagDetailResponseSerializer();
}

class _$AdminFlagDetailResponseSerializer implements PrimitiveSerializer<AdminFlagDetailResponse> {
  @override
  final Iterable<Type> types = const [AdminFlagDetailResponse, _$AdminFlagDetailResponse];

  @override
  final String wireName = r'AdminFlagDetailResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminFlagDetailResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.content != null) {
      yield r'content';
      yield serializers.serialize(
        object.content,
        specifiedType: const FullType(AdminFlagDetailContent),
      );
    }
    if (object.flags != null) {
      yield r'flags';
      yield serializers.serialize(
        object.flags,
        specifiedType: const FullType(AdminFlagDetailFlags),
      );
    }
    if (object.moderation != null) {
      yield r'moderation';
      yield serializers.serialize(
        object.moderation,
        specifiedType: const FullType(AdminModerationSummary),
      );
    }
    if (object.appeal != null) {
      yield r'appeal';
      yield serializers.serialize(
        object.appeal,
        specifiedType: const FullType(AdminFlagDetailAppeal),
      );
    }
    if (object.history != null) {
      yield r'history';
      yield serializers.serialize(
        object.history,
        specifiedType: const FullType(AdminFlagHistory),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminFlagDetailResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminFlagDetailResponseBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'content':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagDetailContent),
          ) as AdminFlagDetailContent;
          result.content.replace(valueDes);
          break;
        case r'flags':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagDetailFlags),
          ) as AdminFlagDetailFlags;
          result.flags.replace(valueDes);
          break;
        case r'moderation':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminModerationSummary),
          ) as AdminModerationSummary;
          result.moderation.replace(valueDes);
          break;
        case r'appeal':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagDetailAppeal),
          ) as AdminFlagDetailAppeal;
          result.appeal.replace(valueDes);
          break;
        case r'history':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(AdminFlagHistory),
          ) as AdminFlagHistory;
          result.history.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminFlagDetailResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminFlagDetailResponseBuilder();
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
