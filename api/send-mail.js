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
    const vandaag = new Date();
    vandaag.setHours(0, 0, 0, 0);

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
    // De registratie gebeurt hier en niet in de browser, zodat de daglimiet en
    // de herhaalcontrole altijd op volledige gegevens werken.
    const schrijf = (pad, inhoud, extra = {}) =>
      fetch(`${SUPABASE_URL}/rest/v1/${pad}`, {
        method: extra.method ?? 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Content-Profile': schema,
        },
        body: JSON.stringify(inhoud),
      });

    await schrijf('mail_historie', {
      lead_id: lead.id,
      onderwerp: subject,
      inhoud: volledigeTekst,
      type: lead.laatste_contact ? 'follow_up' : 'eerste_mail',
    });

    await schrijf(`leads?id=eq.${lead.id}`, { laatste_contact: new Date().toISOString() }, { method: 'PATCH' });

    return res.status(200).json({
      success: true,
      verstuurd_naar: lead.email,
      vandaag_verstuurd: vandaagVerstuurd + 1,
      daglimiet,
    });
  } catch (err) {
    console.error('Verzendfout:', err);
    return res.status(502).json({ error: 'Versturen mislukt: ' + err.message });
  }
}
