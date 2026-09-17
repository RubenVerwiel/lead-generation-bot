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
