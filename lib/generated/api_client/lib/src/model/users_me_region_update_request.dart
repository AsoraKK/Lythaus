//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'users_me_region_update_request.g.dart';

/// UsersMeRegionUpdateRequest
///
/// Properties:
/// * [countryCode]
/// * [regionCode]
/// * [municipalityCode]
/// * [visibilityLevel]
@BuiltValue()
abstract class UsersMeRegionUpdateRequest implements Built<UsersMeRegionUpdateRequest, UsersMeRegionUpdateRequestBuilder> {
  @BuiltValueField(wireName: r'countryCode')
  String? get countryCode;

  @BuiltValueField(wireName: r'regionCode')
  String? get regionCode;

  @BuiltValueField(wireName: r'municipalityCode')
  String? get municipalityCode;

  @BuiltValueField(wireName: r'visibilityLevel')
  UsersMeRegionUpdateRequestVisibilityLevelEnum? get visibilityLevel;
  // enum visibilityLevelEnum {  private,  region,  country,  };

  UsersMeRegionUpdateRequest._();

  factory UsersMeRegionUpdateRequest([void updates(UsersMeRegionUpdateRequestBuilder b)]) = _$UsersMeRegionUpdateRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(UsersMeRegionUpdateRequestBuilder b) => b
      ..visibilityLevel = const UsersMeRegionUpdateRequestVisibilityLevelEnum._('private');

  @BuiltValueSerializer(custom: true)
  static Serializer<UsersMeRegionUpdateRequest> get serializer => _$UsersMeRegionUpdateRequestSerializer();
}

class _$UsersMeRegionUpdateRequestSerializer implements PrimitiveSerializer<UsersMeRegionUpdateRequest> {
  @override
  final Iterable<Type> types = const [UsersMeRegionUpdateRequest, _$UsersMeRegionUpdateRequest];

  @override
  final String wireName = r'UsersMeRegionUpdateRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    UsersMeRegionUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.countryCode != null) {
      yield r'countryCode';
      yield serializers.serialize(
        object.countryCode,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.regionCode != null) {
      yield r'regionCode';
      yield serializers.serialize(
        object.regionCode,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.municipalityCode != null) {
      yield r'municipalityCode';
      yield serializers.serialize(
        object.municipalityCode,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.visibilityLevel != null) {
      yield r'visibilityLevel';
      yield serializers.serialize(
        object.visibilityLevel,
        specifiedType: const FullType(UsersMeRegionUpdateRequestVisibilityLevelEnum),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    UsersMeRegionUpdateRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required UsersMeRegionUpdateRequestBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'countryCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.countryCode = valueDes;
          break;
        case r'regionCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.regionCode = valueDes;
          break;
        case r'municipalityCode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.municipalityCode = valueDes;
          break;
        case r'visibilityLevel':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(UsersMeRegionUpdateRequestVisibilityLevelEnum),
          ) as UsersMeRegionUpdateRequestVisibilityLevelEnum;
          result.visibilityLevel = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  UsersMeRegionUpdateRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = UsersMeRegionUpdateRequestBuilder();
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

class UsersMeRegionUpdateRequestVisibilityLevelEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'private')
  static const UsersMeRegionUpdateRequestVisibilityLevelEnum private = _$usersMeRegionUpdateRequestVisibilityLevelEnum_private;
  @BuiltValueEnumConst(wireName: r'region')
  static const UsersMeRegionUpdateRequestVisibilityLevelEnum region = _$usersMeRegionUpdateRequestVisibilityLevelEnum_region;
  @BuiltValueEnumConst(wireName: r'country')
  static const UsersMeRegionUpdateRequestVisibilityLevelEnum country = _$usersMeRegionUpdateRequestVisibilityLevelEnum_country;

  static Serializer<UsersMeRegionUpdateRequestVisibilityLevelEnum> get serializer => _$usersMeRegionUpdateRequestVisibilityLevelEnumSerializer;

  const UsersMeRegionUpdateRequestVisibilityLevelEnum._(String name): super(name);

  static BuiltSet<UsersMeRegionUpdateRequestVisibilityLevelEnum> get values => _$usersMeRegionUpdateRequestVisibilityLevelEnumValues;
  static UsersMeRegionUpdateRequestVisibilityLevelEnum valueOf(String name) => _$usersMeRegionUpdateRequestVisibilityLevelEnumValueOf(name);
}
