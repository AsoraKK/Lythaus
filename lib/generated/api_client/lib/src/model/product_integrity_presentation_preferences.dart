//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'product_integrity_presentation_preferences.g.dart';

/// ProductIntegrityPresentationPreferences
///
/// Properties:
/// * [leftHandedMode]
/// * [horizontalSwipeEnabled]
/// * [version]
@BuiltValue()
abstract class ProductIntegrityPresentationPreferences implements Built<ProductIntegrityPresentationPreferences, ProductIntegrityPresentationPreferencesBuilder> {
  @BuiltValueField(wireName: r'leftHandedMode')
  bool get leftHandedMode;

  @BuiltValueField(wireName: r'horizontalSwipeEnabled')
  bool get horizontalSwipeEnabled;

  @BuiltValueField(wireName: r'version')
  int get version;

  ProductIntegrityPresentationPreferences._();

  factory ProductIntegrityPresentationPreferences([void updates(ProductIntegrityPresentationPreferencesBuilder b)]) = _$ProductIntegrityPresentationPreferences;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(ProductIntegrityPresentationPreferencesBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<ProductIntegrityPresentationPreferences> get serializer => _$ProductIntegrityPresentationPreferencesSerializer();
}

class _$ProductIntegrityPresentationPreferencesSerializer implements PrimitiveSerializer<ProductIntegrityPresentationPreferences> {
  @override
  final Iterable<Type> types = const [ProductIntegrityPresentationPreferences, _$ProductIntegrityPresentationPreferences];

  @override
  final String wireName = r'ProductIntegrityPresentationPreferences';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    ProductIntegrityPresentationPreferences object, {
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
    yield r'version';
    yield serializers.serialize(
      object.version,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    ProductIntegrityPresentationPreferences object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required ProductIntegrityPresentationPreferencesBuilder result,
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
        case r'version':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.version = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  ProductIntegrityPresentationPreferences deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = ProductIntegrityPresentationPreferencesBuilder();
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
