// api/sheets.js — magazyn danych na Vercel Blob (magazyn PRYWATNY).
// Zastępuje Google Sheets/Apps Script. Aplikacja bez zmian: /api/sheets
// (GET action=read / POST action=write). Bez CORS, bez limitu rozmiaru.
import { put, get } from '@vercel/blob';

function pathFor(key) { return `data/${key}.json`; }

async function readKey(key) {
  let res;
  try {
    res = await get(pathFor(key), { access: 'private' });
  } catch {
    return null; // nie istnieje / błąd -> aplikacja zostawi lokalne dane
  }
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  const text = await new Response(res.stream).text();
  return JSON.parse(text);
}

async function writeKey(key, obj) {
  await put(pathFor(key), JSON.stringify(obj), {
    access: 'private',
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
