import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/browser',
  workers: 4, // Bound WebGL/browser contention when native engine suites run alongside it.
  use: {
    storageState: {cookies:[],origins:[{origin:'http://127.0.0.1:4173',localStorage:[{name:'orca-web:native-startup-preferences-v1',value:'{"version":1,"default_page":"1"}'}]}]}, baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'ORCA_ARRANGE_WORKER_BIN=./tests/fixtures/fake-arrange-worker.mjs ORCA_GCODE_WORKER_BIN=./tests/fixtures/no-native-gcode-worker ORCA_SLICER_BIN=./tests/fixtures/fake-slicer.sh ORCA_PROFILES_DIR=./tests/fixtures/presets DATA_DIR=./test-results/e2e-data HOST=127.0.0.1 PORT=4173 npm start',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false
  }
});
