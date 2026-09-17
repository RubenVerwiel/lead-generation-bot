import { getAccessToken } from './auth.js';
import { getSettings } from './settings.js';

export async function generateMail(lead) {
  const token = await getAccessToken();
  if (!token) throw new Error('Je bent niet (meer) ingelogd.');

  const response = await fetch('/api/generate-mail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      lead: {
        bedrijfsnaam: lead.bedrijfsnaam,
        branche: lead.branche,
        locatie: lead.locatie,
        bedrijfsgrootte: lead.bedrijfsgrootte,
        contactpersoon: lead.contactpersoon,
      },
      settings: getSettings(),
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Onbekende fout bij het genereren van de mail.');
  }
  return result.mail;
}

// De AI-mail begint altijd met "Onderwerp: ..." gevolgd door een lege regel en
// dan de body (zie de prompt in api/generate-mail.js) — dit splitst dat weer op.
export function splitMail(mailText) {
  const match = mailText.match(/^Onderwerp:\s*(.+?)\r?\n\r?\n([\s\S]*)$/);
  if (match) {
    return { subject: match[1].trim(), body: match[2].trim() };
  }
  return { subject: 'Bericht', body: mailText.trim() };
}

export async function sendMail({ to, subject, body }) {
  const token = await getAccessToken();
  if (!token) throw new Error('Je bent niet (meer) ingelogd.');

  const response = await fetch('/api/send-mail', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, subject, body }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'Onbekende fout bij het versturen van de mail.');
  }
  return result;
}
