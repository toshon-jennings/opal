import { describe, it, expect, vi } from 'vitest';
import { generatePreviewHTML } from '../src/utils/preview-generator';
import * as previewSecurity from '../src/lib/previewSecurity';

vi.mock('../src/lib/previewSecurity', () => {
    return {
        PREVIEW_CDN_URLS: {
            react: 'mock-react.js',
            reactDom: 'mock-react-dom.js',
            babel: 'mock-babel.js',
            tailwind: 'mock-tailwind.js'
        },
        PREVIEW_SECURITY_LIMITS: {
            maxSourceChars: 1000
        },
        assertPreviewBudget: vi.fn(),
        buildPreviewErrorDocument: vi.fn((msg) => `MOCK_ERROR_DOC: ${msg}`),
        createPreviewRuntimeGuard: vi.fn(() => 'MOCK_RUNTIME_GUARD()'),
        getPreviewCsp: vi.fn(() => 'mock-csp')
    };
});

describe('generatePreviewHTML', () => {
    it('should generate valid html when providing component and app files', () => {
        const files = {
            'src/Button.tsx': 'export default function Button() { return <button>Click me</button>; }',
            'src/App.tsx': 'import Button from "./Button"; export default function App() { return <Button />; }'
        };
        const html = generatePreviewHTML(files, { isDarkMode: true });

        expect(html).toContain('class="dark"');
        expect(html).toContain('<script src="mock-react.js"></script>');
        expect(html).toContain('<script src="mock-react-dom.js"></script>');
        expect(html).toContain('<script src="mock-babel.js"></script>');
        expect(html).toContain('<script src="mock-tailwind.js"></script>');
        expect(html).toContain('MOCK_RUNTIME_GUARD()');
        expect(html).toContain('<meta http-equiv="Content-Security-Policy" content="mock-csp">');

        // Assert json structure
        expect(html).toContain('<script type="application/json" id="__perci-src">');
        const sourcesMatch = html.match(/<script type="application\/json" id="__perci-src">(.*?)<\/script>/);
        expect(sourcesMatch).toBeTruthy();

        const sources = JSON.parse(sourcesMatch[1]);
        expect(sources).toHaveLength(3);
        expect(sources[0]).toBe('export default function Button() { return <button>Click me</button>; }');
        expect(sources[1]).toBe('import Button from "./Button"; export default function App() { return <Button />; }');
        expect(sources[2]).toBe(`ReactDOM.createRoot(document.getElementById('root')).render(<App />);`);
    });

    it('should generate light mode html when isDarkMode is false', () => {
        const files = {
            'src/App.tsx': 'export default function App() { return <div>App</div>; }'
        };
        const html = generatePreviewHTML(files, { isDarkMode: false });

        expect(html).not.toContain('class="dark"');
        expect(html).toContain('background: #ffffff');
    });

    it('should handle budget assertion failure', () => {
        previewSecurity.assertPreviewBudget.mockImplementationOnce(() => {
            throw new Error('Budget exceeded');
        });

        const files = { 'src/App.tsx': 'export default function App() { return <div>App</div>; }' };
        const html = generatePreviewHTML(files);

        expect(html).toBe('MOCK_ERROR_DOC: Budget exceeded');
    });

    it('should filter out non-tsx/jsx and entry files from component files list', () => {
        const files = {
            'src/App.tsx': 'app',
            'src/index.tsx': 'index',
            'src/styles.css': 'css',
            'src/Component.jsx': 'component1',
            'src/Widget.tsx': 'component2',
            'package.json': '{}'
        };

        const html = generatePreviewHTML(files);
        const sourcesMatch = html.match(/<script type="application\/json" id="__perci-src">(.*?)<\/script>/);
        const sources = JSON.parse(sourcesMatch[1]);

        expect(sources).toHaveLength(4); // Component.jsx, Widget.tsx, App.tsx, ReactDOM.render...
        expect(sources[0]).toBe('component1');
        expect(sources[1]).toBe('component2');
        expect(sources[2]).toBe('app');
    });
});
