module.exports = {
    root: true,
    env: {
        browser: true,
        es2022: true,
        node: true
    },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        // React 17+ automatic JSX transform (Vite's @vitejs/plugin-react default):
        // turns off react-in-jsx-scope / jsx-uses-react.
        'plugin:react/jsx-runtime',
        'plugin:react-hooks/recommended'
    ],
    plugins: ['react-refresh'],
    globals: {
        // Injected at build time by vite.config.js `define`.
        __APP_VERSION__: 'readonly'
    },
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    settings: {
        react: {
            version: 'detect'
        }
    },
    rules: {
        'no-constant-condition': 'off',
        'no-control-regex': 'off',
        'react/prop-types': 'off',
        // <webview> is a real Electron tag; these are its documented attributes,
        // which the rule only knows about for plain DOM elements.
        'react/no-unknown-property': ['error', {
            ignore: [
                'allowpopups',
                'disablewebsecurity',
                'httpreferrer',
                'nodeintegration',
                'partition',
                'preload',
                'useragent',
                'webpreferences'
            ]
        }],
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    },
    overrides: [
        {
            // react-three-fiber scenes. R3F maps the whole three.js object model
            // onto JSX intrinsics (<mesh position>, <boxGeometry args>, ...), so
            // no-unknown-property has no idea what is valid here.
            files: ['src/components/OfficeScene.jsx', 'src/components/NotesGraph3D.jsx'],
            rules: {
                'react/no-unknown-property': 'off'
            }
        }
    ]
};
