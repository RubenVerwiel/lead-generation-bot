import { checkBotAuth } from './_auth.js';
import { fetchFollowUps } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const { testmodus = true } = req.body ?? {};
    const leads = await fetchFollowUps(testmodus);
    return res.status(200).json({ count: leads.length, leads });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
