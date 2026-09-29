import nodemailer from 'nodemailer';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

// Dagelijkse verzendlimiet. Bewust laag: als een nieuw mailadres ineens
// tientallen vergelijkbare mails per dag verstuurt, ziet Gmail dat als spam en
// beschadig je de reputatie van je afzenderadres. Die schade is moeilijk te
// herstellen. Wil je meer versturen, verhoog dit dan stapsgewijs (bijvoorbeeld
// +10 per week) en let op of je bounces of spamklachten krijgt.
const STANDAARD_DAGLIMIET = 20;

// Binnen deze tijd wordt een tweede mail naar dezelfde lead geweigerd, zodat
// dubbelklikken of een herhaalde bulkactie niet tot dubbele mails leidt.
const HERHAAL_BLOKKADE_MINUTEN = 10;

const TOEGESTANE_SCHEMAS = ['public', 'testfase_leadgeneration'];

// Elk id in de database is een uuid (zie database/schema.sql). We controleren
// dat hier hard, omdat het id verderop in het webadres van de database-vraag
// terechtkomt. Zonder deze controle zou iemand er extra zoekopdrachten in
// kunnen meesmokkelen. De beveiligingsregels van de database vangen dat al af,
// maar een id dat geen id is hoort sowieso nooit zo ver te komen.
const UUID_PATROON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Middernacht van "vandaag" volgens de Nederlandse klok, als absoluut tijdstip.
//
// Dit moet expliciet, want deze code draait op een server van Vercel en die
// staat op UTC. Zonder deze functie zou "vandaag" in de zomer om 02:00 onze
// tijd beginnen: een mail van dinsdagavond 23:30 telde dan al mee voor
// woensdag, en woensdag had je stiekem een dubbele daglimiet.
//
// Nederland loopt 1 uur voor op UTC in de winter en 2 uur in de zomer. Welke
// van de twee het is vragen we op bij de tijdzonegegevens van Node zelf, zodat
// het verzetten van de klok in maart en oktober vanzelf goed gaat.
const NL_KLOK = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Amsterdam',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

