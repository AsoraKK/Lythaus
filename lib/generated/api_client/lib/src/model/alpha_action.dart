//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'alpha_action.g.dart';

/// AlphaAction
///
/// Properties:
/// * [caseId]
/// * [status]
/// * [accepted]
@BuiltValue()
abstract class AlphaAction implements Built<AlphaAction, AlphaActionBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String? get caseId;

  @BuiltValueField(wireName: r'status')
  String? get status;

  @BuiltValueField(wireName: r'accepted')
  bool? get accepted;

  AlphaAction._();

  factory AlphaAction([void updates(AlphaActionBuilder b)]) = _$AlphaAction;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AlphaActionBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AlphaAction> get serializer => _$AlphaActionSerializer();
}

class _$AlphaActionSerializer implements PrimitiveSerializer<AlphaAction> {
  @override
  final Iterable<Type> types = const [AlphaAction, _$AlphaAction];

  @override
  final String wireName = r'AlphaAction';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AlphaAction object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.caseId != null) {
      yield r'caseId';
      yield serializers.serialize(
        object.caseId,
        specifiedType: const FullType(String),
      );
    }
    if (object.status != null) {
      yield r'status';
      yield serializers.serialize(
        object.status,
        specifiedType: const FullType(String),
      );
    }
    if (object.accepted != null) {
      yield r'accepted';
      yield serializers.serialize(
        object.accepted,
        specifiedType: const FullType(bool),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    AlphaAction object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AlphaActionBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'caseId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.caseId = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.status = valueDes;
          break;
        case r'accepted':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.accepted = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AlphaAction deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AlphaActionBuilder();
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
