1. **Vendor Klipit Extension**
   - Check out `klipit` commit `030089480b5798ec8a0d6b1cb53dd4d4748310db` and place it in `electron/extensions/klipit/`.
   - Write `electron/extensions/klipit/UPSTREAM.md` with instructions on how to update it.
   - Verify creation with `ls` and `cat`.

2. **CommonJS Module for Klipit Health and Paths**
   - Create `electron/lib/klipit.cjs` implementing `getKlipitExtensionPath` and `normalizeKlipitHealth`.
   - Add tests for it in `test/klipit-extension.test.js`.
   - Run tests to verify the module's behavior.

3. **Update Electron Main Process**
   - Modify `electron/main.cjs` to use `getKlipitExtensionPath` instead of `$HOME/klippit`.
   - Parse the health status using `normalizeKlipitHealth`.
   - Add a new `klipit:health` IPC contract for the health status.
   - Keep `get-klipit-extension-id` temporarily for backwards compatibility.

4. **Verify Electron Main Process Changes**
   - Use `read_file` to verify the changes in `electron/main.cjs`.

5. **Update Electron Preload**
   - Edit `electron/preload.cjs` to expose `getKlipitHealth: () => ipcRenderer.invoke('klipit:health')` in `contextBridge`.

6. **Verify Electron Preload Changes**
   - Use `read_file` to verify the changes in `electron/preload.cjs`.

7. **Update HANDOFF.md**
   - Record the changes made in this milestone.

8. **Test the changes**
   - Run `npm test`, `npm run build`, and `node --check electron/lib/klipit.cjs` to verify changes.

9. **Complete pre-commit steps**
   - Complete pre commit steps to make sure proper testing, verifications, reviews and reflections are done.
