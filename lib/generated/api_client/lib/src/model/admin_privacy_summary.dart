//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_privacy_summary.g.dart';

/// AdminPrivacySummary
///
/// Properties:
/// * [sampledAt]
/// * [privacyRequests]
/// * [activeLegalHolds]
@BuiltValue()
abstract class AdminPrivacySummary implements Built<AdminPrivacySummary, AdminPrivacySummaryBuilder> {
  @BuiltValueField(wireName: r'sampledAt')
  DateTime get sampledAt;

  @BuiltValueField(wireName: r'privacyRequests')
  int get privacyRequests;

  @BuiltValueField(wireName: r'activeLegalHolds')
  int get activeLegalHolds;

  AdminPrivacySummary._();

  factory AdminPrivacySummary([void updates(AdminPrivacySummaryBuilder b)]) = _$AdminPrivacySummary;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminPrivacySummaryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminPrivacySummary> get serializer => _$AdminPrivacySummarySerializer();
}

class _$AdminPrivacySummarySerializer implements PrimitiveSerializer<AdminPrivacySummary> {
  @override
  final Iterable<Type> types = const [AdminPrivacySummary, _$AdminPrivacySummary];

  @override
  final String wireName = r'AdminPrivacySummary';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminPrivacySummary object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'sampledAt';
    yield serializers.serialize(
      object.sampledAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'privacyRequests';
    yield serializers.serialize(
      object.privacyRequests,
      specifiedType: const FullType(int),
    );
    yield r'activeLegalHolds';
    yield serializers.serialize(
      object.activeLegalHolds,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminPrivacySummary object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminPrivacySummaryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'sampledAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.sampledAt = valueDes;
          break;
        case r'privacyRequests':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.privacyRequests = valueDes;
          break;
        case r'activeLegalHolds':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.activeLegalHolds = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminPrivacySummary deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminPrivacySummaryBuilder();
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
