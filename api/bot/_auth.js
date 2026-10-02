// api/bot/_auth.js
// Checkt of het request van n8n komt met de juiste BOT_API_KEY.

export function checkBotAuth(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : '';

  if (!token || token !== process.env.BOT_API_KEY) {
    return { ok: false, error: 'Ongeldige of ontbrekende bot API-key.' };
  }
  return { ok: true };
}
