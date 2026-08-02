/**
 * ThinkingBubble - A Universal AI Thinking Indicator Component
 * 
 * A production-grade, provider-agnostic component that displays either:
 * - Implicit Mode: Animated typing dots (default)
 * - Explicit Mode: Live streaming reasoning text
 * 
 * @author Senior Frontend Engineer
 * @version 1.0.0
 */

class ThinkingBubble {
    static #styleInjected = false;
    static #instanceCount = 0;

    #container = null;
    #bubbleElement = null;
    #contentElement = null;
    #instanceId = null;
    #isActive = false;
    #mode = 'implicit'; // 'implicit' | 'explicit'
    #thinkingText = '';
    #abortController = null;

    /**
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.container - Parent container to render into
     * @param {string} options.position - Position relative to message ('above' | 'inline')
     * @param {string} options.theme - Color theme ('light' | 'dark' | 'auto')
     */
    constructor(options = {}) {
        this.#instanceId = `thinking-bubble-${++ThinkingBubble.#instanceCount}`;
        this.#container = options.container || document.body;
        this.position = options.position || 'inline';
        this.theme = options.theme || 'auto';

        ThinkingBubble.#injectStyles();
    }

    /**
     * Inject scoped CSS styles (only once per page)
     */
    static #injectStyles() {
        if (ThinkingBubble.#styleInjected) return;
        ThinkingBubble.#styleInjected = true;

        const styles = document.createElement('style');
        styles.id = 'thinking-bubble-styles';
        styles.textContent = `
      /* ========================================
         ThinkingBubble Component Styles
         ======================================== */

      :root {
        --tb-bg-light: #f7f9fc;
        --tb-bg-dark: #1e1e2e;
        --tb-border-light: #e2e8f0;
        --tb-border-dark: #3d3d5c;
        --tb-text-light: #4a5568;
        --tb-text-dark: #a0aec0;
        --tb-dot-light: #718096;
        --tb-dot-dark: #a0aec0;
        --tb-accent: #6366f1;
        --tb-shadow-light: rgba(0, 0, 0, 0.08);
        --tb-shadow-dark: rgba(0, 0, 0, 0.3);
      }

      .thinking-bubble {
        --tb-bg: var(--tb-bg-light);
        --tb-border: var(--tb-border-light);
        --tb-text: var(--tb-text-light);
        --tb-dot: var(--tb-dot-light);
        --tb-shadow: var(--tb-shadow-light);
      }

      .thinking-bubble[data-theme="dark"] {
        --tb-bg: var(--tb-bg-dark);
        --tb-border: var(--tb-border-dark);
        --tb-text: var(--tb-text-dark);
        --tb-dot: var(--tb-dot-dark);
        --tb-shadow: var(--tb-shadow-dark);
      }

      @media (prefers-color-scheme: dark) {
        .thinking-bubble[data-theme="auto"] {
          --tb-bg: var(--tb-bg-dark);
          --tb-border: var(--tb-border-dark);
          --tb-text: var(--tb-text-dark);
          --tb-dot: var(--tb-dot-dark);
          --tb-shadow: var(--tb-shadow-dark);
        }
      }

      .thinking-bubble {
        display: inline-flex;
        align-items: center;
        background: var(--tb-bg);
        border: 1px solid var(--tb-border);
        border-radius: 18px;
        padding: 10px 16px;
        margin: 8px 0;
        box-shadow: 0 2px 8px var(--tb-shadow);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        opacity: 0;
        transform: translateY(8px) scale(0.95);
        max-width: 100%;
      }

      .thinking-bubble.thinking-bubble--visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .thinking-bubble.thinking-bubble--exiting {
        opacity: 0;
        transform: translateY(-8px) scale(0.95);
      }

      /* Implicit Mode - Typing Dots */
      .thinking-bubble__dots {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 4px 0;
      }

      .thinking-bubble__dot {
        width: 8px;
        height: 8px;
        background: var(--tb-dot);
        border-radius: 50%;
        animation: thinking-bounce 1.4s ease-in-out infinite;
      }

      .thinking-bubble__dot:nth-child(1) {
        animation-delay: 0s;
      }

      .thinking-bubble__dot:nth-child(2) {
        animation-delay: 0.16s;
      }

      .thinking-bubble__dot:nth-child(3) {
        animation-delay: 0.32s;
      }

      @keyframes thinking-bounce {
        0%, 60%, 100% {
          transform: translateY(0);
          opacity: 0.6;
        }
        30% {
          transform: translateY(-8px);
          opacity: 1;
        }
      }

      /* Reduced motion preference */
      @media (prefers-reduced-motion: reduce) {
        .thinking-bubble__dot {
          animation: thinking-pulse 1.4s ease-in-out infinite;
        }

        @keyframes thinking-pulse {
          0%, 100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }

        .thinking-bubble,
        .thinking-bubble.thinking-bubble--visible,
        .thinking-bubble.thinking-bubble--exiting {
          transition: opacity 0.2s ease;
          transform: none;
        }
      }

      /* Explicit Mode - Reasoning Text */
      .thinking-bubble--explicit {
        flex-direction: column;
        align-items: stretch;
        border-radius: 12px;
        padding: 0;
        overflow: hidden;
        max-width: min(100%, 600px);
      }

      .thinking-bubble__header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: linear-gradient(135deg, var(--tb-accent) 0%, #8b5cf6 100%);
        color: white;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .thinking-bubble__header-icon {
        width: 16px;
        height: 16px;
        animation: thinking-spin 2s linear infinite;
      }

      @keyframes thinking-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-bubble__header-icon {
          animation: none;
        }
      }

      .thinking-bubble__content {
        padding: 14px 16px;
        max-height: 200px;
        overflow-y: auto;
        overflow-x: hidden;
        scroll-behavior: smooth;
        scrollbar-width: thin;
        scrollbar-color: var(--tb-border) transparent;
      }

      .thinking-bubble__content::-webkit-scrollbar {
        width: 6px;
      }

      .thinking-bubble__content::-webkit-scrollbar-track {
        background: transparent;
      }

      .thinking-bubble__content::-webkit-scrollbar-thumb {
        background: var(--tb-border);
        border-radius: 3px;
      }

      .thinking-bubble__content::-webkit-scrollbar-thumb:hover {
        background: var(--tb-dot);
      }

      .thinking-bubble__text {
        font-family: 'SF Mono', 'Fira Code', 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        line-height: 1.6;
        color: var(--tb-text);
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
      }

      .thinking-bubble__cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: var(--tb-accent);
        margin-left: 2px;
        animation: thinking-blink 1s step-end infinite;
        vertical-align: text-bottom;
      }

      @keyframes thinking-blink {
        0%, 50% { opacity: 1; }
        51%, 100% { opacity: 0; }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-bubble__cursor {
          animation: none;
          opacity: 1;
        }
      }

      /* Loading shimmer for explicit mode */
      .thinking-bubble__shimmer {
        position: relative;
        overflow: hidden;
      }

      .thinking-bubble__shimmer::after {
        content: '';
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.1) 50%,
          transparent 100%
        );
        animation: thinking-shimmer 2s infinite;
      }

      @keyframes thinking-shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-bubble__shimmer::after {
          animation: none;
          display: none;
        }
      }

      /* Status indicator */
      .thinking-bubble__status {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border-top: 1px solid var(--tb-border);
        font-size: 11px;
        color: var(--tb-text);
        opacity: 0.7;
      }

      .thinking-bubble__status-dot {
        width: 6px;
        height: 6px;
        background: #10b981;
        border-radius: 50%;
        animation: thinking-status-pulse 1.5s ease-in-out infinite;
      }

      @keyframes thinking-status-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }

      @media (prefers-reduced-motion: reduce) {
        .thinking-bubble__status-dot {
          animation: none;
        }
      }

      /* Responsive adjustments */
      @media (max-width: 480px) {
        .thinking-bubble--explicit {
          max-width: 100%;
          border-radius: 8px;
        }

        .thinking-bubble__content {
          max-height: 150px;
          padding: 12px;
        }

        .thinking-bubble__text {
          font-size: 12px;
        }
      }

      /* Error state */
      .thinking-bubble--error {
        border-color: #ef4444;
      }

      .thinking-bubble--error .thinking-bubble__header {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      }
    `;
        document.head.appendChild(styles);
    }

