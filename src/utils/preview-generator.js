
export function generatePreviewHTML(files, options = {}) {
    const isDarkMode = Boolean(options.isDarkMode);
    // Extract all component code
    const appCode = files['src/App.tsx'] || '';

    // Process component files to remove exports and imports for the browser bundle
    // simpler approach: we'll bundle them all into one script for now or use a simple module system simulation
    // For this implementation, we will concatenate them and use Babel.

    // We need to resolve imports roughly.
    // A simple strategy is to make all components available globally or in a scope.

    const componentFiles = Object.entries(files)
        .filter(([path]) => (path.endsWith('.tsx') || path.endsWith('.jsx')) && path !== 'src/App.tsx' && path !== 'src/index.tsx')
        .map(([, code]) => {
            // Remove imports
            let cleanCode = code.replace(/import\s+.*?from\s+['"].*?['"];?/g, '');
            // Remove default export
            cleanCode = cleanCode.replace(/export\s+default\s+/g, '');
            // Remove named exports
            cleanCode = cleanCode.replace(/export\s+/g, '');
            return cleanCode;
        });

    let mainAppCode = appCode.replace(/import\s+.*?from\s+['"].*?['"];?/g, '');
    mainAppCode = mainAppCode.replace(/export\s+default\s+function\s+App/, 'function App');
    // If it was just "export default App", handle that
    mainAppCode = mainAppCode.replace(/export\s+default\s+App;?/, '');

    const combinedCode = [
        ...componentFiles,
        mainAppCode
    ].join('\n\n');

    // Surface colors so the preview's default (unpainted) background matches
    // Opal's active theme instead of always defaulting to white.
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
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script>tailwind = { config: { darkMode: 'class' } };</script>
    <script src="https://cdn.tailwindcss.com"></script>
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
    
    <script type="text/babel">
        const { useState, useEffect, useRef, useMemo, useCallback } = React;
        
        // Prevent common errors
        window.process = { env: { NODE_ENV: 'production' } };
        
        try {
            ${combinedCode}
            
            // Note: We assume the main component is named 'App'
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(<App />);
        } catch (err) {
            document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">' + err.toString() + '</div>';
            console.error(err);
        }
    </script>
</body>
</html>
    `;
}
