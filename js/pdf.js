// Small dependency-free PDF writer (A4, Helvetica, JPEG images) + the QC report.
import { MODELS, HEADER_FIELDS, PHOTO_KINDS } from './models.js';
import { PROGRAMMING, INDOOR_TEST } from './checklists.js';
import { val, progress, RESULT_LABEL } from './logic.js';

// Helvetica glyph widths (WinAnsi 32..255, per 1000 em)
const W_REG=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

const CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
function enc(str) {
  const out = [];
  for (const ch of String(str ?? '')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c < 127) out.push(c);
    else if (c >= 160 && c <= 255) out.push(c);
    else if (CP1252[c]) out.push(CP1252[c]);
    else if (c === 10 || c === 9) out.push(32);
    else out.push(63);
  }
  return out;
}

const A4 = [595.28, 841.89];
const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' '); };

export class PDF {
  constructor() { this.pages = []; this.images = []; this.page(); }
  page() { this.cur = { ops: [] }; this.pages.push(this.cur); return this; }
  get W() { return A4[0]; }
  get H() { return A4[1]; }
  widthOf(s, size, bold) {
    const w = bold ? W_BOLD : W_REG;
    return enc(s).reduce((a, c) => a + (w[c - 32] || 556), 0) * size / 1000;
  }
  wrap(s, width, size, bold) {
    const lines = [];
    for (const para of String(s ?? '').split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const t = line ? line + ' ' + word : word;
        if (this.widthOf(t, size, bold) <= width || !line) line = t; else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }
  text(x, y, s, { size = 9, bold = false, color = '#191919', align = 'left' } = {}) {
    const bytes = enc(s);
    let str = '';
    for (const b of bytes) {
      if (b === 40 || b === 41 || b === 92) str += '\\' + String.fromCharCode(b);
      else if (b >= 128) str += '\\' + b.toString(8).padStart(3, '0');
      else str += String.fromCharCode(b);
    }
    let xx = x;
    if (align !== 'left') { const w = this.widthOf(s, size, bold); xx = align === 'right' ? x - w : x - w / 2; }
    this.cur.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${xx.toFixed(2)} ${(this.H - y).toFixed(2)} Td (${str}) Tj ET`);
  }
  rect(x, y, w, h, { fill, stroke, lw = 0.5 } = {}) {
    let op = `${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
    const pre = [];
    if (fill) pre.push(`${rgb(fill)} rg`);
    if (stroke) pre.push(`${rgb(stroke)} RG ${lw} w`);
    this.cur.ops.push(`${pre.join(' ')} ${op} ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  }
  line(x1, y1, x2, y2, { color = '#e2dadb', lw = 0.5 } = {}) {
    this.cur.ops.push(`${rgb(color)} RG ${lw} w ${x1.toFixed(2)} ${(this.H - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.H - y2).toFixed(2)} l S`);
  }
  // jpeg: Uint8Array of a baseline JPEG; w/h its pixel size
  image(jpeg, w, h, x, y, dw, dh) {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, jpeg, w, h });
    this.cur.ops.push(`q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${(this.H - y - dh).toFixed(2)} cm /${name} Do Q`);
  }
  blob() {
    const te = new TextEncoder();
    const chunks = []; let len = 0; const offs = [];
    const add = d => { const b = typeof d === 'string' ? te.encode(d) : d; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; add(`${n} 0 obj\n`); body.forEach(add); add('\nendobj\n'); };
    add('%PDF-1.4\n'); add(new Uint8Array([37, 226, 227, 207, 211, 10]));
    // 1 catalog, 2 pages, 3 F1, 4 F2, then images, then page+content pairs
    const nImg = this.images.length;
    const firstPage = 5 + nImg;
    const kids = this.pages.map((_, i) => `${firstPage + i * 2} 0 R`).join(' ');
    obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${this.pages.length} >>`]);
    obj(3, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    obj(4, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
    this.images.forEach((im, i) => obj(5 + i, [
      `<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpeg.length} >>\nstream\n`,
      im.jpeg, '\nendstream']));
    const xobj = this.images.map((im, i) => `/${im.name} ${5 + i} 0 R`).join(' ');
    this.pages.forEach((p, i) => {
      const n = firstPage + i * 2;
      const content = te.encode(p.ops.join('\n'));
      obj(n, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xobj} >> >> /Contents ${n + 1} 0 R >>`]);
      obj(n + 1, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    });
    const total = firstPage + this.pages.length * 2;
    const xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    add(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }
}

// Load any image blob, downscale and re-encode as baseline JPEG for the PDF.
async function toJpeg(blob, max = 1000) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const jb = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return { bytes: new Uint8Array(await jb.arrayBuffer()), w, h };
  } finally { URL.revokeObjectURL(url); }
}

// ------------------------------------------------------------------ report
const C = { ink: '#191919', muted: '#7c7c7c', line: '#e2dadb', band: '#111111', gold: '#d4af37', bg: '#faf6f6',
  pass: '#2e7d32', fail: '#c62828', par: '#b7791f', na: '#7c7c7c' };
const resColor = r => C[r] || C.muted;

export async function buildReport(build, photos, getBlob, { draft = false } = {}) {
  const model = MODELS[build.model];
  const pdf = new PDF();
  const M = 40, W = pdf.W - 2 * M, BOTTOM = pdf.H - 50;
  let y = 0;

  const header = () => {
    pdf.rect(0, 0, pdf.W, 64, { fill: C.band });
    pdf.text(M, 30, 'ACECORE', { size: 16, bold: true, color: '#ffffff' });
    pdf.text(M, 47, 'Quality Control Report', { size: 9, color: C.gold });
    pdf.text(pdf.W - M, 30, build.serial, { size: 16, bold: true, color: '#ffffff', align: 'right' });
    pdf.text(pdf.W - M, 47, model.name + (draft ? '  ·  DRAFT' : ''), { size: 9, color: draft ? '#ed6a5a' : C.gold, align: 'right' });
    y = 88;
  };
  const newPage = () => { pdf.page(); header(); };
  const need = h => { if (y + h > BOTTOM) newPage(); };
  const h2 = t => { need(40); y += 6; pdf.text(M, y + 10, t, { size: 13, bold: true }); y += 18; pdf.rect(M, y, 28, 2, { fill: C.gold }); y += 12; };
  const h3 = t => { need(30); pdf.text(M, y + 8, t.toUpperCase(), { size: 8, bold: true, color: C.muted }); y += 16; };

  // Generic table: cols = [{w, label, align}], rows = [[cells]] where a cell is string or {t, color, bold}
  const table = (cols, rows) => {
    const size = 8.5, lh = 11, pad = 5;
    const drawHead = () => {
      pdf.rect(M, y, W, 16, { fill: C.bg });
      let x = M;
      cols.forEach(c => { pdf.text(c.align === 'right' ? x + c.w - pad : x + pad, y + 11, c.label, { size: 7.5, bold: true, color: C.muted, align: c.align || 'left' }); x += c.w; });
      y += 16;
    };
    need(16 + lh + 2 * pad); drawHead();
    for (const row of rows) {
      const cells = row.map((cell, i) => {
        const o = typeof cell === 'object' && cell ? cell : { t: cell };
        return { ...o, lines: pdf.wrap(o.t ?? '', cols[i].w - 2 * pad, o.small ? 7.5 : size, o.bold) };
      });
      const h = Math.max(...cells.map(c => c.lines.length * (c.small ? 9.5 : lh))) + 2 * pad - 2;
      if (y + h > BOTTOM) { newPage(); drawHead(); }
      let x = M;
      cells.forEach((c, i) => {
        c.lines.forEach((ln, j) => pdf.text(cols[i].align === 'right' ? x + cols[i].w - pad : x + pad, y + pad + 8 + j * (c.small ? 9.5 : lh), ln,
          { size: c.small ? 7.5 : size, bold: c.bold, color: c.color || C.ink, align: cols[i].align || 'left' }));
        x += cols[i].w;
      });
      y += h;
      pdf.line(M, y, M + W, y);
    }
    y += 10;
  };
  const kv = pairs => {
    // two key/value columns
    const half = (W - 20) / 2, rows = [];
    for (let i = 0; i < pairs.length; i += 2) rows.push([pairs[i], pairs[i + 1]]);
    for (const r of rows) {
      const hs = r.map(p => p ? pdf.wrap(p[1] || '–', half - 110, 8.5).length : 1);
      const h = Math.max(...hs) * 11 + 8;
      need(h);
      r.forEach((p, i) => {
        if (!p) return;
        const x = M + i * (half + 20);
        pdf.text(x, y + 11, p[0], { size: 8, color: C.muted });
        pdf.wrap(p[1] || '–', half - 110, 8.5).forEach((ln, j) => pdf.text(x + 110, y + 11 + j * 11, ln, { size: 8.5, bold: !!p[1] }));
      });
      y += h;
      pdf.line(M, y, M + W, y);
    }
    y += 10;
  };

  // ---- page 1: summary
  header();
  const p = progress(build);
  const fin = val(build, 'meta.finalized');
  kv([
    ['Serial number', build.serial], ['Model', model.name],
    ...HEADER_FIELDS.map(f => [f.label, val(build, f.id)]),
    ['Status', fin ? `Finalized ${new Date(fin).toLocaleString('en-GB')}` : 'Not finalized'],
    ...(val(build, 'meta.override') ? [['Finalized with open items', val(build, 'meta.override')]] : []),
    ['Report generated', new Date().toLocaleString('en-GB')],
  ]);
  table([{ w: W * 0.5, label: 'CHECKLIST' }, { w: W * 0.25, label: 'DONE', align: 'right' }, { w: W * 0.25, label: 'FAIL / PAR', align: 'right' }],
    p.parts.map(x => [x.label, `${x.done} / ${x.total}`, { t: `${x.fail} / ${x.par}`, color: x.fail ? C.fail : x.par ? C.par : C.ink }]));

  // ---- build info
  h2('Build info');
  for (const g of model.buildInfo) {
    h3(g.title);
    kv(g.fields.map(f => [f.label, f.pair ? [val(build, `info.${f.id}.model`), val(build, `info.${f.id}.sn`) && `SN ${val(build, `info.${f.id}.sn`)}`].filter(Boolean).join('  ·  ') : val(build, `info.${f.id}`)]));
  }

  // ---- quality checklist
  newPage();
  h2('Quality checklist');
  const sw = [W * 0.44, W * 0.1, W * 0.14, W * 0.32];
  for (const s of model.qcSections) {
    h3(s.title);
    table([{ w: sw[0], label: 'ITEM' }, { w: sw[1], label: 'SELF' }, { w: sw[2], label: 'SUPERVISOR' }, { w: sw[3], label: 'NOTE' }],
      s.items.map(it => {
        const self = val(build, `${it.id}.self`), sup = val(build, `${it.id}.sup`);
        return [it.label, { t: self ? 'Pass' : '–', color: self ? C.pass : C.muted, bold: !!self },
          it.sup ? { t: RESULT_LABEL[sup] || '–', color: resColor(sup), bold: !!sup } : { t: 'n/a', color: C.muted },
          { t: val(build, `${it.id}.note`), small: true }];
      }));
  }
  h3('Programming');
  table([{ w: W * 0.5, label: 'ITEM' }, { w: W * 0.15, label: 'PASS' }, { w: W * 0.35, label: 'VERSION / NAME' }],
    PROGRAMMING.map(it => { const v = val(build, `${it.id}.pass`); return [it.label, { t: v ? 'Pass' : '–', color: v ? C.pass : C.muted, bold: !!v }, val(build, `${it.id}.version`)]; }));
  h3('Indoor test');
  kv([['Date', val(build, 'indoor.date')], ['Pilot', val(build, 'indoor.pilot')]]);
  table([{ w: W * 0.6, label: 'TEST' }, { w: W * 0.4, label: 'RESULT' }],
    INDOOR_TEST.map(it => { const r = val(build, `${it.id}.res`); return [it.label, { t: RESULT_LABEL[r] || '–', color: resColor(r), bold: !!r }]; }));

  // ---- final assembly
  if (model.finalAssembly) {
    newPage();
    h2('Final assembly checklist');
    for (const s of model.finalAssembly) {
      h3(s.title);
      table([{ w: W * 0.5, label: 'ITEM' }, { w: W * 0.14, label: 'RESULT' }, { w: W * 0.36, label: 'NOTE' }],
        s.items.map(it => { const r = val(build, `${it.id}.res`); return [it.label, { t: RESULT_LABEL[r] || '–', color: resColor(r), bold: !!r }, { t: val(build, `${it.id}.note`), small: true }]; }));
    }
  }

  // ---- photos
  if (photos.length) {
    newPage();
    h2('Photos');
    const colW = (W - 16) / 2;
    for (const kind of PHOTO_KINDS) {
      const list = photos.filter(ph => ph.kind === kind.id);
      if (!list.length) continue;
      h3(kind.label);
      for (let i = 0; i < list.length; i += 2) {
        const imgs = [];
        for (const ph of list.slice(i, i + 2)) {
          try { imgs.push({ ph, j: await toJpeg(await getBlob(ph)) }); } catch (e) { console.warn('photo skipped', e); }
        }
        if (!imgs.length) continue;
        const rowH = Math.max(...imgs.map(o => colW * o.j.h / o.j.w)) ;
        const hh = Math.min(rowH, 300);
        need(hh + 22);
        imgs.forEach((o, k) => {
          let dw = colW, dh = colW * o.j.h / o.j.w;
          if (dh > hh) { dh = hh; dw = hh * o.j.w / o.j.h; }
          const x = M + k * (colW + 16);
          pdf.image(o.j.bytes, o.j.w, o.j.h, x, y, dw, dh);
          pdf.text(x, y + dh + 11, o.ph.name, { size: 7, color: C.muted });
        });
        y += hh + 22;
      }
    }
  }

  // ---- footers
  const n = pdf.pages.length;
  pdf.pages.forEach((pg, i) => {
    pdf.cur = pg;
    pdf.line(M, pdf.H - 34, pdf.W - M, pdf.H - 34);
    pdf.text(M, pdf.H - 22, `Acecore Technologies  ·  ${build.serial}  ·  ${model.name}`, { size: 7.5, color: C.muted });
    pdf.text(pdf.W - M, pdf.H - 22, `Page ${i + 1} of ${n}`, { size: 7.5, color: C.muted, align: 'right' });
  });
  return pdf.blob();
}
