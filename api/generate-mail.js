import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Methode niet toegestaan.' });
  }

  // Alleen ingelogde gebruikers mogen deze functie gebruiken, zodat niemand
  // anders ons Claude-budget kan opmaken. We hebben hiervoor geen service-role
  // key nodig: de publieke anon key mag een toegangstoken laten valideren.
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Niet ingelogd.' });
  }

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });
  if (!userRes.ok) {
    return res.status(401).json({ error: 'Ongeldige of verlopen sessie.' });
  }

  const { lead, settings } = req.body ?? {};
  if (!lead || !lead.bedrijfsnaam) {
    return res.status(400).json({ error: 'Leadgegevens ontbreken.' });
  }

  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: buildPrompt(lead, settings ?? {}) }],
    }),
  });

  if (!claudeRes.ok) {
    console.error('Claude API error:', await claudeRes.text());
    return res.status(502).json({ error: 'Kon geen mail genereren, probeer het later opnieuw.' });
  }

  const data = await claudeRes.json();
  const mail = data?.content?.[0]?.text ?? '';
  return res.status(200).json({ mail });
}

function buildPrompt(lead, settings) {
  const toon = settings.toon === 'informeel' ? 'informele, vriendelijke' : 'zakelijke, professionele';

  return `Je schrijft een korte outreach-e-mail in het Nederlands namens ${settings.naam || 'de afzender'} van ${settings.bedrijf || 'ons bedrijf'}.

Wat wij aanbieden: ${settings.aanbod || 'onze diensten'}.
Gewenste toon: ${toon}.

Schrijf een e-mail aan het volgende bedrijf:
- Bedrijfsnaam: ${lead.bedrijfsnaam}
- Branche: ${lead.branche || 'onbekend'}
- Locatie: ${lead.locatie || 'onbekend'}
- Bedrijfsgrootte: ${lead.bedrijfsgrootte || 'onbekend'}
- Contactpersoon: ${lead.contactpersoon || 'onbekend'}

Regels:
- Maximaal 150 woorden.
- Begin met "Onderwerp: ..." op de eerste regel, dan een lege regel, dan de mailtekst.
- Spreek de contactpersoon aan als die bekend is, anders neutraal.
- Geen opsommingstekens of markdown, gewoon lopende tekst.
- Sluit af met de naam van de afzender.`;
}
