// LLM Client Factory with Industry-Standard Thinking Detection
// Based on Open-WebUI and LobeChat implementations

// UNIVERSAL Configuration - Works across ALL providers and models
const THINKING_CONFIG = {
    // Universal standard: <think> tags (de-facto industry standard)
    tags: {
        patterns: [
            { open: '<think>', close: '</think>', name: 'think' },
            { open: '<thinking>', close: '</thinking>', name: 'thinking' },
            { open: '[THINKING]', close: '[/THINKING]', name: 'THINKING' },
            { open: '[REASONING]', close: '[/REASONING]', name: 'REASONING' },
        ]
    },

    // Provider-specific API field mappings
    fields: {
        openai: {
            delta: ['reasoning'],
            message: ['reasoning_content'],
            usage: 'reasoning_tokens'
        },
        anthropic: {
            contentBlocks: true,
            blockTypes: ['thinking', 'reasoning']
        },
        deepseek: {
            message: ['reasoning_content'],
            delta: ['reasoning']
        },
        google: {
            message: ['thought_process', 'thinking']
        }
    },

    // Universal field names to check (works for any provider)
    universalFields: [
        'reasoning',
        'reasoning_content',
        'thinking',
        'thought_process',
        'chain_of_thought',
        'internal_monologue',
        'thinking_blocks',
        'reasoning_blocks'
    ]
};

// Universal extraction function - checks ALL possible locations
function extractThinking(apiResponse, providerConfig = null) {
    if (!apiResponse) return { thinking: null, content: null };

    // Method 1: Check provider-specific fields
    if (providerConfig) {
        // Check delta fields (streaming)
        if (apiResponse.delta && providerConfig.delta) {
            for (const field of providerConfig.delta) {
                if (apiResponse.delta[field]) {
                    return {
                        thinking: apiResponse.delta[field],
                        content: apiResponse.delta.content || null
                    };
                }
            }
        }

        // Check message fields
        if (apiResponse.message && providerConfig.message) {
            for (const field of providerConfig.message) {
                if (apiResponse.message[field]) {
                    return {
                        thinking: apiResponse.message[field],
                        content: apiResponse.message.content || null
                    };
                }
            }
        }

        // Check content blocks (Anthropic style)
        if (providerConfig.contentBlocks && Array.isArray(apiResponse.content)) {
            let thinking = null;
            let content = '';

            for (const block of apiResponse.content) {
                if (providerConfig.blockTypes.includes(block.type)) {
                    thinking = block.text;
                } else if (block.type === 'text') {
                    content += block.text;
                }
            }

            if (thinking) {
                return { thinking, content };
            }
        }
    }

    // Method 2: Check universal field names
    for (const field of THINKING_CONFIG.universalFields) {
        if (apiResponse[field]) {
            return {
                thinking: apiResponse[field],
                content: apiResponse.content || apiResponse.text || null
            };
        }

        // Check nested in message
        if (apiResponse.message && apiResponse.message[field]) {
            return {
                thinking: apiResponse.message[field],
                content: apiResponse.message.content || null
            };
        }
    }

    // Method 3: No structured thinking found
    return {
        thinking: null,
        content: apiResponse.content || apiResponse.text || null
    };
}

// Extract thinking tokens from usage data
function extractThinkingTokens(apiResponse, providerConfig) {
    if (!apiResponse.usage || !providerConfig?.usage) return null;
    return apiResponse.usage[providerConfig.usage] || null;
}

// Streaming tag parser - tracks state across chunks
class StreamingTagParser {
    constructor() {
        this.reset();
    }

    reset() {
        this.inThinking = false;
        this.thinkingBuffer = '';
        this.contentBuffer = '';
        this.currentTag = null;
    }

