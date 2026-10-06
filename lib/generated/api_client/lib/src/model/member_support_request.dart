//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/member_suggestion_request.dart';
import 'package:lythaus_api_client/src/model/member_problem_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'member_support_request.g.dart';

/// MemberSupportRequest
///
/// Properties:
/// * [kind]
/// * [category]
/// * [title]
/// * [actual]
/// * [expected]
/// * [reproductionSteps]
/// * [appVersion]
/// * [platform]
/// * [id]
/// * [revision]
/// * [state]
/// * [createdAt]
/// * [updatedAt]
/// * [memberMessage]
/// * [improvement]
/// * [benefit]
@BuiltValue()
abstract class MemberSupportRequest implements Built<MemberSupportRequest, MemberSupportRequestBuilder> {
  /// One Of [MemberProblemRequest], [MemberSuggestionRequest]
  OneOf get oneOf;

  static const String discriminatorFieldName = r'kind';

  static const Map<String, Type> discriminatorMapping = {
    r'MemberProblemRequest': MemberProblemRequest,
    r'MemberSuggestionRequest': MemberSuggestionRequest,
  };

  MemberSupportRequest._();

  factory MemberSupportRequest([void updates(MemberSupportRequestBuilder b)]) = _$MemberSupportRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(MemberSupportRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<MemberSupportRequest> get serializer => _$MemberSupportRequestSerializer();
}

extension MemberSupportRequestDiscriminatorExt on MemberSupportRequest {
    String? get discriminatorValue {
        if (this is MemberProblemRequest) {
            return r'MemberProblemRequest';
        }
        if (this is MemberSuggestionRequest) {
            return r'MemberSuggestionRequest';
        }
        return null;
    }
}
extension MemberSupportRequestBuilderDiscriminatorExt on MemberSupportRequestBuilder {
    String? get discriminatorValue {
        if (this is MemberProblemRequestBuilder) {
            return r'MemberProblemRequest';
        }
        if (this is MemberSuggestionRequestBuilder) {
            return r'MemberSuggestionRequest';
        }
        return null;
    }
}

class _$MemberSupportRequestSerializer implements PrimitiveSerializer<MemberSupportRequest> {
  @override
  final Iterable<Type> types = const [MemberSupportRequest, _$MemberSupportRequest];

  @override
  final String wireName = r'MemberSupportRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    MemberSupportRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    MemberSupportRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  MemberSupportRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = MemberSupportRequestBuilder();
    Object? oneOfDataSrc;
    final serializedList = (serialized as Iterable<Object?>).toList();
    final discIndex = serializedList.indexOf(MemberSupportRequest.discriminatorFieldName) + 1;
    final discValue = serializers.deserialize(serializedList[discIndex], specifiedType: FullType(String)) as String;
    oneOfDataSrc = serialized;
    final oneOfTypes = [MemberProblemRequest, MemberSuggestionRequest, ];
    Object oneOfResult;
    Type oneOfType;
    switch (discValue) {
      case r'MemberProblemRequest':
        oneOfResult = serializers.deserialize(
          oneOfDataSrc,
          specifiedType: FullType(MemberProblemRequest),
        ) as MemberProblemRequest;
        oneOfType = MemberProblemRequest;
        break;
      case r'MemberSuggestionRequest':
        oneOfResult = serializers.deserialize(
          oneOfDataSrc,
          specifiedType: FullType(MemberSuggestionRequest),
        ) as MemberSuggestionRequest;
        oneOfType = MemberSuggestionRequest;
        break;
      default:
        throw UnsupportedError("Couldn't deserialize oneOf for the discriminator value: ${discValue}");
    }
    result.oneOf = OneOfDynamic(typeIndex: oneOfTypes.indexOf(oneOfType), types: oneOfTypes, value: oneOfResult);
    return result.build();
  }
}

class MemberSupportRequestKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'suggestion')
  static const MemberSupportRequestKindEnum suggestion = _$memberSupportRequestKindEnum_suggestion;

  static Serializer<MemberSupportRequestKindEnum> get serializer => _$memberSupportRequestKindEnumSerializer;

  const MemberSupportRequestKindEnum._(String name): super(name);

  static BuiltSet<MemberSupportRequestKindEnum> get values => _$memberSupportRequestKindEnumValues;
  static MemberSupportRequestKindEnum valueOf(String name) => _$memberSupportRequestKindEnumValueOf(name);
}
