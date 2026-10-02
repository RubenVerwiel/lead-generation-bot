import { checkBotAuth } from './_auth.js';
import { updateLead } from './_db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const { id, patch, testmodus = true } = req.body ?? {};
    if (!id || !patch) return res.status(400).json({ error: 'id en patch zijn verplicht' });

    const verboden = ['verwijderd', 'verwijderd_op', 'id'];
    for (const key of verboden) {
      if (key in patch) delete patch[key];
    }

    // "Niet benaderen" mag de bot wel AANzetten: reageert iemand met "stop met
    // mailen", dan moet de bot dat kunnen vastleggen. Uitzetten mag nooit.
    // Anders kan een lead die zich via de afmeldlink heeft afgemeld alsnog
    // gemaild worden, en dat is precies de grens die api/send-mail.js bewaakt.
    if ('niet_benaderen' in patch && patch.niet_benaderen !== true) {
      delete patch.niet_benaderen;
    }

    // Blijft er na het filteren niets over, dan bestond de wijziging alleen uit
    // velden die de bot niet mag aanraken. Een lege update laat Supabase
    // struikelen met een onbegrijpelijke 500; dit zegt wat er echt aan de hand
    // is, zodat de bot het verschil ziet tussen "mag niet" en "kapot".
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: 'Geen wijzigingen over na controle.',
        hint: 'De velden verwijderd, verwijderd_op en id mogen niet gewijzigd worden, '
          + 'en niet_benaderen mag alleen op true gezet worden.',
      });
    }

    const updated = await updateLead(id, patch, testmodus);
    return res.status(200).json({ success: true, lead: updated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
