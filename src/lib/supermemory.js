const DEFAULT_BASE_URL = 'http://localhost:6768';
const DEFAULT_CONTAINER_TAG = 'perci_memory';

function normalizePath(path) {
    if (!path) return '/';
    return path.startsWith('/') ? path : `/${path}`;
}

async function parseResponse(response) {
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }
    return {
        ok: response.ok,
        status: response.status,
        data,
        body: data ? undefined : text,
        error: response.ok ? undefined : (data?.error || text || `HTTP ${response.status}`),
    };
}

export class SupermemoryClient {
    constructor(baseURL = DEFAULT_BASE_URL, apiKey = null) {
        this.baseURL = baseURL.replace(/\/+$/, '');
        this.apiKey = apiKey || null;
    }

    async request(method, path, body = null) {
        const apiPath = normalizePath(path);
        if (typeof window !== 'undefined' && window.electron?.supermemoryApi) {
            const result = await window.electron.supermemoryApi(method, apiPath, body);
            if (!result?.ok) {
                throw new Error(result?.error || `Supermemory request failed (${result?.status || 'unknown'})`);
            }
            return result.data ?? result.body ?? result;
        }

        const response = await fetch(`${this.baseURL}${apiPath}`, {
            method,
            headers: {
                ...(body ? { 'content-type': 'application/json' } : {}),
                ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const result = await parseResponse(response);
        if (!result.ok) {
            throw new Error(result.error || `Supermemory request failed (${result.status})`);
        }
        return result.data ?? result.body ?? result;
    }

    async isHealthy() {
        try {
            await this.request('GET', '/health');
            return true;
        } catch {
            try {
                await this.request('GET', '/');
                return true;
            } catch {
                return false;
            }
        }
    }

    async add(content, containerTag = DEFAULT_CONTAINER_TAG, options = {}) {
        return this.request('POST', '/v3/documents', {
            content,
            containerTag,
            ...options,
        });
    }

    async search(query, containerTag = DEFAULT_CONTAINER_TAG, options = {}) {
        return this.request('POST', '/v4/search', {
            q: query,
            query,
            containerTag,
            limit: options.limit || 8,
            ...options,
        });
    }

    async profile(containerTag = DEFAULT_CONTAINER_TAG) {
        return this.request('POST', '/v4/profile', { containerTag });
    }

    async delete(documentId) {
        if (!documentId) throw new Error('documentId is required');
        return this.request('DELETE', `/v3/documents/${encodeURIComponent(documentId)}`);
    }
}

export default SupermemoryClient;