    /**
     * Create the implicit mode (typing dots) DOM
     */
    #createImplicitDOM() {
        const frag = document.createDocumentFragment();
        const container = document.createElement('div');
        container.className = 'thinking-bubble__dots';
        container.setAttribute('role', 'status');

        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('span');
            dot.className = 'thinking-bubble__dot';
            container.appendChild(dot);
        }

        frag.appendChild(container);
        return frag;
    }

    /**
     * Create the explicit mode (reasoning text) DOM
     */
    #createExplicitDOM() {
        const frag = document.createDocumentFragment();

        // Header
        const header = document.createElement('div');
        header.className = 'thinking-bubble__header thinking-bubble__shimmer';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'thinking-bubble__header-icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M12 6v6l4 2');

        svg.appendChild(circle);
        svg.appendChild(path);

        const headerText = document.createElement('span');
        headerText.textContent = 'Thinking...';

        header.appendChild(svg);
        header.appendChild(headerText);
        frag.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.className = 'thinking-bubble__content';

        const pre = document.createElement('pre');
        pre.className = 'thinking-bubble__text';

        const cursor = document.createElement('span');
        cursor.className = 'thinking-bubble__cursor';

        content.appendChild(pre);
        content.appendChild(cursor);
        frag.appendChild(content);

        // Status
        const status = document.createElement('div');
        status.className = 'thinking-bubble__status';

        const statusDot = document.createElement('span');
        statusDot.className = 'thinking-bubble__status-dot';

        const statusText = document.createElement('span');
        statusText.textContent = 'Processing reasoning steps';

        status.appendChild(statusDot);
        status.appendChild(statusText);
        frag.appendChild(status);

        return frag;
    }

    /**
     * Get resolved theme based on system preference
     */
    #getResolvedTheme() {
        if (this.theme !== 'auto') return this.theme;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Render the bubble to the DOM
     */
    #render() {
        this.#bubbleElement = document.createElement('div');
        this.#bubbleElement.id = this.#instanceId;
        this.#bubbleElement.className = `thinking-bubble${this.#mode === 'explicit' ? ' thinking-bubble--explicit' : ''}`;
        this.#bubbleElement.setAttribute('data-theme', this.theme);
        this.#bubbleElement.setAttribute('aria-live', 'polite');
        this.#bubbleElement.setAttribute('aria-atomic', 'false');
        this.#bubbleElement.setAttribute('aria-label', 'AI is thinking');

        const contentNodes = this.#mode === 'implicit'
            ? this.#createImplicitDOM()
            : this.#createExplicitDOM();

        this.#bubbleElement.appendChild(contentNodes);

        this.#container.appendChild(this.#bubbleElement);

        if (this.#mode === 'explicit') {
            this.#contentElement = this.#bubbleElement.querySelector('.thinking-bubble__text');
        }

        // Trigger enter animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.#bubbleElement?.classList.add('thinking-bubble--visible');
            });
        });
    }

    /**
     * Update the thinking text in explicit mode
     * @param {string} text - Text to append
     */
    #appendText(text) {
        if (!this.#contentElement || this.#mode !== 'explicit') return;

        this.#thinkingText += text;
        this.#contentElement.textContent = this.#thinkingText;

        // Auto-scroll to bottom
        const scrollContainer = this.#contentElement.closest('.thinking-bubble__content');
        if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
    }

    /**
     * Process an async stream of thinking chunks
     * @param {ReadableStream|AsyncGenerator} stream - Stream of text chunks
     */
    async #processStream(stream) {
        try {
            // Handle ReadableStream
            if (stream instanceof ReadableStream) {
                const reader = stream.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done || !this.#isActive) break;

                    const text = typeof value === 'string' ? value : decoder.decode(value, { stream: true });
                    this.#appendText(text);
                }

                reader.releaseLock();
            }
            // Handle AsyncGenerator / AsyncIterable
            else if (Symbol.asyncIterator in stream) {
                for await (const chunk of stream) {
                    if (!this.#isActive) break;
                    const text = typeof chunk === 'string' ? chunk : chunk.text || chunk.content || String(chunk);
                    this.#appendText(text);
                }
            }
            // Handle regular iterator
            else if (Symbol.iterator in stream) {
                for (const chunk of stream) {
                    if (!this.#isActive) break;
                    const text = typeof chunk === 'string' ? chunk : chunk.text || chunk.content || String(chunk);
                    this.#appendText(text);
                }
            }
        } catch (error) {
            console.error('ThinkingBubble: Stream processing error', error);
            this.#showError('Stream interrupted');
        }
    }

    /**
     * Show error state
     * @param {string} message - Error message
     */
    #showError(message) {
        if (!this.#bubbleElement) return;

        this.#bubbleElement.classList.add('thinking-bubble--error');

        const header = this.#bubbleElement.querySelector('.thinking-bubble__header span');
        if (header) {
            header.textContent = `Error: ${message}`;
        }

        const statusText = this.#bubbleElement.querySelector('.thinking-bubble__status span:last-child');
        if (statusText) {
            statusText.textContent = 'Processing stopped';
        }

        const statusDot = this.#bubbleElement.querySelector('.thinking-bubble__status-dot');
        if (statusDot) {
            statusDot.style.background = '#ef4444';
            statusDot.style.animation = 'none';
        }
    }

    /**
     * Start the thinking indicator
     * @param {Object} options - Start options
     * @param {ReadableStream|AsyncGenerator|null} options.thinkingStream - Optional stream of reasoning chunks
     * @param {Function} options.onComplete - Callback when complete
     * @param {AbortSignal} options.signal - Optional abort signal
     * @returns {Promise<void>}
     */
    async startThinking(options = {}) {
        const { thinkingStream = null, onComplete = null, signal = null } = options;

        // Clean up any existing bubble
        if (this.#isActive) {
            await this.stopThinking();
        }

        this.#isActive = true;
        this.#thinkingText = '';
        this.#abortController = new AbortController();

        // Auto-detect mode based on stream presence
        this.#mode = thinkingStream ? 'explicit' : 'implicit';

        // Render the bubble
        this.#render();

        // Handle external abort signal
        if (signal) {
            signal.addEventListener('abort', () => this.stopThinking(), { once: true });
        }

        // Process stream in explicit mode
        if (thinkingStream && this.#mode === 'explicit') {
            await this.#processStream(thinkingStream);
        }

        // Call completion callback if provided
        if (onComplete && typeof onComplete === 'function') {
            onComplete(this.#thinkingText);
        }

        return this.#thinkingText;
    }

    /**
     * Stop the thinking indicator and remove from DOM
     * @param {Object} options - Stop options
     * @param {boolean} options.immediate - Skip exit animation
     * @returns {Promise<void>}
     */
    async stopThinking(options = {}) {
        const { immediate = false } = options;

        if (!this.#isActive || !this.#bubbleElement) return;

        this.#isActive = false;
        this.#abortController?.abort();

        if (immediate) {
            this.#bubbleElement.remove();
            this.#bubbleElement = null;
            this.#contentElement = null;
            return;
        }

        // Exit animation
        this.#bubbleElement.classList.remove('thinking-bubble--visible');
        this.#bubbleElement.classList.add('thinking-bubble--exiting');

        await new Promise(resolve => setTimeout(resolve, 300));

        this.#bubbleElement?.remove();
        this.#bubbleElement = null;
        this.#contentElement = null;
    }

    /**
     * Check if currently showing
     * @returns {boolean}
     */
    get isActive() {
        return this.#isActive;
    }

    /**
     * Get the current thinking text (explicit mode only)
     * @returns {string}
     */
    get thinkingText() {
        return this.#thinkingText;
    }

    /**
     * Get the current mode
     * @returns {string}
     */
    get currentMode() {
        return this.#mode;
    }

    /**
     * Destroy the instance and clean up
     */
    destroy() {
        this.stopThinking({ immediate: true });
        this.#container = null;
    }
}

// ES Module exports
export { ThinkingBubble };
export default ThinkingBubble;


/* ========================================
   USAGE EXAMPLES (Uncomment to test)
   ======================================== */

/*
// Example 1: Basic Implicit Mode (Typing Dots)
// -------------------------------------------
const container = document.querySelector('.chat-messages');
const thinkingBubble = new ThinkingBubble({ 
  container,
  theme: 'auto' // or 'light' / 'dark'
});

// Show typing indicator while waiting for response
async function sendMessage(prompt) {
  await thinkingBubble.startThinking();
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    const data = await response.json();
    
    await thinkingBubble.stopThinking();
    renderAssistantMessage(data.content);
  } catch (error) {
    await thinkingBubble.stopThinking();
    showError(error);
  }
}


// Example 2: Explicit Mode with SSE Stream (OpenAI/Anthropic style)
// -----------------------------------------------------------------
async function sendMessageWithThinking(prompt) {
  const container = document.querySelector('.chat-messages');
  const thinkingBubble = new ThinkingBubble({ container, theme: 'dark' });
  
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, stream: true })
  });

  // Create a stream from SSE events
  const thinkingStream = new ReadableStream({
    async start(controller) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = decoder.decode(value);
        const lines = text.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          
          // Handle Anthropic's thinking_delta or similar
          if (data.type === 'thinking_delta' || data.type === 'content_block_delta') {
            if (data.delta?.thinking || data.delta?.text) {
              controller.enqueue(data.delta.thinking || data.delta.text);
            }
          }
        }
      }
      
      controller.close();
    }
  });

  // Start with the thinking stream
  const thinkingResult = await thinkingBubble.startThinking({
    thinkingStream,
    onComplete: (text) => console.log('Thinking complete:', text.length, 'chars')
  });

  await thinkingBubble.stopThinking();
}


// Example 3: Using with Async Generator (Custom LLM)
// --------------------------------------------------
async function* createThinkingGenerator() {
  const steps = [
    'Analyzing the question...\n',
    'Considering context and constraints...\n',
    'Formulating approach...\n',
    'Drafting response...\n'
  ];
  
  for (const step of steps) {
    await new Promise(resolve => setTimeout(resolve, 800));
    yield step;
  }
}

async function demoAsyncGenerator() {
  const container = document.querySelector('.chat-messages');
  const thinkingBubble = new ThinkingBubble({ container });

  await thinkingBubble.startThinking({
    thinkingStream: createThinkingGenerator()
  });

  await thinkingBubble.stopThinking();
}


// Example 4: Promise-based with Ollama
// ------------------------------------
async function ollamaChat(prompt) {
  const container = document.querySelector('.chat-messages');
  const thinkingBubble = new ThinkingBubble({ container, theme: 'light' });

  // Start implicit thinking (no stream)
  thinkingBubble.startThinking();

  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama2',
        prompt,
        stream: false
      })
    });

    const data = await response.json();
    await thinkingBubble.stopThinking();
    
    return data.response;
  } catch (error) {
    await thinkingBubble.stopThinking();
    throw error;
  }
}


// Example 5: With AbortController for cancellation
// ------------------------------------------------
const controller = new AbortController();
const thinkingBubble = new ThinkingBubble({ container });

// Start thinking with abort signal
thinkingBubble.startThinking({ signal: controller.signal });

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);


// Example 6: React Integration
// ----------------------------
// In a React component:

import { useEffect, useRef } from 'react';
import { ThinkingBubble } from './ThinkingBubble';

function ChatMessage({ isThinking, thinkingStream }) {
  const containerRef = useRef(null);
  const bubbleRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    bubbleRef.current = new ThinkingBubble({
      container: containerRef.current,
      theme: 'auto'
    });

    return () => bubbleRef.current?.destroy();
  }, []);

  useEffect(() => {
    if (!bubbleRef.current) return;

    if (isThinking) {
      bubbleRef.current.startThinking({ thinkingStream });
    } else {
      bubbleRef.current.stopThinking();
    }
  }, [isThinking, thinkingStream]);

  return <div ref={containerRef} className="message-container" />;
}
*/
