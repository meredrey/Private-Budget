// api/sheets.js — pośrednik między aplikacją a Google Apps Script.
// Omija CORS + rozwiązuje duże dane: kompresja (gzip) → base64 → małe kawałki.
// Odczyt kawałków: GET (krótki adres). Zapis kawałków: POST (dane w treści,
// bez limitu długości adresu — długie GET-y Google odbijał stroną HTML).
import zlib from 'zlib';

const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbwjb8-sUkUymiZVFjkYuDIeIQlTu9IfVwVmWVPeLNeHxWUZYvdtle6eJxqqMU_bjIouyw/exec';
const CHUNK = 4000; // znaków base64 na kawałek (mały = pewny zapis POST)

async function asRead(sheet) {
  const r = await fetch(`${APPS_SCRIPT}?action=read&sheet=${encodeURIComponent(sheet)}`, { redirect: 'follow' });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { return null; } // HTML/błąd -> brak danych
  return (j && j.success) ? j.data : null;
}
async function asWrite(sheet, value) {
  const r = await fetch(APPS_SCRIPT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'write', sheet, data: value }),
    redirect: 'follow'
  });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { return { success: false, error: txt.slice(0, 200) }; }
  return j;
}

async function writeChunked(sheet, obj) {
  const full = JSON.stringify(obj);
  const b64 = zlib.gzipSync(Buffer.from(full, 'utf8')).toString('base64');
  const parts = [];
  for (let i = 0; i < b64.length; i += CHUNK) parts.push(b64.slice(i, i + CHUNK));
  // zapis kawałków po kolei (bezpiecznie, bez konfliktów)
  for (let i = 0; i < parts.length; i++) {
    const w = await asWrite(`${sheet}__c${i}`, parts[i]);
    if (!(w && w.success && w.data && w.data.written)) {
      return { ok: false, error: 'Zapis kawałka ' + i + ' nieudany', detail: w };
    }
  }
  const m = await asWrite(`${sheet}__meta`, { n: parts.length, gz: true });
  if (!(m && m.success && m.data && m.data.written)) {
    return { ok: false, error: 'Zapis meta nieudany', detail: m };
  }
  return { ok: true, written: true, chunks: parts.length };
}

async function readChunked(sheet) {
  const meta = await asRead(`${sheet}__meta`);
  if (!meta || typeof meta.n !== 'number') {
    return await asRead(sheet); // brak metadanych -> stary pojedynczy arkusz
  }
  const idx = Array.from({ length: meta.n }, (_, i) => i);
  const parts = await Promise.all(idx.map(i => asRead(`${sheet}__c${i}`)));
  if (parts.some(p => p === null || p === undefined)) return null; // niekompletne -> nie nadpisuj
  const b64 = parts.join('');
  const full = meta.gz
    ? zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')
    : b64;
  return JSON.parse(full);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    let action, sheet, data;
    if (req.method === 'GET') {
      action = req.query.action; sheet = req.query.sheet;
      if (action === 'write' && req.query.data !== undefined) data = JSON.parse(req.query.data);
    } else if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      action = body.action; sheet = body.sheet; data = body.data;
    } else {
      res.status(405).send(JSON.stringify({ success: false, error: 'Method not allowed' })); return;
    }

    if (action === 'read') {
      const obj = await readChunked(sheet);
      res.status(200).send(JSON.stringify({ success: true, data: obj }));
    } else if (action === 'write') {
      const r = await writeChunked(sheet, data);
      if (r.ok) res.status(200).send(JSON.stringify({ success: true, data: { written: true, chunks: r.chunks } }));
      else res.status(200).send(JSON.stringify({ success: false, error: r.error, detail: r.detail }));
    } else {
      res.status(200).send(JSON.stringify({ success: true, data: { ok: true } }));
    }
  } catch (err) {
    res.status(500).send(JSON.stringify({ success: false, error: String(err) }));
  }
}
