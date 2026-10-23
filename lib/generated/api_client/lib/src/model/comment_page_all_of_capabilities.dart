//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'comment_page_all_of_capabilities.g.dart';

/// CommentPageAllOfCapabilities
///
/// Properties:
/// * [conversations]
/// * [nestedReplies]
/// * [sorts]
/// * [mostRelevantAvailable]
/// * [mostRelevantUnavailableReason]
@BuiltValue()
abstract class CommentPageAllOfCapabilities implements Built<CommentPageAllOfCapabilities, CommentPageAllOfCapabilitiesBuilder> {
  @BuiltValueField(wireName: r'conversations')
  bool? get conversations;

  @BuiltValueField(wireName: r'nestedReplies')
  bool? get nestedReplies;

  @BuiltValueField(wireName: r'sorts')
  BuiltList<CommentPageAllOfCapabilitiesSortsEnum>? get sorts;
  // enum sortsEnum {  newest,  oldest,  };

  @BuiltValueField(wireName: r'mostRelevantAvailable')
  bool? get mostRelevantAvailable;

  @BuiltValueField(wireName: r'mostRelevantUnavailableReason')
  String? get mostRelevantUnavailableReason;

  CommentPageAllOfCapabilities._();

  factory CommentPageAllOfCapabilities([void updates(CommentPageAllOfCapabilitiesBuilder b)]) = _$CommentPageAllOfCapabilities;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(CommentPageAllOfCapabilitiesBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<CommentPageAllOfCapabilities> get serializer => _$CommentPageAllOfCapabilitiesSerializer();
}

class _$CommentPageAllOfCapabilitiesSerializer implements PrimitiveSerializer<CommentPageAllOfCapabilities> {
  @override
  final Iterable<Type> types = const [CommentPageAllOfCapabilities, _$CommentPageAllOfCapabilities];

  @override
  final String wireName = r'CommentPageAllOfCapabilities';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    CommentPageAllOfCapabilities object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    if (object.conversations != null) {
      yield r'conversations';
      yield serializers.serialize(
        object.conversations,
        specifiedType: const FullType(bool),
      );
    }
    if (object.nestedReplies != null) {
      yield r'nestedReplies';
      yield serializers.serialize(
        object.nestedReplies,
        specifiedType: const FullType(bool),
      );
    }
    if (object.sorts != null) {
      yield r'sorts';
      yield serializers.serialize(
        object.sorts,
        specifiedType: const FullType(BuiltList, [FullType(CommentPageAllOfCapabilitiesSortsEnum)]),
      );
    }
    if (object.mostRelevantAvailable != null) {
      yield r'mostRelevantAvailable';
      yield serializers.serialize(
        object.mostRelevantAvailable,
        specifiedType: const FullType(bool),
      );
    }
    if (object.mostRelevantUnavailableReason != null) {
      yield r'mostRelevantUnavailableReason';
      yield serializers.serialize(
        object.mostRelevantUnavailableReason,
        specifiedType: const FullType(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    CommentPageAllOfCapabilities object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required CommentPageAllOfCapabilitiesBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'conversations':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.conversations = valueDes;
          break;
        case r'nestedReplies':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.nestedReplies = valueDes;
          break;
        case r'sorts':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(BuiltList, [FullType(CommentPageAllOfCapabilitiesSortsEnum)]),
          ) as BuiltList<CommentPageAllOfCapabilitiesSortsEnum>;
          result.sorts.replace(valueDes);
          break;
        case r'mostRelevantAvailable':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(bool),
          ) as bool;
          result.mostRelevantAvailable = valueDes;
          break;
        case r'mostRelevantUnavailableReason':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.mostRelevantUnavailableReason = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  CommentPageAllOfCapabilities deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = CommentPageAllOfCapabilitiesBuilder();
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

class CommentPageAllOfCapabilitiesSortsEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'newest')
  static const CommentPageAllOfCapabilitiesSortsEnum newest = _$commentPageAllOfCapabilitiesSortsEnum_newest;
  @BuiltValueEnumConst(wireName: r'oldest')
  static const CommentPageAllOfCapabilitiesSortsEnum oldest = _$commentPageAllOfCapabilitiesSortsEnum_oldest;

  static Serializer<CommentPageAllOfCapabilitiesSortsEnum> get serializer => _$commentPageAllOfCapabilitiesSortsEnumSerializer;

  const CommentPageAllOfCapabilitiesSortsEnum._(String name): super(name);

  static BuiltSet<CommentPageAllOfCapabilitiesSortsEnum> get values => _$commentPageAllOfCapabilitiesSortsEnumValues;
  static CommentPageAllOfCapabilitiesSortsEnum valueOf(String name) => _$commentPageAllOfCapabilitiesSortsEnumValueOf(name);
}
