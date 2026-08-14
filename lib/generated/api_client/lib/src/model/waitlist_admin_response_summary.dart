//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'waitlist_admin_response_summary.g.dart';

/// WaitlistAdminResponseSummary
///
/// Properties:
/// * [totalWaiting]
/// * [last7Days]
@BuiltValue()
abstract class WaitlistAdminResponseSummary implements Built<WaitlistAdminResponseSummary, WaitlistAdminResponseSummaryBuilder> {
  @BuiltValueField(wireName: r'totalWaiting')
  int get totalWaiting;

  @BuiltValueField(wireName: r'last7Days')
  int get last7Days;

  WaitlistAdminResponseSummary._();

  factory WaitlistAdminResponseSummary([void updates(WaitlistAdminResponseSummaryBuilder b)]) = _$WaitlistAdminResponseSummary;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(WaitlistAdminResponseSummaryBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<WaitlistAdminResponseSummary> get serializer => _$WaitlistAdminResponseSummarySerializer();
}

class _$WaitlistAdminResponseSummarySerializer implements PrimitiveSerializer<WaitlistAdminResponseSummary> {
  @override
  final Iterable<Type> types = const [WaitlistAdminResponseSummary, _$WaitlistAdminResponseSummary];

  @override
  final String wireName = r'WaitlistAdminResponseSummary';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    WaitlistAdminResponseSummary object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'totalWaiting';
    yield serializers.serialize(
      object.totalWaiting,
      specifiedType: const FullType(int),
    );
    yield r'last7Days';
    yield serializers.serialize(
      object.last7Days,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    WaitlistAdminResponseSummary object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required WaitlistAdminResponseSummaryBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'totalWaiting':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.totalWaiting = valueDes;
          break;
        case r'last7Days':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.last7Days = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  WaitlistAdminResponseSummary deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = WaitlistAdminResponseSummaryBuilder();
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