    // Process a text chunk and extract thinking/content
    processChunk(text) {
        const results = [];
        let remaining = text;

        while (remaining) {
            if (!this.inThinking) {
                // Look for opening tag
                let earliestMatch = null;
                let earliestIndex = Infinity;

                for (const tag of THINKING_CONFIG.tags.patterns) {
                    const index = remaining.indexOf(tag.open);
                    if (index !== -1 && index < earliestIndex) {
                        earliestIndex = index;
                        earliestMatch = tag;
                    }
                }

                if (earliestMatch) {
                    // Emit content before tag
                    if (earliestIndex > 0) {
                        const beforeTag = remaining.substring(0, earliestIndex);
                        if (beforeTag.trim()) {
                            results.push({ isThinking: false, content: beforeTag });
                        }
                    }

                    // Enter thinking mode
                    this.inThinking = true;
                    this.currentTag = earliestMatch;
                    remaining = remaining.substring(earliestIndex + earliestMatch.open.length);
                } else {
                    // No tag found, emit as regular content
                    if (remaining.trim()) {
                        results.push({ isThinking: false, content: remaining });
                    }
                    remaining = '';
                }
            } else {
                // Look for closing tag
                const closeIndex = remaining.indexOf(this.currentTag.close);

                if (closeIndex !== -1) {
                    // Found closing tag
                    const thinkingContent = remaining.substring(0, closeIndex);
                    this.thinkingBuffer += thinkingContent;

                    // Emit complete thinking
                    if (this.thinkingBuffer.trim()) {
                        results.push({ isThinking: true, content: this.thinkingBuffer.trim() });
                    }

                    // Exit thinking mode
                    const closingTagLength = this.currentTag.close.length;
                    this.inThinking = false;
                    this.thinkingBuffer = '';
                    this.currentTag = null;
                    remaining = remaining.substring(closeIndex + closingTagLength);
                } else {
                    // No closing tag yet, buffer it
                    this.thinkingBuffer += remaining;
                    remaining = '';
                }
            }
        }

        return results;
    }

    // Get any buffered incomplete thinking
    getBuffered() {
        if (this.thinkingBuffer && this.inThinking) {
            return { isThinking: true, content: this.thinkingBuffer };
        }
        return null;
    }

    flushAsContent() {
        if (!this.thinkingBuffer || !this.inThinking) return null;
        const content = this.thinkingBuffer;
        this.reset();
        return content.trim() ? { isThinking: false, content } : null;
    }
}

function flushUnclosedThinking(tagParser, onChunk) {
    const flushed = tagParser.flushAsContent();
    if (flushed) onChunk(flushed.content, { isThinking: false, recoveredThinking: true });
}

function normalizeStreamOptions(options) {
    return options && typeof options === 'object' ? options : {};
}

export class LLMFactory {
    static getClient(provider, apiKey, options = {}) {
        switch (provider) {
            case 'openai':
                return new OpenAIClient(apiKey);
            case 'groq':
                return new GroqClient(apiKey);
            case 'gemini':
                return new GeminiClient(apiKey);
            case 'ollama':
                return new OllamaClient();
            case 'lmstudio':
                return new LMStudioClient(options.lmStudioUrl);
            case 'jan':
                return new JanClient(options.janUrl);
            case 'openrouter':
                return new OpenRouterClient(apiKey);
            case 'anthropic':
                return new AnthropicClient(apiKey);
            case 'mistral':
                return new MistralClient(apiKey);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
}

class BaseClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
    }

    async streamChat() {
        throw new Error('Not implemented');
    }

    async _readErrorMessage(response, fallback) {
        try {
            const text = await response.text();
            if (!text) return fallback;
            try {
                const data = JSON.parse(text);
                return data.error?.message || data.error || data.message || text;
            } catch {
                return text;
            }
        } catch {
            return fallback;
        }
    }

    // ── Tool-use helpers ───────────────────────────────────────────────────

