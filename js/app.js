import { CONFIG, DEMO_MODE } from './config.js';
import * as auth from './auth.js';
import { MODELS, HEADER_FIELDS, PHOTO_LINKS, PHOTO_KINDS } from './models.js';
import { PROGRAMMING, INDOOR_TEST } from './checklists.js';
import { val, setVal, meta, newBuild, progress, issues, STATUS_LABEL, RESULT_LABEL, RESULT_SHORT } from './logic.js';
import * as store from './store.js';
import { buildReport } from './pdf.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('#app');

// ------------------------------------------------------------------ user
function userName() {
  if (!DEMO_MODE) { const a = auth.account(); return (a && (a.name || a.username)) || ''; }
  return localStorage.getItem('acqc.name') || '';
}
const today = () => new Date().toISOString().slice(0, 10);
function fmtTime(t) {
  if (!t || t < 10) return '';
  const d = new Date(t), now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? time : `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${time}`;
}
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ------------------------------------------------------------------ UI helpers
function toast(msg, kind = '') {
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 4200);
  setTimeout(() => t.remove(), 4700);
}
function modal(html, { wide = false, onClose } = {}) {
  const m = document.createElement('div');
  m.className = 'modal-bg';
  m.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { m.remove(); onClose && onClose(); };
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
  document.body.appendChild(m);
  return { el: m, close };
}
function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p class="muted">${text}</p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>`,
    { onClose: () => res(false) });
    $('[data-ok]', m.el).onclick = () => { m.el.remove(); res(true); };
  });
}
function promptBox(title, text, { placeholder = '', okLabel = 'OK', value = '' } = {}) {
  return new Promise(res => {
    const m = modal(`<h2>${esc(title)}</h2><p class="muted">${text}</p>
      <input class="input" data-v placeholder="${esc(placeholder)}" value="${esc(value)}">
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-ok>${esc(okLabel)}</button></div>`,
    { onClose: () => res(null) });
    const inp = $('[data-v]', m.el); inp.focus();
    const ok = () => { const v = inp.value.trim(); if (!v) return inp.focus(); m.el.remove(); res(v); };
    $('[data-ok]', m.el).onclick = ok;
    inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
  });
}

const ICON = {
  check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  camera: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  qr: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19h4L19 9l-4-4L5 15z"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  ext: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/></svg>',
};

// ------------------------------------------------------------------ top bar
function renderTopbar() {
  const u = userName();
  $('#topbar').innerHTML = `
    <a class="brand" href="#/" aria-label="Acecore QC home">
      <img src="assets/logo.svg" alt="ACECORE" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'wordmark',textContent:'ACECORE'}))">
      <span class="brand-tag">Quality Control</span>
    </a>
    <div class="top-right">
      <span id="sync" class="sync"></span>
      ${u ? `<span class="user">${esc(u)}</span>` : ''}
      <a class="icon-btn" href="#/settings" aria-label="Settings">${ICON.gear}</a>
    </div>`;
  renderSync(store.getSyncState());
}
function renderSync(s) {
  const el = $('#sync'); if (!el) return;
  const map = {
    idle: ['', ''], pending: ['pending', 'Unsaved…'], saving: ['pending', 'Saving…'],
    saved: ['ok', DEMO_MODE ? 'Saved on this device' : 'Saved'], offline: ['warn', 'Offline – saved on device'],
    error: ['err', 'Sync error'],
  };
  const [cls, txt] = map[s.state] || map.idle;
  el.className = `sync ${cls}`;
  el.title = s.error || '';
  el.innerHTML = txt ? `<i></i>${txt}` : '';
}
store.onSync(renderSync);

// ------------------------------------------------------------------ router
let cleanup = [];
function onLeave(fn) { cleanup.push(fn); }
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(qs || '') };
}
async function route() {
  cleanup.forEach(fn => fn()); cleanup = [];
  const { parts, q } = parseHash();
  document.body.dataset.view = parts[0] || 'home';
  window.scrollTo(0, 0);
  try {
    if (!DEMO_MODE && !auth.isSignedIn()) return viewSignIn();
    if (DEMO_MODE && !userName() && parts[0] !== 'settings') {
      const n = await promptBox('Welcome', 'What is your name? It is recorded with every check you make.', { placeholder: 'Your name', okLabel: 'Continue' });
      if (n) { localStorage.setItem('acqc.name', n); renderTopbar(); }
    }
    if (!parts.length) return await viewHome();
    if (parts[0] === 'new') return viewNew();
    if (parts[0] === 'b' && parts[1]) return await viewBuild(parts[1], parts[2] || 'quality', q);
    if (parts[0] === 'photo') return await viewCapture(q);
    if (parts[0] === 'settings') return await viewSettings();
    location.hash = '#/';
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="empty"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/">Back to builds</a></div>`;
  }
}