export function middernachtInNederland(nu = new Date()) {
  // Leest de Nederlandse wandklok af en doet alsof het UTC is. Het verschil
  // met het echte tijdstip is precies de tijdzone-afwijking van dat moment.
  const alsofUtc = (tijdstip) => new Date(NL_KLOK.format(tijdstip).replace(' ', 'T') + 'Z');

  const nlMiddernacht = alsofUtc(nu);
  nlMiddernacht.setUTCHours(0, 0, 0, 0);

  let resultaat = new Date(nlMiddernacht.getTime() - (alsofUtc(nu).getTime() - nu.getTime()));

  // Op de twee dagen per jaar dat de klok verzet wordt, geldt om middernacht
  // een andere afwijking dan nu. Deze correctieronde zet dat recht.
  resultaat = new Date(nlMiddernacht.getTime() - (alsofUtc(resultaat).getTime() - resultaat.getTime()));
  return resultaat;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Methode niet toegestaan.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Niet ingelogd.' });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return res.status(401).json({ error: 'Ongeldige of verlopen sessie.' });

  const { lead_id, schema, subject, body } = req.body ?? {};

  if (!lead_id || !subject || !body) {
    return res.status(400).json({ error: 'Lead, onderwerp of inhoud ontbreekt.' });
  }
  if (!UUID_PATROON.test(String(lead_id))) {
    return res.status(400).json({ error: 'Ongeldig lead-id.' });
  }
  if (!TOEGESTANE_SCHEMAS.includes(schema)) {
    return res.status(400).json({ error: 'Onbekende omgeving.' });
  }

  // Alle vervolgvragen aan de database stellen we namens de ingelogde
  // gebruiker, zodat de beveiligingsregels van de database blijven gelden.
  const db = (pad, extraHeaders = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Accept-Profile': schema,
        'Content-Profile': schema,
        ...extraHeaders,
      },
    });

  try {
    // --- 1. De lead uit de database halen, niet uit het verzoek ---
    // Het e-mailadres komt hier vandaan en niet van de afzender van het
    // verzoek: zo kan er nooit naar een ander adres gemaild worden dan het
    // adres dat bij deze lead hoort.
    const leadRes = await db(`leads?id=eq.${lead_id}&select=id,bedrijfsnaam,email,niet_benaderen,laatste_contact`);
    if (!leadRes.ok) {
      return res.status(502).json({ error: 'Kon de lead niet ophalen uit de database.' });
    }
    const [lead] = await leadRes.json();
    if (!lead) return res.status(404).json({ error: 'Lead niet gevonden.' });
    if (!lead.email) return res.status(400).json({ error: 'Deze lead heeft geen e-mailadres.' });

    // --- 2. Harde AVG-controle ---
    // Deze staat hier met opzet en niet alleen in de interface: ook als een
    // knop of bulkactie de controle zou overslaan, gebeurt er hier niets.
    if (lead.niet_benaderen) {
      return res.status(403).json({
        error: 'Deze lead staat op "niet benaderen" en mag geen mail ontvangen.',
      });
    }

    // --- 3. Niet twee keer kort achter elkaar naar dezelfde lead ---
    const grens = new Date(Date.now() - HERHAAL_BLOKKADE_MINUTEN * 60 * 1000).toISOString();
    const recentRes = await db(
      `mail_historie?lead_id=eq.${lead_id}&verzonden_op=gte.${grens}&select=id`,
      { Prefer: 'count=exact' }
    );
    const recent = recentRes.ok ? await recentRes.json() : [];
    if (recent.length > 0) {
      return res.status(429).json({
        error: `Er is net al een mail naar deze lead gestuurd. Wacht ${HERHAAL_BLOKKADE_MINUTEN} minuten.`,
      });
    }

    // --- 4. Dagelijkse verzendlimiet ---
    // Geteld over beide omgevingen samen: ook testmails gaan echt de deur uit
    // via Gmail en tellen dus mee voor je afzenderreputatie.
    const daglimiet = Number(process.env.MAX_MAILS_PER_DAG) || STANDAARD_DAGLIMIET;
    const vandaag = middernachtInNederland();

    let vandaagVerstuurd = 0;
    for (const s of TOEGESTANE_SCHEMAS) {
      const telRes = await fetch(
        `${SUPABASE_URL}/rest/v1/mail_historie?verzonden_op=gte.${vandaag.toISOString()}&select=id`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Accept-Profile': s,
          },
        }
      );
      if (telRes.ok) vandaagVerstuurd += (await telRes.json()).length;
    }

    if (vandaagVerstuurd >= daglimiet) {
      return res.status(429).json({
        error: `Daglimiet bereikt: er zijn vandaag al ${vandaagVerstuurd} mails verstuurd (limiet ${daglimiet}).`,
      });
    }

    // --- 5. Afmeldregel toevoegen ---
    const basisUrl = `https://${req.headers.host}`;
    const afmeldLink = `${basisUrl}/api/afmelden?lead=${lead.id}&omgeving=${schema}`;
    const volledigeTekst =
      `${body}\n\n` +
      `---\n` +
      `Geen interesse? Meld je hier af en je ontvangt geen mail meer van ons:\n` +
      `${afmeldLink}`;

    // --- 6. Versturen ---
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: lead.email,
      subject,
      text: volledigeTekst,
    });

    // --- 7. Vastleggen ---
    // Vanaf hier is de mail echt de deur uit en valt er niets meer terug te
    // draaien. Wat hierna misgaat mag daarom NOOIT als "versturen mislukt"
    // naar buiten komen: dan zou je opnieuw klikken en dezelfde lead een
    // tweede keer mailen. Het komt als waarschuwing mee bij een geslaagde
    // verzending.
    //
    // De registratie gebeurt hier en niet in de browser, zodat de daglimiet en
    // de herhaalcontrole altijd op volledige gegevens werken.
    //
    // Deze functie gooit met opzet geen fout, maar geeft de fouttekst terug
    // (of null als alles goed ging).
    const schrijf = async (pad, inhoud, extra = {}) => {
      try {
        const antwoord = await fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
          method: extra.method ?? 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Content-Profile': schema,
          },
          body: JSON.stringify(inhoud),
        });
        return antwoord.ok ? null : `${antwoord.status} ${await antwoord.text()}`;
      } catch (err) {
        return err.message;
      }
    };

    const waarschuwingen = [];

    const historieFout = await schrijf('mail_historie', {
      lead_id: lead.id,
      onderwerp: subject,
      inhoud: volledigeTekst,
      type: lead.laatste_contact ? 'follow_up' : 'eerste_mail',
    });
    if (historieFout) {
      console.error('Vastleggen in mail_historie mislukt:', historieFout);
      waarschuwingen.push(
        'De mail is wel verstuurd, maar kon niet in de geschiedenis worden opgeslagen. ' +
          'Hij telt daardoor niet mee voor de daglimiet en de dubbelcheck - mail deze lead niet nog een keer.'
      );
    }

    const leadFout = await schrijf(
      `leads?id=eq.${lead.id}`,
      { laatste_contact: new Date().toISOString() },
      { method: 'PATCH' }
    );
    if (leadFout) {
      console.error('Bijwerken van laatste_contact mislukt:', leadFout);
      waarschuwingen.push('De mail is wel verstuurd, maar "laatste contact" is bij deze lead niet bijgewerkt.');
    }

    return res.status(200).json({
      success: true,
      verstuurd_naar: lead.email,
      vandaag_verstuurd: vandaagVerstuurd + 1,
      daglimiet,
      ...(waarschuwingen.length ? { waarschuwingen } : {}),
    });
  } catch (err) {
    console.error('Verzendfout:', err);
    return res.status(502).json({ error: 'Versturen mislukt: ' + err.message });
  }
}
