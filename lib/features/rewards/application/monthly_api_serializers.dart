// ignore_for_file: public_member_api_docs

import 'package:built_collection/built_collection.dart';
import 'package:built_value/json_object.dart';
import 'package:built_value/serializer.dart';
import 'package:lythaus_api_client/lythaus_api_client.dart' as api;

final monthlyApiSerializers =
    (api.standardSerializers.toBuilder()..addBuilderFactory(
          const FullType(BuiltMap, [
            FullType(String),
            FullType.nullable(JsonObject),
          ]),
          () => MapBuilder<String, JsonObject?>(),
        ))
        .build();
