// Source extraction is deliberately limited to literal C++ option metadata.
// Unknown expressions remain explicit; source code is never executed as JS.
const strings = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
const unknown = expression => ({ unresolved: expression.trim() });
const unresolved = value => value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, 'unresolved');

export function stripComments(source) {
  return source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    match => match.startsWith('//') || match.startsWith('/*') ? match.replace(/[^\n]/g, ' ') : match);
}

function balanced(source, start, open = source[start], close = { '(': ')', '{': '}', '[': ']' }[open]) {
  const masked = source.replace(strings, match => ' '.repeat(match.length));
  let depth = 0;
  for (let index = start; index < masked.length; index++) {
    if (masked[index] === open) depth++;
    else if (masked[index] === close && --depth === 0) return { text: source.slice(start + 1, index), end: index + 1 };
  }
  throw new Error(`Unterminated ${open} at source offset ${start}`);
}

function split(expression) {
  const masked = expression.replace(strings, match => ' '.repeat(match.length));
  const result = [];
  let depth = 0, start = 0;
  for (let index = 0; index < masked.length; index++) {
    if ('({['.includes(masked[index])) depth++;
    else if (')}]'.includes(masked[index])) depth--;
    else if (masked[index] === ',' && depth === 0) { result.push(expression.slice(start, index).trim()); start = index + 1; }
  }
  if (expression.slice(start).trim()) result.push(expression.slice(start).trim());
  return result;
}

function decodeString(quoted) {
  return quoted.slice(1, -1).replace(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([0-7]{1,3})|([\s\S]))/g, (_, unicode, hex, octal, escaped) => {
    if (unicode || hex || octal) return String.fromCharCode(parseInt(unicode || hex || octal, octal ? 8 : 16));
    return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', a: '\x07' })[escaped] ?? escaped;
  });
}

export function literal(expression, constants = {}) {
  let value = expression.trim();
  if (value.startsWith('(') && balanced(value, 0).end === value.length) return literal(value.slice(1, -1), constants);
  if (/^(?:L|_L|_U|_)\s*\(/.test(value)) {
    const bracket = value.indexOf('('), argument = balanced(value, bracket);
    if (argument.end === value.length) return literal(argument.text, constants);
  }
  if (/^(?:(?:u8|u|U|L)?"(?:\\.|[^"\\])*"\s*)+$/.test(value)) return [...value.matchAll(/"(?:\\.|[^"\\])*"/g)].map(match => decodeString(match[0])).join('');
  if (value === 'true' || value === 'false') return value === 'true';
  if (Object.hasOwn(constants, value)) return constants[value];
  if (/^-[A-Za-z_]\w*$/.test(value) && typeof constants[value.slice(1)] === 'number') return -constants[value.slice(1)];
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?[fFlL]?$/.test(value)) return Number(value.replace(/[fFlL]$/, ''));
  if (value.startsWith('{') && balanced(value, 0).end === value.length) return split(value.slice(1, -1)).map(item => literal(item, constants));
  return unknown(value);
}

function functionBlock(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) throw new Error(`Missing authoritative source function: ${signature}`);
  const opening = source.indexOf('{', start);
  return { ...balanced(source, opening), start: opening + 1 };
}

const lineAt = (source, offset) => source.slice(0, offset).split('\n').length;
const normalizedEnum = value => value.trim().replace(/^int\((.*)\)$/, '$1').replace(/^static_cast<int>\((.*)\)$/, '$1');

