// OrcaSlicer 2.4.2 GizmoObjectManipulation uses this truncated reciprocal,
// independently of its exact 25.4 factor when committing an inch value.
const millimetersToInches = 0.0393700787;
const inchesToMillimeters = 25.4;
const keys = new Set(['position', 'size', 'rotation', 'absolute_rotation', 'scale']);
function checked(key, value) {
  if (!keys.has(key) || !Number.isFinite(value)) throw new Error('Invalid manipulation value');
  return key === 'position' || key === 'size';
}
export function nativeManipulationDisplay(key, value, imperial = false) {
  return checked(key, value) && imperial ? value * millimetersToInches : value;
}
export function nativeManipulationInput(key, value, imperial = false) {
  return checked(key, value) && imperial ? value * inchesToMillimeters : value;
}