// ------------------------------------------------------------------ sign in
function viewSignIn() {
  app.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Acecore Technologies</p>
      <h1>Quality control,<br>built in.</h1>
      <p class="lead">Sign in with your Acecore Microsoft account to open build checklists and upload photos to SharePoint.</p>
      <button class="btn primary big" id="signin">Sign in with Microsoft</button>
    </section>`;
  $('#signin').onclick = () => auth.login();
}

// ------------------------------------------------------------------ home
const FILTERS = [['all', 'All'], ['in_progress', 'In build'], ['supervisor', 'Awaiting supervisor'], ['attention', 'Has fails'], ['ready', 'Ready'], ['completed', 'Completed']];
async function viewHome() {
  let filter = sessionStorage.getItem('acqc.filter') || 'all';
  let search = '';
  let builds = await store.cachedBuilds();
  app.innerHTML = `
    <section class="page-head">
      <div><p class="eyebrow">Production</p><h1>Builds</h1></div>
      <a class="btn primary" href="#/new">${ICON.plus}New build</a>
    </section>
    <div class="toolbar">
      <input class="input search" type="search" placeholder="Search serial, customer, engineer…" aria-label="Search">
      <div class="chips">${FILTERS.map(([k, l]) => `<button class="chip" data-f="${k}">${l}</button>`).join('')}</div>
    </div>
    <div id="list" class="cards"></div>
    <p id="loadstate" class="muted center small"></p>`;
  const draw = () => {
    $$('.chip').forEach(c => c.classList.toggle('on', c.dataset.f === filter));
    const s = search.toLowerCase();
    const rows = builds.filter(b => MODELS[b.model]).map(b => ({ b, p: progress(b) }))
      .filter(({ b, p }) => (filter === 'all' || p.status === filter) &&
        (!s || [b.serial, val(b, 'h.customer'), val(b, 'h.engineer'), MODELS[b.model].name].join(' ').toLowerCase().includes(s)))
      .sort((x, y) => (x.p.status === 'completed') - (y.p.status === 'completed') || (y.b.updated || 0) - (x.b.updated || 0));
    $('#list').innerHTML = rows.length ? rows.map(({ b, p }) => `
      <a class="card build-card" href="#/b/${encodeURIComponent(b.serial)}/quality">
        <div class="row between"><span class="serial">${esc(b.serial)}</span><span class="badge">${esc(MODELS[b.model].name)}</span></div>
        <div class="muted small">${esc(val(b, 'h.customer') || 'No customer')} · ${esc(val(b, 'h.engineer') || '–')}</div>
        <div class="bar"><i style="width:${p.pct}%"></i></div>
        <div class="row between small"><span class="status s-${p.status}">${STATUS_LABEL[p.status]}</span><span class="muted">${p.pct}%</span></div>
        <div class="muted tiny">Updated ${ago(b.updated || b.created.t)}</div>
      </a>`).join('') : `<div class="empty"><p class="muted">${builds.length ? 'No builds match this filter.' : 'No builds yet. Start with “New build”.'}</p></div>`;
  };
  $$('.chip').forEach(c => (c.onclick = () => { filter = c.dataset.f; sessionStorage.setItem('acqc.filter', filter); draw(); }));
  $('.search').oninput = e => { search = e.target.value; draw(); };
  draw();
  $('#loadstate').textContent = 'Refreshing…';
  try {
    builds = await store.listBuilds();
    if (document.body.dataset.view === 'home') { draw(); $('#loadstate').textContent = ''; }
  } catch (e) {
    $('#loadstate').textContent = navigator.onLine ? `Could not refresh: ${e.message}` : 'Offline – showing builds saved on this device.';
  }
}

// ------------------------------------------------------------------ new build
function viewNew() {
  const models = Object.entries(MODELS);
  app.innerHTML = `
    <section class="page-head"><div><a class="back" href="#/">${ICON.back}All builds</a><p class="eyebrow">Start</p><h1>New build</h1></div></section>
    <form class="card form" id="nb" autocomplete="off">
      <label class="lbl">Model</label>
      <div class="model-pick">${models.map(([k, m], i) => `
        <label class="model-opt"><input type="radio" name="model" value="${k}" ${i === 0 ? 'checked' : ''}><span><b>${esc(m.name)}</b><small>${m.finalAssembly ? 'Build info · Quality · Final assembly' : 'Build info · Quality'}</small></span></label>`).join('')}
      </div>
      <label class="lbl" for="sn">UAV serial number</label>
      <input class="input big" id="sn" name="serial" required placeholder="e.g. D-086-H" autocapitalize="characters" spellcheck="false">
      <div class="grid2">
        <div><label class="lbl" for="cu">Customer</label><input class="input" id="cu" name="customer"></div>
        <div><label class="lbl" for="en">Name engineer</label><input class="input" id="en" name="engineer" value="${esc(userName())}"></div>
        <div><label class="lbl" for="ds">Date start</label><input class="input" id="ds" type="date" name="date" value="${today()}"></div>
      </div>
      <div class="form-actions"><a class="btn ghost" href="#/">Cancel</a><button class="btn primary" type="submit">Create build</button></div>
    </form>`;
  $('#sn').oninput = e => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); };
  $('#nb').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const serial = store.safeSerial(fd.get('serial'));
    if (!serial) return;
    const btn = $('button[type=submit]', e.target); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const b = newBuild({ model: fd.get('model'), serial, by: userName(),
        header: { 'h.customer': fd.get('customer'), 'h.engineer': fd.get('engineer'), 'h.date_start': fd.get('date') } });
      const r = await store.createBuild(b);
      if (r.exists) toast(`${esc(serial)} already exists – opened the existing build.`);
      else toast(`Build ${esc(serial)} created.`, 'ok');
      location.hash = `#/b/${encodeURIComponent(serial)}/info`;
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Create build';
      toast(`Could not create build: ${esc(err.message)}`, 'err');
    }
  };
}

// ------------------------------------------------------------------ build view
let B = null;           // current build
let PHOTOS = [];        // photos of current build
let CTX = { tab: 'quality' }; // current tab
const TABS = [['info', 'Build info'], ['quality', 'Quality checklist'], ['final', 'Final assembly'], ['photos', 'Photos'], ['report', 'Report']];

