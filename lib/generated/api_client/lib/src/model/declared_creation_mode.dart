//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'declared_creation_mode.g.dart';

class DeclaredCreationMode extends EnumClass {

  /// Public author disclosure. AI-generated public content is not accepted.
  @BuiltValueEnumConst(wireName: r'human')
  static const DeclaredCreationMode human = _$human;
  /// Public author disclosure. AI-generated public content is not accepted.
  @BuiltValueEnumConst(wireName: r'ai_assisted')
  static const DeclaredCreationMode aiAssisted = _$aiAssisted;

  static Serializer<DeclaredCreationMode> get serializer => _$declaredCreationModeSerializer;

  const DeclaredCreationMode._(String name): super(name);

  static BuiltSet<DeclaredCreationMode> get values => _$values;
  static DeclaredCreationMode valueOf(String name) => _$valueOf(name);
}

/// Optionally, enum_class can generate a mixin to go with your enum for use
/// with Angular. It exposes your enum constants as getters. So, if you mix it
/// in to your Dart component class, the values become available to the
/// corresponding Angular template.
///
/// Trigger mixin generation by writing a line like this one next to your enum.
abstract class DeclaredCreationModeMixin = Object with _$DeclaredCreationModeMixin;
