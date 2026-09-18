import { watchAuth } from './auth.js';
import {
  fetchLeadById,
  updateLead,
  fetchNotities,
  createNotitie,
  fetchMailHistorie,
  fetchStatusHistorie,
  logMail,
} from './leads.js';
import { setTestmodus, isTestmodus } from './testmodus.js';
import { generateMail, sendMail, splitMail } from './mail.js';
import { formatDatum, formatDatumTijd } from './format.js';

const STATUS_LABELS = {
  nieuw: 'Nieuw',
  benaderd: 'Benaderd',
  gereageerd: 'Gereageerd',
  afspraak: 'Afspraak',
  klant: 'Klant',
  afgewezen: 'Afgewezen',
};

const params = new URLSearchParams(window.location.search);
const leadId = params.get('id');
// De lijstpagina geeft via ?test=0 door dat er in productiemodus gewerkt wordt.
// Zonder die parameter start deze pagina, net als de rest van de app, in testmodus.
if (params.get('test') === '0') setTestmodus(false);

const detailScreen = document.getElementById('detail-screen');
const laadScherm = document.getElementById('detail-laden');
const testmodusBanner = document.getElementById('testmodus-banner');
const detailTitel = document.getElementById('detail-titel');
const statusBadge = document.getElementById('detail-status-badge');

const leadForm = document.getElementById('lead-form');
const opslaanMelding = document.getElementById('opslaan-melding');
const notitieForm = document.getElementById('notitie-form');
const notitieFout = document.getElementById('notitie-fout');
const tijdlijn = document.getElementById('tijdlijn');
const mailActies = document.getElementById('mail-acties');
const mailFout = document.getElementById('mail-fout');

let lead = null;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function toonFout(tekst) {
  laadScherm.textContent = tekst;
  laadScherm.classList.remove('hidden');
  detailScreen.classList.add('hidden');
}

// --- Formulier vullen en opslaan ---

function vulFormulier() {
  detailTitel.textContent = lead.bedrijfsnaam;
  document.title = `${lead.bedrijfsnaam} — Lead Generation Bot`;
  statusBadge.textContent = STATUS_LABELS[lead.status] ?? lead.status;
  statusBadge.className = `lead-status-badge status-${lead.status}`;

  document.getElementById('veld-bedrijfsnaam').value = lead.bedrijfsnaam ?? '';
  document.getElementById('veld-branche').value = lead.branche ?? '';
  document.getElementById('veld-locatie').value = lead.locatie ?? '';
  document.getElementById('veld-bedrijfsgrootte').value = lead.bedrijfsgrootte ?? '';
  document.getElementById('veld-bron').value = lead.bron ?? 'handmatig';
  document.getElementById('veld-contactpersoon').value = lead.contactpersoon ?? '';
  document.getElementById('veld-email').value = lead.email ?? '';
  document.getElementById('veld-telefoon').value = lead.telefoon ?? '';
  document.getElementById('veld-status').value = lead.status ?? 'nieuw';
  document.getElementById('veld-leadscore').value = lead.leadscore ?? '';
  document.getElementById('veld-opgericht-jaar').value = lead.opgericht_jaar ?? '';
  document.getElementById('veld-follow-up').value = lead.follow_up_datum ?? '';
  document.getElementById('veld-website-url').value = lead.website_url ?? '';
  document.getElementById('veld-heeft-website').checked = Boolean(lead.heeft_website);
  document.getElementById('veld-niet-benaderen').checked = Boolean(lead.niet_benaderen);
  document.getElementById('veld-notities').value = lead.notities ?? '';
}

leadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  opslaanMelding.textContent = '';
  opslaanMelding.className = 'melding';

  const leadscore = document.getElementById('veld-leadscore').value;
  const opgerichtJaar = document.getElementById('veld-opgericht-jaar').value;

  const patch = {
    bedrijfsnaam: document.getElementById('veld-bedrijfsnaam').value.trim(),
    branche: document.getElementById('veld-branche').value.trim(),
    locatie: document.getElementById('veld-locatie').value.trim(),
    bedrijfsgrootte: document.getElementById('veld-bedrijfsgrootte').value,
    bron: document.getElementById('veld-bron').value,
    contactpersoon: document.getElementById('veld-contactpersoon').value.trim(),
    email: document.getElementById('veld-email').value.trim(),
    telefoon: document.getElementById('veld-telefoon').value.trim(),
    status: document.getElementById('veld-status').value,
    leadscore: leadscore ? Number(leadscore) : null,
    opgericht_jaar: opgerichtJaar ? Number(opgerichtJaar) : null,
    follow_up_datum: document.getElementById('veld-follow-up').value || null,
    website_url: document.getElementById('veld-website-url').value.trim() || null,
    heeft_website: document.getElementById('veld-heeft-website').checked,
    niet_benaderen: document.getElementById('veld-niet-benaderen').checked,
    notities: document.getElementById('veld-notities').value.trim(),
  };

  try {
    lead = await updateLead(leadId, patch);
    vulFormulier();
    renderMailActies();
    await renderTijdlijn();
    opslaanMelding.textContent = 'Wijzigingen opgeslagen.';
    opslaanMelding.className = 'melding melding-gelukt';
  } catch (err) {
    opslaanMelding.textContent = 'Opslaan mislukt: ' + err.message;
    opslaanMelding.className = 'melding melding-fout';
  }
});

// --- Notities ---

notitieForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  notitieFout.textContent = '';
  const tekst = document.getElementById('notitie-tekst').value.trim();
  if (!tekst) return;

  try {
    await createNotitie(leadId, tekst);
    notitieForm.reset();
    await renderTijdlijn();
  } catch (err) {
    notitieFout.textContent = 'Notitie opslaan mislukt: ' + err.message;
  }
});

// --- Tijdlijn: notities, mails en statuswijzigingen door elkaar, nieuwste bovenaan ---

async function renderTijdlijn() {
  tijdlijn.innerHTML = '<p class="tijdlijn-leeg">Bezig met laden…</p>';

  try {
    const [notities, mails, statussen] = await Promise.all([
      fetchNotities(leadId),
      fetchMailHistorie(leadId),
      fetchStatusHistorie(leadId),
    ]);

    const items = [
      ...notities.map((n) => ({
        soort: 'notitie',
        moment: n.aangemaakt_op,
        titel: 'Notitie',
        tekst: n.tekst,
      })),
      ...mails.map((m) => ({
        soort: 'mail',
        moment: m.verzonden_op,
        titel: `Mail verstuurd${m.type === 'follow_up' ? ' (follow-up)' : ''}: ${m.onderwerp ?? ''}`,
        tekst: m.inhoud,
        uitklapbaar: true,
      })),
      ...statussen.map((s) => ({
        soort: 'status',
        moment: s.gewijzigd_op,
        titel: `Status gewijzigd van ${STATUS_LABELS[s.oude_status] ?? s.oude_status ?? '—'} naar ${STATUS_LABELS[s.nieuwe_status] ?? s.nieuwe_status}`,
      })),
    ].sort((a, b) => new Date(b.moment) - new Date(a.moment));

    if (items.length === 0) {
      tijdlijn.innerHTML = '<p class="tijdlijn-leeg">Nog geen gebeurtenissen voor deze lead.</p>';
      return;
    }

    tijdlijn.innerHTML = items
      .map(
        (item) => `
        <div class="tijdlijn-item soort-${item.soort}">
          <div class="tijdlijn-moment">${formatDatumTijd(item.moment)}</div>
          <div class="tijdlijn-titel">${escapeHtml(item.titel)}</div>
          ${
            item.tekst
              ? item.uitklapbaar
                ? `<details class="mail-details">
                     <summary>Mailinhoud tonen</summary>
                     <pre class="mail-text">${escapeHtml(item.tekst)}</pre>
                   </details>`
                : `<div class="tijdlijn-tekst">${escapeHtml(item.tekst)}</div>`
              : ''
          }
        </div>`
      )
      .join('');
  } catch (err) {
    tijdlijn.innerHTML = `<p class="tijdlijn-leeg">Tijdlijn laden mislukt: ${escapeHtml(err.message)}</p>`;
  }
}