async function viewBuild(serial, tab, q) {
  B = await store.cachedBuild(serial);
  app.innerHTML = `<div class="loading">Loading ${esc(serial)}…</div>`;
  if (!B) {
    try { B = await store.refreshBuild(serial); } catch (e) { /* offline */ }
    if (!B) { app.innerHTML = `<div class="empty"><h2>Build ${esc(serial)} not found</h2><a class="btn" href="#/">Back to builds</a></div>`; return; }
  }
  const model = MODELS[B.model];
  const tabs = TABS.filter(([k]) => k !== 'final' || model.finalAssembly);
  if (!tabs.some(([k]) => k === tab)) tab = 'quality';
  app.innerHTML = `
    <section class="build-head">
      <div><a class="back" href="#/">${ICON.back}All builds</a><p class="eyebrow">${esc(model.name)}</p><h1>${esc(B.serial)}</h1></div>
      <div id="headstat"></div>
    </section>
    <nav class="tabs" role="tablist">${tabs.map(([k, l]) => `<a role="tab" class="tab ${k === tab ? 'on' : ''}" href="#/b/${encodeURIComponent(serial)}/${k}">${l}<span class="tab-count" data-tc="${k}"></span></a>`).join('')}</nav>
    <div id="locked"></div>
    <div id="tab" class="tabpane"></div>`;
  CTX = { tab, serial };
  const renderAll = () => { renderHead(); renderTab(CTX); };
  renderAll();
  loadPhotos().then(() => { if (['photos', 'report', 'quality'].includes(CTX.tab) && !isEditing()) renderTab(CTX); renderHead(); });

  if (q.get('item')) setTimeout(() => focusItem(q.get('item')), 50);

  // live updates from other devices
  const refresh = async () => {
    try {
      const nb = await store.refreshBuild(serial);
      if (nb && JSON.stringify(nb.fields) !== JSON.stringify(B.fields)) {
        B = nb;
        if (!isEditing()) renderAll(); else pendingRender = true;
      }
    } catch {}
  };
  let pendingRender = false;
  const iv = setInterval(refresh, 20000);
  const off = store.onBuildChanged((s, nb) => {
    if (s !== serial) return;
    B = store.mergeBuilds(B, nb);
    if (!isEditing()) renderAll(); else pendingRender = true;
  });
  const onBlur = () => setTimeout(() => { if (pendingRender && !isEditing()) { pendingRender = false; renderAll(); } }, 300);
  document.addEventListener('focusout', onBlur);
  onLeave(() => { clearInterval(iv); off(); document.removeEventListener('focusout', onBlur); });
  refresh();
}
const isEditing = () => { const a = document.activeElement; return a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest('#tab'); };
const locked = () => !!val(B, 'meta.finalized');

async function loadPhotos() {
  try { PHOTOS = await store.backend.listPhotos(B.serial); } catch (e) { PHOTOS = PHOTOS || []; }
  return PHOTOS;
}

function renderHead() {
  const p = progress(B);
  const deg = Math.round(p.pct * 3.6);
  $('#headstat').innerHTML = `
    <div class="headstat">
      <div class="ring" style="--deg:${deg}deg"><span>${p.pct}<small>%</small></span></div>
      <div><span class="status s-${p.status}">${STATUS_LABEL[p.status]}</span>
      <div class="muted small">${esc(val(B, 'h.customer') || 'No customer')}</div></div>
    </div>`;
  const byId = Object.fromEntries(p.parts.map(x => [x.id, x]));
  const tc = {
    quality: `${byId.self.done + byId.sup.done + byId.prog.done + byId.indoor.done}/${byId.self.total + byId.sup.total + byId.prog.total + byId.indoor.total}`,
    final: byId.final ? `${byId.final.done}/${byId.final.total}` : '',
    photos: PHOTOS.length ? String(PHOTOS.length) : '',
  };
  $$('[data-tc]').forEach(el => (el.textContent = tc[el.dataset.tc] || ''));
  $('#locked').innerHTML = locked() ? `<div class="banner">Finalized on ${esc(new Date(val(B, 'meta.finalized')).toLocaleString('en-GB'))}. Reopen it on the Report tab to make changes.</div>` : '';
}

// value change from any input
function change(key, v) {
  if (locked()) return;
  setVal(B, key, v, userName());
  store.saveLocal(B);
}

function renderTab(ctx) {
  const el = $('#tab'); if (!el) return;
  const fn = { info: tabInfo, quality: tabQuality, final: tabFinal, photos: tabPhotos, report: tabReport }[ctx.tab];
  el.innerHTML = fn();
  el.classList.toggle('is-locked', locked());
  if (locked()) $$('input,textarea,select', el).forEach(i => { if (!i.closest('.keep-enabled')) i.disabled = true; });
  bindTab(ctx);
}

