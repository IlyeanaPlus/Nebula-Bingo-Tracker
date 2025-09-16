import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])

// .eslintrc.nbt.cjs
// Flags legacy pipeline imports so we don't regress.
// If you already have an ESLint config, add this file and extend it from yours.

module.exports = {
  root: false, // keep false so this can be "extended" by your main config
  rules: {
    // Disallow importing old modules
    "no-restricted-imports": [
      "error",
      {
        "paths": [
          { "name": "../utils/computeCrops25", "message": "Use ../utils/computeCrops25Squares instead." },
          { "name": "./utils/computeCrops25",  "message": "Use ./utils/computeCrops25Squares instead." },

          { "name": "../utils/initIndex",      "message": "Index loads via ../utils/sprites (v3) now." },
          { "name": "./utils/initIndex",       "message": "Index loads via ./utils/sprites (v3) now." },

          { "name": "../utils/sprites_legacy", "message": "Use ../utils/sprites (v3 loader) instead." },
          { "name": "./utils/sprites_legacy",  "message": "Use ./utils/sprites (v3 loader) instead." },

          { "name": "../utils/matchers_shape", "message": "Shape head is parked. Use ../utils/matchers (cosine) instead." },
          { "name": "./utils/matchers_shape",  "message": "Shape head is parked. Use ./utils/matchers (cosine) instead." },
          { "name": "../utils/matchers_alt",   "message": "Use ../utils/matchers (cosine) instead." },
          { "name": "./utils/matchers_alt",    "message": "Use ./utils/matchers (cosine) instead." },

          { "name": "../utils/clip",           "message": "Use ../utils/clipSession instead." },
          { "name": "./utils/clip",            "message": "Use ./utils/clipSession instead." },
          { "name": "../utils/clipLegacy",     "message": "Use ../utils/clipSession instead." },
          { "name": "./utils/clipLegacy",      "message": "Use ./utils/clipSession instead." }
        ],
        // Also block wildcard-y filenames if they exist in the repo
        "patterns": [
          { "group": ["**/utils/computeCrops25.*"], "message": "Use computeCrops25Squares instead." },
          { "group": ["**/utils/initIndex.*"],      "message": "Index loads via utils/sprites (v3) now." },
          { "group": ["**/utils/sprites_*"],        "message": "Use utils/sprites (v3) only." },
          { "group": ["**/utils/matchers_*"],       "message": "Use utils/matchers (cosine) only." },
          { "group": ["**/utils/clip*.js"],         "message": "Use utils/clipSession.js only." }
        ]
      }
    ]
  }
};

