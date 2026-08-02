import { describe, expect, it } from 'vitest';
import { LOCAL_SERVICES, findLocalService, launchArgsFor } from '../src/lib/localServices';

describe('local service catalog', () => {
    it('assigns every service a unique port', () => {
        // PORTMASTER.md assigns ports precisely so local apps never collide.
        // Two catalog entries sharing a port means Perci would launch one app
        // onto another's port — the failure that made Open Notebook's
        // `make start-all` squat on the Eidos Dashboard's :3000.
        const byPort = new Map();
        for (const service of LOCAL_SERVICES) {
            const clash = byPort.get(service.port);
            expect(clash, `port ${service.port} claimed by both "${clash}" and "${service.id}"`).toBeUndefined();
            byPort.set(service.port, service.id);
        }
    });

    it('gives every service a unique id', () => {
        const ids = LOCAL_SERVICES.map(s => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('points each url at the port it declares', () => {
        for (const service of LOCAL_SERVICES) {
            expect(service.url, service.id).toContain(`:${service.port}`);
        }
    });

    it('never starts Open Notebook through the target that binds :3000', () => {
        // `make run` / `make start-all` run a bare `next dev`, which takes Next's
        // default :3000 — the Eidos Dashboard's assigned port. Compose maps 8502.
        const openNotebook = findLocalService('open-notebook');
        expect(openNotebook.startCommand).not.toMatch(/\bmake\b/);
        expect(openNotebook.startCommand).toContain('docker compose');
    });

    it('can launch GitHub Overview from its own checkout', () => {
        expect(launchArgsFor('github-overview')).toEqual({
            command: './github-overview serve',
            cwd: '~/github-overview',
        });
    });

    it('returns no launch args for services without a start command', () => {
        // Surfaces use this to hide a Start button rather than offer one that fails.
        const unstartable = LOCAL_SERVICES.filter(s => !s.startCommand);
        for (const service of unstartable) {
            expect(launchArgsFor(service.id), service.id).toBeNull();
        }
        expect(launchArgsFor('does-not-exist')).toBeNull();
    });

    it('relies on cwd instead of repeating the path in the command', () => {
        // A `cd ~/x && ...` prefix duplicates cwd and drifts out of sync with it.
        for (const service of LOCAL_SERVICES) {
            expect(service.startCommand, service.id).not.toMatch(/^cd\s/);
        }
    });
});