// ---- field renderers
function fieldHtml(key, label, { type = 'text', options, multiline, placeholder = '', cls = '' } = {}) {
  const v = val(B, key);
  const id = 'f_' + key.replace(/[^a-z0-9]/gi, '_');
  let input;
  if (options) input = `<select class="input" id="${id}" data-k="${key}"><option value=""></option>${options.map(o => `<option ${o === v ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  else if (multiline) input = `<textarea class="input" id="${id}" data-k="${key}" rows="3" placeholder="${esc(placeholder)}">${esc(v)}</textarea>`;
  else input = `<input class="input" id="${id}" data-k="${key}" type="${type}" value="${esc(v)}" placeholder="${esc(placeholder)}" ${type === 'text' ? 'spellcheck="false"' : ''}>`;
  return `<div class="field ${cls}"><label class="lbl" for="${id}">${esc(label)}</label>${input}</div>`;
}
const segHtml = (key, opts, extra = '') => {
  const v = val(B, key);
  return `<div class="seg" role="group" ${extra}>${opts.map(o => `<button type="button" class="seg-${o} ${v === o ? 'on' : ''}" data-seg="${key}" data-v="${o}" aria-pressed="${v === o}" title="${RESULT_LABEL[o]}">${RESULT_SHORT[o]}</button>`).join('')}</div>`;
};
const whoHtml = key => { const m = meta(B, key); return m && m.t > 10 && m.v ? `<span class="who">${esc(m.by || '')}${m.by ? ' · ' : ''}${fmtTime(m.t)}</span>` : ''; };

function tabInfo() {
  const model = MODELS[B.model];
  return `
    <section class="card" id="sec-header">
      <h2 class="card-title">General</h2>
      <div class="fields">${HEADER_FIELDS.map(f => fieldHtml(f.id, f.label, { type: f.date ? 'date' : 'text' })).join('')}
        <div class="field"><label class="lbl">UAV serial nr</label><input class="input" value="${esc(B.serial)}" disabled></div>
      </div>
    </section>
    ${model.buildInfo.map(g => `
      <section class="card">
        <h2 class="card-title">${esc(g.title)}</h2>
        <div class="fields ${g.compact ? 'compact' : ''}">
          ${g.fields.map(f => f.pair
            ? `<div class="field pair"><label class="lbl">${esc(f.label)}</label><div class="pair-in">
                 <input class="input" data-k="info.${f.id}.model" value="${esc(val(B, `info.${f.id}.model`))}" aria-label="${esc(f.label)} model" placeholder="Model">
                 <input class="input sn" data-k="info.${f.id}.sn" value="${esc(val(B, `info.${f.id}.sn`))}" aria-label="${esc(f.label)} serial number" placeholder="SN" spellcheck="false"></div></div>`
            : fieldHtml(`info.${f.id}`, f.label, { options: f.options, multiline: f.multiline, placeholder: f.sn ? 'SN' : '', cls: f.multiline ? 'full' : '' })).join('')}
        </div>
      </section>`).join('')}`;
}

function sectionCount(items, key, test) { return items.filter(i => test(val(B, `${i.id}.${key}`))).length; }

function tabQuality() {
  const model = MODELS[B.model];
  const nav = model.qcSections.map(s => {
    const self = sectionCount(s.items, 'self', v => v === true);
    const sups = s.items.filter(i => i.sup);
    const sup = sectionCount(sups, 'sup', v => !!v);
    const done = self === s.items.length && sup === sups.length;
    return `<a class="chip ${done ? 'done' : ''}" href="#sec-${s.id}" data-jump="sec-${s.id}">${esc(s.title)} <b>${self + sup}/${s.items.length + sups.length}</b></a>`;
  }).join('') + `<a class="chip" data-jump="sec-programming" href="#sec-programming">Programming <b>${sectionCount(PROGRAMMING, 'pass', v => v === true)}/${PROGRAMMING.length}</b></a>
    <a class="chip" data-jump="sec-indoor" href="#sec-indoor">Indoor test <b>${sectionCount(INDOOR_TEST, 'res', v => !!v)}/${INDOOR_TEST.length}</b></a>`;
  return `
    <p class="intro">Keep the checklist updated while you work: tick <b>Self check</b> as you go. When the centerpiece is ready to close, a supervisor fills in the <b>Supervisor check</b>.<br><span class="muted small"><b>PAR</b> = pass after repair (found wrong, fixed, re-checked). Add a note with what was repaired.</span></p>
    <div class="jump">${nav}</div>
    ${model.qcSections.map(s => `
      <section class="card" id="sec-${s.id}">
        <div class="card-title row between"><h2>${esc(s.title)}</h2><span class="colheads"><span>Self check</span><span>Supervisor check</span></span></div>
        ${s.items.map(it => qcItem(it)).join('')}
      </section>`).join('')}
    <section class="card" id="sec-programming">
      <div class="card-title row between"><h2>Programming</h2><span class="colheads"><span>Version / name</span><span>Pass</span></span></div>
      ${PROGRAMMING.map(it => `
        <div class="item" id="it-${it.id}">
          <div class="item-main"><div class="item-label">${esc(it.label)}</div>${whoHtml(`${it.id}.pass`)}</div>
          <div class="item-ctl">
            <input class="input ver" data-k="${it.id}.version" value="${esc(val(B, `${it.id}.version`))}" placeholder="Version / name" aria-label="${esc(it.label)} version">
            <button type="button" class="tick ${val(B, `${it.id}.pass`) === true ? 'on' : ''}" data-tick="${it.id}.pass" aria-pressed="${val(B, `${it.id}.pass`) === true}">${ICON.check}<span>Pass</span></button>
          </div>
        </div>`).join('')}
    </section>
    <section class="card" id="sec-indoor">
      <h2 class="card-title">Indoor test</h2>
      <div class="fields">${fieldHtml('indoor.date', 'Date', { type: 'date' })}${fieldHtml('indoor.pilot', 'Pilot')}</div>
      ${INDOOR_TEST.map(it => `
        <div class="item" id="it-${it.id}">
          <div class="item-main"><div class="item-label">${esc(it.label)}</div>${whoHtml(`${it.id}.res`)}</div>
          <div class="item-ctl">${segHtml(`${it.id}.res`, ['pass', 'fail', 'na'])}</div>
        </div>`).join('')}
    </section>`;
}

function qcItem(it) {
  const self = val(B, `${it.id}.self`) === true;
  const sup = val(B, `${it.id}.sup`);
  const note = val(B, `${it.id}.note`);
  const pk = PHOTO_LINKS[it.id];
  const nPh = pk ? PHOTOS.filter(p => p.kind === pk).length : 0;
  return `
    <div class="item ${sup === 'fail' ? 'is-fail' : ''}" id="it-${it.id}">
      <div class="item-main">
        <div class="item-label">${esc(it.label)}</div>
        <div class="item-help">${esc(it.help)}</div>
        ${pk ? `<div class="photo-link"><button type="button" class="btn small ghost keep" data-qr="${pk}">${ICON.qr}Scan with phone</button>
          <a class="btn small ghost" href="#/b/${encodeURIComponent(B.serial)}/photos">${ICON.camera}${nPh ? `${nPh} photo${nPh > 1 ? 's' : ''}` : 'No photos yet'}</a></div>` : ''}
        <div class="whos">${self ? `<span>Self: ${whoHtml(`${it.id}.self`)}</span>` : ''}${sup ? `<span>Supervisor: ${whoHtml(`${it.id}.sup`)}</span>` : ''}</div>
      </div>
      <div class="item-ctl">
        <button type="button" class="tick ${self ? 'on' : ''}" data-tick="${it.id}.self" aria-pressed="${self}" aria-label="Self check ${esc(it.label)}">${ICON.check}<span>Self</span></button>
        ${it.sup ? segHtml(`${it.id}.sup`, ['pass', 'fail', 'par', 'na'], `aria-label="Supervisor check ${esc(it.label)}"`) : `<div class="nosup">No supervisor check</div>`}
        <button type="button" class="icon-btn note-btn ${note ? 'has' : ''}" data-note="${it.id}" aria-label="Note">${ICON.note}</button>
      </div>
      <div class="item-note" ${note ? '' : 'hidden'}><textarea class="input" rows="2" data-k="${it.id}.note" placeholder="Note (optional)">${esc(note)}</textarea></div>
    </div>`;
}

function tabFinal() {
  const model = MODELS[B.model];
  return `
    <p class="intro">A final checklist for the ${esc(model.name)} in its final assembly stages. <b>All items must be checked before finalizing the system.</b></p>
    ${model.finalAssembly.map(s => `
      <section class="card" id="sec-${s.id}">
        <div class="card-title row between"><h2>${esc(s.title)}</h2><span class="muted small">${sectionCount(s.items, 'res', v => !!v)}/${s.items.length}</span></div>
        ${s.items.map(it => {
          const note = val(B, `${it.id}.note`);
          return `
          <div class="item ${val(B, `${it.id}.res`) === 'fail' ? 'is-fail' : ''}" id="it-${it.id}">
            <div class="item-main"><div class="item-label">${esc(it.label)}</div><div class="item-help">${esc(it.help)}</div><div class="whos">${whoHtml(`${it.id}.res`)}</div></div>
            <div class="item-ctl">${segHtml(`${it.id}.res`, ['pass', 'fail', 'par', 'na'])}
              <button type="button" class="icon-btn note-btn ${note ? 'has' : ''}" data-note="${it.id}" aria-label="Note">${ICON.note}</button></div>
            <div class="item-note" ${note ? '' : 'hidden'}><textarea class="input" rows="2" data-k="${it.id}.note" placeholder="Note (optional)">${esc(note)}</textarea></div>
          </div>`;
        }).join('')}
      </section>`).join('')}`;
}

function tabPhotos() {
  return `
    <p class="intro">Photos are stored in the <b>${esc(B.serial)}/photos</b> folder${DEMO_MODE ? ' (on this device – demo mode)' : ' in SharePoint'}. Scan the QR code with your phone, or take a photo with this device.</p>
    ${PHOTO_KINDS.map(k => {
      const list = PHOTOS.filter(p => p.kind === k.id);
      return `
      <section class="card">
        <div class="card-title row between fwrap"><h2>${k.label} <span class="muted">${list.length}</span></h2>
          <div class="row gap">
            <button type="button" class="btn small keep" data-qr="${k.id}">${ICON.qr}Scan with phone</button>
            <label class="btn small ghost keep">${ICON.camera}This device<input type="file" accept="image/*" multiple hidden data-upload="${k.id}"></label>
          </div></div>
        <div class="thumbs">${list.length ? list.map(p => `
          <figure class="thumb"><a href="${esc(p.webUrl || p.thumb)}" target="_blank" rel="noopener"><img src="${esc(p.thumb)}" alt="${esc(p.name)}" loading="lazy"></a>
            <figcaption>${esc(p.name)}${locked() ? '' : `<button class="icon-btn" data-delphoto="${esc(p.id)}" aria-label="Delete photo">${ICON.trash}</button>`}</figcaption></figure>`).join('')
          : `<p class="muted small">No ${k.label.toLowerCase()} photos yet.</p>`}</div>
      </section>`;
    }).join('')}
    <div class="row gap"><button class="btn ghost small keep" id="refreshPhotos">Refresh</button>${DEMO_MODE ? '' : '<button class="btn ghost small keep" id="openFolder">' + ICON.ext + 'Open folder in SharePoint</button>'}</div>`;
}

function tabReport() {
  const p = progress(B);
  const iss = issues(B, PHOTOS);
  const fin = val(B, 'meta.finalized');
  const over = val(B, 'meta.override');
  const groups = { info: 'Build info', quality: 'Quality checklist', final: 'Final assembly', photos: 'Photos' };
  return `
    <section class="card">
      <h2 class="card-title">Progress</h2>
      <div class="parts">${p.parts.map(x => `
        <div class="part"><div class="row between"><span>${x.label}</span><span class="muted">${x.done}/${x.total}</span></div>
          <div class="bar"><i style="width:${x.total ? (x.done / x.total) * 100 : 0}%"></i></div>
          ${x.fail || x.par ? `<div class="small"><span class="t-fail">${x.fail} fail</span> · <span class="t-par">${x.par} pass after repair</span></div>` : ''}</div>`).join('')}</div>
    </section>
    <section class="card">
      <h2 class="card-title">Report</h2>
      ${fin ? `<p>Finalized on <b>${esc(new Date(fin).toLocaleString('en-GB'))}</b> by ${esc((meta(B, 'meta.finalized') || {}).by || '–')}.${over ? ` <br><span class="t-par">Finalized with open items: ${esc(over)}</span>` : ''}</p>` : '<p class="muted">The PDF report contains build info, all checklists with who/when, and the photos.</p>'}
      <div class="row gap fwrap keep-enabled">
        <button class="btn ghost keep" id="dlPdf">Download PDF</button>
        ${DEMO_MODE ? '' : '<button class="btn ghost keep" id="upPdf">Save PDF to SharePoint</button>'}
        ${fin ? '<button class="btn ghost keep" id="reopen">Reopen build</button>' : `<button class="btn primary keep" id="finalize">Finalize build</button>`}
      </div>
      <p class="muted small" id="pdfstate"></p>
    </section>
    <section class="card">
      <h2 class="card-title">${iss.length ? `Open items <span class="muted">${iss.length}</span>` : 'All checks complete'}</h2>
      ${iss.length ? Object.entries(groups).map(([g, l]) => {
        const list = iss.filter(i => i.tab === g).sort((a, b) => /^FAIL/.test(b.text) - /^FAIL/.test(a.text));
        return list.length ? `<h3 class="sub">${l}</h3>${issueList(list.slice(0, 8))}${list.length > 8 ? `<details class="more"><summary>Show ${list.length - 8} more</summary>${issueList(list.slice(8))}</details>` : ''}` : '';
      }).join('') : '<p class="muted">Nothing is missing. The build can be finalized.</p>'}
    </section>`;
}

const issueList = list => `<ul class="issues">${list.map(i => `<li class="${/^FAIL/.test(i.text) ? 't-fail' : ''}"><a href="#/b/${encodeURIComponent(B.serial)}/${i.tab}${i.anchor ? `?item=${encodeURIComponent(i.anchor)}` : ''}">${esc(i.text)}</a></li>`).join('')}</ul>`;

function focusItem(id) {
  const el = document.getElementById('it-' + id) || document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1600);
}