// --- Mail schrijven en versturen vanaf de detailpagina ---

function renderMailActies() {
  if (lead.niet_benaderen) {
    mailActies.innerHTML = '<span class="mail-geblokkeerd">Mailacties uitgeschakeld: deze lead staat op niet benaderen.</span>';
    return;
  }

  mailActies.innerHTML = `
    <button type="button" class="secondary" id="schrijf-mail-btn">
      ${lead.mail_concept ? '🔁 Herschrijf mail' : '✉️ Schrijf mail'}
    </button>
    ${lead.mail_concept ? '<button type="button" class="secondary" id="verstuur-mail-btn">📤 Verstuur</button>' : ''}
    ${
      lead.mail_concept
        ? `<details class="mail-details mail-concept-blok">
             <summary>Concept-mail: ${escapeHtml(splitMail(lead.mail_concept).subject)}</summary>
             <pre class="mail-text">${escapeHtml(lead.mail_concept)}</pre>
           </details>`
        : ''
    }
  `;
}

mailActies.addEventListener('click', async (e) => {
  const schrijfBtn = e.target.closest('#schrijf-mail-btn');
  if (schrijfBtn) {
    mailFout.textContent = '';
    schrijfBtn.disabled = true;
    schrijfBtn.textContent = 'Bezig met schrijven...';
    try {
      const mailText = await generateMail(lead);
      lead = await updateLead(leadId, { mail_concept: mailText });
      renderMailActies();
    } catch (err) {
      mailFout.textContent = 'Kon mail niet genereren: ' + err.message;
      renderMailActies();
    }
    return;
  }

  const verstuurBtn = e.target.closest('#verstuur-mail-btn');
  if (verstuurBtn) {
    const waarschuwing = isTestmodus()
      ? '\n\nLet op: je zit in testmodus, dit is een nep-e-mailadres — deze mail zal waarschijnlijk bouncen.'
      : '';
    if (!window.confirm(`Mail versturen naar ${lead.email}?${waarschuwing}`)) return;

    mailFout.textContent = '';
    verstuurBtn.disabled = true;
    verstuurBtn.textContent = 'Versturen...';

    try {
      const { subject, body } = splitMail(lead.mail_concept);
      await sendMail({ to: lead.email, subject, body });
      await logMail(leadId, {
        onderwerp: subject,
        inhoud: body,
        type: lead.laatste_contact ? 'follow_up' : 'eerste_mail',
      });
      lead = await updateLead(leadId, {
        laatste_contact: new Date().toISOString(),
        ...(lead.status === 'nieuw' ? { status: 'benaderd' } : {}),
      });
      vulFormulier();
      renderMailActies();
      await renderTijdlijn();
    } catch (err) {
      mailFout.textContent = 'Kon mail niet versturen: ' + err.message;
      renderMailActies();
    }
  }
});

// --- Opstarten ---

async function laadPagina() {
  if (!leadId) {
    toonFout('Geen lead opgegeven in de link.');
    return;
  }

  try {
    lead = await fetchLeadById(leadId);
  } catch (err) {
    toonFout('Kon deze lead niet laden: ' + err.message);
    return;
  }

  testmodusBanner.classList.toggle('hidden', !isTestmodus());
  vulFormulier();
  renderMailActies();
  laadScherm.classList.add('hidden');
  detailScreen.classList.remove('hidden');
  await renderTijdlijn();
}

watchAuth((session) => {
  if (session) {
    laadPagina();
  } else {
    // Zonder sessie is er niets te zien; terug naar het inlogscherm.
    window.location.href = 'index.html';
  }
});
