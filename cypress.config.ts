import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    baseUrl: 'http://127.0.0.1:4178',
    video: false,
    screenshotOnRunFailure: true,
    specPattern: 'tests/cypress/**/*.cy.ts',
    supportFile: false,
  },
});
