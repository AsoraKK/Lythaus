//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_presentation_preferences_update.g.dart';

/// ProductIntegrityPresentationPreferencesUpdate
///
/// Properties:
/// * [leftHandedMode]
/// * [horizontalSwipeEnabled]
/// * [expectedVersion]
@BuiltValue()
abstract class ProductIntegrityPresentationPreferencesUpdate implements Built<ProductIntegrityPresentationPreferencesUpdate, ProductIntegrityPresentationPreferencesUpdateBuilder> {
  @BuiltValueField(wireName: r'leftHandedMode')
  bool get leftHandedMode;

  @BuiltValueField(wireName: r'horizontalSwipeEnabled')
  bool get horizontalSwipeEnabled;

  @BuiltValueField(wireName: r'expectedVersion')
  int get expectedVersion;

  ProductIntegrityPresentationPreferencesUpdate._();

  factory ProductIntegrityPresentationPreferencesUpdate([void updates(ProductIntegrityPresentationPreferencesUpdateBuilder b)]) = _$ProductIntegrityPresentationPreferencesUpdate;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityPresentationPreferencesUpdateBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityPresentationPreferencesUpdate> get serializer => _$ProductIntegrityPresentationPreferencesUpdateSerializer();
}

class _$ProductIntegrityPresentationPreferencesUpdateSerializer implements PrimitiveSerializer<ProductIntegrityPresentationPreferencesUpdate> {
  @override
  final Iterable<Type> types = const [ProductIntegrityPresentationPreferencesUpdate, _$ProductIntegrityPresentationPreferencesUpdate];

  @override
  final String wireName = r'ProductIntegrityPresentationPreferencesUpdate';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityPresentationPreferencesUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'leftHandedMode';
    yield serializers.serialize(
      object.leftHandedMode,
      specifiedType: const FullType(bool),
    );
    yield r'horizontalSwipeEnabled';
    yield serializers.serialize(
      object.horizontalSwipeEnabled,
      specifiedType: const FullType(bool),
    );
    yield r'expectedVersion';
    yield serializers.serialize(
      object.expectedVersion,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityPresentationPreferencesUpdate object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityPresentationPreferencesUpdateBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'leftHandedMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.leftHandedMode = valueDes;
          break;
        case r'horizontalSwipeEnabled':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.horizontalSwipeEnabled = valueDes;
          break;
        case r'expectedVersion':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expectedVersion = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityPresentationPreferencesUpdate deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityPresentationPreferencesUpdateBuilder();
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