    /** Convert the AGENT_TOOLS descriptor array into OpenAI function-calling schema. */
    _formatToolsAsOpenAI(tools) {
        return tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: {
                    type: 'object',
                    properties: Object.fromEntries(
                        Object.entries(t.parameters || {}).map(([k, desc]) => [
                            k, { type: 'string', description: String(desc) }
                        ])
                    ),
                    required: Object.keys(t.parameters || {})
                }
            }
        }));
    }

    /**
     * Shared streaming-with-tools logic for all OpenAI-compatible endpoints.
     * Accumulates streamed tool-call arguments (which arrive in chunks) and
     * returns { content, toolCalls } when the stream is complete.
     */
    async _openAIStreamWithTools(url, headers, messages, tools, onChunk, modelId, options = {}) {
        const streamOptions = normalizeStreamOptions(options);
        const formattedMessages = messages.map(m => {
            if (m.role === 'tool')      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
            if (m.tool_calls)           return { role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls };
            if (m.images?.length > 0) {
                const parts = [{ type: 'text', text: m.content || '' }];
                for (const img of m.images) {
                    parts.push({ type: 'image_url', image_url: { url: img.dataUrl || `data:${img.type||'image/png'};base64,${img.base64}` } });
                }
                return { role: m.role, content: parts };
            }
            return { role: m.role, content: m.content };
        });

        let response;
        try {
            response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({
                    model: modelId,
                    messages: formattedMessages,
                    tools: this._formatToolsAsOpenAI(tools),
                    tool_choice: 'auto',
                    stream: true
                }),
                signal: streamOptions.signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new Error(`Could not reach model API at ${url}`);
        }

        if (!response.ok) {
            const message = await this._readErrorMessage(response, `API Error ${response.status}`);
            throw new Error(message);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let content = '';
        // index → { id, name, argumentsStr }
        const acc = {};

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            for (const line of decoder.decode(value).split('\n')) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
                try {
                    const data = JSON.parse(line.slice(6));
                    const delta = data.choices?.[0]?.delta;
                    if (!delta) continue;

                    if (delta.content) {
                        content += delta.content;
                        onChunk(delta.content);
                    }

                    for (const tc of (delta.tool_calls || [])) {
                        const i = tc.index ?? 0;
                        if (!acc[i]) acc[i] = { id: '', name: '', argumentsStr: '' };
                        if (tc.id)                   acc[i].id = tc.id;
                        if (tc.function?.name)       acc[i].name += tc.function.name;
                        if (tc.function?.arguments)  acc[i].argumentsStr += tc.function.arguments;
                    }
                } catch { /* ignore malformed chunks */ }
            }
        }

        const calls = Object.values(acc);
        const toolCalls = calls.length > 0
            ? calls.map(tc => ({
                id:   tc.id,
                name: tc.name,
                args: (() => { try { return JSON.parse(tc.argumentsStr || '{}'); } catch { return {}; } })()
              }))
            : null;

        return { content, toolCalls };
    }

    /**
     * Default fallback: providers that don't support native tool calling
     * fall back to regular streaming (Bolt-style action tags still work).
     */
    async streamChatWithTools(messages, tools, onChunk, modelId, options = {}) {
        let content = '';
        await this.streamChat(messages, (chunk, meta) => {
            if (!meta?.isThinking) content += chunk;
            onChunk(chunk, meta);
        }, modelId, options);
        return { content, toolCalls: null };
    }
}