function bindTab(ctx) {
  const el = $('#tab');
  // text inputs: save while typing
  let tmr;
  el.oninput = e => {
    const k = e.target.dataset.k; if (!k) return;
    clearTimeout(tmr);
    const v = e.target.value;
    tmr = setTimeout(() => { change(k, v); renderHead(); }, 400);
  };
  el.onchange = e => {
    const k = e.target.dataset.k;
    if (k) { clearTimeout(tmr); change(k, e.target.value); renderHead(); }
    const up = e.target.dataset.upload;
    if (up) uploadFromDevice(up, [...e.target.files]).then(() => renderTab(ctx));
  };
  el.onclick = async e => {
    const t = e.target.closest('button, a[data-jump]');
    if (!t) return;
    if (t.dataset.jump) { e.preventDefault(); focusItem(t.dataset.jump); return; }
    if (t.dataset.qr) return showQr(t.dataset.qr);
    if (t.id === 'refreshPhotos') { await loadPhotos(); renderTab(ctx); renderHead(); return; }
    if (t.id === 'openFolder') { const u = await store.backend.folderUrl(B.serial); if (u) window.open(u, '_blank'); return; }
    if (t.id === 'dlPdf') return makePdf(false);
    if (t.id === 'upPdf') return makePdf(true);
    if (t.id === 'finalize') return finalize(ctx);
    if (t.id === 'reopen') return reopen(ctx);
    if (t.dataset.delphoto) {
      const p = PHOTOS.find(x => x.id === t.dataset.delphoto);
      if (p && await confirmBox('Delete photo?', `${esc(p.name)} will be removed${DEMO_MODE ? '' : ' from SharePoint (it goes to the recycle bin)'}.`, 'Delete', true)) {
        try { await store.backend.deletePhoto(B.serial, p); await loadPhotos(); renderTab(ctx); renderHead(); }
        catch (err) { toast(esc(err.message), 'err'); }
      }
      return;
    }
    if (t.dataset.note) {
      const box = t.closest('.item').querySelector('.item-note');
      box.hidden = !box.hidden;
      if (!box.hidden) $('textarea', box).focus();
      return;
    }
    if (locked()) return toast('This build is finalized. Reopen it on the Report tab to make changes.');
    if (t.dataset.tick) {
      const k = t.dataset.tick;
      change(k, val(B, k) === true ? false : true);
      renderTab(ctx); renderHead(); return;
    }
    if (t.dataset.seg) {
      const k = t.dataset.seg, v = t.dataset.v;
      change(k, val(B, k) === v ? '' : v);
      renderTab(ctx); renderHead();
    }
  };
}

