import { watchAuth } from './auth.js';
import {
  fetchLeads,
  fetchFollowUps,
  telNieuweLeadsSinds,
  telMailsSinds,
  telStatuswijzigingenSinds,
} from './leads.js';
import { setTestmodus, isTestmodus } from './testmodus.js';
import { formatDatum } from './format.js';

// De funnel is een volgorde, geen losse categorieën: één kleur die per stap
// donkerder wordt leest daarom beter dan zes verschillende kleuren.
const FUNNEL_STAPPEN = [
  { status: 'nieuw', label: 'Nieuw', kleur: '#a5b4fc' },
  { status: 'benaderd', label: 'Benaderd', kleur: '#818cf8' },
  { status: 'gereageerd', label: 'Gereageerd', kleur: '#6366f1' },
  { status: 'afspraak', label: 'Afspraak', kleur: '#4f46e5' },
  { status: 'klant', label: 'Klant', kleur: '#4338ca' },
];

const params = new URLSearchParams(window.location.search);
if (params.get('test') === '0') setTestmodus(false);

const scherm = document.getElementById('dashboard-screen');
const laadScherm = document.getElementById('dashboard-laden');
const testmodusBanner = document.getElementById('testmodus-banner');
const funnelEl = document.getElementById('funnel');
const conversieEl = document.getElementById('conversie');
const followUpsEl = document.getElementById('follow-ups');
const afgewezenEl = document.getElementById('afgewezen-aantal');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function detailLink(id) {
  return `lead-detail.html?id=${id}${isTestmodus() ? '' : '&test=0'}`;
}

function beginVanDeWeek() {
  const nu = new Date();
  const dagenSindsMaandag = (nu.getDay() + 6) % 7;
  const maandag = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - dagenSindsMaandag);
  return maandag.toISOString();
}

// Per stap: hoeveel leads zijn minstens zover gekomen?
function berekenFunnel(leads) {
  const volgorde = FUNNEL_STAPPEN.map((s) => s.status);
  return FUNNEL_STAPPEN.map((stap, i) => ({
    ...stap,
    aantal: leads.filter((lead) => volgorde.indexOf(lead.status) >= i).length,
  }));
}

function renderFunnel(stappen) {
  const grootste = Math.max(...stappen.map((s) => s.aantal), 1);

  funnelEl.innerHTML = stappen
    .map(
      (stap) => `
      <div class="funnel-rij">
        <span class="funnel-label">${stap.label}</span>
        <div class="funnel-spoor">
          <div class="funnel-balk" style="width: ${Math.max((stap.aantal / grootste) * 100, 1)}%; background: ${stap.kleur};"></div>
        </div>
        <span class="funnel-aantal">${stap.aantal}</span>
      </div>`
    )
    .join('');
}

function renderConversie(stappen) {
  const stappenMetVorige = stappen.slice(1);

  conversieEl.innerHTML = stappenMetVorige
    .map((stap, i) => {
      const vorige = stappen[i];
      const percentage = vorige.aantal > 0 ? Math.round((stap.aantal / vorige.aantal) * 100) : 0;
      return `
      <div class="conversie-stap">
        <span class="conversie-percentage">${percentage}%</span>
        <span class="conversie-label">${vorige.label} → ${stap.label}</span>
      </div>`;
    })
    .join('');
}

function renderFollowUps(leads) {
  if (leads.length === 0) {
    followUpsEl.innerHTML = '<p class="toelichting">Niets om vandaag op te volgen.</p>';
    return;
  }

  const vandaag = new Date().toISOString().slice(0, 10);

  followUpsEl.innerHTML = leads
    .map((lead) => {
      const teLaat = lead.follow_up_datum < vandaag;
      return `
      <div class="follow-up ${teLaat ? 'te-laat' : ''}">
        <a href="${detailLink(lead.id)}">${escapeHtml(lead.bedrijfsnaam)}</a>
        <span class="follow-up-datum">${formatDatum(lead.follow_up_datum)}${teLaat ? ' · te laat' : ''}</span>
      </div>`;
    })
    .join('');
}

async function laadDashboard() {
  try {
    const weekStart = beginVanDeWeek();

    const [leads, followUps, nieuweLeads, mails, vooruitgang] = await Promise.all([
      fetchLeads(),
      fetchFollowUps(),
      telNieuweLeadsSinds(weekStart),
      telMailsSinds(weekStart),
      telStatuswijzigingenSinds(weekStart, ['afspraak', 'klant']),
    ]);

    document.getElementById('kpi-nieuw').textContent = nieuweLeads;
    document.getElementById('kpi-mails').textContent = mails;
    document.getElementById('kpi-vooruitgang').textContent = vooruitgang;

    const stappen = berekenFunnel(leads);
    renderFunnel(stappen);
    renderConversie(stappen);
    afgewezenEl.textContent = leads.filter((l) => l.status === 'afgewezen').length;
    renderFollowUps(followUps);

    testmodusBanner.classList.toggle('hidden', !isTestmodus());
    laadScherm.classList.add('hidden');
    scherm.classList.remove('hidden');
  } catch (err) {
    laadScherm.textContent = 'Kon het dashboard niet laden: ' + err.message;
  }
}

watchAuth((session) => {
  if (session) {
    laadDashboard();
  } else {
    window.location.href = 'index.html';
  }
});
