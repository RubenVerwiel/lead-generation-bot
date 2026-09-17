import nodemailer from 'nodemailer';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Methode niet toegestaan.' });
  }

  // Zelfde beveiliging als /api/generate-mail: alleen ingelogde gebruikers
  // mogen via dit endpoint mails laten versturen.
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

  const { to, subject, body } = req.body ?? {};
  if (!to || !body) {
    return res.status(400).json({ error: 'Ontvanger of inhoud van de mail ontbreekt.' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject: subject || 'Bericht',
      text: body,
    });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Verzendfout:', err);
    return res.status(502).json({ error: 'Versturen mislukt: ' + err.message });
  }
}
