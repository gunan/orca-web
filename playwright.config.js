import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'ORCA_SLICER_BIN=./tests/fixtures/fake-slicer.sh PORT=4173 npm start',
    url: 'http://127.0.0.1:4173/api/health',
    reuseExistingServer: false
  }
});
