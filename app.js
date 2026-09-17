import { login, logout, watchAuth } from './auth.js';
import { fetchLeads, createLead, updateLead, generateFakeLeads } from './leads.js';
import { isTestmodus, setTestmodus, onTestmodusChange } from './testmodus.js';
import { getSettings, saveSettings } from './settings.js';
import { generateMail } from './mail.js';

const STATUSES = ['Nieuw', 'Benaderd', 'Reactie', 'Klant', 'Afgewezen'];

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

let currentFilters = {};
let currentLeads = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function slug(status) {
  return status
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
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
    <div class="pipeline-item status-${slug(status)}">
      <span class="pipeline-count">${counts[status]}</span>
      <span class="pipeline-label">${status}</span>
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
    card.className = `lead-card status-${slug(lead.status)}`;
    card.innerHTML = `
      <div class="lead-top">
        <span class="lead-name">${escapeHtml(lead.bedrijfsnaam)}</span>
        <span class="lead-status-badge">${escapeHtml(lead.status)}</span>
      </div>
      <div class="lead-meta">
        <span>🏷️ ${escapeHtml(lead.branche)}</span>
        <span>👥 ${escapeHtml(lead.bedrijfsgrootte)}</span>
        <span>📍 ${escapeHtml(lead.locatie)}</span>
      </div>
      <div class="lead-contact">
        👤 ${escapeHtml(lead.contactpersoon)} · ✉️ ${escapeHtml(lead.email)} · ☎️ ${escapeHtml(lead.telefoon)}
      </div>
      ${lead.notities ? `<div class="lead-notes">${escapeHtml(lead.notities)}</div>` : ''}
      <div class="lead-mail">
        ${lead.mail_concept ? `<pre class="mail-text">${escapeHtml(lead.mail_concept)}</pre>` : ''}
        <div class="lead-mail-actions">
          <button type="button" class="secondary write-mail-btn" data-id="${lead.id}">
            ${lead.mail_concept ? '🔁 Herschrijf mail' : '✉️ Schrijf mail'}
          </button>
          <button type="button" class="secondary copy-mail-btn ${lead.mail_concept ? '' : 'hidden'}" data-id="${lead.id}">📋 Kopieer</button>
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
  }
});
