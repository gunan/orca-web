import test from 'node:test';
import assert from 'node:assert/strict';
import {RAW_CLI_SHRINKAGE_WARNING,shrinkagePreviewWarnings} from '../../shared/shrinkage-status.js';
test('only a positively advertised native initialization capability suppresses the raw CLI diagnostic',()=>{
  const context={warnings:[RAW_CLI_SHRINKAGE_WARNING,'A separate source limitation']};
  for(const capability of [undefined,false,'true',null])assert.deepEqual(shrinkagePreviewWarnings(context,capability),context.warnings);
  assert.deepEqual(shrinkagePreviewWarnings(context,true),['A separate source limitation']);
  assert.deepEqual(context.warnings,[RAW_CLI_SHRINKAGE_WARNING,'A separate source limitation']);
  assert.deepEqual(shrinkagePreviewWarnings(null,true),[]);
});
