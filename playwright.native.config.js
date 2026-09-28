import { defineConfig } from '@playwright/test';

// Preserve production engine/resource configuration, but fail if fixture paths
// leaked into this real-native test environment. There is no fake fallback.
for (const key of ['ORCA_SLICER_BIN', 'ORCA_PROFILES_DIR']) {
  if (/fake-slicer|tests[/\\]fixtures/i.test(process.env[key] || '')) {
    throw new Error(`${key} points at a test fixture; native browser tests require the installed OrcaSlicer and native presets.`);
  }
}

export default defineConfig({
  testDir: './tests/native-e2e',
  outputDir: './test-results/native-browser',
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 10_000 },
  use: {
    storageState: {cookies:[],origins:[{origin:'http://127.0.0.1:4174',localStorage:[{name:'orca-web:native-startup-preferences-v1',value:'{"version":1,"default_page":"1"}'}]}]},
    baseURL: 'http://127.0.0.1:4174',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'DATA_DIR=./test-results/native-e2e-data HOST=127.0.0.1 PORT=4174 npm start',
    url: 'http://127.0.0.1:4174/api/health',
    timeout: 60_000,
    reuseExistingServer: false
  }
});