// ---- photos
async function uploadFromDevice(kind, files) {
  for (const f of files) {
    const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    try { await store.backend.uploadPhoto(B.serial, store.photoName(kind, ext), f); }
    catch (e) { toast(`Upload failed: ${esc(e.message)}`, 'err'); }
  }
  await loadPhotos(); renderHead();
  toast(`${files.length} photo${files.length > 1 ? 's' : ''} saved.`, 'ok');
}

function qrSvg(text) {
  const { QRCode, QRErrorCorrectLevel } = window.QRCodeLib;
  const q = new QRCode(-1, QRErrorCorrectLevel.M);
  q.addData(text); q.make();
  const n = q.getModuleCount(), m = 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n + 2 * m} ${n + 2 * m}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
const captureUrl = (kind) => `${location.origin}${location.pathname}#/photo?sn=${encodeURIComponent(B.serial)}&kind=${kind}`;

function showQr(kind) {
  const before = new Set(PHOTOS.map(p => p.id));
  let current = kind;
  const m = modal(`
    <div class="row between"><div><p class="eyebrow">Scan with your phone</p><h2>${esc(B.serial)}</h2></div><button class="icon-btn" data-close aria-label="Close">✕</button></div>
    <div class="seg kind-seg">${PHOTO_KINDS.map(k => `<button type="button" data-kind="${k.id}" class="${k.id === kind ? 'on' : ''}">${k.label}</button>`).join('')}</div>
    <div class="qr" id="qrbox"></div>
    <p class="muted small center">Open the camera app on your phone and point it at the code. Photos land in <b>${esc(B.serial)}/photos</b>${DEMO_MODE ? '.<br><span class="t-par">Demo mode: phones can only upload once SharePoint is connected.</span>' : '.'}</p>
    <div id="arrived" class="arrived"></div>
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`, {
    wide: true,
    onClose: async () => { clearInterval(iv); await loadPhotos(); renderHead(); if ($('#tab')) renderTab(CTX); },
  });
  const draw = () => { $('#qrbox', m.el).innerHTML = qrSvg(captureUrl(current)); };
  draw();
  $$('[data-kind]', m.el).forEach(b => (b.onclick = () => { current = b.dataset.kind; $$('[data-kind]', m.el).forEach(x => x.classList.toggle('on', x === b)); draw(); }));
  const iv = setInterval(async () => {
    const list = await loadPhotos();
    const fresh = list.filter(p => !before.has(p.id));
    $('#arrived', m.el).innerHTML = fresh.length ? `<p class="t-pass small"><b>${fresh.length} new photo${fresh.length > 1 ? 's' : ''} received</b></p><div class="thumbs mini">${fresh.map(p => `<img src="${esc(p.thumb)}" alt="">`).join('')}</div>` : '';
  }, 4000);
}

