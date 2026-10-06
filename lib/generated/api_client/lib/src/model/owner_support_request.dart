//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/owner_suggestion_request.dart';
import 'package:lythaus_api_client/src/model/owner_problem_request.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';
import 'package:one_of/one_of.dart';

part 'owner_support_request.g.dart';

/// OwnerSupportRequest
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
/// * [submitterId]
/// * [improvement]
/// * [benefit]
@BuiltValue()
abstract class OwnerSupportRequest implements Built<OwnerSupportRequest, OwnerSupportRequestBuilder> {
  /// One Of [OwnerProblemRequest], [OwnerSuggestionRequest]
  OneOf get oneOf;

  static const String discriminatorFieldName = r'kind';

  static const Map<String, Type> discriminatorMapping = {
    r'OwnerProblemRequest': OwnerProblemRequest,
    r'OwnerSuggestionRequest': OwnerSuggestionRequest,
  };

  OwnerSupportRequest._();

  factory OwnerSupportRequest([void updates(OwnerSupportRequestBuilder b)]) = _$OwnerSupportRequest;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(OwnerSupportRequestBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<OwnerSupportRequest> get serializer => _$OwnerSupportRequestSerializer();
}

extension OwnerSupportRequestDiscriminatorExt on OwnerSupportRequest {
    String? get discriminatorValue {
        if (this is OwnerProblemRequest) {
            return r'OwnerProblemRequest';
        }
        if (this is OwnerSuggestionRequest) {
            return r'OwnerSuggestionRequest';
        }
        return null;
    }
}
extension OwnerSupportRequestBuilderDiscriminatorExt on OwnerSupportRequestBuilder {
    String? get discriminatorValue {
        if (this is OwnerProblemRequestBuilder) {
            return r'OwnerProblemRequest';
        }
        if (this is OwnerSuggestionRequestBuilder) {
            return r'OwnerSuggestionRequest';
        }
        return null;
    }
}

class _$OwnerSupportRequestSerializer implements PrimitiveSerializer<OwnerSupportRequest> {
  @override
  final Iterable<Type> types = const [OwnerSupportRequest, _$OwnerSupportRequest];

  @override
  final String wireName = r'OwnerSupportRequest';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    OwnerSupportRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
  }

  @override
  Object serialize(
    Serializers serializers,
    OwnerSupportRequest object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final oneOf = object.oneOf;
    return serializers.serialize(oneOf.value, specifiedType: FullType(oneOf.valueType))!;
  }

  @override
  OwnerSupportRequest deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = OwnerSupportRequestBuilder();
    Object? oneOfDataSrc;
    final serializedList = (serialized as Iterable<Object?>).toList();
    final discIndex = serializedList.indexOf(OwnerSupportRequest.discriminatorFieldName) + 1;
    final discValue = serializers.deserialize(serializedList[discIndex], specifiedType: FullType(String)) as String;
    oneOfDataSrc = serialized;
    final oneOfTypes = [OwnerProblemRequest, OwnerSuggestionRequest, ];
    Object oneOfResult;
    Type oneOfType;
    switch (discValue) {
      case r'OwnerProblemRequest':
        oneOfResult = serializers.deserialize(
          oneOfDataSrc,
          specifiedType: FullType(OwnerProblemRequest),
        ) as OwnerProblemRequest;
        oneOfType = OwnerProblemRequest;
        break;
      case r'OwnerSuggestionRequest':
        oneOfResult = serializers.deserialize(
          oneOfDataSrc,
          specifiedType: FullType(OwnerSuggestionRequest),
        ) as OwnerSuggestionRequest;
        oneOfType = OwnerSuggestionRequest;
        break;
      default:
        throw UnsupportedError("Couldn't deserialize oneOf for the discriminator value: ${discValue}");
    }
    result.oneOf = OneOfDynamic(typeIndex: oneOfTypes.indexOf(oneOfType), types: oneOfTypes, value: oneOfResult);
    return result.build();
  }
}

class OwnerSupportRequestKindEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'suggestion')
  static const OwnerSupportRequestKindEnum suggestion = _$ownerSupportRequestKindEnum_suggestion;

  static Serializer<OwnerSupportRequestKindEnum> get serializer => _$ownerSupportRequestKindEnumSerializer;

  const OwnerSupportRequestKindEnum._(String name): super(name);

  static BuiltSet<OwnerSupportRequestKindEnum> get values => _$ownerSupportRequestKindEnumValues;
  static OwnerSupportRequestKindEnum valueOf(String name) => _$ownerSupportRequestKindEnumValueOf(name);
}
