import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'fs'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'))

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
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
          if (id.includes('prismjs')) return 'prism';
          if (id.includes('refractor')) return 'refractor';
          if (id.includes('react-markdown') || id.includes('remark-') || id.includes('rehype-') || id.includes('micromark') || id.includes('unified') || id.includes('hast-') || id.includes('mdast-')) return 'markdown';
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
          // Required for WebContainer API (enables SharedArrayBuffer)
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      },
      // Also configure for preview builds
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          next();
        });
      }
    }
  ],
})
