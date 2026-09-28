// OrcaSlicer 2.4.2, GCodeProcessor.cpp:58–101 and GCode.cpp:4619–4627.
// The Bambu and compatible tag sets describe identical slice events. Reading
// them must preserve the original native text and command order.
export const isNativeLayerChange = line => line.trim() === ';LAYER_CHANGE' || line.trim() === '; CHANGE_LAYER';
export function nativeLayerZ(line) {
  const match = line.match(/^;(?:Z:| Z_HEIGHT:)\s*([-+\d.eE]+)\s*$/);
  return match ? Number(match[1]) : undefined;
}
export function nativeFeature(line) {
  const match = line.match(/^;(?:TYPE:| FEATURE: )(.*)$/);
  return match ? match[1].trim() : undefined;
}
export const isNativeWipeStart = line => line === ';WIPE_START' || line === '; WIPE_START';
export const isNativeWipeEnd = line => line === ';WIPE_END' || line === '; WIPE_END';
