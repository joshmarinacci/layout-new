import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {ignores: ['dist', 'docs', 'examples', 'src-tauri', 'node_modules']},
    {
        files: ['**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
            reactHooks.configs.flat['recommended-latest'],
        ],
        languageOptions: {
            ecmaVersion: 2022,
            globals: {...globals.browser, ...globals.node},
        },
        rules: {
            // Sanitizers intentionally match \u0000-\u001f in filenames and font names.
            'no-control-regex': 'off',
            // The recommended preset only warns on missing deps; fail the lint instead.
            'react-hooks/exhaustive-deps': 'error',
        },
    },
    // Must stay last: turns off rules that conflict with Prettier's formatting.
    prettier,
);
