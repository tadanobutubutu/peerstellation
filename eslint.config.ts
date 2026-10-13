import eslint from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import security from 'eslint-plugin-security';

export default [
  {
    ignores: [
      'vite.config.ts',
      'vitest.config.ts',
      'playwright.config.ts',
      'coverage/**',
      'public/locales/**',
      'src/scene/renderer-wasm/**',
      'wasm/target/**',
      'artifacts/**',
      'node_modules/**',
    ],
  },
  eslint.configs.recommended,
  security.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          plugins: ['@babel/plugin-syntax-typescript'],
        },
      },
    },
    rules: {
      // Babel parses TypeScript syntax but does not provide TypeScript's scope
      // model. `tsc`/Biome own type and unused-symbol checks; ESLint here is
      // deliberately the security audit layer.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    // The repository deliberately has no JSX. Keeping the a11y rules in a
    // separate scope makes the audit reusable if a component is introduced,
    // without pretending that a DOM-only TypeScript file is JSX-tested.
    files: ['**/*.{jsx,tsx}'],
    ...jsxA11y.flatConfigs.recommended,
  },
];
