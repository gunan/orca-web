import test from 'node:test';
import assert from 'node:assert/strict';
import { literal, stripComments, extractProcessSchema } from '../../scripts/lib/native-schema.js';

test('C++ literals preserve units, escaped text, adjacent strings, constants, and unknown expressions without execution', () => {
  assert.equal(literal('L("A \\"quoted\\" value\\n" "next")'), 'A "quoted" value\nnext');
  assert.equal(literal('u8"\\u2206\\u2103"'), '∆℃');
  assert.equal(literal('("%")'), '%');
  assert.equal(literal('-limit', { limit: 1500 }), -1500);
  assert.equal(literal('0.05f'), 0.05);
  assert.deepEqual(literal('run_untrusted_code()'), { unresolved: 'run_untrusted_code()' });
  assert.equal(stripComments('"https://example.test/*text*/" // comment\n/* block\ncomment */ true').split('\n').length, 3);
  assert.ok(stripComments('"https://example.test/*text*/" // comment').includes('https://example.test/*text*/'));
});

function sources() {
  return {
    'PrintConfigConstants.hpp': '#define INITIAL_VALUE 0.2\n',
    'Config.hpp': 'float min = -FLT_MAX; float max = FLT_MAX;',
    'PrintConfig.cpp': `
static t_config_enum_values s_keys_map_Test { {"first", firstValue}, {"second", secondValue} };
void PrintConfigDef::init_common_params() {
 def = this->add("height", coFloat); def->label = L("Height"); def->min = 0; def->set_default_value(new ConfigOptionFloat(INITIAL_VALUE));
}
void PrintConfigDef::init_fff_params() {
 auto def_base = def = this->add("pattern", coEnum);
 def->label = L("Pattern"); def->enum_keys_map = &ConfigOptionEnum<Test>::get_enum_values();
 def->enum_values.push_back( "first"); def->enum_values.push_back("second");
 def->enum_labels.push_back(L("First")); def->enum_labels.push_back(L("Second"));
 def->set_default_value(new ConfigOptionEnum<Test>(secondValue));
 def = this->add("pattern_copy", coEnum); def->label = L("Pattern copy");
 def->enum_keys_map = &ConfigOptionEnum<Test>::get_enum_values();
 def->enum_values = def_base->enum_values; def->enum_labels = def_base->enum_labels;
 def->set_default_value(new ConfigOptionEnum<Test>(firstValue));
}`,
    'Preset.cpp': 'static std::vector<std::string> s_Preset_print_options{ "height", "pattern", "pattern_copy" };',
    'Tab.cpp': 'void TabPrint::build() { auto page = add_options_page(L("Quality")); auto optgroup = page->new_optgroup(L("Layer height")); optgroup->append_single_option_line("height"); optgroup->append_single_option_line("pattern"); }',
    'ConfigManipulation.cpp': 'toggle_field("height", have_layers);'
  };
}

test('extracts only authoritative membership, native enum aliases, page groups, and dependency references', () => {
  const result = extractProcessSchema(sources(), { version: 'fixture' });
  assert.equal(result.options.length, 3);
  assert.equal(result.options[0].default, 0.2);
  assert.equal(result.options[0].ui.page, 'Quality');
  assert.equal(result.options[0].ui.group, 'Layer height');
  assert.equal(result.options[0].dependencyReferences[0].line, 1);
  assert.deepEqual(result.options[1].options, result.options[2].options);
  assert.equal(result.options[1].default, 'second');
  assert.equal(result.options[2].default, 'first');
  assert.equal(result.options[2].ui, undefined);
  assert.deepEqual(result.coverage.unresolved, []);
});

test('fails on missing member definitions and reports unresolved metadata instead of guessing', () => {
  const missing = sources();
  missing['Preset.cpp'] = 'static std::vector<std::string> s_Preset_print_options{"missing"};';
  assert.throws(() => extractProcessSchema(missing, {}), /Missing native process definitions/);
  const dynamic = sources();
  dynamic['PrintConfig.cpp'] = dynamic['PrintConfig.cpp'].replace('def->min = 0', 'def->min = dynamic_limit()');
  const result = extractProcessSchema(dynamic, {});
  assert.equal(result.coverage.fullyParsed, 2);
  assert.deepEqual(result.coverage.unresolved, [{ key: 'height', fields: [{ field: 'min', expression: 'dynamic_limit()' }] }]);
});
