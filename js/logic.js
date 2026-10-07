// Build data model: values, defaults, progress and validation.
import { MODELS, HEADER_FIELDS } from './models.js';
import { PROGRAMMING, INDOOR_TEST } from './checklists.js';

export const RESULT_LABEL = { pass: 'Pass', fail: 'Fail', par: 'Pass after repair', na: 'N/A' };
export const RESULT_SHORT = { pass: 'Pass', fail: 'Fail', par: 'PAR', na: 'N/A' };

export function val(build, key) {
  const f = build.fields[key];
  return f ? f.v : '';
}
export function setVal(build, key, v, by) {
  build.fields[key] = { v, t: Date.now(), by: by || '' };
  build.updated = Date.now();
}
export function meta(build, key) { return build.fields[key] || null; }

export function newBuild({ model, serial, header, by }) {
  const m = MODELS[model];
  const b = { app: 'acecore-qc', schema: 1, serial, model, created: { t: Date.now(), by }, updated: Date.now(), fields: {} };
  // defaults from the template get timestamp 1 so any real edit always wins
  for (const g of m.buildInfo) for (const f of g.fields) {
    if (f.pair) { if (f.def) b.fields[`info.${f.id}.model`] = { v: f.def, t: 1 }; }
    else if (f.def) b.fields[`info.${f.id}`] = { v: f.def, t: 1 };
  }
  for (const [k, v] of Object.entries(header || {})) if (v) setVal(b, k, v, by);
  return b;
}

export function progress(build) {
  const m = MODELS[build.model];
  if (!m) return { parts: [], pct: 0, status: 'unknown' };
  const qcItems = m.qcSections.flatMap(s => s.items);
  const supItems = qcItems.filter(i => i.sup);
  const count = (items, key, test) => items.filter(i => test(val(build, `${i.id}.${key}`))).length;
  const parts = [
    { id: 'self', label: 'Self check', total: qcItems.length, done: count(qcItems, 'self', v => v === true), fail: 0, par: 0 },
    { id: 'sup', label: 'Supervisor check', total: supItems.length, done: count(supItems, 'sup', v => !!v),
      fail: count(supItems, 'sup', v => v === 'fail'), par: count(supItems, 'sup', v => v === 'par') },
    { id: 'prog', label: 'Programming', total: PROGRAMMING.length, done: count(PROGRAMMING, 'pass', v => v === true), fail: 0, par: 0 },
    { id: 'indoor', label: 'Indoor test', total: INDOOR_TEST.length, done: count(INDOOR_TEST, 'res', v => !!v),
      fail: count(INDOOR_TEST, 'res', v => v === 'fail'), par: 0 },
  ];
  if (m.finalAssembly) {
    const fa = m.finalAssembly.flatMap(s => s.items);
    parts.push({ id: 'final', label: 'Final assembly', total: fa.length, done: count(fa, 'res', v => !!v),
      fail: count(fa, 'res', v => v === 'fail'), par: count(fa, 'res', v => v === 'par') });
  }
  const total = parts.reduce((a, p) => a + p.total, 0);
  const done = parts.reduce((a, p) => a + p.done, 0);
  const fails = parts.reduce((a, p) => a + p.fail, 0);
  let status = 'in_progress';
  if (val(build, 'meta.finalized')) status = 'completed';
  else if (fails) status = 'attention';
  else if (parts[0].done === parts[0].total && parts[1].done < parts[1].total) status = 'supervisor';
  else if (done === total) status = 'ready';
  return { parts, pct: total ? Math.round((done / total) * 100) : 0, status, fails };
}

export const STATUS_LABEL = {
  in_progress: 'In build', supervisor: 'Awaiting supervisor', attention: 'Has fails',
  ready: 'Ready to finalize', completed: 'Completed', unknown: 'Unknown model',
};

// Everything that still blocks finalizing a build
export function issues(build, photos = []) {
  const m = MODELS[build.model];
  const out = [];
  const add = (tab, text, anchor) => out.push({ tab, text, anchor });
  for (const f of HEADER_FIELDS.filter(f => f.id !== 'h.date_end')) if (!val(build, f.id)) add('info', `${f.label} is empty`, 'header');
  for (const s of m.qcSections) for (const i of s.items) {
    const r = i.sup ? val(build, `${i.id}.sup`) : 'x';
    if (r === 'fail') { add('quality', `FAIL: ${s.title} › ${i.label}`, i.id); continue; }
    const miss = [val(build, `${i.id}.self`) !== true && 'self check', !r && 'supervisor check'].filter(Boolean);
    if (miss.length) add('quality', `${s.title} › ${i.label} — needs ${miss.join(' + ')}`, i.id);
  }
  for (const i of PROGRAMMING) if (val(build, `${i.id}.pass`) !== true) add('quality', `Programming not passed: ${i.label}`, i.id);
  for (const i of INDOOR_TEST) {
    const r = val(build, `${i.id}.res`);
    if (!r) add('quality', `Indoor test missing: ${i.label}`, i.id);
    else if (r === 'fail') add('quality', `FAIL: Indoor test › ${i.label}`, i.id);
  }
  if (m.finalAssembly) for (const s of m.finalAssembly) for (const i of s.items) {
    const r = val(build, `${i.id}.res`);
    if (!r) add('final', `Not checked: ${s.title} › ${i.label}`, i.id);
    else if (r === 'fail') add('final', `FAIL: ${s.title} › ${i.label}`, i.id);
  }
  if (!photos.some(p => p.kind === 'top')) add('photos', 'No photo of the top side yet');
  if (!photos.some(p => p.kind === 'bottom')) add('photos', 'No photo of the bottom side yet');
  return out;
}
