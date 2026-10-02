import { checkBotAuth } from './_auth.js';
import { createLead, zoekDuplicaat } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const { lead, testmodus = true, forceren = false } = req.body ?? {};
    if (!lead?.bedrijfsnaam) return res.status(400).json({ error: 'bedrijfsnaam is verplicht' });

    if (!forceren) {
      const duplicaat = await zoekDuplicaat({
        bedrijfsnaam: lead.bedrijfsnaam,
        website_url: lead.website_url,
      }, testmodus);

      if (duplicaat) {
        return res.status(200).json({
          success: false,
          reden: 'duplicaat_gevonden',
          bestaande_lead: {
            id: duplicaat.id,
            bedrijfsnaam: duplicaat.bedrijfsnaam,
            status: duplicaat.status,
          },
          hint: 'Roep opnieuw aan met forceren=true om alsnog toe te voegen.',
        });
      }
    }

    const nieuweLead = {
      status: 'nieuw',
      bron: 'bot',
      aangemaakt_op: new Date().toISOString(),
      verwijderd: false,
      niet_benaderen: false,
      ...lead,
    };

    const created = await createLead(nieuweLead, testmodus);
    return res.status(200).json({ success: true, testmodus, lead: created });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
