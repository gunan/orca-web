export const ROTATION_PRESETS = [0, 90, 180, 270];
export function displayAngle(degrees) {
  const angle = ((degrees % 360) + 360) % 360;
  return Math.abs(angle - 360) < 1e-7 || Math.abs(angle) < 1e-7
    ? 0
    : Number(angle.toFixed(1));
}
export function withRotationAngle(rotation, axis, degrees) {
  if (
    !Number.isInteger(axis) ||
    axis < 0 ||
    axis > 2 ||
    !Number.isFinite(degrees)
  )
    throw new Error("Enter a valid rotation angle.");
  return rotation.map((value, index) => (index === axis ? degrees : value));
}
