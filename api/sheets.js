// api/sheets.js — pośrednik (proxy) między aplikacją a Google Apps Script.
//  • omija CORS (aplikacja rozmawia tylko z własną domeną vercel.app),
//  • dzieli duże dane na kawałki przy zapisie i skleja przy odczycie
//    (znosi limit 50 000 znaków na komórkę),
//  • zapisuje metodą, która nie gubi dużej treści (ręczna obsługa przekierowania).
// Aplikacja korzysta z tego bez żadnych zmian: /api/sheets?action=read&sheet=X  oraz  POST /api/sheets

const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbwjb8-sUkUymiZVFjkYuDIeIQlTu9IfVwVmWVPeLNeHxWUZYvdtle6eJxqqMU_bjIouyw/exec';
const CHUNK = 35000; // maks. znaków surowych na kawałek (bezpiecznie < 50 000 na komórkę)

// --- Zapis jednej komórki (sheet=name) wartością value. POST z ręczną obsługą 302,
//     żeby duża treść nie zginęła przy przekierowaniu Apps Scriptu. ---
async function asWrite(sheet, value) {
  const body = JSON.stringify({ action: 'write', sheet, data: value });
  let r = await fetch(APPS_SCRIPT, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
    redirect: 'manual'
  });
  // Apps Script przekierowuje (302) do script.googleusercontent.com — ponawiamy POST tam,
  // żeby zachować treść (auto-follow zamieniłby POST na GET i zgubił dane).
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get('location');
    if (loc) {
      r = await fetch(loc, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
    }
  }
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { success: false, error: t.slice(0, 200) }; }
}

// --- Odczyt jednej komórki (zwraca zapisaną wartość albo null). ---
async function asRead(sheet) {
  const r = await fetch(`${APPS_SCRIPT}?action=read&sheet=${encodeURIComponent(sheet)}`, { redirect: 'follow' });
  const j = await r.json();
  return (j && j.success) ? j.data : null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    // ===== ODCZYT =====
    if (req.method === 'GET') {
      const action = req.query.action;
      const sheet = req.query.sheet;
      if (action !== 'read' || !sheet) { res.status(200).send(JSON.stringify({ success: true, data: { ok: true } })); return; }

      const meta = await asRead(sheet + '__meta');
      if (meta && typeof meta.count === 'number') {
        // sklej kawałki
        let full = '';
        for (let i = 0; i < meta.count; i++) {
          const part = await asRead(sheet + '__' + i);
          if (typeof part === 'string') full += part;
        }
        let data = null;
        try { data = JSON.parse(full); } catch { data = null; }
        res.status(200).send(JSON.stringify({ success: true, data }));
        return;
      }
      // brak metadanych → stary, pojedynczy zapis (zgodność wsteczna)
      const single = await asRead(sheet);
      res.status(200).send(JSON.stringify({ success: true, data: single }));
      return;
    }

    // ===== ZAPIS =====
    if (req.method === 'POST') {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      let payload; try { payload = JSON.parse(raw); } catch { payload = {}; }
      const { action, sheet, data } = payload;
      if (action !== 'write' || !sheet) { res.status(200).send(JSON.stringify({ success: true, data: { ok: true } })); return; }

      const str = JSON.stringify(data);
      const n = Math.max(1, Math.ceil(str.length / CHUNK));

      // zapisz kawałki
      for (let i = 0; i < n; i++) {
        const part = str.slice(i * CHUNK, (i + 1) * CHUNK);
        const w = await asWrite(sheet + '__' + i, part);
        if (!(w && w.success)) {
          res.status(200).send(JSON.stringify({ success: false, error: 'Zapis kawałka ' + i + ' nieudany', detail: w }));
          return;
        }
      }
      // zapisz licznik kawałków
      await asWrite(sheet + '__meta', { count: n, len: str.length, at: new Date().toISOString() });

      res.status(200).send(JSON.stringify({ success: true, data: { written: true, chunks: n } }));
      return;
    }

    res.status(405).send(JSON.stringify({ success: false, error: 'Method not allowed' }));
  } catch (err) {
    res.status(500).send(JSON.stringify({ success: false, error: String(err) }));
  }
}
