//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_public_profile_user_reputation.g.dart';

/// Present only for public Passport visibility and active reputation. Never contains enforcement status or evidence.
///
/// Properties:
/// * [level]
/// * [label]
@BuiltValue()
abstract class ProductIntegrityPublicProfileUserReputation implements Built<ProductIntegrityPublicProfileUserReputation, ProductIntegrityPublicProfileUserReputationBuilder> {
  @BuiltValueField(wireName: r'level')
  int get level;

  @BuiltValueField(wireName: r'label')
  String get label;

  ProductIntegrityPublicProfileUserReputation._();

  factory ProductIntegrityPublicProfileUserReputation([void updates(ProductIntegrityPublicProfileUserReputationBuilder b)]) = _$ProductIntegrityPublicProfileUserReputation;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityPublicProfileUserReputationBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityPublicProfileUserReputation> get serializer => _$ProductIntegrityPublicProfileUserReputationSerializer();
}

class _$ProductIntegrityPublicProfileUserReputationSerializer implements PrimitiveSerializer<ProductIntegrityPublicProfileUserReputation> {
  @override
  final Iterable<Type> types = const [ProductIntegrityPublicProfileUserReputation, _$ProductIntegrityPublicProfileUserReputation];

  @override
  final String wireName = r'ProductIntegrityPublicProfileUserReputation';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityPublicProfileUserReputation object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'level';
    yield serializers.serialize(
      object.level,
      specifiedType: const FullType(int),
    );
    yield r'label';
    yield serializers.serialize(
      object.label,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityPublicProfileUserReputation object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityPublicProfileUserReputationBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'level':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.level = valueDes;
          break;
        case r'label':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.label = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityPublicProfileUserReputation deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityPublicProfileUserReputationBuilder();
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
