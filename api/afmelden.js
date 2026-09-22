import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// Dit is het enige endpoint dat zonder login bereikbaar is, en dat moet ook:
// de ontvanger van een mail heeft geen account. De link bevat het interne id
// van de lead — een willekeurige reeks van 36 tekens die niet te raden is, en
// die alleen de ontvanger van die ene mail heeft. Wie de link heeft, kan
// daarmee uitsluitend die ene lead op "niet benaderen" zetten. Meer niet:
// gegevens opvragen of wijzigen kan er niet mee.
const TOEGESTANE_SCHEMAS = ['public', 'testfase_leadgeneration'];

function pagina(titel, tekst, kleur) {
  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titel}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#f8fafc; color:#0f172a; padding:24px;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .kaart { background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:32px;
           max-width:420px; text-align:center; box-shadow:0 10px 30px -15px rgba(15,23,42,.15); }
  h1 { font-size:1.3rem; margin:0 0 12px; color:${kleur}; }
  p { color:#64748b; font-size:.92rem; line-height:1.5; margin:0; }
</style>
</head>
<body><div class="kaart"><h1>${titel}</h1><p>${tekst}</p></div></body>
</html>`;
}

export default async function handler(req, res) {
  const { lead, omgeving } = req.query ?? {};
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!lead || !TOEGESTANE_SCHEMAS.includes(omgeving)) {
    return res
      .status(400)
      .send(pagina('Ongeldige link', 'Deze afmeldlink klopt niet. Reageer op de mail als je geen berichten meer wilt ontvangen.', '#b91c1c'));
  }

  try {
    const resultaat = await fetch(`${SUPABASE_URL}/rest/v1/rpc/lead_afmelden`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_lead_id: lead, p_schema: omgeving }),
    });

    if (!resultaat.ok) throw new Error(await resultaat.text());
    const gelukt = await resultaat.json();

    if (gelukt !== true) {
      return res
        .status(404)
        .send(pagina('Niet gevonden', 'We konden deze afmelding niet verwerken. Reageer op de mail, dan halen we je handmatig van de lijst.', '#b91c1c'));
    }

    return res
      .status(200)
      .send(pagina('Je bent afgemeld', 'Je ontvangt geen berichten meer van ons. Je hoeft verder niets te doen.', '#059669'));
  } catch (err) {
    console.error('Afmelden mislukt:', err);
    return res
      .status(500)
      .send(pagina('Er ging iets mis', 'Probeer het later nog eens, of reageer op de mail zodat we je handmatig kunnen afmelden.', '#b91c1c'));
  }
}
