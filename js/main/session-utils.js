(function (global) {
    function normalizeTenant(value) {
        if (value === undefined || value === null) return '';
        const text = String(value).trim();
        if (!text || text === 'null' || text === 'undefined') return '';
        return text;
    }

    function getSessionStorageCandidates(currentTenant, storage) {
        const storageRef = storage || (global && global.localStorage ? global.localStorage : null);
        const candidates = [];
        const tenantList = [
            normalizeTenant(currentTenant),
            storageRef && typeof storageRef.getItem === 'function' ? normalizeTenant(storageRef.getItem('sibukinstal_tenant_id')) : '',
            'demo'
        ];

        tenantList.forEach((tenant) => {
            if (!tenant) return;
            const key = `simisterbin_session_${tenant}`;
            if (!candidates.includes(key)) candidates.push(key);
        });

        if (candidates.length === 0) candidates.push('simisterbin_session_demo');
        return candidates;
    }

    function resolveSessionStorageKey(currentTenant, storage) {
        return getSessionStorageCandidates(currentTenant, storage)[0];
    }

    function readSession(currentTenant, storage) {
        const storageRef = storage || (global && global.localStorage ? global.localStorage : null);
        if (!storageRef || typeof storageRef.getItem !== 'function') {
            return { key: resolveSessionStorageKey(currentTenant, storageRef), value: null };
        }

        const candidates = getSessionStorageCandidates(currentTenant, storageRef);
        for (const key of candidates) {
            const value = storageRef.getItem(key);
            if (value) return { key, value };
        }

        return { key: candidates[0], value: null };
    }

    function sanitizeSessionPayload(session) {
        if (!session || typeof session !== 'object') return {};
        const safe = { ...session };
        delete safe.password;
        return safe;
    }

    function serializeSessionPayload(session) {
        return JSON.stringify(sanitizeSessionPayload(session));
    }

    function clearSessionStorage(currentTenant, storage) {
        const storageRef = storage || (global && global.localStorage ? global.localStorage : null);
        if (!storageRef || typeof storageRef.removeItem !== 'function') return;

        const keysToClear = new Set();
        const tenantNames = new Set([
            normalizeTenant(currentTenant),
            normalizeTenant(storageRef.getItem('sibukinstal_tenant_id')),
            'demo'
        ]);

        tenantNames.forEach((tenant) => {
            if (tenant) keysToClear.add(`simisterbin_session_${tenant}`);
        });

        const liveKeys = Object.keys(storageRef || {});
        liveKeys.forEach((key) => {
            if (/^simisterbin_session_/.test(key)) keysToClear.add(key);
        });

        keysToClear.forEach((key) => {
            try { storageRef.removeItem(key); } catch (_) {}
        });
    }

    global.sanitizeSessionPayload = sanitizeSessionPayload;
    global.serializeSessionPayload = serializeSessionPayload;
    global.getSessionStorageCandidates = getSessionStorageCandidates;
    global.resolveSessionStorageKey = resolveSessionStorageKey;
    global.readSession = readSession;
    global.clearSessionStorage = clearSessionStorage;

    global.SibukSession = {
        getSessionStorageCandidates,
        resolveSessionStorageKey,
        readSession,
        sanitizeSessionPayload,
        serializeSessionPayload,
        clearSessionStorage
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            getSessionStorageCandidates,
            resolveSessionStorageKey,
            readSession,
            sanitizeSessionPayload,
            serializeSessionPayload,
            clearSessionStorage
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
