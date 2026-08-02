import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import localhostHealth from '../electron/localhost-health.cjs';

const { parseLocalHttpUrl, probeLocalHttp } = localhostHealth;

describe('Localhost Manager health probe', () => {
    let server;
    let origin;
    let streamClosed;

    beforeAll(async () => {
        let markStreamClosed;
        streamClosed = new Promise(resolve => { markStreamClosed = resolve; });
        server = http.createServer((req, res) => {
            if (req.url === '/redirect') {
                res.writeHead(307, { Location: '/' });
                res.end();
                return;
            }
            if (req.url === '/forbidden') {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }
            if (req.url === '/stream') {
                res.once('close', markStreamClosed);
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.write('data: ready\n\n');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Ready');
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${server.address().port}`;
    });

    afterAll(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    it('recognizes a local service without CORS headers as healthy', async () => {
        await expect(probeLocalHttp(origin)).resolves.toMatchObject({
            ok: true,
            reachable: true,
            status: 200,
        });
    });

    it('closes a streaming response after reading its status', async () => {
        await expect(probeLocalHttp(`${origin}/stream`)).resolves.toMatchObject({
            ok: true,
            reachable: true,
            status: 200,
        });
        await streamClosed;
    });

    it('keeps redirects reachable and reports real HTTP errors precisely', async () => {
        await expect(probeLocalHttp(`${origin}/redirect`)).resolves.toMatchObject({
            ok: true,
            reachable: true,
            status: 307,
        });
        await expect(probeLocalHttp(`${origin}/forbidden`)).resolves.toMatchObject({
            ok: false,
            reachable: true,
            status: 403,
        });
    });

    it('rejects non-local and unsupported URLs', async () => {
        expect(parseLocalHttpUrl('http://[::1]:3000')).not.toBeNull();
        await expect(probeLocalHttp('https://example.com')).resolves.toMatchObject({
            ok: false,
            reachable: false,
            error: 'Only loopback HTTP URLs can be checked.',
        });
        await expect(probeLocalHttp('file:///etc/passwd')).resolves.toMatchObject({
            ok: false,
            reachable: false,
            error: 'Only loopback HTTP URLs can be checked.',
        });
    });
});
