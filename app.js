import { login, logout, watchAuth } from './auth.js';
import { fetchLeads, createLead, updateLead, generateFakeLeads } from './leads.js';
import { isTestmodus, setTestmodus, onTestmodusChange } from './testmodus.js';
import { getSettings, saveSettings } from './settings.js';
import { generateMail, sendMail, splitMail } from './mail.js';

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
const leadGrid = document.getElementById('lead-grid');
const emptyState = document.getElementById('empty-state');

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsForm = document.getElementById('settings-form');
const settingsClose = document.getElementById('settings-close');

const bulkActionsBar = document.getElementById('bulk-actions');
const bulkCountEl = document.getElementById('bulk-count');
const bulkSendBtn = document.getElementById('bulk-send-btn');
const bulkClearBtn = document.getElementById('bulk-clear-btn');
const bulkProgress = document.getElementById('bulk-progress');

let currentFilters = {};
let currentLeads = [];
let selectedLeadIds = new Set();

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
    const leads = await fetchLeads(currentFilters);
    currentLeads = leads;
    renderPipeline(leads);
    renderLeads(leads);
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

  pipelineSummary.innerHTML = STATUSES.map(
    (status) => `
    <div class="pipeline-item status-${status}">
      <span class="pipeline-count">${counts[status]}</span>
      <span class="pipeline-label">${STATUS_LABELS[status]}</span>
    </div>
  `
  ).join('');
}

function renderLeads(leads) {
  leadGrid.innerHTML = '';

  if (leads.length === 0) {
    emptyState.textContent = 'Geen leads gevonden voor deze zoekcriteria.';
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  leads.forEach((lead) => {
    const card = document.createElement('div');
    card.className = `lead-card status-${lead.status}`;
    card.innerHTML = `
      <div class="lead-top">
        <label class="lead-select-wrap">
          <input type="checkbox" class="lead-select" data-id="${lead.id}" ${selectedLeadIds.has(lead.id) ? 'checked' : ''}>
        </label>
        <span class="lead-name">${escapeHtml(lead.bedrijfsnaam)}</span>
        <span class="lead-status-badge">${escapeHtml(STATUS_LABELS[lead.status] ?? lead.status)}</span>
      </div>
      <div class="lead-meta">
        ${escapeHtml(lead.branche)} · ${escapeHtml(lead.bedrijfsgrootte)} · ${escapeHtml(lead.locatie)}
      </div>
      <div class="lead-contact">
        ${escapeHtml(lead.contactpersoon)} · ${escapeHtml(lead.email)} · ${escapeHtml(lead.telefoon)}
      </div>
      ${lead.notities ? `<div class="lead-notes">${escapeHtml(lead.notities)}</div>` : ''}
      <div class="lead-mail">
        ${lead.mail_concept ? `<pre class="mail-text">${escapeHtml(lead.mail_concept)}</pre>` : ''}
        <div class="lead-mail-actions">
          <button type="button" class="secondary write-mail-btn" data-id="${lead.id}">
            ${lead.mail_concept ? '🔁 Herschrijf mail' : '✉️ Schrijf mail'}
          </button>
          <button type="button" class="secondary copy-mail-btn ${lead.mail_concept ? '' : 'hidden'}" data-id="${lead.id}">📋 Kopieer</button>
          <button type="button" class="secondary send-mail-btn ${lead.mail_concept ? '' : 'hidden'}" data-id="${lead.id}">📤 Verstuur</button>
        </div>
        <p class="mail-error error-text" data-id="${lead.id}"></p>
      </div>
    `;
    leadGrid.appendChild(card);
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
  testmodusBanner.classList.toggle('hidden', !actief);
  generateFakeBtn.classList.toggle('hidden', !actief);
  // Het schema (en daarmee de lead-id's) wisselt, dus een oude selectie klopt niet meer.
  selectedLeadIds.clear();
  updateBulkBar();
  loadLeads();
});

// --- Filters ---
filterForm.addEventListener('submit', (e) => {
  e.preventDefault();
  currentFilters = {
    branche: document.getElementById('filter-branche').value.trim(),
    grootte: document.getElementById('filter-grootte').value,
    locatie: document.getElementById('filter-locatie').value.trim(),
  };
  loadLeads();
});

resetFiltersBtn.addEventListener('click', () => {
  filterForm.reset();
  currentFilters = {};
  loadLeads();
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
    writeBtn.textContent = 'Bezig met schrijven...';

    try {
      const mail = await generateMail(lead);
      await updateLead(id, { mail_concept: mail });
      await loadLeads();
    } catch (err) {
      errorEl.textContent = 'Kon mail niet genereren: ' + err.message;
      writeBtn.disabled = false;
      writeBtn.textContent = lead.mail_concept ? '🔁 Herschrijf mail' : '✉️ Schrijf mail';
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
      copyBtn.textContent = '✅ Gekopieerd';
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
    sendBtn.textContent = 'Versturen...';

    try {
      const { subject, body } = splitMail(lead.mail_concept);
      await sendMail({ to: lead.email, subject, body });
      if (lead.status === 'nieuw') {
        await updateLead(id, { status: 'benaderd' });
      }
      await loadLeads();
    } catch (err) {
      errorEl.textContent = 'Kon mail niet versturen: ' + err.message;
      sendBtn.disabled = false;
      sendBtn.textContent = '📤 Verstuur';
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
  updateBulkBar();
  renderLeads(currentLeads);
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

  for (let i = 0; i < ids.length; i++) {
    const lead = currentLeads.find((l) => l.id === ids[i]);
    if (!lead) continue;

    bulkProgress.textContent = `Bezig: ${i + 1} van ${ids.length} (${lead.bedrijfsnaam})...`;

    try {
      const mailText = await generateMail(lead);
      await updateLead(lead.id, { mail_concept: mailText });
      const { subject, body } = splitMail(mailText);
      await sendMail({ to: lead.email, subject, body });
      if (lead.status === 'nieuw') {
        await updateLead(lead.id, { status: 'benaderd' });
      }
      success++;
    } catch (err) {
      console.error(`Fout bij ${lead.bedrijfsnaam}:`, err);
      failed++;
    }
  }

  bulkProgress.textContent = `Klaar: ${success} verstuurd, ${failed} mislukt.`;
  selectedLeadIds.clear();
  bulkSendBtn.disabled = false;
  updateBulkBar();
  await loadLeads();
  setTimeout(() => bulkProgress.classList.add('hidden'), 5000);
});
