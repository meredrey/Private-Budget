// api/sheets.js — magazyn danych na Vercel Blob (zastępuje Google Sheets/Apps Script).
// Aplikacja bez zmian: nadal woła /api/sheets (GET action=read / POST action=write).
// Bez CORS, bez przekierowań, bez limitu rozmiaru. Dane leżą pod tajnym prefiksem.
import { put, list } from '@vercel/blob';

const SECRET = 'budget-9b830d47370e3068879a1bc1'; // tajny prefiks ścieżki (prywatność danych)

async function readKey(key) {
  const name = `${SECRET}/${key}.json`;
  const { blobs } = await list({ prefix: name, limit: 100 });
  const hit = blobs.find(b => b.pathname === name);
  if (!hit) return null;                 // brak danych -> aplikacja zostawi lokalne
  const r = await fetch(hit.url, { cache: 'no-store' });
  if (!r.ok) return null;
  return await r.json();
}

async function writeKey(key, obj) {
  await put(`${SECRET}/${key}.json`, JSON.stringify(obj), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json'
  });
  return { written: true };
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
      const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      action = b.action; sheet = b.sheet; data = b.data;
    } else {
      res.status(405).send(JSON.stringify({ success: false, error: 'Method not allowed' })); return;
    }

    if (action === 'read') {
      const obj = await readKey(sheet);
      res.status(200).send(JSON.stringify({ success: true, data: obj }));
    } else if (action === 'write') {
      const r = await writeKey(sheet, data);
      res.status(200).send(JSON.stringify({ success: true, data: r }));
    } else {
      res.status(200).send(JSON.stringify({ success: true, data: { ok: true } }));
    }
  } catch (err) {
    res.status(500).send(JSON.stringify({ success: false, error: String(err) }));
  }
}