// OpenAI Client with comprehensive detection
export class OpenAIClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gpt-4o', options = {}) {
        if (!this.apiKey) throw new Error('OpenAI API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        const config = THINKING_CONFIG.fields.openai;
        const tagParser = new StreamingTagParser();

        // Format messages - handle images if present
        const formattedMessages = messages.map(m => {
            // Check if message has images
            if (m.images && m.images.length > 0) {
                const content = [
                    { type: 'text', text: m.content || '' }
                ];

                // Add images in OpenAI format
                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}`
                        }
                    });
                }

                return { role: m.role, content };
            }

            return { role: m.role, content: m.content };
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: formattedMessages,
                stream: true
            }),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'OpenAI API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));

                        // LAYER 1: Check API-level thinking fields
                        const extracted = extractThinking(data.choices?.[0], config);

                        if (extracted.thinking) {
                            // Found API-level thinking
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            // LAYER 2: Parse content for embedded tags
                            const tagResults = tagParser.processChunk(extracted.content);
                            for (const result of tagResults) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Extract thinking tokens
                        const tokens = extractThinkingTokens(data, config);
                        if (tokens) {
                            onChunk('', { thinkingTokens: tokens });
                        }

                        // Extract finish reason
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'gpt-4o', options = {}) {
        if (!this.apiKey) throw new Error('OpenAI API Key missing');
        return this._openAIStreamWithTools(
            'https://api.openai.com/v1/chat/completions',
            { 'Authorization': `Bearer ${this.apiKey}` },
            messages, tools, onChunk, modelId, options
        );
    }
}

// Groq Client with tag-based detection
export class GroqClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'llama-3.3-70b-versatile', options = {}) {
        if (!this.apiKey) throw new Error('Groq API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        const tagParser = new StreamingTagParser();

        // Format messages - handle images if present (Groq uses OpenAI-compatible format)
        const formattedMessages = messages.map(m => {
            if (m.images && m.images.length > 0) {
                const content = [
                    { type: 'text', text: m.content || '' }
                ];

                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}`
                        }
                    });
                }

                return { role: m.role, content };
            }

            return { role: m.role, content: m.content };
        });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: formattedMessages,
                stream: true
            }),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Groq API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices[0]?.delta?.content || '';

                        if (content) {
                            // Parse for thinking tags in real-time
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Extract finish reason
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }
                    } catch (e) {
                        console.error('Error parsing chunk', e);
                    }
                }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'llama-3.3-70b-versatile', options = {}) {
        if (!this.apiKey) throw new Error('Groq API Key missing');
        return this._openAIStreamWithTools(
            'https://api.groq.com/openai/v1/chat/completions',
            { 'Authorization': `Bearer ${this.apiKey}` },
            messages, tools, onChunk, modelId, options
        );
    }
}

