//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'email_session_response.g.dart';

/// Direct email authentication or refresh-token rotation response.
///
/// Properties:
/// * [accessToken] - Short-lived JWT bearer token (15 minutes).
/// * [refreshToken] - Rotating opaque refresh token.
/// * [tokenType]
/// * [expiresIn] - Access-token lifetime in seconds.
@BuiltValue()
abstract class EmailSessionResponse implements Built<EmailSessionResponse, EmailSessionResponseBuilder> {
  /// Short-lived JWT bearer token (15 minutes).
  @BuiltValueField(wireName: r'accessToken')
  String get accessToken;

  /// Rotating opaque refresh token.
  @BuiltValueField(wireName: r'refreshToken')
  String get refreshToken;

  @BuiltValueField(wireName: r'tokenType')
  EmailSessionResponseTokenTypeEnum get tokenType;
  // enum tokenTypeEnum {  Bearer,  };

  /// Access-token lifetime in seconds.
  @BuiltValueField(wireName: r'expiresIn')
  int get expiresIn;

  EmailSessionResponse._();

  factory EmailSessionResponse([void updates(EmailSessionResponseBuilder b)]) = _$EmailSessionResponse;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(EmailSessionResponseBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<EmailSessionResponse> get serializer => _$EmailSessionResponseSerializer();
}

class _$EmailSessionResponseSerializer implements PrimitiveSerializer<EmailSessionResponse> {
  @override
  final Iterable<Type> types = const [EmailSessionResponse, _$EmailSessionResponse];

  @override
  final String wireName = r'EmailSessionResponse';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    EmailSessionResponse object, {
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
      specifiedType: const FullType(EmailSessionResponseTokenTypeEnum),
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
    EmailSessionResponse object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required EmailSessionResponseBuilder result,
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
            specifiedType: const FullType(EmailSessionResponseTokenTypeEnum),
          ) as EmailSessionResponseTokenTypeEnum;
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
  EmailSessionResponse deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = EmailSessionResponseBuilder();
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

class EmailSessionResponseTokenTypeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Bearer')
  static const EmailSessionResponseTokenTypeEnum bearer = _$emailSessionResponseTokenTypeEnum_bearer;

  static Serializer<EmailSessionResponseTokenTypeEnum> get serializer => _$emailSessionResponseTokenTypeEnumSerializer;

  const EmailSessionResponseTokenTypeEnum._(String name): super(name);

  static BuiltSet<EmailSessionResponseTokenTypeEnum> get values => _$emailSessionResponseTokenTypeEnumValues;
  static EmailSessionResponseTokenTypeEnum valueOf(String name) => _$emailSessionResponseTokenTypeEnumValueOf(name);
}
