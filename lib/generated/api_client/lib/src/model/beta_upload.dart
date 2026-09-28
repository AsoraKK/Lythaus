//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'beta_upload.g.dart';

/// BetaUpload
///
/// Properties:
/// * [caseId]
/// * [uploadUrl]
/// * [expiresAt]
/// * [status]
/// * [contentType]
@BuiltValue()
abstract class BetaUpload implements Built<BetaUpload, BetaUploadBuilder> {
  @BuiltValueField(wireName: r'caseId')
  String get caseId;

  @BuiltValueField(wireName: r'uploadUrl')
  String get uploadUrl;

  @BuiltValueField(wireName: r'expiresAt')
  DateTime get expiresAt;

  @BuiltValueField(wireName: r'status')
  BetaUploadStatusEnum get status;
  // enum statusEnum {  uploading,  };

  @BuiltValueField(wireName: r'contentType')
  String get contentType;

  BetaUpload._();

  factory BetaUpload([void updates(BetaUploadBuilder b)]) = _$BetaUpload;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(BetaUploadBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<BetaUpload> get serializer => _$BetaUploadSerializer();
}

class _$BetaUploadSerializer implements PrimitiveSerializer<BetaUpload> {
  @override
  final Iterable<Type> types = const [BetaUpload, _$BetaUpload];

  @override
  final String wireName = r'BetaUpload';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    BetaUpload object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'caseId';
    yield serializers.serialize(
      object.caseId,
      specifiedType: const FullType(String),
    );
    yield r'uploadUrl';
    yield serializers.serialize(
      object.uploadUrl,
      specifiedType: const FullType(String),
    );
    yield r'expiresAt';
    yield serializers.serialize(
      object.expiresAt,
      specifiedType: const FullType(DateTime),
    );
    yield r'status';
    yield serializers.serialize(
      object.status,
      specifiedType: const FullType(BetaUploadStatusEnum),
    );
    yield r'contentType';
    yield serializers.serialize(
      object.contentType,
      specifiedType: const FullType(String),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    BetaUpload object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required BetaUploadBuilder result,
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
        case r'uploadUrl':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.uploadUrl = valueDes;
          break;
        case r'expiresAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.expiresAt = valueDes;
          break;
        case r'status':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BetaUploadStatusEnum),
          ) as BetaUploadStatusEnum;
          result.status = valueDes;
          break;
        case r'contentType':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.contentType = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  BetaUpload deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = BetaUploadBuilder();
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

class BetaUploadStatusEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'uploading')
  static const BetaUploadStatusEnum uploading = _$betaUploadStatusEnum_uploading;

  static Serializer<BetaUploadStatusEnum> get serializer => _$betaUploadStatusEnumSerializer;

  const BetaUploadStatusEnum._(String name): super(name);

  static BuiltSet<BetaUploadStatusEnum> get values => _$betaUploadStatusEnumValues;
  static BetaUploadStatusEnum valueOf(String name) => _$betaUploadStatusEnumValueOf(name);
}