// Gemini Client with universal detection
export class GeminiClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'gemini-1.5-flash', options = {}) {
        if (!this.apiKey) throw new Error('Gemini API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent`);
        url.searchParams.set('key', this.apiKey);
        url.searchParams.set('alt', 'sse');
        const config = THINKING_CONFIG.fields.google;
        const tagParser = new StreamingTagParser();

        // Format messages - handle images with Gemini's format
        const contents = messages.map(m => {
            const parts = [];

            // Add text part
            if (m.content) {
                parts.push({ text: m.content });
            }

            // Add image parts if present
            if (m.images && m.images.length > 0) {
                for (const img of m.images) {
                    parts.push({
                        inline_data: {
                            mime_type: img.type || 'image/png',
                            data: img.base64
                        }
                    });
                }
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: parts.length > 0 ? parts : [{ text: '' }]
            };
        });

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: contents
            }),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.replace(/^data:\s*/, '');
                if (!payload || payload === '[DONE]') continue;

                try {
                    const data = JSON.parse(payload);

                    // Check for API-level thinking
                    const extracted = extractThinking(data.candidates?.[0], config);

                    if (extracted.thinking) {
                        onChunk(extracted.thinking, { isThinking: true });
                    }

                    if (extracted.content) {
                        // Parse for tags
                        const results = tagParser.processChunk(extracted.content);
                        for (const result of results) {
                            onChunk(result.content, { isThinking: result.isThinking });
                        }
                    }

                    // Extract finish reason
                    const finishReason = data.candidates?.[0]?.finishReason;
                    if (finishReason) {
                        onChunk('', { finishReason });
                    }
                } catch (e) {
                    console.error('Error parsing Gemini chunk', e);
                }
            }
        }

        // Process final buffer
        if (buffer.trim()) {
            try {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data:')) {
                    const payload = trimmed.replace(/^data:\s*/, '');
                    if (payload && payload !== '[DONE]') {
                        const data = JSON.parse(payload);
                        const extracted = extractThinking(data.candidates?.[0], config);

                        if (extracted.thinking) {
                            onChunk(extracted.thinking, { isThinking: true });
                        }

                        if (extracted.content) {
                            const results = tagParser.processChunk(extracted.content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error parsing final Gemini chunk', e);
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'gemini-1.5-flash', options = {}) {
        if (!this.apiKey) throw new Error('Gemini API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        // Gemini uses functionDeclarations format
        const functionDeclarations = tools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(t.parameters || {}).map(([k, desc]) => [k, { type: 'string', description: String(desc) }])
                ),
                required: Object.keys(t.parameters || {})
            }
        }));

        // Build Gemini-format contents, handling tool results
        const contents = [];
        let systemInstruction = null;
        for (const m of messages) {
            if (m.role === 'system') { systemInstruction = m.content; continue; }
            if (m.role === 'tool') {
                contents.push({
                    role: 'user',
                    parts: [{ functionResponse: { name: m.name || 'tool', response: { result: m.content } } }]
                });
                continue;
            }
            if (m.tool_calls) {
                contents.push({
                    role: 'model',
                    parts: m.tool_calls.map(tc => ({ functionCall: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') } }))
                });
                continue;
            }
            contents.push({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content || '' }]
            });
        }

        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`);
        url.searchParams.set('key', this.apiKey);

        const body = { contents, tools: [{ functionDeclarations }] };
        if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Gemini API Error ${response.status}`);
        }

        const data = await response.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        let content = '';
        const toolCalls = [];

        for (const part of parts) {
            if (part.text) {
                content += part.text;
                onChunk(part.text);
            }
            if (part.functionCall) {
                toolCalls.push({
                    id:   `gemini-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    name: part.functionCall.name,
                    args: part.functionCall.args || {}
                });
            }
        }

        return { content, toolCalls: toolCalls.length > 0 ? toolCalls : null };
    }
}

// Ollama Client with tag support
export class OllamaClient extends BaseClient {
    constructor() {
        super(null);
    }

    async streamChat(messages, onChunk, modelId = 'llama2', options = {}) {
        const streamOptions = normalizeStreamOptions(options);
        const tagParser = new StreamingTagParser();

        // Format messages - Ollama uses 'images' array for multimodal
        const formattedMessages = messages.map(m => {
            const msg = { role: m.role, content: m.content };

            // Ollama expects images as array of base64 strings
            if (m.images && m.images.length > 0) {
                msg.images = m.images.map(img => img.base64);
            }

            return msg;
        });

        let response;
        try {
            response = await fetch('http://localhost:11434/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: formattedMessages,
                    stream: true
                }),
                signal: streamOptions.signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new Error('Ollama is not reachable at http://localhost:11434. Start Ollama, then refresh models in Settings.');
        }

        if (!response.ok) {
            const message = await this._readErrorMessage(response, 'Ollama API Error');
            throw new Error(`Ollama API Error: ${message}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        const content = data.message?.content || '';

                        if (content) {
                            // Parse for thinking tags
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing Ollama chunk', e);
                    }
                }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'llama2', options = {}) {
        const streamOptions = normalizeStreamOptions(options);
        // Ollama supports tools via /api/chat with the OpenAI-compatible tools format
        const formattedMessages = messages.map(m => {
            if (m.role === 'tool') return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
            return { role: m.role, content: m.content };
        });

        let response;
        try {
            response = await fetch('http://localhost:11434/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelId,
                    messages: formattedMessages,
                    tools: this._formatToolsAsOpenAI(tools),
                    stream: false
                }),
                signal: streamOptions.signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new Error('Ollama is not reachable at http://localhost:11434. Start Ollama, then refresh models in Settings.');
        }

        if (!response.ok) {
            const message = await this._readErrorMessage(response, 'Ollama API Error');
            const toolSupportHint = message.includes('does not support tools')
                ? ' This model cannot run Cowork tools; choose a tool-capable Ollama model or switch to another provider.'
                : '';
            throw new Error(`Ollama API Error: ${message}.${toolSupportHint}`);
        }

        const data = await response.json();
        const msg = data.message || {};
        const content = msg.content || '';
        if (content) onChunk(content);

        const toolCalls = msg.tool_calls?.length > 0
            ? msg.tool_calls.map((tc, i) => ({
                id:   `ollama-${Date.now()}-${i}`,
                name: tc.function?.name || '',
                args: (() => { try { return typeof tc.function?.arguments === 'string' ? JSON.parse(tc.function.arguments) : (tc.function?.arguments || {}); } catch { return {}; } })()
              }))
            : null;

        return { content, toolCalls };
    }
}

