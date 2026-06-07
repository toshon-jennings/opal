
import {
    PREVIEW_CDN_URLS,
    PREVIEW_SECURITY_LIMITS,
    assertPreviewBudget,
    buildPreviewErrorDocument,
    createPreviewRuntimeGuard,
    getPreviewCsp
} from '../lib/previewSecurity';

export function generatePreviewHTML(files, options = {}) {
    const isDarkMode = Boolean(options.isDarkMode);

    // Each component file goes ahead of App.tsx so components are defined (in one
    // shared eval scope) before App references them; the render call comes last.
    // Files are kept as SEPARATE sources and transpiled one-by-one in the browser
    // rather than concatenated first: each file commonly does `import React`, and
    // parsing them as one module would be a duplicate-binding error. Imports and
    // exports are stripped by Babel (strip-modules plugin below) instead of by
    // regex, which missed multi-line and side-effect imports.
    const componentFiles = Object.entries(files)
        .filter(([path]) => (path.endsWith('.tsx') || path.endsWith('.jsx')) && path !== 'src/App.tsx' && path !== 'src/index.tsx')
        .map(([, code]) => code);

    const appCode = files['src/App.tsx'] || '';

    const sources = [
        ...componentFiles,
        appCode,
        `ReactDOM.createRoot(document.getElementById('root')).render(<App />);`
    ];
    const totalSourceChars = sources.reduce((total, source) => total + String(source || '').length, 0);
    try {
        assertPreviewBudget('Build preview source', totalSourceChars, PREVIEW_SECURITY_LIMITS.maxSourceChars);
    } catch (error) {
        return buildPreviewErrorDocument(error.message);
    }

    // Embed the sources as JSON inside a non-executed <script type="text/plain">.
    // Each source is transpiled with the TypeScript preset (isTSX) so generated
    // .tsx files with interfaces and generics (e.g. useState<T>()) transform
    // correctly. Escape </script> so source can't break out of the block.
    const sourcesJSON = JSON.stringify(sources).replace(/<\/script>/gi, '<\\/script>');

    // Surface colors so the preview's default (unpainted) background matches
    // Perci's active theme instead of always defaulting to white.
    const surfaceBg = isDarkMode ? '#0f1115' : '#ffffff';
    const surfaceText = isDarkMode ? '#e5e7eb' : '#111827';
    const scrollbarTrack = isDarkMode ? '#1c1f26' : '#f1f1f1';
    const scrollbarThumb = isDarkMode ? '#3a3f4b' : '#c1c1c1';
    const scrollbarThumbHover = isDarkMode ? '#4a505e' : '#a8a8a8';

    // Create HTML with bundled code
    return `
<!DOCTYPE html>
<html${isDarkMode ? ' class="dark"' : ''}>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${getPreviewCsp({ scripts: true, styles: true, images: true })}">
    <script src="${PREVIEW_CDN_URLS.react}"></script>
    <script src="${PREVIEW_CDN_URLS.reactDom}"></script>
    <script src="${PREVIEW_CDN_URLS.babel}"></script>
    <script>tailwind = { config: { darkMode: 'class' } };</script>
    <script src="${PREVIEW_CDN_URLS.tailwind}"></script>
    <style>
        html, body { background: ${surfaceBg}; color: ${surfaceText}; }
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
        /* Add some basic scrollbar styling */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: ${scrollbarTrack}; }
        ::-webkit-scrollbar-thumb { background: ${scrollbarThumb}; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: ${scrollbarThumbHover}; }
    </style>
</head>
<body>
    <div id="root"></div>

    <script type="application/json" id="__perci-src">${sourcesJSON}</script>
    <script>
        ${createPreviewRuntimeGuard()}

        const { useState, useEffect, useRef, useMemo, useCallback } = React;

        // Prevent common errors
        window.process = { env: { NODE_ENV: 'production' } };

        try {
            // Strip ES module syntax: imports point at bare/relative modules that
            // don't exist here (components share one eval scope), and exports are
            // meaningless. A default-exported function/class declaration keeps its
            // declaration so the name (e.g. App) stays defined; a bare default
            // export expression is dropped.
            const __stripModules = function () {
                return {
                    visitor: {
                        ImportDeclaration(path) { path.remove(); },
                        ExportDefaultDeclaration(path) {
                            const decl = path.node.declaration;
                            if (decl && (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') && decl.id) {
                                path.replaceWith(decl);
                            } else {
                                path.remove();
                            }
                        },
                        ExportNamedDeclaration(path) {
                            if (path.node.declaration) path.replaceWith(path.node.declaration);
                            else path.remove();
                        },
                        ExportAllDeclaration(path) { path.remove(); }
                    }
                };
            };
            const __sources = JSON.parse(document.getElementById('__perci-src').textContent);
            // Transpile each file separately so a per-file import of React is not
            // a duplicate-binding error across the combined program.
            const __perciOut = __sources.map(function (src) {
                return Babel.transform(src, {
                    filename: 'app.tsx',
                    presets: ['react', ['typescript', { isTSX: true, allExtensions: true }]],
                    plugins: [__stripModules]
                }).code;
            }).join('\\n');
            // Executing generated code is the whole point of this sandboxed
            // (allow-scripts) preview iframe; this replaces the prior
            // <script type="text/babel"> auto-transform. Direct eval keeps the
            // destructured React hooks above in scope for the transpiled code.
            eval(__perciOut);
        } catch (err) {
            const errorBox = document.createElement('div');
            errorBox.style.cssText = 'color: red; padding: 20px; white-space: pre-wrap; font-family: monospace;';
            errorBox.textContent = err && err.message ? err.message : String(err);
            document.getElementById('root').replaceChildren(errorBox);
            console.error(err);
        }
    </script>
</body>
</html>
    `;
}
