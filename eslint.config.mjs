import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  // Global ignores - must be standalone object
  { ignores: ['out/', 'dist/', 'node_modules/', '*.js', '*.cjs'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  // All TypeScript source files
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'off',
      'no-prototype-builtins': 'off',
    },
  },

  // Renderer (browser)
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
        Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
        HTMLVideoElement: 'readonly', HTMLCanvasElement: 'readonly',
        HTMLElement: 'readonly', HTMLDivElement: 'readonly',
        CanvasRenderingContext2D: 'readonly', Image: 'readonly',
        ResizeObserver: 'readonly', IntersectionObserver: 'readonly',
        MutationObserver: 'readonly', localStorage: 'readonly',
        MouseEvent: 'readonly', KeyboardEvent: 'readonly',
        React: 'readonly',
      },
    },
  },

  // Main process (Node.js)
  {
    files: ['src/main/**/*.ts'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', Buffer: 'readonly',
        __dirname: 'readonly', __filename: 'readonly', require: 'readonly',
        module: 'readonly', exports: 'readonly', setTimeout: 'readonly',
        clearTimeout: 'readonly', setInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Preload (Node.js + browser bridge)
  {
    files: ['src/preload/**/*.ts'],
    languageOptions: {
      globals: {
        window: 'readonly', document: 'readonly', console: 'readonly',
        process: 'readonly', Buffer: 'readonly',
      },
    },
  },
)
