import { storage } from './storage.js';

const SYNC_URL_KEY   = 'syncUrl';
const SYNC_TOKEN_KEY = 'syncToken';
const FETCH_TIMEOUT  = 10_000;

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
      throw new Error(`Timed out after ${FETCH_TIMEOUT / 1000}s — is desktop on the same WiFi?`);
    }
    if (err.message && err.message.toLowerCase().includes('failed to fetch')) {
      throw new Error(
        'Network blocked. Check: (1) Desktop CMDRSYS is running ' +
        '(2) Same WiFi network (3) Windows Firewall allows port 45678 ' +
        '(4) Try opening the URL in your phone browser to confirm reachability'
      );
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export async function pingDesktop() {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured — add it in Settings');
  const res = await fetchWithTimeout(`${url}/ping`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Auth token mismatch — clear both token fields to disable auth');
  if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
  return res.json();
}

export async function pullFromDesktop() {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithTimeout(`${url}/sync`, { headers: authHeaders(token) });
  if (res.status === 401) throw new Error('Sync token mismatch — check token in Settings');
  if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
  return res.json();
}

export async function pushToDesktop(bookmarks, logs) {
  const { url, token } = await getSyncConfig();
  if (!url) throw new Error('No sync URL configured');
  const res = await fetchWithTimeout(`${url}/sync`, {
    method:  'POST',
    headers: authHeaders(token),
    body:    JSON.stringify({ bookmarks, logs }),
  });
  if (res.status === 401) throw new Error('Sync token mismatch — check token in Settings');
  if (!res.ok) throw new Error(`Desktop responded HTTP ${res.status}`);
  return res.json();
}

export async function fullSync(localBookmarks, localLogs) {
  const remote = await pullFromDesktop();

  const bmMap = new Map((localBookmarks || []).map(b => [b.id, b]));
  for (const rb of (remote.bookmarks || [])) {
    const local = bmMap.get(rb.id);
    if (!local || local.ts < rb.ts) bmMap.set(rb.id, rb);
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
  };
}
