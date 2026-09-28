export const RAW_CLI_SHRINKAGE_WARNING = 'Source-based shrinkage preview: fresh-load OrcaSlicer 2.4.2 CLI slicing has a known shrinkage discrepancy. Confirm final layers in the sliced preview.';

// Suppress only this known raw-CLI diagnostic after the server positively
// advertises its native initialization adapter. Retain unrelated warnings.
export function shrinkagePreviewWarnings(context, nativeShrinkageInitialization = false) {
  return (context?.warnings || []).filter(warning => nativeShrinkageInitialization !== true || warning !== RAW_CLI_SHRINKAGE_WARNING);
}