// LM Studio Client with tag support
export class LMStudioClient extends BaseClient {
    constructor(baseUrl = 'http://localhost:1234') {
        super(null);
        this.baseUrl = baseUrl.replace(/\/$/, '');
    }

    async streamChat(messages, onChunk, modelId, options = {}) {
        const streamOptions = normalizeStreamOptions(options);
        const tagParser = new StreamingTagParser();

        // Format messages - LM Studio uses OpenAI-compatible format
        const formattedMessages = messages.map(m => {
            if (m.images && m.images.length > 0) {
                const content = [
                    { type: 'text', text: m.content || '' }
                ];

                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: {
                            url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}`
                        }
                    });
                }

                return { role: m.role, content };
            }

            return { role: m.role, content: m.content };
        });

        let response;
        try {
            response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelId || 'local-model',
                    messages: formattedMessages,
                    stream: true
                }),
                signal: streamOptions.signal
            });
        } catch (err) {
            if (err?.name === 'AbortError') throw err;
            throw new Error(`LM Studio is not reachable at ${this.baseUrl}. Use http://localhost:1234 when LM Studio is running on this Mac.`);
        }

        if (!response.ok) {
            const message = await this._readErrorMessage(response, 'LM Studio API Error');
            throw new Error(`LM Studio API Error: ${message}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const choice = data.choices?.[0];
                        const content = choice?.delta?.content || '';

                        if (content) {
                            // Parse for thinking tags
                            const results = tagParser.processChunk(content);
                            for (const result of results) {
                                onChunk(result.content, { isThinking: result.isThinking });
                            }
                        }

                        // Surface finish_reason so callers can detect context overflow
                        const finishReason = choice?.finish_reason;
                        if (finishReason) {
                            onChunk('', { finishReason });
                        }
                    } catch (e) {
                        console.error('Error parsing LM Studio chunk', e);
                    }
                }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId, options = {}) {
        return this._openAIStreamWithTools(
            `${this.baseUrl}/v1/chat/completions`,
            {},
            messages, tools, onChunk, modelId || 'local-model', options
        );
    }
}

export class JanClient extends LMStudioClient {
    constructor(baseUrl = 'http://127.0.0.1:6767') {
        super(baseUrl);
    }

    async streamChat(messages, onChunk, modelId, options = {}) {
        try {
            return await super.streamChat(messages, onChunk, modelId, options);
        } catch (err) {
            if (String(err.message || '').includes('LM Studio is not reachable')) {
                throw new Error(`Jan is not reachable at ${this.baseUrl}. Start Jan from Settings > Connect Models, then refresh models.`);
            }
            throw err;
        }
    }
}

// ── OpenRouter Client ─────────────────────────────────────────────────────────
// OpenRouter uses the OpenAI-compatible format with an extra Referer header.
export class OpenRouterClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'openai/gpt-4o', options = {}) {
        if (!this.apiKey) throw new Error('OpenRouter API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        const tagParser = new StreamingTagParser();
        const config = THINKING_CONFIG.fields.openai;

        const formattedMessages = messages.map(m => {
            if (m.images && m.images.length > 0) {
                const content = [{ type: 'text', text: m.content || '' }];
                for (const img of m.images) {
                    content.push({
                        type: 'image_url',
                        image_url: { url: img.dataUrl || `data:${img.type || 'image/png'};base64,${img.base64}` }
                    });
                }
                return { role: m.role, content };
            }
            return { role: m.role, content: m.content };
        });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://perci.app',
                'X-Title': 'Perci'
            },
            body: JSON.stringify({ model: modelId, messages: formattedMessages, stream: true }),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'OpenRouter API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        // Buffer partial SSE lines across reads: a `data:` line can be split
        // mid-JSON by a network chunk boundary. Without this, both halves fail
        // JSON.parse and the delta — often a whitespace/newline-only token — is
        // silently dropped, jamming the streamed text together (no spaces or
        // paragraph breaks). Mirrors the AnthropicClient stream loop below.
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const extracted = extractThinking(data.choices?.[0], config);

                        if (extracted.thinking) onChunk(extracted.thinking, { isThinking: true });
                        if (extracted.content) {
                            for (const r of tagParser.processChunk(extracted.content)) {
                                onChunk(r.content, { isThinking: r.isThinking });
                            }
                        }

                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) onChunk('', { finishReason });
                    } catch (e) { /* ignore malformed chunks */ }
                }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'openai/gpt-4o', options = {}) {
        if (!this.apiKey) throw new Error('OpenRouter API Key missing');
        return this._openAIStreamWithTools(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                'Authorization': `Bearer ${this.apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Perci'
            },
            messages, tools, onChunk, modelId, options
        );
    }
}

// ── Anthropic Client ──────────────────────────────────────────────────────────
// Uses Anthropic's Messages API with streaming. Handles extended thinking blocks.
export class AnthropicClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'claude-sonnet-4-5', options = {}) {
        if (!this.apiKey) throw new Error('Anthropic API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        const tagParser = new StreamingTagParser();

        // Separate system message from the conversation
        let systemPrompt = '';
        const conversation = [];
        for (const m of messages) {
            if (m.role === 'system') {
                systemPrompt = m.content;
            } else {
                if (m.images && m.images.length > 0) {
                    const content = [{ type: 'text', text: m.content || '' }];
                    for (const img of m.images) {
                        content.push({
                            type: 'image',
                            source: { type: 'base64', media_type: img.type || 'image/png', data: img.base64 }
                        });
                    }
                    conversation.push({ role: m.role, content });
                } else {
                    conversation.push({ role: m.role, content: m.content });
                }
            }
        }

        const body = {
            model: modelId,
            max_tokens: 8192,
            stream: true,
            messages: conversation
        };
        if (systemPrompt) body.system = systemPrompt;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(body),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Anthropic API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.replace(/^data:\s*/, '');
                if (!payload || payload === '[DONE]') continue;

                try {
                    const event = JSON.parse(payload);

                    if (event.type === 'content_block_start') {
                        if (event.content_block?.type === 'thinking') {
                            // Anthropic extended thinking block start
                        }
                    } else if (event.type === 'content_block_delta') {
                        const delta = event.delta || {};
                        if (delta.type === 'thinking_delta') {
                            onChunk(delta.thinking || '', { isThinking: true });
                        } else if (delta.type === 'text_delta') {
                            const text = delta.text || '';
                            if (text) {
                                for (const r of tagParser.processChunk(text)) {
                                    onChunk(r.content, { isThinking: r.isThinking });
                                }
                            }
                        }
                    } else if (event.type === 'message_delta') {
                        const stopReason = event.delta?.stop_reason;
                        if (stopReason) onChunk('', { finishReason: stopReason });
                    }
                } catch (e) { /* ignore malformed events */ }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'claude-sonnet-4-5', options = {}) {
        if (!this.apiKey) throw new Error('Anthropic API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        let systemPrompt = '';
        const conversation = [];
        for (const m of messages) {
            if (m.role === 'system') { systemPrompt = m.content; continue; }
            if (m.role === 'tool') {
                conversation.push({
                    role: 'user',
                    content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: m.content }]
                });
                continue;
            }
            if (m.tool_calls) {
                conversation.push({
                    role: 'assistant',
                    content: [
                        ...(m.content ? [{ type: 'text', text: m.content }] : []),
                        ...m.tool_calls.map(tc => ({
                            type: 'tool_use',
                            id:   tc.id,
                            name: tc.function?.name || tc.name,
                            input: (() => { try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; } })()
                        }))
                    ]
                });
                continue;
            }
            conversation.push({ role: m.role, content: m.content });
        }

        const anthropicTools = tools.map(t => ({
            name: t.name,
            description: t.description,
            input_schema: {
                type: 'object',
                properties: Object.fromEntries(
                    Object.entries(t.parameters || {}).map(([k, desc]) => [k, { type: 'string', description: String(desc) }])
                ),
                required: Object.keys(t.parameters || {})
            }
        }));

        const body = { model: modelId, max_tokens: 8192, stream: true, messages: conversation, tools: anthropicTools };
        if (systemPrompt) body.system = systemPrompt;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': this.apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(body),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic API Error ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let content = '';
        // block_index → { id, name, inputStr }
        const blockAcc = {};

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data:')) continue;
                const payload = line.replace(/^data:\s*/, '');
                if (!payload || payload === '[DONE]') continue;
                try {
                    const ev = JSON.parse(payload);
                    if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
                        const idx = ev.index ?? 0;
                        blockAcc[idx] = { id: ev.content_block.id, name: ev.content_block.name, inputStr: '' };
                    } else if (ev.type === 'content_block_delta') {
                        const d = ev.delta || {};
                        if (d.type === 'text_delta' && d.text) {
                            content += d.text;
                            onChunk(d.text);
                        }
                        if (d.type === 'input_json_delta' && d.partial_json) {
                            const idx = ev.index ?? 0;
                            if (blockAcc[idx]) blockAcc[idx].inputStr += d.partial_json;
                        }
                    }
                } catch { /* ignore */ }
            }
        }

        const calls = Object.values(blockAcc);
        const toolCalls = calls.length > 0
            ? calls.map(b => ({
                id:   b.id,
                name: b.name,
                args: (() => { try { return JSON.parse(b.inputStr || '{}'); } catch { return {}; } })()
              }))
            : null;

        return { content, toolCalls };
    }
}

