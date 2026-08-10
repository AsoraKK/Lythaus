//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/declared_creation_mode.dart';
import 'package:built_collection/built_collection.dart';
import 'package:lythaus_api_client/src/model/moderation_state.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'personal_feed_item.g.dart';

/// PersonalFeedItem
///
/// Properties:
/// * [id]
/// * [authorId]
/// * [body]
/// * [declaredCreationMode]
/// * [visibility]
/// * [moderationState]
/// * [geoScope]
/// * [placeId]
/// * [publishedAt]
/// * [createdAt]
/// * [source_]
/// * [explanationBasis]
@BuiltValue()
abstract class PersonalFeedItem implements Built<PersonalFeedItem, PersonalFeedItemBuilder> {
  @BuiltValueField(wireName: r'id')
  String get id;

  @BuiltValueField(wireName: r'authorId')
  String get authorId;

  @BuiltValueField(wireName: r'body')
  String get body;

  @BuiltValueField(wireName: r'declaredCreationMode')
  DeclaredCreationMode get declaredCreationMode;
  // enum declaredCreationModeEnum {  human,  ai_assisted,  };

  @BuiltValueField(wireName: r'visibility')
  PersonalFeedItemVisibilityEnum get visibility;
  // enum visibilityEnum {  public,  followers,  private,  };

  @BuiltValueField(wireName: r'moderationState')
  ModerationState get moderationState;
  // enum moderationStateEnum {  under_review,  allowed,  blocked,  };

  @BuiltValueField(wireName: r'geoScope')
  PersonalFeedItemGeoScopeEnum? get geoScope;
  // enum geoScopeEnum {  global,  country,  province,  municipality,  community,  none,  };

  @BuiltValueField(wireName: r'placeId')
  String? get placeId;

  @BuiltValueField(wireName: r'publishedAt')
  DateTime? get publishedAt;

  @BuiltValueField(wireName: r'createdAt')
  DateTime get createdAt;

  @BuiltValueField(wireName: r'source')
  String? get source_;

  @BuiltValueField(wireName: r'explanationBasis')
  String? get explanationBasis;

  PersonalFeedItem._();

  factory PersonalFeedItem([void updates(PersonalFeedItemBuilder b)]) = _$PersonalFeedItem;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(PersonalFeedItemBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<PersonalFeedItem> get serializer => _$PersonalFeedItemSerializer();
}

class _$PersonalFeedItemSerializer implements PrimitiveSerializer<PersonalFeedItem> {
  @override
  final Iterable<Type> types = const [PersonalFeedItem, _$PersonalFeedItem];

  @override
  final String wireName = r'PersonalFeedItem';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    PersonalFeedItem object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'id';
    yield serializers.serialize(
      object.id,
      specifiedType: const FullType(String),
    );
    yield r'authorId';
    yield serializers.serialize(
      object.authorId,
      specifiedType: const FullType(String),
    );
    yield r'body';
    yield serializers.serialize(
      object.body,
      specifiedType: const FullType(String),
    );
    yield r'declaredCreationMode';
    yield serializers.serialize(
      object.declaredCreationMode,
      specifiedType: const FullType(DeclaredCreationMode),
    );
    yield r'visibility';
    yield serializers.serialize(
      object.visibility,
      specifiedType: const FullType(PersonalFeedItemVisibilityEnum),
    );
    yield r'moderationState';
    yield serializers.serialize(
      object.moderationState,
      specifiedType: const FullType(ModerationState),
    );
    if (object.geoScope != null) {
      yield r'geoScope';
      yield serializers.serialize(
        object.geoScope,
        specifiedType: const FullType.nullable(PersonalFeedItemGeoScopeEnum),
      );
    }
    if (object.placeId != null) {
      yield r'placeId';
      yield serializers.serialize(
        object.placeId,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.publishedAt != null) {
      yield r'publishedAt';
      yield serializers.serialize(
        object.publishedAt,
        specifiedType: const FullType.nullable(DateTime),
      );
    }
    yield r'createdAt';
    yield serializers.serialize(
      object.createdAt,
      specifiedType: const FullType(DateTime),
    );
    if (object.source_ != null) {
      yield r'source';
      yield serializers.serialize(
        object.source_,
        specifiedType: const FullType.nullable(String),
      );
    }
    if (object.explanationBasis != null) {
      yield r'explanationBasis';
      yield serializers.serialize(
        object.explanationBasis,
        specifiedType: const FullType.nullable(String),
      );
    }
  }

