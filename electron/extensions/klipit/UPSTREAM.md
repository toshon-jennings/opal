# Klipit Upstream

Repository: https://github.com/toshon-jennings/klipit
Commit: 030089480b5798ec8a0d6b1cb53dd4d4748310db
Version: 0.4.4
Manifest: V3

## Deterministic Refresh Instructions
To update this vendored extension:
1. `rm -rf electron/extensions/klipit/*`
2. `git clone https://github.com/toshon-jennings/klipit /tmp/klipit`
3. `cd /tmp/klipit && git checkout <new-commit-hash>`
4. `cp -r /tmp/klipit/* /path/to/perci/electron/extensions/klipit/`
5. `rm -rf /tmp/klipit`
6. Update this UPSTREAM.md with the new commit hash and version.
