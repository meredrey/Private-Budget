// api/sheets.js — pośrednik (proxy) między aplikacją a Google Apps Script.
// Dzięki niemu aplikacja rozmawia tylko z własną domeną (vercel.app),
// więc przeglądarka nie blokuje odczytu (koniec błędów CORS / 500 / 404).
const APPS_SCRIPT = 'https://script.google.com/macros/s/AKfycbwjb8-sUkUymiZVFjkYuDIeIQlTu9IfVwVmWVPeLNeHxWUZYvdtle6eJxqqMU_bjIouyw/exec';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let upstream;
    if (req.method === 'GET') {
      // ODCZYT — przekaż parametry (action, sheet) do Apps Script
      const qs = new URLSearchParams(req.query).toString();
      upstream = await fetch(`${APPS_SCRIPT}?${qs}`, { redirect: 'follow' });
    } else if (req.method === 'POST') {
      // ZAPIS — przekaż treść żądania do Apps Script
      const body = typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body || {});
      upstream = await fetch(APPS_SCRIPT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow'
      });
    } else {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }
    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(text);
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
}
