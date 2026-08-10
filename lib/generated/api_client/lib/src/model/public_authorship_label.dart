//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//

// ignore_for_file: unused_element
import 'package:built_collection/built_collection.dart';
import 'package:built_value/built_value.dart';
import 'package:built_value/serializer.dart';

part 'public_authorship_label.g.dart';

class PublicAuthorshipLabel extends EnumClass {

  @BuiltValueEnumConst(wireName: r'Human-authored')
  static const PublicAuthorshipLabel humanAuthored = _$humanAuthored;
  @BuiltValueEnumConst(wireName: r'AI-assisted')
  static const PublicAuthorshipLabel aIAssisted = _$aIAssisted;

  static Serializer<PublicAuthorshipLabel> get serializer => _$publicAuthorshipLabelSerializer;

  const PublicAuthorshipLabel._(String name): super(name);

  static BuiltSet<PublicAuthorshipLabel> get values => _$values;
  static PublicAuthorshipLabel valueOf(String name) => _$valueOf(name);
}

/// Optionally, enum_class can generate a mixin to go with your enum for use
/// with Angular. It exposes your enum constants as getters. So, if you mix it
/// in to your Dart component class, the values become available to the
/// corresponding Angular template.
///
/// Trigger mixin generation by writing a line like this one next to your enum.
abstract class PublicAuthorshipLabelMixin = Object with _$PublicAuthorshipLabelMixin;
