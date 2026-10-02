import { checkBotAuth } from './_auth.js';
import { telMailsVandaag } from './_db.js';

const DAGLIMIET = Number(process.env.MAX_MAILS_PER_DAG) || 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = checkBotAuth(req);
  if (!auth.ok) return res.status(401).json({ error: auth.error });

  try {
    const verzonden = await telMailsVandaag();
    const resterend = Math.max(0, DAGLIMIET - verzonden);

    const nu = new Date();
    const nlUur = Number(new Intl.DateTimeFormat('nl-NL', {
      timeZone: 'Europe/Amsterdam', hour: 'numeric', hour12: false
    }).format(nu));
    const nlDag = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Amsterdam', weekday: 'short'
    }).format(nu);

    const isKantooruur = nlUur >= 8 && nlUur < 18;
    const isWeekend = ['Sat', 'Sun'].includes(nlDag);

    const waarschuwingen = [];
    if (verzonden >= DAGLIMIET) {
      waarschuwingen.push(`DAGLIMIET BEREIKT (${DAGLIMIET}). Geen mails meer vandaag.`);
    } else if (verzonden >= DAGLIMIET * 0.9) {
      waarschuwingen.push(`KRITIEK: nog maar ${resterend} mails over.`);
    } else if (verzonden >= DAGLIMIET * 0.8) {
      waarschuwingen.push(`${verzonden}/${DAGLIMIET} mails verstuurd vandaag.`);
    } else if (verzonden >= DAGLIMIET * 0.6) {
      waarschuwingen.push(`${verzonden}/${DAGLIMIET} mails verstuurd, nog ${resterend} te gaan.`);
    }
    if (!isKantooruur) waarschuwingen.push(`Buiten kantooruren (${nlUur}u).`);
    if (isWeekend) waarschuwingen.push(`Het is weekend.`);

    return res.status(200).json({
      verzonden_vandaag: verzonden,
      daglimiet: DAGLIMIET,
      resterend,
      kan_versturen: verzonden < DAGLIMIET,
      is_kantooruur: isKantooruur,
      is_weekend: isWeekend,
      waarschuwingen,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
