import { checkBotAuth } from './_auth.js';
import { createNotitie } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const { lead_id, tekst, testmodus = true } = req.body ?? {};
    if (!lead_id || !tekst) return res.status(400).json({ error: 'lead_id en tekst zijn verplicht' });
    const notitie = await createNotitie(lead_id, tekst, testmodus);
    return res.status(200).json({ success: true, notitie });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
