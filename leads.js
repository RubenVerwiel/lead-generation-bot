import { supabase } from './supabaseClient.js';
import { isTestmodus } from './testmodus.js';

// Dit bestand is de enige plek die weet welk schema actief is (testomgeving of
// productie) en is ook het punt waar later een echte databron (KvK-API,
// Apollo) aangesloten kan worden zonder de rest van de app aan te passen.
function activeSchema() {
  return isTestmodus() ? 'testfase_leadgeneration' : 'public';
}

function tabel(naam) {
  return supabase.schema(activeSchema()).from(naam);
}

function leadsTable() {
  return tabel('leads');
}

export async function fetchLeads(filters = {}, sortering = {}) {
  const kolom = sortering.kolom || 'aangemaakt_op';
  const oplopend = sortering.oplopend ?? false;

  let query = leadsTable()
    .select('*')
    .order(kolom, { ascending: oplopend, nullsFirst: false });

  if (filters.zoekterm) query = query.ilike('bedrijfsnaam', `%${filters.zoekterm}%`);
  if (filters.branche) query = query.ilike('branche', `%${filters.branche}%`);
  if (filters.grootte) query = query.eq('bedrijfsgrootte', filters.grootte);
  if (filters.locatie) query = query.ilike('locatie', `%${filters.locatie}%`);

  if (filters.statussen?.length) query = query.in('status', filters.statussen);
  if (filters.bron) query = query.eq('bron', filters.bron);

  if (filters.datumVan) query = query.gte('aangemaakt_op', filters.datumVan);
  // Tot en met het einde van de gekozen dag, anders valt die dag zelf buiten de selectie.
  if (filters.datumTot) query = query.lte('aangemaakt_op', `${filters.datumTot}T23:59:59`);

  if (filters.geenContact14Dagen) {
    const grens = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    // Nooit benaderd telt ook als "langer dan 14 dagen geen contact".
    query = query.or(`laatste_contact.is.null,laatste_contact.lt.${grens}`);
  }

  if (filters.minLeadscore) query = query.gte('leadscore', filters.minLeadscore);
  if (filters.opgerichtVan) query = query.gte('opgericht_jaar', filters.opgerichtVan);
  if (filters.opgerichtTot) query = query.lte('opgericht_jaar', filters.opgerichtTot);

  if (filters.heeftWebsite === 'ja') query = query.eq('heeft_website', true);
  if (filters.heeftWebsite === 'nee') query = query.eq('heeft_website', false);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createLead(lead) {
  const { data, error } = await leadsTable().insert(lead).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLeads(ids) {
  const { error } = await leadsTable().delete().in('id', ids);
  if (error) throw error;
}

// --- Ontdubbeling ---

// Haalt het domein uit een webadres, zodat "https://www.acme.nl/contact" en
// "acme.nl" als hetzelfde bedrijf herkend worden.
export function haalDomein(url) {
  if (!url) return null;
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0] || null;
}

// Zoekt een bestaande lead met dezelfde bedrijfsnaam of hetzelfde
// website-domein. Geeft de gevonden lead terug, of null.
export async function zoekDuplicaat({ bedrijfsnaam, website_url }) {
  if (bedrijfsnaam) {
    const { data, error } = await leadsTable()
      .select('*')
      .ilike('bedrijfsnaam', bedrijfsnaam.trim())
      .limit(1);
    if (error) throw error;
    if (data.length) return data[0];
  }

  const domein = haalDomein(website_url);
  if (domein) {
    const { data, error } = await leadsTable()
      .select('*')
      .ilike('website_url', `%${domein}%`)
      .limit(1);
    if (error) throw error;
    if (data.length) return data[0];
  }

  return null;
}

export async function updateLead(id, patch) {
  const { data, error } = await leadsTable().update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function fetchLeadById(id) {
  const { data, error } = await leadsTable().select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

// --- Notities, mailhistorie en statushistorie (voor de tijdlijn) ---

export async function fetchNotities(leadId) {
  const { data, error } = await tabel('notities')
    .select('*')
    .eq('lead_id', leadId)
    .order('aangemaakt_op', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createNotitie(leadId, tekst) {
  const { data, error } = await tabel('notities')
    .insert({ lead_id: leadId, tekst })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchMailHistorie(leadId) {
  const { data, error } = await tabel('mail_historie')
    .select('*')
    .eq('lead_id', leadId)
    .order('verzonden_op', { ascending: false });
  if (error) throw error;
  return data;
}

export async function logMail(leadId, { onderwerp, inhoud, type }) {
  const { error } = await tabel('mail_historie').insert({
    lead_id: leadId,
    onderwerp,
    inhoud,
    type,
  });
  if (error) throw error;
}

// --- Dashboardgegevens ---

// Leads waarvan de follow-up-datum vandaag of eerder is en die nog lopen.
export async function fetchFollowUps() {
  const vandaag = new Date().toISOString().slice(0, 10);
  const { data, error } = await leadsTable()
    .select('*')
    .not('follow_up_datum', 'is', null)
    .lte('follow_up_datum', vandaag)
    .in('status', ['nieuw', 'benaderd', 'gereageerd', 'afspraak'])
    .order('follow_up_datum', { ascending: true });
  if (error) throw error;
  return data;
}

export async function telNieuweLeadsSinds(sindsIso) {
  const { count, error } = await leadsTable()
    .select('id', { count: 'exact', head: true })
    .gte('aangemaakt_op', sindsIso);
  if (error) throw error;
  return count ?? 0;
}

export async function telMailsSinds(sindsIso) {
  const { count, error } = await tabel('mail_historie')
    .select('id', { count: 'exact', head: true })
    .gte('verzonden_op', sindsIso);
  if (error) throw error;
  return count ?? 0;
}

export async function telStatuswijzigingenSinds(sindsIso, naarStatussen) {
  const { count, error } = await tabel('status_historie')
    .select('id', { count: 'exact', head: true })
    .gte('gewijzigd_op', sindsIso)
    .in('nieuwe_status', naarStatussen);
  if (error) throw error;
  return count ?? 0;
}

export async function fetchStatusHistorie(leadId) {
  const { data, error } = await tabel('status_historie')
    .select('*')
    .eq('lead_id', leadId)
    .order('gewijzigd_op', { ascending: false });
  if (error) throw error;
  return data;
}

// --- Nep-leads genereren (alleen testmodus) ---

const BEDRIJFSNAAM_TEMPLATES = [
  'Van der Berg %BRANCHE%', '%LOCATIE% %BRANCHE% Groep', 'De Vries & Partners',
  'Noord %BRANCHE% B.V.', '%BRANCHE% Solutions %LOCATIE%', 'Janssen Holding',
  '%LOCATIE% Handelsonderneming', 'Bakker %BRANCHE% Services', 'De Jong %BRANCHE%',
  '%BRANCHE% Innovaties B.V.', 'Peters & Zonen', '%LOCATIE% Consultancy Groep',
];
const VOORNAMEN = ['Lisa', 'Mark', 'Sanne', 'Tom', 'Eva', 'Rick', 'Fleur', 'Bram', 'Nina', 'Joris'];
const ACHTERNAMEN = ['de Boer', 'Visser', 'Smit', 'Meijer', 'Mulder', 'de Groot', 'Bos', 'Dekker'];
const VOORBEELD_BRANCHES = ['IT', 'Bouw', 'Horeca', 'Zorg', 'Marketing', 'Logistiek', 'Retail', 'Financiën'];
const VOORBEELD_LOCATIES = ['Amsterdam', 'Rotterdam', 'Utrecht', 'Eindhoven', 'Groningen', 'Tilburg'];
const GROOTTES = ['1-10 medewerkers', '11-50 medewerkers', '51-200 medewerkers', '200+ medewerkers'];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function genereerBedrijfsnaam(branche, locatie) {
  const naam = randomFrom(BEDRIJFSNAAM_TEMPLATES);
  return naam.replace('%BRANCHE%', branche).replace('%LOCATIE%', locatie);
}

function genereerNepLead(criteria) {
  const branche = criteria.branche || randomFrom(VOORBEELD_BRANCHES);
  const locatie = criteria.locatie || randomFrom(VOORBEELD_LOCATIES);
  const bedrijfsgrootte = criteria.grootte || randomFrom(GROOTTES);
  const bedrijfsnaam = genereerBedrijfsnaam(branche, locatie);
  const voornaam = randomFrom(VOORNAMEN);
  const achternaam = randomFrom(ACHTERNAMEN);
  const contactpersoon = `${voornaam} ${achternaam}`;
  const domein = bedrijfsnaam.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16) || 'bedrijf';
  const email = `${voornaam.toLowerCase()}@${domein}.nl`;
  const telefoon = `06-${Math.floor(10000000 + Math.random() * 89999999)}`;

  return { bedrijfsnaam, branche, locatie, bedrijfsgrootte, contactpersoon, email, telefoon, status: 'nieuw' };
}

export async function generateFakeLeads(criteria = {}, count = 5) {
  if (!isTestmodus()) {
    throw new Error('Voorbeeldleads genereren kan alleen in testmodus.');
  }
  const nieuweLeads = Array.from({ length: count }, () => genereerNepLead(criteria));
  const { data, error } = await leadsTable().insert(nieuweLeads).select();
  if (error) throw error;
  return data;
}
