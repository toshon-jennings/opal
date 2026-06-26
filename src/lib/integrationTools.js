const DEFAULT_MAX_RESULTS = 10;

function clampMaxResults(value, fallback = DEFAULT_MAX_RESULTS) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(25, Math.max(1, parsed));
}

function compactText(value, limit = 12000) {
    const text = String(value || '');
    return text.length > limit ? `${text.slice(0, limit)}\n\n[truncated ${text.length - limit} chars]` : text;
}

function decodeBase64Utf8(value) {
    const binary = atob(String(value || ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
}

function parseRepo(params = {}) {
    if (params.owner && params.repo) return { owner: params.owner, repo: params.repo };
    const combined = String(params.repository || '').trim();
    const [owner, repo] = combined.split('/');
    return { owner, repo };
}

function requireToken(apiKeys, key, label) {
    const token = apiKeys?.[key];
    if (!token) throw new Error(`${label} token is not configured in Settings.`);
    return token;
}

async function readResponseBody(response) {
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function apiFetch(url, options = {}) {
    const response = await fetch(url, options);
    const body = await readResponseBody(response);
    if (!response.ok) {
        const message = typeof body === 'string'
            ? body
            : body?.message || body?.error?.message || body?.error || `HTTP ${response.status}`;
        throw new Error(message);
    }
    return body;
}

function githubHeaders(apiKeys) {
    const token = requireToken(apiKeys, 'github', 'GitHub');
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
}

function githubUrl(path, params = {}) {
    const url = new URL(`https://api.github.com${path}`);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });
    return url.toString();
}

export const INTEGRATION_TOOLS = [
    {
        name: 'github_get_repo',
        description: 'Get summary information for a GitHub repository.',
        parameters: {
            owner: 'Repository owner or organization.',
            repo: 'Repository name.'
        }
    },
    {
        name: 'github_list_issues',
        description: 'List GitHub issues for a repository. Pull requests are excluded.',
        parameters: {
            owner: 'Repository owner or organization.',
            repo: 'Repository name.',
            state: 'Issue state: open, closed, or all. Defaults to open.',
            max_results: 'Maximum issues to return. Defaults to 10.'
        }
    },
    {
        name: 'github_list_pull_requests',
        description: 'List GitHub pull requests for a repository.',
        parameters: {
            owner: 'Repository owner or organization.',
            repo: 'Repository name.',
            state: 'Pull request state: open, closed, or all. Defaults to open.',
            max_results: 'Maximum pull requests to return. Defaults to 10.'
        }
    },
    {
        name: 'github_get_file',
        description: 'Read a file from a GitHub repository.',
        parameters: {
            owner: 'Repository owner or organization.',
            repo: 'Repository name.',
            path: 'Path to the file in the repository.',
            ref: 'Optional branch, tag, or commit SHA.'
        }
    },
    {
        name: 'github_search_code',
        description: 'Search GitHub code using GitHub search syntax.',
        parameters: {
            query: 'GitHub code search query, for example "repo:owner/name symbolName".',
            max_results: 'Maximum results to return. Defaults to 10.'
        }
    },
    {
        name: 'github_create_issue',
        description: 'Create a GitHub issue in a repository.',
        parameters: {
            owner: 'Repository owner or organization.',
            repo: 'Repository name.',
            title: 'Issue title.',
            body: 'Issue body.'
        }
    }
];

const WRITE_TOOL_NAMES = new Set(['github_create_issue']);

export function getIntegrationTools({ allowWrites = true, apiKeys = null } = {}) {
    const timesfmTools = [
        {
            name: 'timesfm_forecast',
            description: 'Generate zero-shot time-series forecasts using the Google Research TimesFM model.',
            parameters: {
                history: 'A JSON array of chronological historical numeric values.',
                horizon: 'The number of future time steps to forecast. Defaults to 24.'
            }
        },
        {
            name: 'timesfm_plot',
            description: 'Generate a base64 markdown chart image comparing history and forecast.',
            parameters: {
                history: 'A JSON array of chronological historical numeric values.',
                forecast_values: 'A JSON array of forecasted numeric values returned by timesfm_forecast.'
            }
        }
    ];

    const githubTools = apiKeys
        ? (apiKeys.github ? INTEGRATION_TOOLS : [])
        : INTEGRATION_TOOLS;

    const availableTools = [...githubTools, ...timesfmTools];

    return allowWrites
        ? availableTools
        : availableTools.filter(tool => !WRITE_TOOL_NAMES.has(tool.name));
}

export function hasConfiguredIntegrationTools(apiKeys = {}) {
    return true;
}

export function buildIntegrationToolsPrompt(apiKeys = {}) {
    const enabled = ['TimesFM (Local)'];
    if (apiKeys.github) enabled.push('GitHub');

    return [
        `External integration tools: ${enabled.length ? enabled.join('; ') : 'none configured'}.`,
        'Use TimesFM tools (timesfm_forecast, timesfm_plot) when the user asks for time-series forecasting, predictions, or trend analysis.',
        'Use GitHub tools when the user asks for repository, issue, pull request, or GitHub code information.',
        'If the GitHub token is missing, tell the user it needs to be configured in Settings instead of guessing.',
        'For external write actions, confirm the intended change in your final response.'
    ].join('\n');
}

export async function executeIntegrationTool(name, params = {}, apiKeys = {}) {
    switch (name) {
        case 'github_get_repo': {
            const { owner, repo } = parseRepo(params);
            const data = await apiFetch(githubUrl(`/repos/${owner}/${repo}`), { headers: githubHeaders(apiKeys) });
            return {
                full_name: data.full_name,
                description: data.description,
                private: data.private,
                default_branch: data.default_branch,
                html_url: data.html_url,
                pushed_at: data.pushed_at,
                open_issues_count: data.open_issues_count,
                stargazers_count: data.stargazers_count
            };
        }
        case 'github_list_issues': {
            const { owner, repo } = parseRepo(params);
            const data = await apiFetch(githubUrl(`/repos/${owner}/${repo}/issues`, {
                state: params.state || 'open',
                per_page: clampMaxResults(params.max_results)
            }), { headers: githubHeaders(apiKeys) });
            return data
                .filter(issue => !issue.pull_request)
                .map(issue => ({
                    number: issue.number,
                    title: issue.title,
                    state: issue.state,
                    user: issue.user?.login,
                    html_url: issue.html_url,
                    updated_at: issue.updated_at
                }));
        }
        case 'github_list_pull_requests': {
            const { owner, repo } = parseRepo(params);
            const data = await apiFetch(githubUrl(`/repos/${owner}/${repo}/pulls`, {
                state: params.state || 'open',
                per_page: clampMaxResults(params.max_results)
            }), { headers: githubHeaders(apiKeys) });
            return data.map(pr => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                user: pr.user?.login,
                html_url: pr.html_url,
                head: pr.head?.ref,
                base: pr.base?.ref,
                updated_at: pr.updated_at
            }));
        }
        case 'github_get_file': {
            const { owner, repo } = parseRepo(params);
            const data = await apiFetch(githubUrl(`/repos/${owner}/${repo}/contents/${encodeURIComponent(params.path || '').replaceAll('%2F', '/')}`, {
                ref: params.ref
            }), { headers: githubHeaders(apiKeys) });
            const encoded = String(data.content || '').replace(/\s/g, '');
            const decoded = encoded ? decodeBase64Utf8(encoded) : '';
            return {
                name: data.name,
                path: data.path,
                sha: data.sha,
                html_url: data.html_url,
                content: compactText(decoded)
            };
        }
        case 'github_search_code': {
            const data = await apiFetch(githubUrl('/search/code', {
                q: params.query,
                per_page: clampMaxResults(params.max_results)
            }), { headers: githubHeaders(apiKeys) });
            return {
                total_count: data.total_count,
                items: (data.items || []).map(item => ({
                    name: item.name,
                    path: item.path,
                    repository: item.repository?.full_name,
                    html_url: item.html_url
                }))
            };
        }
        case 'github_create_issue': {
            const { owner, repo } = parseRepo(params);
            const data = await apiFetch(githubUrl(`/repos/${owner}/${repo}/issues`), {
                method: 'POST',
                headers: { ...githubHeaders(apiKeys), 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: params.title, body: params.body || '' })
            });
            return { number: data.number, title: data.title, html_url: data.html_url, state: data.state };
        }
        case 'timesfm_forecast': {
            if (!window.electron?.runLocalCommand) {
                throw new Error('Local command execution is not supported in this environment.');
            }
            let history = params.history;
            if (typeof history === 'string') {
                try { history = JSON.parse(history); } catch (_) {}
            }
            if (!history || !Array.isArray(history)) {
                throw new Error('Parameter "history" must be a JSON array of numeric values.');
            }
            const horizon = Number(params.horizon) || 24;
            const projectDir = '/Users/toshonjennings/opal';
            const cmd = 'bash';
            const args = [
                '-c',
                `"${projectDir}/timesfm-venv/bin/python" "${projectDir}/timesfm_mcp_server.py" forecast '${JSON.stringify(history)}' ${horizon}`
            ];
            
            const run = await window.electron.runLocalCommand(cmd, args, projectDir);
            if (!run.ok) {
                throw new Error(run.error || run.stderr || 'TimesFM execution failed.');
            }
            
            try {
                return JSON.parse(run.stdout);
            } catch (e) {
                return { error: 'Failed to parse TimesFM forecast output.', raw: run.stdout };
            }
        }
        case 'timesfm_plot': {
            if (!window.electron?.runLocalCommand) {
                throw new Error('Local command execution is not supported in this environment.');
            }
            let history = params.history;
            let forecast_values = params.forecast_values;
            if (typeof history === 'string') {
                try { history = JSON.parse(history); } catch (_) {}
            }
            if (typeof forecast_values === 'string') {
                try { forecast_values = JSON.parse(forecast_values); } catch (_) {}
            }
            if (!history || !Array.isArray(history) || !forecast_values || !Array.isArray(forecast_values)) {
                throw new Error('Parameters "history" and "forecast_values" must be JSON arrays.');
            }
            const projectDir = '/Users/toshonjennings/opal';
            const cmd = 'bash';
            const args = [
                '-c',
                `"${projectDir}/timesfm-venv/bin/python" "${projectDir}/timesfm_mcp_server.py" plot '${JSON.stringify(history)}' '${JSON.stringify(forecast_values)}'`
            ];
            
            const run = await window.electron.runLocalCommand(cmd, args, projectDir);
            if (!run.ok) {
                throw new Error(run.error || run.stderr || 'TimesFM plotting failed.');
            }
            
            return { plot_markdown: run.stdout.trim() };
        }
        default:
            return { error: `Unknown integration tool: "${name}"` };
    }
}

