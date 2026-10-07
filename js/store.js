// Storage layer.
//  - Backend "graph": SharePoint/OneDrive via Microsoft Graph (production)
//  - Backend "local": IndexedDB on this device only (demo mode)
// Every device also keeps a local cache, so the app keeps working offline.
// Builds are merged per field (newest change wins), so an engineer and a
// supervisor can work on the same build from different devices.
import { CONFIG, DEMO_MODE } from './config.js';
import { getToken } from './auth.js';

// ---------------------------------------------------------------- IndexedDB
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('acecore-qc', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('cache', { keyPath: 'serial' });
      d.createObjectStore('remote', { keyPath: 'serial' });
      d.createObjectStore('files', { keyPath: 'path' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction(store, mode);
    const s = tx.objectStore(store);
    const req = fn(s);
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const idbGet = (st, k) => idb(st, 'readonly', s => s.get(k));
const idbAll = (st) => idb(st, 'readonly', s => s.getAll());
const idbPut = (st, v) => idb(st, 'readwrite', s => s.put(v));
const idbDel = (st, k) => idb(st, 'readwrite', s => s.delete(k));

// ---------------------------------------------------------------- helpers
export function safeSerial(s) {
  return String(s || '').trim().toUpperCase().replace(/[\\/:*?"<>|#%]+/g, '-').replace(/\s+/g, '-');
}
export function photoKindFromName(name) {
  const m = /^(top|bottom|other)_/i.exec(name);
  return m ? m[1].toLowerCase() : 'other';
}
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
export function photoName(kind, ext = 'jpg') {
  return `${kind}_${stamp()}_${Math.random().toString(36).slice(2, 5)}.${ext}`;
}

// Merge two versions of a build: per field, the newest timestamp wins.
export function mergeBuilds(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...b, ...a, fields: { ...b.fields } };
  for (const [k, v] of Object.entries(a.fields || {})) {
    const o = out.fields[k];
    if (!o || (v.t || 0) >= (o.t || 0)) out.fields[k] = v;
  }
  out.created = (a.created && b.created && b.created.t < a.created.t) ? b.created : (a.created || b.created);
  return out;
}
function sameFields(a, b) {
  const ka = Object.keys(a.fields), kb = Object.keys(b.fields);
  if (ka.length !== kb.length) return false;
  return ka.every(k => b.fields[k] && b.fields[k].t === a.fields[k].t && b.fields[k].v === a.fields[k].v);
}

// ================================================================ Local backend
const LocalBackend = {
  kind: 'local',
  async listBuilds() { return (await idbAll('remote')).map(r => r.build); },
  async getBuild(serial) {
    const r = await idbGet('remote', serial);
    return r ? { build: r.build, etag: r.etag } : null;
  },
  async putBuild(build, etag) {
    const cur = await idbGet('remote', build.serial);
    if ((cur && cur.etag) !== (etag || undefined)) { const e = new Error('conflict'); e.conflict = true; throw e; }
    const n = String((cur ? +cur.etag : 0) + 1);
    await idbPut('remote', { serial: build.serial, build, etag: n });
    return n;
  },
  async listPhotos(serial) {
    const all = await idbAll('files');
    return all.filter(f => f.serial === serial && f.dir === 'photos')
      .sort((a, b) => a.created - b.created)
      .map(f => ({ id: f.path, name: f.name, kind: photoKindFromName(f.name), created: f.created, thumb: URL.createObjectURL(f.blob), _blob: f.blob }));
  },
  async uploadPhoto(serial, name, blob, onProgress) {
    await idbPut('files', { path: `${serial}/photos/${name}`, serial, dir: 'photos', name, blob, created: Date.now() });
    onProgress && onProgress(1);
  },
  async deletePhoto(serial, photo) { await idbDel('files', photo.id); },
  async photoBlob(serial, photo) { return photo._blob; },
  async uploadReport(serial, name, blob) {
    await idbPut('files', { path: `${serial}/${name}`, serial, dir: '', name, blob, created: Date.now() });
    return null;
  },
  async folderUrl() { return null; },
  async describe() { return 'This device only (demo mode)'; },
};

// ================================================================ Graph backend
const G = 'https://graph.microsoft.com/v1.0';
async function gfetch(url, opts = {}, retry = true) {
  const token = await getToken();
  const r = await fetch(url.startsWith('http') ? url : G + url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (r.status === 401 && retry) {
    const s = JSON.parse(localStorage.getItem('acqc.auth') || '{}');
    s.expiresAt = 0; localStorage.setItem('acqc.auth', JSON.stringify(s));
    return gfetch(url, opts, false);
  }
  if ((r.status === 429 || r.status === 503) && retry) {
    const wait = (+r.headers.get('Retry-After') || 2) * 1000;
    await new Promise(res => setTimeout(res, wait));
    return gfetch(url, opts, false);
  }
  return r;
}
async function gjson(url, opts) {
  const r = await gfetch(url, opts);
  if (!r.ok) {
    let msg = r.statusText;
    try { const j = await r.json(); msg = (j.error && j.error.message) || msg; } catch {}
    const e = new Error(`SharePoint: ${msg} (${r.status})`); e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}
const encPath = p => p.split('/').map(encodeURIComponent).join('/');

let rootP = null;
function root() {
  if (rootP) return rootP;
  const sig = JSON.stringify([CONFIG.sharepointFolderLink, CONFIG.sharepointHost, CONFIG.sharepointSite, CONFIG.sharepointFolder]);
  rootP = (async () => {
    try {
      const c = JSON.parse(localStorage.getItem('acqc.root') || 'null');
      if (c && c.sig === sig) return c;
    } catch {}
    let item;
    if (CONFIG.sharepointFolderLink) {
      const b = new TextEncoder().encode(CONFIG.sharepointFolderLink.trim());
      let s = ''; b.forEach(x => (s += String.fromCharCode(x)));
      const enc = 'u!' + btoa(s).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
      item = await gjson(`/shares/${enc}/driveItem`);
    } else if (CONFIG.sharepointHost) {
      const site = await gjson(`/sites/${CONFIG.sharepointHost}:/${CONFIG.sharepointSite.replace(/^\/+|\/+$/g, '')}`);
      item = await gjson(`/sites/${site.id}/drive/root:/${encPath(CONFIG.sharepointFolder.replace(/^\/+|\/+$/g, ''))}`);
    } else {
      throw new Error('No SharePoint folder configured in js/config.js');
    }
    const r = { sig, driveId: item.parentReference.driveId, itemId: item.id, webUrl: item.webUrl, name: item.name };
    localStorage.setItem('acqc.root', JSON.stringify(r));
    return r;
  })();
  rootP.catch(() => { rootP = null; });
  return rootP;
}
async function at(rel) { const r = await root(); return `/drives/${r.driveId}/items/${r.itemId}:/${encPath(rel)}:`; }

const ensured = new Set();
async function ensureFolder(rel) {
  if (ensured.has(rel)) return;
  const parts = rel.split('/');
  const r = await root();
  let parent = `/drives/${r.driveId}/items/${r.itemId}`;
  for (let i = 0; i < parts.length; i++) {
    const sub = parts.slice(0, i + 1).join('/');
    if (!ensured.has(sub)) {
      const res = await gfetch(`${parent}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: parts[i], folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
      if (!res.ok && res.status !== 409) throw new Error(`Could not create folder ${sub} (${res.status})`);
      ensured.add(sub);
    }
    parent = `/drives/${r.driveId}/items/${r.itemId}:/${encPath(sub)}:`;
  }
}

async function uploadLarge(rel, blob, conflict, onProgress) {
  const s = await gjson(`${await at(rel)}/createUploadSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': conflict } }),
  });
  const CH = 320 * 1024 * 16; // 5 MiB, multiple of 320 KiB
  let res;
  for (let off = 0; off < blob.size; off += CH) {
    const end = Math.min(off + CH, blob.size);
    res = await fetch(s.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes ${off}-${end - 1}/${blob.size}` },
      body: blob.slice(off, end),
    });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    onProgress && onProgress(end / blob.size);
  }
  return res.json();
}

const GraphBackend = {
  kind: 'graph',
  async listBuilds(cached = {}) {
    const r = await root();
    const kids = await gjson(`/drives/${r.driveId}/items/${r.itemId}/children?$top=999&$select=name,folder`);
    const folders = kids.value.filter(k => k.folder);
    const out = [];
    let i = 0;
    const worker = async () => {
      while (i < folders.length) {
        const f = folders[i++];
        try {
          const got = await this.getBuild(f.name, cached[f.name]);
          if (got) out.push({ ...got.build, _etag: got.etag });
        } catch (e) { console.warn('skip', f.name, e); }
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return out;
  },
  async getBuild(serial, cachedEntry) {
    const r = await gfetch(await at(`${serial}/build.json`));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`SharePoint (${r.status})`);
    const item = await r.json();
    if (cachedEntry && cachedEntry.etag === item.eTag && cachedEntry.build) return { build: cachedEntry.build, etag: item.eTag };
    const d = await fetch(item['@microsoft.graph.downloadUrl'], { cache: 'no-store' });
    return { build: await d.json(), etag: item.eTag };
  },
  async putBuild(build, etag) {
    await ensureFolder(build.serial);
    const url = `${await at(`${build.serial}/build.json`)}/content` + (etag ? '' : '?@microsoft.graph.conflictBehavior=fail');
    const r = await gfetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
      body: JSON.stringify(build, null, 1),
    });
    if (r.status === 412 || r.status === 409) { const e = new Error('conflict'); e.conflict = true; throw e; }
    if (!r.ok) throw new Error(`Saving to SharePoint failed (${r.status})`);
    return (await r.json()).eTag;
  },
  async listPhotos(serial) {
    const r = await gfetch(`${await at(`${serial}/photos`)}/children?$top=999&$expand=thumbnails`);
    if (r.status === 404) return [];
    if (!r.ok) throw new Error(`SharePoint (${r.status})`);
    const j = await r.json();
    return j.value.filter(x => x.file).map(x => {
      const t = x.thumbnails && x.thumbnails[0];
      return {
        id: x.id, name: x.name, kind: photoKindFromName(x.name),
        created: Date.parse(x.createdDateTime), webUrl: x.webUrl,
        thumb: (t && (t.medium || t.large) && (t.medium || t.large).url) || x['@microsoft.graph.downloadUrl'],
        large: (t && t.large && t.large.url) || x['@microsoft.graph.downloadUrl'],
      };
    }).sort((a, b) => a.created - b.created);
  },
  async uploadPhoto(serial, name, blob, onProgress) {
    await ensureFolder(`${serial}/photos`);
    return uploadLarge(`${serial}/photos/${name}`, blob, 'rename', onProgress);
  },
  async deletePhoto(serial, photo) {
    const r = await root();
    await gjson(`/drives/${r.driveId}/items/${photo.id}`, { method: 'DELETE' });
  },
  async photoBlob(serial, photo) {
    const res = await fetch(photo.large || photo.thumb);
    return res.blob();
  },
  async uploadReport(serial, name, blob) {
    await ensureFolder(serial);
    const item = await uploadLarge(`${serial}/${name}`, blob, 'replace');
    return item.webUrl;
  },
  async folderUrl(serial) {
    const r = await gfetch(`${await at(serial)}?$select=webUrl`);
    return r.ok ? (await r.json()).webUrl : null;
  },
  async describe() { const r = await root(); return `SharePoint: ${r.name}`; },
};

export const backend = DEMO_MODE ? LocalBackend : GraphBackend;
export const rootInfo = () => (DEMO_MODE ? Promise.resolve(null) : root());

// ================================================================ Sync layer
const listeners = new Set();
export function onSync(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let syncState = { state: 'idle', pending: 0, error: null };
function setSync(p) { syncState = { ...syncState, ...p }; listeners.forEach(fn => fn(syncState)); }
export const getSyncState = () => syncState;

export async function cachedBuild(serial) {
  const c = await idbGet('cache', serial);
  return c ? c.build : null;
}
export async function cachedBuilds() { return (await idbAll('cache')).map(c => c.build); }

// Fetch the latest version from the backend and merge it into the local copy.
export async function refreshBuild(serial) {
  const c = await idbGet('cache', serial);
  const remote = await backend.getBuild(serial, c);
  if (!remote) return c ? c.build : null;
  const merged = mergeBuilds(c && c.build, remote.build);
  const dirty = !!(c && c.dirty) || (c && !sameFields(merged, remote.build));
  await idbPut('cache', { serial, build: merged, etag: remote.etag, dirty });
  if (dirty) schedulePush(serial, 10);
  return merged;
}

export async function listBuilds() {
  const cache = {};
  for (const c of await idbAll('cache')) cache[c.serial] = c;
  const remote = await backend.listBuilds(cache);
  for (const b of remote) {
    const c = cache[b.serial];
    const etag = b._etag; delete b._etag;
    const merged = mergeBuilds(c && c.build, b);
    await idbPut('cache', { serial: b.serial, build: merged, etag: etag || (c && c.etag), dirty: !!(c && c.dirty) });
    cache[b.serial] = { build: merged };
  }
  return Object.values(cache).map(c => c.build);
}

// Save a changed build locally right away, and push it to the backend shortly after.
export async function saveLocal(build) {
  const c = await idbGet('cache', build.serial);
  await idbPut('cache', { serial: build.serial, build, etag: c && c.etag, dirty: true });
  schedulePush(build.serial);
}

export async function createBuild(build) {
  const existing = await backend.getBuild(build.serial).catch(e => { if (DEMO_MODE) return null; throw e; });
  if (existing) return { exists: true, build: existing.build };
  await idbPut('cache', { serial: build.serial, build, etag: undefined, dirty: true });
  await push(build.serial);
  return { exists: false, build };
}

const timers = {};
function schedulePush(serial, delay = 1200) {
  clearTimeout(timers[serial]);
  setSync({ state: 'pending' });
  timers[serial] = setTimeout(() => push(serial).catch(() => {}), delay);
}

const pushing = {};
export async function push(serial) {
  if (pushing[serial]) { pushing[serial].again = true; return pushing[serial].p; }
  const job = { again: false };
  pushing[serial] = job;
  job.p = (async () => {
    setSync({ state: 'saving' });
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        const c = await idbGet('cache', serial);
        if (!c || !c.dirty) break;
        let remote = null;
        try { remote = await backend.getBuild(serial, c); } catch (e) { if (!e.status) throw e; }
        const merged = mergeBuilds(c.build, remote && remote.build);
        try {
          const etag = await backend.putBuild(merged, remote ? remote.etag : undefined);
          const now = await idbGet('cache', serial);
          // keep any edits made while we were uploading
          const latest = mergeBuilds(now.build, merged);
          const stillDirty = !sameFields(latest, merged);
          await idbPut('cache', { serial, build: latest, etag, dirty: stillDirty });
          if (!sameFields(latest, c.build)) changed(serial, latest);
          if (!stillDirty) break;
        } catch (e) {
          if (!e.conflict) throw e;
        }
      }
      setSync({ state: 'saved', error: null, at: Date.now() });
    } catch (e) {
      const offline = e instanceof TypeError || !navigator.onLine;
      setSync({ state: offline ? 'offline' : 'error', error: offline ? null : e.message });
      clearTimeout(timers[serial]);
      timers[serial] = setTimeout(() => push(serial).catch(() => {}), offline ? 15000 : 30000);
    } finally {
      delete pushing[serial];
      if (job.again) schedulePush(serial, 200);
    }
  })();
  return job.p;
}

const changeListeners = new Set();
export function onBuildChanged(fn) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
function changed(serial, build) { changeListeners.forEach(fn => fn(serial, build)); }

export async function pushAllDirty() {
  for (const c of await idbAll('cache')) if (c.dirty) push(c.serial).catch(() => {});
}
window.addEventListener('online', pushAllDirty);

export async function clearCache() {
  for (const c of await idbAll('cache')) if (!c.dirty) await idbDel('cache', c.serial);
  localStorage.removeItem('acqc.root');
}
