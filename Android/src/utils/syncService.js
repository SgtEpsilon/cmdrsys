import { storage } from './storage.js';

const SYNC_URL_KEY   = 'syncUrl';
const SYNC_TOKEN_KEY = 'syncToken';
const FETCH_TIMEOUT  = 12_000;
const MAX_RETRIES    = 2;

export async function getSyncConfig() {
  const url   = (await storage.get(SYNC_URL_KEY))  ?? '';
  const token = (await storage.get(SYNC_TOKEN_KEY)) ?? '';
  return { url, token };
}

export async function setSyncConfig({ url, token }) {
  if (url   !== undefined) await storage.set(SYNC_URL_KEY,   url.trim());
  if (token !== undefined) await storage.set(SYNC_TOKEN_KEY, token.trim());
}

function authHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['X-Sync-Token'] = token;
  return h;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Timed out after ${FETCH_TIMEOUT / 1000}s — is the desktop on the same WiFi?`);
    }
    if (err.message && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Network blocked. Check: (1) Desktop CMDRSYS is running ' +
        '(2) Same WiFi network (3) Windows Firewall allows port 45678 ' +
        '(4) Open the URL in your phone browser to confirm reachability'
      );
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options);
      if (res.status >= 400 && res.status < 500) return res;
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`Desktop responded HTTP ${res.status}`);
        await delay(600 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        if (err.message.includes('Timed out') || err.message.includes('Network blocked')) {
          await delay(800 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
  }
  throw lastErr;
}

// Normalise x/y (legacy) -> lat/lon (schema v2)
function normaliseBm(b) {
  const out = { ...b };
  out.lat = b.lat ?? b.x ?? null;
  out.lon = b.lon ?? b.y ?? null;
  delete out.x;
  delete out.y;
  return out;
}

export async function pingDesktop() {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured — add it in Settings');
  const res = await fetchWithRetry(`${url}/ping`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Auth token mismatch — clear both token fields to disable auth');
  if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
  return res.json();
}

export async function getDesktopStatus() {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  try {
    const res = await fetchWithRetry(`${url}/sync/status`, { headers: authHeaders(token) });
    if (res.status === 404) return pingDesktop();
    if (res.status === 401) throw new Error('Auth token mismatch');
    if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    throw e;
  }
}

export async function pullFromDesktop() {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithRetry(`${url}/sync`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Sync token mismatch — check token in Settings');
  if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data.bookmarks)) {
    data.bookmarks = data.bookmarks.map(normaliseBm);
  }
  return data;
}

export async function pushToDesktop(bookmarks, logs) {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithRetry(`${url}/sync`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify({ bookmarks: (bookmarks || []).map(normaliseBm), logs }),
  });
  if (res.status === 401) throw new Error('Sync token mismatch — check token in Settings');
  if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
  return res.json();
}

export async function deleteBookmarkOnDesktop(id) {
  const { url, token } = await getSyncConfig();
  if (!url) return;
  try {
    await fetchWithTimeout(`${url}/sync/bookmark/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(token),
    });
  } catch (_) { /* non-fatal */ }
}

export async function deleteLogOnDesktop(id) {
  const { url, token } = await getSyncConfig();
  if (!url) return;
  try {
    await fetchWithTimeout(`${url}/sync/log/${encodeURIComponent(id)}`, {
      method: 'DELETE', headers: authHeaders(token),
    });
  } catch (_) { /* non-fatal */ }
}

export async function fullSync(localBookmarks, localLogs) {
  const remote = await pullFromDesktop();

  const bmMap = new Map((localBookmarks || []).map(b => [b.id, normaliseBm(b)]));
  for (const rb of (remote.bookmarks || [])) {
    const normed = normaliseBm(rb);
    const local  = bmMap.get(normed.id);
    if (!local || local.ts < normed.ts) bmMap.set(normed.id, normed);
  }
  const mergedBookmarks = [...bmMap.values()].sort((a, b) => b.ts - a.ts);

  const logMap = new Map((localLogs || []).map(l => [l.id, l]));
  for (const rl of (remote.logs || [])) {
    const local = logMap.get(rl.id);
    if (!local || local.ts < rl.ts) logMap.set(rl.id, rl);
  }
  const mergedLogs = [...logMap.values()].sort((a, b) => b.ts - a.ts);

  await pushToDesktop(mergedBookmarks, mergedLogs);

  return {
    bookmarks:           mergedBookmarks,
    logs:                mergedLogs,
    settingsFromDesktop: remote.settings || {},
    schemaVersion:       remote.schema_version ?? 1,
  };
}
