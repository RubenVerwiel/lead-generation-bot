import { SUPABASE_URL } from '../config.js';

// Wekelijkse back-up, uitgevoerd door de planner van Vercel (zie vercel.json).
//
// Deze functie is de enige plek in het project die de service_role-sleutel
// gebruikt. Die sleutel omzeilt alle beveiligingsregels van de database en is
// daarom nodig: de planner draait zonder ingelogde gebruiker. Hij staat
// uitsluitend in de serverinstellingen van Vercel, nooit in de code en nooit
// in de browser.
//
// Het endpoint is afgeschermd met CRON_SECRET, zodat niemand anders hem kan
// aanroepen — ook niet als het webadres bekend wordt.

const SCHEMAS = ['public', 'testfase_leadgeneration'];
const TABELLEN = ['leads', 'notities', 'mail_historie', 'status_historie'];
const BUCKET = 'backups';

export default async function handler(req, res) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = process.env.CRON_SECRET;

  if (!serviceKey || !cronSecret) {
    return res.status(500).json({ error: 'Back-up is niet volledig ingesteld op de server.' });
  }

  // Vercel stuurt bij een geplande aanroep automatisch deze header mee; een
  // handmatige aanroep mag dezelfde waarde gebruiken om te testen.
  const meegestuurd = (req.headers.authorization || '').replace('Bearer ', '');
  if (meegestuurd !== cronSecret) {
    return res.status(401).json({ error: 'Niet toegestaan.' });
  }

  const kop = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };

  try {
    const alles = {};
    let totaalRijen = 0;

    for (const schema of SCHEMAS) {
      for (const tabel of TABELLEN) {
        const res2 = await fetch(`${SUPABASE_URL}/rest/v1/${tabel}?select=*`, {
          headers: { ...kop, 'Accept-Profile': schema },
        });
        if (!res2.ok) throw new Error(`${schema}.${tabel}: ${await res2.text()}`);

        const rijen = await res2.json();
        alles[`${schema}.${tabel}`] = rijen;
        totaalRijen += rijen.length;
      }
    }

    const datum = new Date().toISOString().slice(0, 10);
    const bestandsnaam = `backup-${datum}.json`;

    const upload = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${bestandsnaam}`, {
      method: 'POST',
      headers: { ...kop, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body: JSON.stringify({ gemaakt_op: new Date().toISOString(), rijen: totaalRijen, data: alles }),
    });
    if (!upload.ok) throw new Error('Opslaan mislukt: ' + (await upload.text()));

    return res.status(200).json({
      success: true,
      bestand: bestandsnaam,
      rijen: totaalRijen,
      tabellen: Object.keys(alles).length,
    });
  } catch (err) {
    console.error('Back-up mislukt:', err);
    return res.status(500).json({ error: 'Back-up mislukt: ' + err.message });
  }
}