// ── Mistral Client ────────────────────────────────────────────────────────────
// OpenAI-compatible endpoint.
export class MistralClient extends BaseClient {
    async streamChat(messages, onChunk, modelId = 'mistral-large-latest', options = {}) {
        if (!this.apiKey) throw new Error('Mistral API Key missing');

        const streamOptions = normalizeStreamOptions(options);
        const tagParser = new StreamingTagParser();

        const formattedMessages = messages.map(m => ({ role: m.role, content: m.content }));

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({ model: modelId, messages: formattedMessages, stream: true }),
            signal: streamOptions.signal
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || err.message || 'Mistral API Error');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            for (const line of decoder.decode(value).split('\n')) {
                if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                    try {
                        const data = JSON.parse(line.slice(6));
                        const content = data.choices?.[0]?.delta?.content || '';
                        if (content) {
                            for (const r of tagParser.processChunk(content)) {
                                onChunk(r.content, { isThinking: r.isThinking });
                            }
                        }
                        const finishReason = data.choices?.[0]?.finish_reason;
                        if (finishReason) onChunk('', { finishReason });
                    } catch (e) { /* ignore */ }
                }
            }
        }
        flushUnclosedThinking(tagParser, onChunk);
    }

    async streamChatWithTools(messages, tools, onChunk, modelId = 'mistral-large-latest', options = {}) {
        if (!this.apiKey) throw new Error('Mistral API Key missing');
        return this._openAIStreamWithTools(
            'https://api.mistral.ai/v1/chat/completions',
            { 'Authorization': `Bearer ${this.apiKey}` },
            messages, tools, onChunk, modelId, options
        );
    }
}
