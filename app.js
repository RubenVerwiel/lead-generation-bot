import { login, logout, watchAuth } from './auth.js';
import {
  fetchLeads,
  createLead,
  updateLead,
  deleteLeads,
  generateFakeLeads,
  logMail,
  zoekDuplicaat,
} from './leads.js';
import { isTestmodus, setTestmodus, onTestmodusChange } from './testmodus.js';
import { getSettings, saveSettings } from './settings.js';
import { generateMail, sendMail, splitMail } from './mail.js';
import { formatDatum } from './format.js';

// De database slaat de kleine-letterwaarde op; STATUS_LABELS bepaalt wat de
// gebruiker ziet.
const STATUSES = ['nieuw', 'benaderd', 'gereageerd', 'afspraak', 'klant', 'afgewezen'];

const STATUS_LABELS = {
  nieuw: 'Nieuw',
  benaderd: 'Benaderd',
  gereageerd: 'Gereageerd',
  afspraak: 'Afspraak',
  klant: 'Klant',
  afgewezen: 'Afgewezen',
};

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

const testmodusBanner = document.getElementById('testmodus-banner');
const testmodusToggle = document.getElementById('testmodus-toggle');

const filterForm = document.getElementById('filter-form');
const resetFiltersBtn = document.getElementById('reset-filters');

const generateFakeBtn = document.getElementById('generate-fake-leads');
const generateFakeError = document.getElementById('generate-fake-error');

const addLeadForm = document.getElementById('add-lead-form');
const addLeadError = document.getElementById('add-lead-error');

const pipelineSummary = document.getElementById('pipeline-summary');
const leadGrid = document.getElementById('lead-tabel-body');
const leadTabelBody = leadGrid;
const emptyState = document.getElementById('empty-state');
const leadAantal = document.getElementById('lead-aantal');
const zoekVeld = document.getElementById('zoek-bedrijfsnaam');
const exportBtn = document.getElementById('export-btn');
const selectAllesVinkje = document.getElementById('select-alles');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const settingsClose = document.getElementById('settings-close');

