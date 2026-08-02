const { performance } = require('perf_hooks');

const ITERS = 1000000;

function runBaseline() {
    let count = 0;
    const start = performance.now();
    for (let i = 0; i < ITERS; i++) {
        const needsKey = new Set(['openrouter', 'deepinfra', 'groq', 'openai', 'anthropic', 'mistral', 'gemini']);
        const order = ['openrouter', 'deepinfra', 'groq', 'openai', 'anthropic', 'mistral', 'gemini', 'ollama', 'lmstudio', 'jan'];
        for (const provider of order) {
            if (needsKey.has(provider)) {
                count++;
            }
        }
    }
    const end = performance.now();
    console.log(`Baseline: ${end - start} ms`);
}

function runOptimized() {
    let count = 0;
    const needsKey = new Set(['openrouter', 'deepinfra', 'groq', 'openai', 'anthropic', 'mistral', 'gemini']);
    const order = ['openrouter', 'deepinfra', 'groq', 'openai', 'anthropic', 'mistral', 'gemini', 'ollama', 'lmstudio', 'jan'];

    const start = performance.now();
    for (let i = 0; i < ITERS; i++) {
        for (const provider of order) {
            if (needsKey.has(provider)) {
                count++;
            }
        }
    }
    const end = performance.now();
    console.log(`Optimized: ${end - start} ms`);
}

runBaseline();
runOptimized();
