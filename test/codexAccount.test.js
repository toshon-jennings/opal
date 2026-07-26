import { describe, expect, it } from 'vitest';
import codexAccount from '../electron/codex-account.cjs';

const {
    CodexAccountClient,
    codexStatusFromAccount,
    codexBinaryCandidates,
    normalizeWorkingDirectory,
    parseCodexLoginStatus,
    resolveCodexInstallation,
    trustedCodexAuthUrl,
} = codexAccount;

describe('Codex account bridge', () => {
    it('prefers an explicit or user-installed Codex before an app-bundled fallback', () => {
        expect(codexBinaryCandidates({
            env: { PERCI_CODEX_BINARY: '/custom/codex' },
            platform: 'darwin',
            home: '/Users/person',
            pathBinary: '/Users/person/.local/bin/codex',
        })).toEqual([
            '/custom/codex',
            '/Users/person/.local/bin/codex',
            '/Users/person/.hermes/node/bin/codex',
            '/Users/person/.volta/bin/codex',
            '/Users/person/.asdf/shims/codex',
            '/Users/person/.local/share/mise/shims/codex',
            '/Users/person/.npm-global/bin/codex',
            '/Users/person/.bun/bin/codex',
            '/Users/person/bin/codex',
            '/opt/homebrew/bin/codex',
            '/usr/local/bin/codex',
            '/Applications/Codex.app/Contents/Resources/codex',
            '/Applications/ChatGPT.app/Contents/Resources/codex',
        ]);
    });

    it('bounds and normalizes Pocket working directories without evaluating a shell command', () => {
        expect(normalizeWorkingDirectory('~', '/Users/person')).toBe('/Users/person');
        expect(normalizeWorkingDirectory('~/Documents/project', '/Users/person')).toBe('/Users/person/Documents/project');
        expect(normalizeWorkingDirectory('/tmp/project', '/Users/person')).toBe('/tmp/project');
        expect(normalizeWorkingDirectory('relative/project', '/Users/person')).toBe('/Users/person');
        expect(normalizeWorkingDirectory(`/${'x'.repeat(5000)}`, '/Users/person')).toBe('/Users/person');
        expect(normalizeWorkingDirectory('/tmp/bad\0path', '/Users/person')).toBe('/Users/person');
        expect(normalizeWorkingDirectory({ path: '/tmp/project' }, '/Users/person')).toBe('/Users/person');
    });

    it('skips an executable but broken shim and falls back to a working Codex app binary', async () => {
        const installation = await resolveCodexInstallation({
            env: {},
            platform: 'darwin',
            home: '/Users/person',
            pathBinary: '/Users/person/.local/bin/codex',
            shellBinary: null,
            access: () => {},
            probe: async (candidate) => candidate.includes('/Applications/ChatGPT.app/')
                ? { status: 0, stdout: 'codex-cli 1.0.0', stderr: '' }
                : { status: 1, stdout: '', stderr: 'broken wrapper' },
        });

        expect(installation).toEqual({
            path: '/Applications/ChatGPT.app/Contents/Resources/codex',
            version: 'codex-cli 1.0.0',
            source: 'bundled',
        });
    });

    it('identifies ChatGPT subscription auth without treating API-key auth as a subscription', () => {
        expect(parseCodexLoginStatus('Logged in using ChatGPT', 0)).toMatchObject({
            authenticated: true,
            authMode: 'chatgpt',
            subscription: true,
        });
        expect(parseCodexLoginStatus('Logged in using an API key', 0)).toMatchObject({
            authenticated: true,
            authMode: 'api-key',
            subscription: false,
        });
        expect(parseCodexLoginStatus('Not logged in', 1)).toMatchObject({
            authenticated: false,
            authMode: null,
            subscription: false,
        });
    });

    it('only accepts HTTPS OpenAI and ChatGPT authentication URLs', () => {
        expect(trustedCodexAuthUrl('https://auth.openai.com/authorize')).toBe('https://auth.openai.com/authorize');
        expect(trustedCodexAuthUrl('https://chatgpt.com/auth/login')).toBe('https://chatgpt.com/auth/login');
        expect(trustedCodexAuthUrl('http://auth.openai.com/authorize')).toBeNull();
        expect(trustedCodexAuthUrl('https://openai.com.evil.example/authorize')).toBeNull();
    });

    it('derives subscription readiness from Codex app-server without exposing account details', () => {
        expect(codexStatusFromAccount(
            { path: '/usr/local/bin/codex', version: 'codex-cli 1.0.0', source: 'user' },
            { account: { type: 'chatgpt', email: 'private@example.com', planType: 'plus' } },
        )).toEqual({
            installed: true,
            authenticated: true,
            subscription: true,
            authMode: 'chatgpt',
            path: '/usr/local/bin/codex',
            version: 'codex-cli 1.0.0',
            source: 'user',
            plan: 'plus',
        });
    });

    it('requests the official ChatGPT browser login from Codex app-server', async () => {
        const client = new CodexAccountClient();
        const calls = [];
        client.start = async () => {};
        client.request = async (method, params) => {
            calls.push({ method, params });
            return {
                type: 'chatgpt',
                loginId: 'login-1',
                authUrl: 'https://auth.openai.com/authorize',
            };
        };

        await expect(client.startChatGptLogin()).resolves.toMatchObject({
            loginId: 'login-1',
            authUrl: 'https://auth.openai.com/authorize',
        });
        expect(calls).toEqual([{
            method: 'account/login/start',
            params: {
                type: 'chatgpt',
                codexStreamlinedLogin: true,
                useHostedLoginSuccessPage: true,
                appBrand: 'codex',
            },
        }]);
    });
});
