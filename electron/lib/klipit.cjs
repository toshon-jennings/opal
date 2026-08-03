const path = require('path');

/**
 * Returns path to the bundled or development Klipit extension.
 * @param {string} appResourcesPath - process.resourcesPath
 * @param {boolean} isPackaged - app.isPackaged
 * @returns {string} Path to the Klipit extension directory
 */
function getKlipitExtensionPath(appResourcesPath, isPackaged) {
    if (isPackaged) {
        // Resources/electron/... does not exist in a packaged build: `files`
        // packs electron/** into app.asar, and the `electron/extensions/**/*`
        // asarUnpack rule mirrors it out to app.asar.unpacked. The unpacked
        // copy is the one to load — session.loadExtension needs real files on
        // disk, since Chromium's extension loader does not read through asar.
        return path.join(appResourcesPath, 'app.asar.unpacked', 'electron', 'extensions', 'klipit');
    }
    // Development mode, assuming we are running relative to repo root
    return path.join(__dirname, '..', 'extensions', 'klipit');
}

/**
 * Normalizes Klipit extension health status into a structured contract.
 * @param {Object} extension - Electron extension object, or null/undefined
 * @param {string} source - 'bundled' or 'development'
 * @param {Error|null} error - Any load error
 * @returns {Object} Structured health object
 */
function normalizeKlipitHealth(extension, source, error = null) {
    if (error) {
        // Bound and sanitize error text
        const boundedError = String(error.message || error).slice(0, 200);
        // Do not expose absolute paths
        const sanitizedError = boundedError.replace(/(?:\/.*?)\/klipit/g, '[path]/klipit').replace(/(?:C:\\.*?)\\klipit/g, '[path]\\klipit');

        return {
            status: "failed",
            id: null,
            name: "Klipit",
            version: null,
            source,
            error: sanitizedError
        };
    }

    if (!extension) {
        return {
            status: "missing",
            id: null,
            name: "Klipit",
            version: null,
            source,
            error: null
        };
    }

    return {
        status: "loaded",
        id: extension.id,
        name: extension.name || "Klipit",
        version: extension.version || null,
        source,
        error: null
    };
}

module.exports = {
    getKlipitExtensionPath,
    normalizeKlipitHealth
};
