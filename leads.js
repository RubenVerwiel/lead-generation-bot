import { supabase } from './supabaseClient.js';
import { isTestmodus } from './testmodus.js';

// Dit bestand is de enige plek die weet welk schema actief is (testomgeving of
// productie) en is ook het punt waar later een echte databron (KvK-API,
// Apollo) aangesloten kan worden zonder de rest van de app aan te passen.
function activeSchema() {
  return isTestmodus() ? 'testfase_leadgeneration' : 'public';
}

function leadsTable() {
  return supabase.schema(activeSchema()).from('leads');
}

export async function fetchLeads(filters = {}) {
  let query = leadsTable().select('*').order('aangemaakt_op', { ascending: false });

  if (filters.branche) query = query.ilike('branche', `%${filters.branche}%`);
  if (filters.grootte) query = query.eq('bedrijfsgrootte', filters.grootte);
  if (filters.locatie) query = query.ilike('locatie', `%${filters.locatie}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createLead(lead) {
  const { data, error } = await leadsTable().insert(lead).select().single();
  if (error) throw error;
  return data;
}

export async function updateLead(id, patch) {
  const { data, error } = await leadsTable().update(patch).eq('id', id).select().single();
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

  return { bedrijfsnaam, branche, locatie, bedrijfsgrootte, contactpersoon, email, telefoon, status: 'Nieuw' };
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
