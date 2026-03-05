/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: 'tests',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx -y serve -p 3000 -s .',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
};