export async function runChatWithTools({
    client,
    messages,
    tools,
    executeTool,
    onChunk,
    modelId,
    signal,
    maxIterations = 6,
    onToolCall
}) {
    let llmMessages = [...messages];
    let finalContent = '';
    let finalThinking = '';

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        let iterContent = '';
        let iterThinking = '';
        const { content, toolCalls } = await client.streamChatWithTools(
            llmMessages,
            tools,
            (chunk, meta) => {
                if (meta?.isThinking) {
                    iterThinking += chunk;
                } else {
                    iterContent += chunk;
                }
                onChunk?.(chunk, meta);
            },
            modelId,
            { signal }
        );

        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        finalContent = content || iterContent;
        finalThinking = iterThinking;

        if (!toolCalls || toolCalls.length === 0) {
            return { content: finalContent, thinking: finalThinking };
        }

        llmMessages = [
            ...llmMessages,
            {
                role: 'assistant',
                content: content || null,
                tool_calls: toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) }
                }))
            }
        ];

        const toolResults = [];
        for (const toolCall of toolCalls) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            onToolCall?.(toolCall);
            const result = await executeTool(toolCall.name, toolCall.args || {});
            toolResults.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                name: toolCall.name,
                content: JSON.stringify(result)
            });
        }
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        llmMessages = [...llmMessages, ...toolResults];
    }

    return {
        content: finalContent || 'Tool-use limit reached before a final response was produced.',
        thinking: finalThinking
    };
}