// ---- report / finalize
async function makePdf(upload, { quiet = false } = {}) {
  const st = $('#pdfstate');
  try {
    st && (st.textContent = 'Building PDF…');
    await loadPhotos();
    const blob = await buildReport(B, PHOTOS, p => store.backend.photoBlob(B.serial, p), { draft: !val(B, 'meta.finalized') });
    const name = `${B.serial}_QC-report.pdf`;
    if (upload) {
      st && (st.textContent = 'Uploading to SharePoint…');
      const url = await store.backend.uploadReport(B.serial, name, blob);
      st && (st.innerHTML = url ? `Saved to SharePoint · <a href="${esc(url)}" target="_blank" rel="noopener">open PDF</a>` : 'Saved.');
      if (!quiet) toast('Report saved to SharePoint.', 'ok');
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      st && (st.textContent = '');
    }
    return blob;
  } catch (e) {
    console.error(e);
    st && (st.textContent = `PDF failed: ${e.message}`);
    toast(`PDF failed: ${esc(e.message)}`, 'err');
  }
}

async function finalize(ctx) {
  const iss = issues(B, PHOTOS);
  let override = '';
  if (iss.length) {
    override = await promptBox('Finalize with open items?', `There are still <b>${iss.length}</b> open items. To finalize anyway, give a reason – it is printed in the report.`, { placeholder: 'Reason', okLabel: 'Finalize anyway' });
    if (!override) return;
  } else if (!await confirmBox('Finalize build?', `${esc(B.serial)} will be locked and the final PDF report is ${DEMO_MODE ? 'created' : 'saved to SharePoint'}.`, 'Finalize')) return;
  if (!val(B, 'h.date_end')) change('h.date_end', today());
  change('meta.override', override);
  change('meta.finalized', Date.now());
  renderTab(ctx); renderHead();
  await store.push(B.serial).catch(() => {});
  if (DEMO_MODE) await makePdf(false); else await makePdf(true, { quiet: true });
  toast(`${esc(B.serial)} finalized.`, 'ok');
}
async function reopen(ctx) {
  if (!await confirmBox('Reopen build?', 'The build becomes editable again. The finalized status is removed until it is finalized again.', 'Reopen')) return;
  setVal(B, 'meta.finalized', '', userName());
  setVal(B, 'meta.override', '', userName());
  store.saveLocal(B);
  renderTab(ctx); renderHead();
}

