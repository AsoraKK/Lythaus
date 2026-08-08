//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_session_response_data.g.dart';

/// EmailSessionResponseData
///
/// Properties:
/// * [accessToken] - Short-lived JWT bearer token (15 min)
/// * [refreshToken] - Long-lived opaque refresh token
/// * [tokenType]
/// * [expiresIn] - Access token lifetime in seconds
@BuiltValue()
abstract class EmailSessionResponseData implements Built<EmailSessionResponseData, EmailSessionResponseDataBuilder> {
  /// Short-lived JWT bearer token (15 min)
  @BuiltValueField(wireName: r'accessToken')
  String get accessToken;

  /// Long-lived opaque refresh token
  @BuiltValueField(wireName: r'refreshToken')
  String get refreshToken;

  @BuiltValueField(wireName: r'tokenType')
  EmailSessionResponseDataTokenTypeEnum get tokenType;
  // enum tokenTypeEnum {  Bearer,  };

  /// Access token lifetime in seconds
  @BuiltValueField(wireName: r'expiresIn')
  int get expiresIn;

  EmailSessionResponseData._();

  factory EmailSessionResponseData([void updates(EmailSessionResponseDataBuilder b)]) = _$EmailSessionResponseData;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailSessionResponseDataBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailSessionResponseData> get serializer => _$EmailSessionResponseDataSerializer();
}

class _$EmailSessionResponseDataSerializer implements PrimitiveSerializer<EmailSessionResponseData> {
  @override
  final Iterable<Type> types = const [EmailSessionResponseData, _$EmailSessionResponseData];

  @override
  final String wireName = r'EmailSessionResponseData';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailSessionResponseData object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'accessToken';
    yield serializers.serialize(
      object.accessToken,
      specifiedType: const FullType(String),
    );
    yield r'refreshToken';
    yield serializers.serialize(
      object.refreshToken,
      specifiedType: const FullType(String),
    );
    yield r'tokenType';
    yield serializers.serialize(
      object.tokenType,
      specifiedType: const FullType(EmailSessionResponseDataTokenTypeEnum),
    );
    yield r'expiresIn';
    yield serializers.serialize(
      object.expiresIn,
      specifiedType: const FullType(int),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    EmailSessionResponseData object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailSessionResponseDataBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'accessToken':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.accessToken = valueDes;
          break;
        case r'refreshToken':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.refreshToken = valueDes;
          break;
        case r'tokenType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(EmailSessionResponseDataTokenTypeEnum),
          ) as EmailSessionResponseDataTokenTypeEnum;
          result.tokenType = valueDes;
          break;
        case r'expiresIn':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(int),
          ) as int;
          result.expiresIn = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  EmailSessionResponseData deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailSessionResponseDataBuilder();
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

class EmailSessionResponseDataTokenTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Bearer')
  static const EmailSessionResponseDataTokenTypeEnum bearer = _$emailSessionResponseDataTokenTypeEnum_bearer;

  static Serializer<EmailSessionResponseDataTokenTypeEnum> get serializer => _$emailSessionResponseDataTokenTypeEnumSerializer;

  const EmailSessionResponseDataTokenTypeEnum._(String name): super(name);

  static BuiltSet<EmailSessionResponseDataTokenTypeEnum> get values => _$emailSessionResponseDataTokenTypeEnumValues;
  static EmailSessionResponseDataTokenTypeEnum valueOf(String name) => _$emailSessionResponseDataTokenTypeEnumValueOf(name);
}
