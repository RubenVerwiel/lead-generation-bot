import { checkBotAuth } from './_auth.js';
import { fetchLeadById } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const { id, testmodus = true } = req.body ?? {};
    if (!id) return res.status(400).json({ error: 'id is verplicht' });
    const lead = await fetchLeadById(id, testmodus);
    return res.status(200).json({ lead });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