// ------------------------------------------------------------------ phone capture page
async function viewCapture(q) {
  const serial = store.safeSerial(q.get('sn'));
  let kind = PHOTO_KINDS.some(k => k.id === q.get('kind')) ? q.get('kind') : 'top';
  if (!serial) { location.hash = '#/'; return; }
  app.innerHTML = `
    <section class="capture">
      <p class="eyebrow">Photo upload</p>
      <h1>${esc(serial)}</h1>
      <div class="seg kind-seg big">${PHOTO_KINDS.map(k => `<button type="button" data-kind="${k.id}" class="${k.id === kind ? 'on' : ''}">${k.label}</button>`).join('')}</div>
      <label class="btn primary huge">${ICON.camera}Take photo<input type="file" accept="image/*" capture="environment" hidden id="cam"></label>
      <label class="btn ghost">Choose from gallery<input type="file" accept="image/*" multiple hidden id="gal"></label>
      <div id="ups" class="uploads"></div>
      <p class="muted small">Photos are saved in <b>${esc(serial)}/photos</b>${DEMO_MODE ? ' on this device (demo mode)' : ' in SharePoint'}.</p>
    </section>`;
  $$('[data-kind]').forEach(b => (b.onclick = () => { kind = b.dataset.kind; $$('[data-kind]').forEach(x => x.classList.toggle('on', x === b)); }));
  const handle = async files => {
    for (const f of files) {
      const row = document.createElement('div');
      row.className = 'up';
      const url = URL.createObjectURL(f);
      row.innerHTML = `<img src="${url}" alt=""><div class="grow"><div class="small"><b>${PHOTO_KINDS.find(k => k.id === kind).label}</b> · ${(f.size / 1048576).toFixed(1)} MB</div><div class="bar"><i style="width:0%"></i></div><div class="tiny muted st">Uploading…</div></div>`;
      $('#ups').prepend(row);
      const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
      try {
        await store.backend.uploadPhoto(serial, store.photoName(kind, ext), f, p => ($('.bar i', row).style.width = `${Math.round(p * 100)}%`));
        $('.bar i', row).style.width = '100%';
        $('.st', row).textContent = 'Saved ✓';
        row.classList.add('ok');
        if (navigator.vibrate) navigator.vibrate(60);
      } catch (e) {
        $('.st', row).textContent = `Failed: ${e.message}`;
        row.classList.add('err');
      }
    }
  };
  $('#cam').onchange = e => { handle([...e.target.files]); e.target.value = ''; };
  $('#gal').onchange = e => { handle([...e.target.files]); e.target.value = ''; };
}

// ------------------------------------------------------------------ settings
async function viewSettings() {
  const acc = auth.account();
  let where = '';
  try { where = await store.backend.describe(); } catch (e) { where = `<span class="t-fail">${esc(e.message)}</span>`; }
  app.innerHTML = `
    <section class="page-head"><div><a class="back" href="#/">${ICON.back}All builds</a><p class="eyebrow">App</p><h1>Settings</h1></div></section>
    <section class="card">
      <h2 class="card-title">Storage</h2>
      <p>${DEMO_MODE ? '<span class="badge warn">Demo mode</span> No Microsoft app is configured in <code>js/config.js</code>, so everything is stored on this device only.' : where}</p>
      ${DEMO_MODE ? '' : `<p class="muted small">Tenant: ${esc(CONFIG.tenantId)} · App: ${esc(CONFIG.clientId)}</p>`}
    </section>
    <section class="card">
      <h2 class="card-title">You</h2>
      ${DEMO_MODE
        ? `<div class="fields">${`<div class="field"><label class="lbl" for="nm">Your name</label><input class="input" id="nm" value="${esc(userName())}"></div>`}</div>`
        : acc ? `<p><b>${esc(acc.name)}</b><br><span class="muted">${esc(acc.username)}</span></p><button class="btn ghost" id="so">Sign out</button>` : '<button class="btn primary" id="si">Sign in</button>'}
    </section>
    <section class="card">
      <h2 class="card-title">This device</h2>
      <p class="muted small">Builds are cached on this device so the app works offline. Clearing removes cached copies that are already synced.</p>
      <div class="row gap fwrap"><button class="btn ghost" id="cc">Clear synced cache</button><button class="btn ghost" id="upd">Check for app update</button></div>
      <p class="muted tiny">Version ${window.APP_VERSION}</p>
    </section>`;
  const nm = $('#nm'); if (nm) nm.onchange = () => { localStorage.setItem('acqc.name', nm.value.trim()); renderTopbar(); toast('Name saved.', 'ok'); };
  const so = $('#so'); if (so) so.onclick = () => auth.logout();
  const si = $('#si'); if (si) si.onclick = () => auth.login();
  $('#cc').onclick = async () => { await store.clearCache(); toast('Cache cleared.', 'ok'); };
  $('#upd').onclick = async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.update(); toast('Checked for updates. Restart the app to load a new version.'); } else location.reload();
  };
}

// ------------------------------------------------------------------ start
async function start() {
  if (!DEMO_MODE) {
    try { const ret = await auth.handleRedirect(); if (ret) location.hash = ret; }
    catch (e) { toast(`Sign-in failed: ${esc(e.message)}`, 'err'); }
  }
  renderTopbar();
  window.addEventListener('hashchange', () => {
    const { parts } = parseHash();
    // stay on the same build when switching tabs: only re-render the pane
    if (parts[0] === 'b' && B && parts[1] === B.serial && document.body.dataset.view === 'b' && $('#tab')) {
      const tab = parts[2] || 'quality';
      $$('.tab').forEach(a => a.classList.toggle('on', a.getAttribute('href').endsWith('/' + tab)));
      CTX.tab = tab;
      renderTab(CTX);
      window.scrollTo(0, 0);
      const it = parseHash().q.get('item'); if (it) setTimeout(() => focusItem(it), 50);
      return;
    }
    route();
  });
  route();
  store.pushAllDirty();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  }
}
start();