const bulkActionsBar = document.getElementById('bulk-actions');
const bulkCountEl = document.getElementById('bulk-count');
const bulkSendBtn = document.getElementById('bulk-send-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const bulkProgress = document.getElementById('bulk-progress');
const bulkStatusKeuze = document.getElementById('bulk-status');
const bulkLeadscoreKeuze = document.getElementById('bulk-leadscore');
const bulkApplyBtn = document.getElementById('bulk-apply-btn');
const bulkDeleteBtn = document.getElementById('bulk-delete-btn');

let currentFilters = {};
let currentLeads = [];
let pipelineLeads = [];
let selectedLeadIds = new Set();
let sortering = { kolom: 'aangemaakt_op', oplopend: false };

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function showApp() {
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');
  loadLeads();
}

function showLogin() {
  appScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

async function loadLeads() {
  try {
    // Twee opvragingen: de tabel volgt alle filters, de pipeline-blokken tellen
    // dezelfde selectie maar zonder het statusfilter — anders zouden de blokken
    // op 0 springen zodra je er zelf op klikt.
    const [leads, pipelineSelectie] = await Promise.all([
      fetchLeads(currentFilters, sortering),
      fetchLeads({ ...currentFilters, statussen: [] }, sortering),
    ]);
    currentLeads = leads;
    pipelineLeads = pipelineSelectie;
    renderPipeline(pipelineSelectie);
    renderLeads(leads);
    renderSorteerIndicatie();
    selectAllesVinkje.checked = false;
  } catch (err) {
    console.error(err);
    leadGrid.innerHTML = '';
    emptyState.textContent = 'Kon leads niet laden: ' + err.message;
    emptyState.classList.remove('hidden');
  }
}

function renderPipeline(leads) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  leads.forEach((lead) => {
    if (counts[lead.status] !== undefined) counts[lead.status]++;
  });

  const actief = currentFilters.statussen ?? [];

  pipelineSummary.innerHTML = STATUSES.map(
    (status) => `
    <button type="button" class="pipeline-item status-${status}${actief.includes(status) ? ' pipeline-actief' : ''}"
            data-status="${status}" title="Klik om alleen deze leads te tonen">
      <span class="pipeline-count">${counts[status]}</span>
      <span class="pipeline-label">${STATUS_LABELS[status]}</span>
    </button>
  `
  ).join('');
}

function renderLeads(leads) {
  leadAantal.textContent = `${leads.length} lead${leads.length === 1 ? '' : 's'}`;
  leadTabelBody.innerHTML = '';

  if (leads.length === 0) {
    emptyState.textContent = 'Geen leads gevonden voor deze zoekcriteria.';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  leads.forEach((lead) => {
    const rij = document.createElement('tr');
    rij.className = `status-${lead.status}${lead.niet_benaderen ? ' niet-benaderen' : ''}`;

    rij.innerHTML = `
      <td class="kolom-select">
        <input type="checkbox" class="lead-select" data-id="${lead.id}" ${selectedLeadIds.has(lead.id) ? 'checked' : ''}>
      </td>
      <td>
        <a class="lead-name" href="lead-detail.html?id=${lead.id}${isTestmodus() ? '' : '&test=0'}">${escapeHtml(lead.bedrijfsnaam)}</a>
        ${lead.niet_benaderen ? '<span class="opt-out-markering">Niet benaderen</span>' : ''}
        <div class="rij-contact">${escapeHtml(lead.contactpersoon ?? '')}${lead.email ? ` · ${escapeHtml(lead.email)}` : ''}</div>
      </td>
      <td><span class="lead-status-badge">${escapeHtml(STATUS_LABELS[lead.status] ?? lead.status)}</span></td>
      <td class="lead-score">${lead.leadscore ? '★'.repeat(lead.leadscore) : '—'}</td>
      <td>${escapeHtml(lead.branche ?? '')}</td>
      <td>${escapeHtml(lead.locatie ?? '')}</td>
      <td class="kolom-datum">${formatDatum(lead.aangemaakt_op)}</td>
      <td class="kolom-datum">${formatDatum(lead.laatste_contact)}</td>
      <td class="kolom-acties">
        ${
          lead.niet_benaderen
            ? '<span class="mail-geblokkeerd" title="Deze lead staat op niet benaderen">—</span>'
            : `<button type="button" class="icoon-knop write-mail-btn" data-id="${lead.id}" title="${lead.mail_concept ? 'Herschrijf mail' : 'Schrijf mail'}">${lead.mail_concept ? '🔁' : '✉️'}</button>
               <button type="button" class="icoon-knop copy-mail-btn ${lead.mail_concept ? '' : 'hidden'}" data-id="${lead.id}" title="Kopieer mail">📋</button>
               <button type="button" class="icoon-knop send-mail-btn ${lead.mail_concept ? '' : 'hidden'}" data-id="${lead.id}" title="Verstuur mail">📤</button>`
        }
        <span class="mail-error error-text" data-id="${lead.id}"></span>
      </td>
    `;
    leadTabelBody.appendChild(rij);
  });
}

// Na een wijziging werken we de rij ter plekke bij in plaats van de hele lijst
// opnieuw op te halen. Anders springt een rij meteen weg zodra je sorteert op
// de kolom die je net hebt aangepast.
function werkLeadsBijInLijst(ids, patch) {
  const bijwerken = (lijst) =>
    lijst.map((lead) => (ids.includes(lead.id) ? { ...lead, ...patch } : lead));

  currentLeads = bijwerken(currentLeads);
  pipelineLeads = bijwerken(pipelineLeads);
  renderPipeline(pipelineLeads);
  renderLeads(currentLeads);
  markeerGewijzigd(ids);
}

// Klikken op een pipeline-blok filtert de lijst op die status; nog een keer
// klikken zet het filter weer uit.
pipelineSummary.addEventListener('click', (e) => {
  const blok = e.target.closest('.pipeline-item');
  if (!blok) return;

  const status = blok.dataset.status;
  const vinkjes = Array.from(document.querySelectorAll('.filter-status'));
  const aangevinkt = vinkjes.filter((v) => v.checked).map((v) => v.value);
  const alAlleenDeze = aangevinkt.length === 1 && aangevinkt[0] === status;

  vinkjes.forEach((v) => {
    v.checked = !alAlleenDeze && v.value === status;
  });

  currentFilters = leesFilters();
  loadLeads();
});

function markeerGewijzigd(ids) {
  ids.forEach((id) => {
    const vinkje = leadGrid.querySelector(`.lead-select[data-id="${id}"]`);
    const rij = vinkje?.closest('tr');
    if (!rij) return;
    rij.classList.add('net-gewijzigd');
    setTimeout(() => rij.classList.remove('net-gewijzigd'), 2000);
  });
}

function renderSorteerIndicatie() {
  document.querySelectorAll('.sorteerbaar').forEach((kop) => {
    const actief = kop.dataset.sorteer === sortering.kolom;
    kop.classList.toggle('sorteer-actief', actief);
    kop.dataset.richting = actief ? (sortering.oplopend ? '▲' : '▼') : '';
  });
}

// --- Login / uitloggen ---
// watchAuth roept dit meteen aan met de huidige sessie (ook na een
// paginaherlaad) en daarna telkens opnieuw bij inloggen/uitloggen.
watchAuth((session) => {
  if (session) {
    showApp();
  } else {
    showLogin();
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const { error } = await login(email, password);
  if (error) {
    loginError.textContent = 'Inloggen mislukt: controleer je e-mail en wachtwoord.';
  }
  // Bij succes handelt watchAuth() hierboven het tonen van de app af.
});

logoutBtn.addEventListener('click', async () => {
  await logout();
  // watchAuth() hierboven handelt het terugtonen van het loginscherm af.
});

// --- Testmodus ---
testmodusToggle.checked = isTestmodus();
testmodusBanner.classList.toggle('hidden', !isTestmodus());
generateFakeBtn.classList.toggle('hidden', !isTestmodus());

testmodusToggle.addEventListener('change', () => {
  setTestmodus(testmodusToggle.checked);
});

onTestmodusChange((actief) => {
  // De dashboardlink geeft de modus mee, net als de links naar een lead.
  document.getElementById('dashboard-link').href = actief ? 'dashboard.html' : 'dashboard.html?test=0';
  testmodusBanner.classList.toggle('hidden', !actief);
  generateFakeBtn.classList.toggle('hidden', !actief);
  // Het schema (en daarmee de lead-id's) wisselt, dus een oude selectie klopt niet meer.
  selectedLeadIds.clear();
  updateBulkBar();
  loadLeads();
});

// --- Filters ---
function leesFilters() {
  return {
    zoekterm: zoekVeld.value.trim(),
    branche: document.getElementById('filter-branche').value.trim(),
    grootte: document.getElementById('filter-grootte').value,
    locatie: document.getElementById('filter-locatie').value.trim(),
    statussen: Array.from(document.querySelectorAll('.filter-status:checked')).map((c) => c.value),
    bron: document.getElementById('filter-bron').value,
    datumVan: document.getElementById('filter-datum-van').value,
    datumTot: document.getElementById('filter-datum-tot').value,
    geenContact14Dagen: document.getElementById('filter-geen-contact').checked,
    minLeadscore: document.getElementById('filter-leadscore').value,
    opgerichtVan: document.getElementById('filter-opgericht-van').value,
    opgerichtTot: document.getElementById('filter-opgericht-tot').value,
    heeftWebsite: document.getElementById('filter-website').value,
  };
}

// Resultaten werken direct bij; korte vertraging zodat er niet bij elke
// toetsaanslag een query naar de database gaat.
let filterTimer;
filterForm.addEventListener('input', () => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => {
    currentFilters = leesFilters();
    loadLeads();
  }, 300);
});

filterForm.addEventListener('submit', (e) => e.preventDefault());

resetFiltersBtn.addEventListener('click', () => {
  filterForm.reset();
  zoekVeld.value = '';
  currentFilters = {};
  loadLeads();
});

// --- Zoeken op bedrijfsnaam ---
let zoekTimer;
zoekVeld.addEventListener('input', () => {
  clearTimeout(zoekTimer);
  zoekTimer = setTimeout(() => {
    currentFilters = leesFilters();
    loadLeads();
  }, 300);
});

// --- Sorteren op kolomkop ---
document.querySelectorAll('.sorteerbaar').forEach((kop) => {
  kop.addEventListener('click', () => {
    const kolom = kop.dataset.sorteer;
    // Opnieuw op dezelfde kolom klikken draait de volgorde om.
    sortering = kolom === sortering.kolom
      ? { kolom, oplopend: !sortering.oplopend }
      : { kolom, oplopend: true };
    loadLeads();
  });
});

// --- Alle gefilterde leads selecteren ---
selectAllesVinkje.addEventListener('change', () => {
  if (selectAllesVinkje.checked) {
    currentLeads.forEach((lead) => selectedLeadIds.add(lead.id));
  } else {
    currentLeads.forEach((lead) => selectedLeadIds.delete(lead.id));
  }
  updateBulkBar();
  renderLeads(currentLeads);
});

// --- Excel-export van de huidige selectie op het scherm ---
exportBtn.addEventListener('click', async () => {
  if (currentLeads.length === 0) return;

  exportBtn.disabled = true;
  exportBtn.textContent = 'Bezig…';

  try {
    // Pas inladen op het moment dat er echt geëxporteerd wordt.
    const XLSX = await import('https://esm.sh/xlsx@0.18.5');

    const rijen = currentLeads.map((lead) => ({
      Bedrijfsnaam: lead.bedrijfsnaam ?? '',
      Branche: lead.branche ?? '',
      Locatie: lead.locatie ?? '',
      Bedrijfsgrootte: lead.bedrijfsgrootte ?? '',
      Contactpersoon: lead.contactpersoon ?? '',
      'E-mail': lead.email ?? '',
      Telefoon: lead.telefoon ?? '',
      Status: STATUS_LABELS[lead.status] ?? lead.status ?? '',
      Bron: lead.bron ?? '',
      Leadscore: lead.leadscore ?? '',
      'Opgericht in': lead.opgericht_jaar ?? '',
      'Heeft website': lead.heeft_website ? 'Ja' : 'Nee',
      Website: lead.website_url ?? '',
      'Follow-up': formatDatum(lead.follow_up_datum),
      'Laatste contact': formatDatum(lead.laatste_contact),
      Toegevoegd: formatDatum(lead.aangemaakt_op),
      'Niet benaderen': lead.niet_benaderen ? 'Ja' : 'Nee',
      Notitie: lead.notities ?? '',
    }));

    const werkblad = XLSX.utils.json_to_sheet(rijen);
    werkblad['!cols'] = Object.keys(rijen[0]).map((kop) => ({
      wch: Math.max(kop.length + 2, 14),
    }));

    const werkboek = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(werkboek, werkblad, 'Leads');
    XLSX.writeFile(werkboek, `leads-${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (err) {
    console.error(err);
    window.alert('Exporteren mislukt: ' + err.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = 'Exporteer naar Excel';
  }
});

// --- Voorbeeldleads genereren (alleen testmodus) ---
generateFakeBtn.addEventListener('click', async () => {
  generateFakeError.textContent = '';
  try {
    await generateFakeLeads(currentFilters, 5);
    loadLeads();
  } catch (err) {
    generateFakeError.textContent = 'Kon voorbeeldleads niet genereren: ' + err.message;
  }
});

// --- Handmatig lead toevoegen ---
addLeadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  addLeadError.textContent = '';

  const lead = {
    bedrijfsnaam: document.getElementById('add-bedrijfsnaam').value.trim(),
    branche: document.getElementById('add-branche').value.trim(),
    locatie: document.getElementById('add-locatie').value.trim(),
    bedrijfsgrootte: document.getElementById('add-grootte').value,
    contactpersoon: document.getElementById('add-contactpersoon').value.trim(),
    email: document.getElementById('add-email').value.trim(),
    telefoon: document.getElementById('add-telefoon').value.trim(),
    notities: document.getElementById('add-notities').value.trim(),
  };

  try {
    // Ontdubbeling: bestaat deze bedrijfsnaam of dit website-domein al?
    const bestaande = await zoekDuplicaat(lead);
    if (bestaande) {
      const link = `lead-detail.html?id=${bestaande.id}${isTestmodus() ? '' : '&test=0'}`;
      addLeadError.innerHTML =
        `Deze lead bestaat al: <a href="${link}">${escapeHtml(bestaande.bedrijfsnaam)}</a> — er is geen duplicaat aangemaakt.`;
      return;
    }

    await createLead(lead);
    addLeadForm.reset();
    loadLeads();
  } catch (err) {
    addLeadError.textContent = 'Kon lead niet toevoegen: ' + err.message;
  }
});

// --- Instellingen ---
function openSettings() {
  const settings = getSettings();
  document.getElementById('settings-naam').value = settings.naam;
  document.getElementById('settings-bedrijf').value = settings.bedrijf;
  document.getElementById('settings-aanbod').value = settings.aanbod;
  document.getElementById('settings-toon').value = settings.toon;
  settingsModal.classList.remove('hidden');
}

function closeSettings() {
  settingsModal.classList.add('hidden');
}

settingsBtn.addEventListener('click', openSettings);
settingsClose.addEventListener('click', closeSettings);

settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSettings({
    naam: document.getElementById('settings-naam').value.trim(),
    bedrijf: document.getElementById('settings-bedrijf').value.trim(),
    aanbod: document.getElementById('settings-aanbod').value.trim(),
    toon: document.getElementById('settings-toon').value,
  });
  closeSettings();
});

// --- AI-mailfunctie op elke leadkaart (via event delegation, want kaarten
// worden steeds opnieuw gerenderd) ---
leadGrid.addEventListener('click', async (e) => {
  const writeBtn = e.target.closest('.write-mail-btn');
  if (writeBtn) {
    const id = writeBtn.dataset.id;
    const lead = currentLeads.find((l) => l.id === id);
    if (!lead) return;

    const errorEl = leadGrid.querySelector(`.mail-error[data-id="${id}"]`);
    errorEl.textContent = '';
    writeBtn.disabled = true;
    writeBtn.textContent = '⏳';

    try {
      const mail = await generateMail(lead);
      await updateLead(id, { mail_concept: mail });
      werkLeadsBijInLijst([id], { mail_concept: mail });
    } catch (err) {
      errorEl.textContent = 'Mail genereren mislukt: ' + err.message;
      writeBtn.disabled = false;
      writeBtn.textContent = lead.mail_concept ? '🔁' : '✉️';
    }
    return;
  }

  const copyBtn = e.target.closest('.copy-mail-btn');
  if (copyBtn) {
    const id = copyBtn.dataset.id;
    const lead = currentLeads.find((l) => l.id === id);
    if (!lead || !lead.mail_concept) return;

    try {
      await navigator.clipboard.writeText(lead.mail_concept);
      const original = copyBtn.textContent;
      copyBtn.textContent = '✅';
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1500);
    } catch (err) {
      console.error('Kopiëren mislukt', err);
    }
    return;
  }

  const sendBtn = e.target.closest('.send-mail-btn');
  if (sendBtn) {
    const id = sendBtn.dataset.id;
    const lead = currentLeads.find((l) => l.id === id);
    if (!lead || !lead.mail_concept) return;

    const testWarning = isTestmodus()
      ? '\n\nLet op: je zit in testmodus, dit is een nep-e-mailadres — deze mail zal waarschijnlijk bouncen.'
      : '';
    if (!window.confirm(`Mail versturen naar ${lead.email}?${testWarning}`)) return;

    const errorEl = leadGrid.querySelector(`.mail-error[data-id="${id}"]`);
    errorEl.textContent = '';
    sendBtn.disabled = true;
    sendBtn.textContent = '⏳';

    try {
      const { subject, body } = splitMail(lead.mail_concept);
      await sendMail({ to: lead.email, subject, body });
      await logMail(lead.id, {
        onderwerp: subject,
        inhoud: body,
        type: lead.laatste_contact ? 'follow_up' : 'eerste_mail',
      });
      const wijziging = {
        laatste_contact: new Date().toISOString(),
        ...(lead.status === 'nieuw' ? { status: 'benaderd' } : {}),
      };
      await updateLead(id, wijziging);
      werkLeadsBijInLijst([id], wijziging);
    } catch (err) {
      errorEl.textContent = 'Versturen mislukt: ' + err.message;
      sendBtn.disabled = false;
      sendBtn.textContent = '📤';
    }
  }
});

// --- Selectievakjes op leadkaarten ---
leadGrid.addEventListener('change', (e) => {
  const checkbox = e.target.closest('.lead-select');
  if (!checkbox) return;

  if (checkbox.checked) {
    selectedLeadIds.add(checkbox.dataset.id);
  } else {
    selectedLeadIds.delete(checkbox.dataset.id);
  }
  updateBulkBar();
});

function updateBulkBar() {
  const count = selectedLeadIds.size;
  bulkActionsBar.classList.toggle('hidden', count === 0);
  bulkCountEl.textContent = `${count} geselecteerd`;
}

bulkClearBtn.addEventListener('click', () => {
  selectedLeadIds.clear();
  selectAllesVinkje.checked = false;
  updateBulkBar();
  renderLeads(currentLeads);
});

// --- Bulk: status en/of leadscore in één keer toepassen ---
// De keuzes blijven staan tot je op Toepassen klikt, zodat je status en score
// samen kunt instellen. De selectie blijft daarna bewaard.
bulkApplyBtn.addEventListener('click', async () => {
  const ids = Array.from(selectedLeadIds);
  if (ids.length === 0) return;

  const patch = {};
  if (bulkStatusKeuze.value) patch.status = bulkStatusKeuze.value;
  if (bulkLeadscoreKeuze.value) patch.leadscore = Number(bulkLeadscoreKeuze.value);

  if (Object.keys(patch).length === 0) {
    bulkProgress.classList.remove('hidden');
    bulkProgress.textContent = 'Kies eerst een status of een leadscore.';
    return;
  }

  bulkApplyBtn.disabled = true;
  bulkProgress.classList.remove('hidden');
  bulkProgress.textContent = `Bezig met bijwerken van ${ids.length} lead(s)…`;

  let mislukt = 0;
  let eersteFout = '';
  for (const id of ids) {
    try {
      await updateLead(id, patch);
    } catch (err) {
      console.error(err);
      mislukt++;
      if (!eersteFout) eersteFout = err.message || String(err);
    }
  }

  bulkProgress.textContent = mislukt
    ? `${mislukt} van de ${ids.length} lead(s) mislukt — ${eersteFout}`
    : `Klaar: ${ids.length} lead(s) bijgewerkt.`;

  bulkStatusKeuze.value = '';
  bulkLeadscoreKeuze.value = '';
  bulkApplyBtn.disabled = false;
  werkLeadsBijInLijst(ids, patch);
  // Een foutmelding laten we staan, zodat je hem kunt lezen.
  if (!mislukt) setTimeout(() => bulkProgress.classList.add('hidden'), 4000);
});

bulkDeleteBtn.addEventListener('click', async () => {
  const ids = Array.from(selectedLeadIds);
  if (ids.length === 0) return;

  const bevestigd = window.confirm(
    `Weet je zeker dat je ${ids.length} lead(s) definitief wilt verwijderen?\n\n` +
      'Dit kan niet ongedaan worden gemaakt: ook de bijbehorende notities, ' +
      'mailhistorie en statushistorie worden verwijderd.'
  );
  if (!bevestigd) return;

  bulkProgress.classList.remove('hidden');
  bulkProgress.textContent = `Bezig met verwijderen van ${ids.length} lead(s)…`;

  try {
    await deleteLeads(ids);
    bulkProgress.textContent = `${ids.length} lead(s) verwijderd.`;
    selectedLeadIds.clear();
    updateBulkBar();
    await loadLeads();
  } catch (err) {
    bulkProgress.textContent = 'Verwijderen mislukt: ' + err.message;
  }
  setTimeout(() => bulkProgress.classList.add('hidden'), 4000);
});

// --- Voor alle geselecteerde leads: mail schrijven, opslaan én versturen ---
bulkSendBtn.addEventListener('click', async () => {
  const ids = Array.from(selectedLeadIds);
  if (ids.length === 0) return;

  const testWarning = isTestmodus()
    ? '\n\nLet op: je zit in testmodus met nepleads en verzonnen e-mailadressen — deze mails zullen waarschijnlijk bouncen.'
    : '';
  const confirmed = window.confirm(
    `Weet je zeker dat je voor ${ids.length} lead(s) een mail wilt laten schrijven én versturen?${testWarning}`
  );
  if (!confirmed) return;

  bulkSendBtn.disabled = true;
  bulkProgress.classList.remove('hidden');

  let success = 0;
  let failed = 0;
  let overgeslagen = 0;

  for (let i = 0; i < ids.length; i++) {
    const lead = currentLeads.find((l) => l.id === ids[i]);
    if (!lead) continue;

    // AVG/opt-out: deze leads mogen nooit in een mailflow terechtkomen.
    if (lead.niet_benaderen) {
      overgeslagen++;
      continue;
    }

    bulkProgress.textContent = `Bezig: ${i + 1} van ${ids.length} (${lead.bedrijfsnaam})...`;

    try {
      const mailText = await generateMail(lead);
      await updateLead(lead.id, { mail_concept: mailText });
      const { subject, body } = splitMail(mailText);
      await sendMail({ to: lead.email, subject, body });
      await logMail(lead.id, {
        onderwerp: subject,
        inhoud: body,
        type: lead.laatste_contact ? 'follow_up' : 'eerste_mail',
      });
      await updateLead(lead.id, {
        laatste_contact: new Date().toISOString(),
        ...(lead.status === 'nieuw' ? { status: 'benaderd' } : {}),
      });
      success++;
    } catch (err) {
      console.error(`Fout bij ${lead.bedrijfsnaam}:`, err);
      failed++;
    }
  }

  bulkProgress.textContent =
    `Klaar: ${success} verstuurd, ${failed} mislukt` +
    (overgeslagen ? `, ${overgeslagen} overgeslagen (niet benaderen).` : '.');
  selectedLeadIds.clear();
  bulkSendBtn.disabled = false;
  updateBulkBar();
  await loadLeads();
  setTimeout(() => bulkProgress.classList.add('hidden'), 5000);
});