  @override
  Object serialize(
    Serializers serializers,
    PersonalFeedItem object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required PersonalFeedItemBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'id':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.id = valueDes;
          break;
        case r'authorId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.authorId = valueDes;
          break;
        case r'body':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(String),
          ) as String;
          result.body = valueDes;
          break;
        case r'declaredCreationMode':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DeclaredCreationMode),
          ) as DeclaredCreationMode;
          result.declaredCreationMode = valueDes;
          break;
        case r'visibility':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(PersonalFeedItemVisibilityEnum),
          ) as PersonalFeedItemVisibilityEnum;
          result.visibility = valueDes;
          break;
        case r'moderationState':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(ModerationState),
          ) as ModerationState;
          result.moderationState = valueDes;
          break;
        case r'geoScope':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(PersonalFeedItemGeoScopeEnum),
          ) as PersonalFeedItemGeoScopeEnum?;
          if (valueDes == null) continue;
          result.geoScope = valueDes;
          break;
        case r'placeId':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.placeId = valueDes;
          break;
        case r'publishedAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(DateTime),
          ) as DateTime?;
          if (valueDes == null) continue;
          result.publishedAt = valueDes;
          break;
        case r'createdAt':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(DateTime),
          ) as DateTime;
          result.createdAt = valueDes;
          break;
        case r'source':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.source_ = valueDes;
          break;
        case r'explanationBasis':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType.nullable(String),
          ) as String?;
          if (valueDes == null) continue;
          result.explanationBasis = valueDes;
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  PersonalFeedItem deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = PersonalFeedItemBuilder();
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

class PersonalFeedItemVisibilityEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'public')
  static const PersonalFeedItemVisibilityEnum public = _$personalFeedItemVisibilityEnum_public;
  @BuiltValueEnumConst(wireName: r'followers')
  static const PersonalFeedItemVisibilityEnum followers = _$personalFeedItemVisibilityEnum_followers;
  @BuiltValueEnumConst(wireName: r'private')
  static const PersonalFeedItemVisibilityEnum private = _$personalFeedItemVisibilityEnum_private;

  static Serializer<PersonalFeedItemVisibilityEnum> get serializer => _$personalFeedItemVisibilityEnumSerializer;

  const PersonalFeedItemVisibilityEnum._(String name): super(name);

  static BuiltSet<PersonalFeedItemVisibilityEnum> get values => _$personalFeedItemVisibilityEnumValues;
  static PersonalFeedItemVisibilityEnum valueOf(String name) => _$personalFeedItemVisibilityEnumValueOf(name);
}

class PersonalFeedItemGeoScopeEnum extends EnumClass {

  @BuiltValueEnumConst(wireName: r'global')
  static const PersonalFeedItemGeoScopeEnum global = _$personalFeedItemGeoScopeEnum_global;
  @BuiltValueEnumConst(wireName: r'country')
  static const PersonalFeedItemGeoScopeEnum country = _$personalFeedItemGeoScopeEnum_country;
  @BuiltValueEnumConst(wireName: r'province')
  static const PersonalFeedItemGeoScopeEnum province = _$personalFeedItemGeoScopeEnum_province;
  @BuiltValueEnumConst(wireName: r'municipality')
  static const PersonalFeedItemGeoScopeEnum municipality = _$personalFeedItemGeoScopeEnum_municipality;
  @BuiltValueEnumConst(wireName: r'community')
  static const PersonalFeedItemGeoScopeEnum community = _$personalFeedItemGeoScopeEnum_community;
  @BuiltValueEnumConst(wireName: r'none')
  static const PersonalFeedItemGeoScopeEnum none = _$personalFeedItemGeoScopeEnum_none;

  static Serializer<PersonalFeedItemGeoScopeEnum> get serializer => _$personalFeedItemGeoScopeEnumSerializer;

  const PersonalFeedItemGeoScopeEnum._(String name): super(name);

  static BuiltSet<PersonalFeedItemGeoScopeEnum> get values => _$personalFeedItemGeoScopeEnumValues;
  static PersonalFeedItemGeoScopeEnum valueOf(String name) => _$personalFeedItemGeoScopeEnumValueOf(name);
}