function enumMaps(source) {
  const result = {};
  for (const match of source.matchAll(/(?:static\s+)?(?:const\s+)?t_config_enum_values\s+s_keys_map_(\w+)\s*(?:=\s*)?\{/g)) {
    const body = balanced(source, match.index + match[0].lastIndexOf('{')).text;
    result[match[1]] = split(body).filter(Boolean).map(pair => {
      const values = split(pair.replace(/^\s*\{/, '').replace(/\}\s*$/, ''));
      return { value: literal(values[0]), symbol: normalizedEnum(values[1] || '') };
    });
  }
  return result;
}

function defaultValue(expression, enumType, maps, constants) {
  const constructor = expression.trim().match(/^new\s+(ConfigOption\w+)(?:<([^>]+)>)?\s*([({])/);
  if (!constructor) return unknown(expression);
  const [, type, template] = constructor;
  const argument = balanced(expression, expression.indexOf(constructor[3], constructor.index));
  const argumentsList = split(argument.text);
  if (/^ConfigOptionEnum(?:sGeneric(?:Nullable)?|Generic)?$/.test(type)) {
    const symbol = normalizedEnum(argumentsList.at(-1) || '');
    const mapped = maps[template || enumType]?.find(item => item.symbol === symbol)?.value;
    if (mapped === undefined) return unknown(expression);
    return type.includes('Enums') ? [mapped] : mapped;
  }
  if (type === 'ConfigOptionFloatOrPercent') {
    const value = literal(argumentsList[0], constants), percent = literal(argumentsList[1], constants);
    return typeof value === 'number' && typeof percent === 'boolean' ? { value, percent } : unknown(expression);
  }
  if (/^ConfigOption(?:Bool|Float|Int|Percent|String)$/.test(type)) {
    if (!argumentsList.length) return type === 'ConfigOptionString' ? '' : type === 'ConfigOptionBool' ? false : 0;
    return argumentsList.length === 1 ? literal(argumentsList[0], constants) : unknown(expression);
  }
  if (/^ConfigOption(?:Bools|Floats|Ints|Percents|Strings)(?:Nullable)?$/.test(type)) {
    if (constructor[3] === '(' && argumentsList.length > 1) {
      const count = literal(argumentsList[0], constants), value = literal(argumentsList[1], constants);
      if (Number.isInteger(count) && count >= 0 && count < 100 && !unresolved(value)) return Array(count).fill(value);
      return unknown(expression);
    }
    return argumentsList.map(item => literal(item, constants));
  }
  return unknown(expression);
}

function metadataBlock(body, key, nativeType, context) {
  const raw = { label: '', category: '', tooltip: '', sidetext: '', mode: 'comSimple', nullable: false, readonly: false, multiline: false, ratio_over: '', min: -3.4028234663852886e38, max: 3.4028234663852886e38, enum_values: [], enum_labels: [] };
  const problems = [];
  let enumType, defaultExpression;
  // Assignments, pushes and defaults are processed in source order, preserving
  // native option order and aliases such as def_top_fill_pattern.
  const operations = /def->(\w+)\s*(=|\.(?:push_back|emplace_back)\s*\(|\()\s*/g;
  for (const match of body.matchAll(operations)) {
    const field = match[1], operation = match[2], position = match.index + match[0].length;
    let expression;
    if (operation === '=') {
      const tail = body.slice(position), masked = tail.replace(strings, text => ' '.repeat(text.length));
      const end = masked.indexOf(';');
      if (end < 0) throw new Error(`Missing assignment terminator for ${key}.${field}`);
      expression = tail.slice(0, end).trim();
    } else expression = balanced(body, match.index + match[0].lastIndexOf('(')).text.trim();
    if (field === 'set_default_value') { defaultExpression = expression; continue; }
    if (field === 'enum_keys_map') {
      enumType = expression.match(/ConfigOptionEnum<([^>]+)>/)?.[1] || expression.match(/&s_keys_map_(\w+)/)?.[1];
      continue;
    }
    if (!Object.hasOwn(raw, field) && !['full_label', 'max_literal', 'gui_type', 'gui_flags'].includes(field)) continue;
    let value;
    const reference = expression.match(/^(\w+)->(\w+)$/);
    if (reference) value = context.aliases[reference[1]]?.[reference[2]] ?? unknown(expression);
    else if (field === 'mode') value = /^com(?:Simple|Advanced|Expert|Develop)$/.test(expression) ? expression : unknown(expression);
    else if (field === 'gui_type') value = expression.startsWith('ConfigOptionDef::GUIType::') ? expression.split('::').at(-1) : unknown(expression);
    else value = literal(expression, context.constants);
    if (operation.startsWith('.')) {
      if (!Array.isArray(raw[field])) raw[field] = [];
      raw[field].push(value);
    } else raw[field] = value;
  }
  const defaults = defaultExpression === undefined ? unknown('No native default assignment') : defaultValue(defaultExpression, enumType, context.enums, context.constants);
  for (const [field, value] of Object.entries({ ...raw, default: defaults })) {
    if (unresolved(value) || (Array.isArray(value) && value.some(unresolved))) problems.push({ field, expression: unresolved(value) ? value.unresolved : value.filter(unresolved).map(item => item.unresolved).join(', ') });
  }
  const values = raw.enum_values;
  const labels = raw.enum_labels;
  // An enum without explicit GUI values still has authoritative serialized keys.
  const options = Array.isArray(values) && values.length ? values : context.enums[enumType]?.map(item => item.value) || [];
  const definition = {
    key, nativeType, label: raw.label, fullLabel: raw.full_label || raw.label,
    category: raw.category, tooltip: raw.tooltip, unit: raw.sidetext,
    mode: raw.mode, nullable: raw.nullable, readOnly: raw.readonly, multiline: raw.multiline,
    min: raw.min, max: raw.max, ratioOver: raw.ratio_over,
    default: defaults,
    ...(options.length ? { options: options.map((value, index) => ({ value, label: Array.isArray(labels) && labels[index] !== undefined ? labels[index] : value })) } : {}),
    ...(raw.gui_type ? { guiType: raw.gui_type } : {}),
    ...(raw.gui_flags ? { guiFlags: raw.gui_flags } : {}),
    ...(raw.max_literal !== undefined ? { maxLiteral: raw.max_literal } : {}),
    unresolved: problems
  };
  return { definition, raw };
}

function presetKeys(source) {
  const match = source.match(/s_Preset_print_options\s*\{/);
  if (!match) throw new Error('Native process preset membership list was not found');
  const body = balanced(source, match.index + match[0].lastIndexOf('{'));
  const keys = split(body.text).map(item => literal(item));
  if (keys.some(key => typeof key !== 'string')) throw new Error('Native process membership contains unsupported expressions');
  return keys;
}

function uiLayout(source) {
  const block = functionBlock(source, 'void TabPrint::build()');
  const result = new Map();
  let page = '', group = '', order = 0;
  const events = /add_options_page\s*\(|new_optgroup\s*\(|append_single_option_line\s*\(|get_option\s*\(/g;
  for (const match of block.text.matchAll(events)) {
    const expression = balanced(block.text, match.index + match[0].lastIndexOf('(')).text;
    const value = literal(split(expression)[0]);
    if (typeof value !== 'string') continue;
    if (match[0].startsWith('add_options_page')) { page = value; group = ''; }
    else if (match[0].startsWith('new_optgroup')) group = value;
    else if (!result.has(value)) result.set(value, { page, group, order: order++, line: lineAt(source, block.start + match.index) });
  }
  return result;
}

function dependencyReferences(source, key) {
  const lines = source.split('\n'), result = [];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].includes(`"${key}"`)) result.push({ line: index + 1, source: 'ConfigManipulation.cpp' });
  }
  return result;
}

function positiveValidationRules(source) {
  const result = new Map();
  const signature = 'std::map<std::string, std::string> validate(const FullPrintConfig &cfg, bool under_cli)';
  if (!source.includes(signature)) return result;
  const block = functionBlock(source, signature);
  for (const match of block.text.matchAll(/if\s*\(\s*cfg\.(?:get_abs_value\("([^"]+)"\)|(\w+)(?:\.value)?)\s*<=\s*0\s*\)/g)) {
    result.set(match[1] || match[2], { minimumExclusive: 0, validationSource: { file: 'PrintConfig.cpp', line: lineAt(source, block.start + match.index) } });
  }
  return result;
}

export function extractProcessSchema(sources, provenance) {
  const cleaned = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, stripComments(source)]));
  const constants = {};
  for (const match of cleaned['PrintConfigConstants.hpp'].matchAll(/^\s*#define\s+(\w+)\s+([^\n]+)/gm)) constants[match[1]] = literal(match[2]);
  for (const match of cleaned['PrintConfig.cpp'].matchAll(/\bconst\s+(?:int|double|float|bool)\s+(\w+)\s*=\s*([^;]+);/g)) {
    const value = literal(match[2], constants);
    if (!unresolved(value)) constants[match[1]] = value;
  }
  const context = { constants, aliases: {}, enums: enumMaps(cleaned['PrintConfig.cpp']) };
  const keys = presetKeys(cleaned['Preset.cpp']);
  const definitions = new Map();
  const source = cleaned['PrintConfig.cpp'];
  for (const signature of ['void PrintConfigDef::init_common_params()', 'void PrintConfigDef::init_fff_params()']) {
    const block = functionBlock(source, signature);
    const calls = [...block.text.matchAll(/\bdef\s*=\s*this->add(?:_nullable)?\s*\(/g)];
    for (let index = 0; index < calls.length; index++) {
      const match = calls[index], opening = match.index + match[0].lastIndexOf('(');
      const call = balanced(block.text, opening), args = split(call.text);
      const key = literal(args[0]);
      if (typeof key !== 'string' || !/^co\w+$/.test(args[1] || '')) continue;
      const body = block.text.slice(call.end, calls[index + 1]?.index ?? block.text.length);
      const { definition, raw } = metadataBlock(body, key, args[1], context);
      definition.source = { file: 'PrintConfig.cpp', line: lineAt(source, block.start + match.index) };
      const startOfLine = block.text.lastIndexOf('\n', match.index) + 1;
      const alias = block.text.slice(startOfLine, match.index).match(/auto\s+(\w+)\s*=\s*$/)?.[1];
      if (alias) context.aliases[alias] = raw;
      if (definitions.has(key) && keys.includes(key)) throw new Error(`Duplicate native process definition ${key}`);
      definitions.set(key, definition);
    }
  }
  const layout = uiLayout(cleaned['Tab.cpp']), validation = positiveValidationRules(source);
  const missing = keys.filter(key => !definitions.has(key));
  if (missing.length) throw new Error(`Missing native process definitions: ${missing.join(', ')}`);
  const options = keys.map(key => ({ ...definitions.get(key), ...(validation.get(key) || {}), ...(layout.has(key) ? { ui: layout.get(key) } : {}), dependencyReferences: dependencyReferences(cleaned['ConfigManipulation.cpp'], key) }));
  return {
    schemaVersion: 1, provenance,
    scope: 'All FFF process preset keys declared by Preset.cpp; machine and filament schemas are separate work.',
    dependencyStatus: 'Source references only. Native conditional visibility, enablement, and automatic corrections are not implemented by this metadata export.',
    coverage: { processKeys: keys.length, definitions: options.length, nativeUiControls: options.filter(item => item.ui).length, fullyParsed: options.filter(item => item.unresolved.length === 0).length, unresolved: options.filter(item => item.unresolved.length).map(item => ({ key: item.key, fields: item.unresolved })) },
    options
  };
}

// Literal extraction primitives shared with the machine/filament generator.
export { balanced, split, functionBlock, lineAt, enumMaps, metadataBlock, dependencyReferences, positiveValidationRules };
