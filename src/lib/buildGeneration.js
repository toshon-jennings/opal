// Shared build-mode code generation helpers.
// Used by both the single-model Build view and the side-by-side Compare view so
// the system prompt and response parsing stay in one place.

export const PROVIDERS_REQUIRING_API_KEYS = new Set([
    'openai', 'groq', 'gemini', 'openrouter', 'anthropic', 'mistral'
]);

// Builds the code-generation system prompt. `extraSections` are optional extra
// blocks (model routing, budget, durable memory) inserted before the user
// request; Compare passes none, single Build passes its routing/budget/memory.
export function buildCodeGenSystemPrompt({ userMessage, existingFiles = [], extraSections = [] }) {
    const extras = extraSections.filter(Boolean).join('\n\n');
    return `You are a code generation AI. Generate React components based on user requests.

CRITICAL RULES:
1. Return a JSON object with file paths as keys and code as values
2. Use React with TypeScript (tsx) or JavaScript (jsx)
3. Use Tailwind CSS for styling
4. Include proper imports (React, etc)
5. Make components functional and complete
6. The main entry point is typically src/App.tsx
7. DO NOT use markdown formatting (no \`\`\`). Just return raw JSON.

Format your response as valid JSON ONLY:
{
  "src/App.tsx": "import React from 'react'...",
  "src/components/Header.tsx": "export default function Header()..."
}

Existing files:
${JSON.stringify(existingFiles)}
${extras ? `\n${extras}\n` : ''}
User request: ${userMessage}`;
}

// Strips markdown code fences LLMs add despite instructions, then parses the
// JSON map of file path -> source. Throws if the response isn't valid JSON.
export function parseGeneratedFiles(fullResponse) {
    let jsonStr = fullResponse;
    if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/, '').replace(/```/, '');
    } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```\n?/, '').replace(/```/, '');
    }
    return JSON.parse(jsonStr);
}
