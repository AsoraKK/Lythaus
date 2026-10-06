//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'public_message.g.dart';

/// PublicMessage
///
/// Properties:
/// * [id]
/// * [from]
/// * [text]
/// * [revision]
/// * [createdAt]
@BuiltValue()
abstract class PublicMessage implements Built<PublicMessage, PublicMessageBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'from')
  PublicMessageFromEnum get from;
  // enum fromEnum {  member,  owner,  };

  @BuiltValueField(wireName: r'text')
  String get text;

  @BuiltValueField(wireName: r'revision')
  int get revision;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  PublicMessage._();

  factory PublicMessage([void updates(PublicMessageBuilder b)]) = _$PublicMessage;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PublicMessageBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PublicMessage> get serializer => _$PublicMessageSerializer();
}

class _$PublicMessageSerializer implements PrimitiveSerializer<PublicMessage> {
  @override
  final Iterable<Type> types = const [PublicMessage, _$PublicMessage];

  @override
  final String wireName = r'PublicMessage';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PublicMessage object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'from';
    yield serializers.serialize(
      object.from,
      specifiedType: const FullType(PublicMessageFromEnum),
    );
    yield r'text';
    yield serializers.serialize(
      object.text,
      specifiedType: const FullType(String),
    );
    yield r'revision';
    yield serializers.serialize(
      object.revision,
      specifiedType: const FullType(int),
    );
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    PublicMessage object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PublicMessageBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'from':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PublicMessageFromEnum),
          ) as PublicMessageFromEnum;
          result.from = valueDes;
          break;
        case r'text':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.text = valueDes;
          break;
        case r'revision':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.revision = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PublicMessage deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PublicMessageBuilder();
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

class PublicMessageFromEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'member')
  static const PublicMessageFromEnum member = _$publicMessageFromEnum_member;
  @BuiltValueEnumConst(wireName: r'owner')
  static const PublicMessageFromEnum owner = _$publicMessageFromEnum_owner;

  static Serializer<PublicMessageFromEnum> get serializer => _$publicMessageFromEnumSerializer;

  const PublicMessageFromEnum._(String name): super(name);

  static BuiltSet<PublicMessageFromEnum> get values => _$publicMessageFromEnumValues;
  static PublicMessageFromEnum valueOf(String name) => _$publicMessageFromEnumValueOf(name);
}
