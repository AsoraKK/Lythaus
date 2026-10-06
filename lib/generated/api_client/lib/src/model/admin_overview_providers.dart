//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:lythaus_api_client/src/model/overview_provider.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'admin_overview_providers.g.dart';

/// AdminOverviewProviders
///
/// Properties:
/// * [cloudflare]
/// * [planetscale]
@BuiltValue()
abstract class AdminOverviewProviders implements Built<AdminOverviewProviders, AdminOverviewProvidersBuilder> {
  @BuiltValueField(wireName: r'cloudflare')
  OverviewProvider get cloudflare;

  @BuiltValueField(wireName: r'planetscale')
  OverviewProvider get planetscale;

  AdminOverviewProviders._();

  factory AdminOverviewProviders([void updates(AdminOverviewProvidersBuilder b)]) = _$AdminOverviewProviders;

  @BuiltValueHook(initializeBuilder: true)
  static void _defaults(AdminOverviewProvidersBuilder b) => b;

  @BuiltValueSerializer(custom: true)
  static Serializer<AdminOverviewProviders> get serializer => _$AdminOverviewProvidersSerializer();
}

class _$AdminOverviewProvidersSerializer implements PrimitiveSerializer<AdminOverviewProviders> {
  @override
  final Iterable<Type> types = const [AdminOverviewProviders, _$AdminOverviewProviders];

  @override
  final String wireName = r'AdminOverviewProviders';

  Iterable<Object?> _serializeProperties(
    Serializers serializers,
    AdminOverviewProviders object, {
    FullType specifiedType = FullType.unspecified,
  }) sync* {
    yield r'cloudflare';
    yield serializers.serialize(
      object.cloudflare,
      specifiedType: const FullType(OverviewProvider),
    );
    yield r'planetscale';
    yield serializers.serialize(
      object.planetscale,
      specifiedType: const FullType(OverviewProvider),
    );
  }

  @override
  Object serialize(
    Serializers serializers,
    AdminOverviewProviders object, {
    FullType specifiedType = FullType.unspecified,
  }) {
    return _serializeProperties(serializers, object, specifiedType: specifiedType).toList();
  }

  void _deserializeProperties(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
    required List<Object?> serializedList,
    required AdminOverviewProvidersBuilder result,
    required List<Object?> unhandled,
  }) {
    for (var i = 0; i < serializedList.length; i += 2) {
      final key = serializedList[i] as String;
      final value = serializedList[i + 1];
      switch (key) {
        case r'cloudflare':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewProvider),
          ) as OverviewProvider;
          result.cloudflare.replace(valueDes);
          break;
        case r'planetscale':
          final valueDes = serializers.deserialize(
            value,
            specifiedType: const FullType(OverviewProvider),
          ) as OverviewProvider;
          result.planetscale.replace(valueDes);
          break;
        default:
          unhandled.add(key);
          unhandled.add(value);
          break;
      }
    }
  }

  @override
  AdminOverviewProviders deserialize(
    Serializers serializers,
    Object serialized, {
    FullType specifiedType = FullType.unspecified,
  }) {
    final result = AdminOverviewProvidersBuilder();
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
