import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

function setSecurityHeaders(res) {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
}

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.js'],
    include: ['test/**/*.test.js'],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Electron loads production assets over the file:// protocol.
    // Disable modulepreload to avoid file-origin preload fetch quirks.
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@webcontainer')) return 'webcontainer';
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) return 'monaco';
          if (id.includes('@xterm')) return 'terminal';
          if (id.includes('pdfjs-dist')) return 'pdf';
          if (id.includes('html2canvas')) return 'html-export';
          if (id.includes('jspdf')) return 'pdf-export';
          if (id.includes('xlsx')) return 'spreadsheet';
          if (id.includes('framer-motion')) return 'motion';
          if (id.includes('lucide-react')) return 'icons';
          if (id.includes('streamdown')) return 'streamdown';
          if (id.includes('katex')) return 'math';
          if (id.includes('dompurify')) return 'sanitize';
          if (id.includes('d3')) return 'charts';
          if (id.includes('react-syntax-highlighter')) return 'syntax-ui';
          // Keep the markdown/syntax-highlighting graph together with vendor.
          // Splitting react-markdown + remark/rehype/micromark/unified/hast/mdast
          // away from refractor/prismjs introduces a cross-chunk circular import,
          // which Rollup emits as `Cannot access 'X' before initialization` (TDZ)
          // under file:// in the packaged build. Letting them share `vendor`
          // eliminates the cycle.
          if (id.includes('react') || id.includes('react-dom')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  plugins: [
    react(),
    // WebContainer API requires these headers for SharedArrayBuffer support
    {
      name: 'configure-webcontainer-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // COOP/COEP enables SharedArrayBuffer for WebContainer; frame
          // protection prevents the dev app from being embedded/clickjacked.
          setSecurityHeaders(res);
          next();
        });
      },
      // Also configure for preview builds
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          setSecurityHeaders(res);
          next();
        });
      }
    },
    // Strip `crossorigin` attributes from the built HTML.
    // When the Electron app loads `dist/index.html` via the `file://` protocol,
    // Chromium treats each file as a unique origin and blocks the `crossorigin`
    // module script, leaving the renderer blank after the splash.
    {
      name: 'strip-crossorigin-for-electron',
      apply: 'build',
      enforce: 'post',
      transformIndexHtml(html) {
        // Remove both boolean and valued forms (e.g. crossorigin or crossorigin="anonymous")
        // so module scripts are not blocked under file:// in Electron.
        return html.replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s>])/g, '');
      },
    }
  ],
})
