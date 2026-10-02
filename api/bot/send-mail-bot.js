import { checkBotAuth } from './_auth.js';
// Net als in _db.js: het webadres en de publieke sleutel van de database staan
// al in config.js, waar de hele app ze vandaan haalt. Ze hoeven dus niet als
// omgevingsvariabele in Vercel gezet te worden. BOT_EMAIL en BOT_PASSWORD zijn
// wel geheim en komen daarom uit process.env.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../config.js';

async function botLogin() {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        email: process.env.BOT_EMAIL,
        password: process.env.BOT_PASSWORD,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bot-login mislukt: ${err}`);
  }
  const data = await res.json();
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const { lead_id, subject, body, testmodus = true, bevestigd = false } = req.body ?? {};

    if (!bevestigd) {
      return res.status(400).json({
        error: 'bevestigd_ontbreekt',
        hint: 'Zet bevestigd=true om te versturen.',
      });
    }
    if (!lead_id || !subject || !body) {
      return res.status(400).json({ error: 'lead_id, subject en body zijn verplicht.' });
    }

    const botToken = await botLogin();
    const schema = testmodus ? 'testfase_leadgeneration' : 'public';
    const baseUrl = `https://${req.headers.host}`;

    const sendRes = await fetch(`${baseUrl}/api/send-mail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({ lead_id, schema, subject, body }),
    });

    const result = await sendRes.json();

    if (!sendRes.ok) {
      return res.status(sendRes.status).json({
        success: false,
        error: result.error,
        details: result,
      });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
