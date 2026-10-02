// api/bot/_db.js
// Server-side database functies voor de bot.
// Gebruikt service_role key voor volledige toegang (bypass RLS).

import { createClient } from '@supabase/supabase-js';
// SUPABASE_URL komt uit config.js en niet uit process.env: het webadres van de
// database is geen geheim en staat al in config.js, waar de rest van de app
// hem ook vandaan haalt (zie api/send-mail.js, api/backup.js, api/afmelden.js).
// Zo hoeft er niets extra's ingesteld te worden in Vercel.
import { SUPABASE_URL } from '../../config.js';

const supabase = createClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function schemaNaam(testmodus) {
  return testmodus ? 'testfase_leadgeneration' : 'public';
}

function leadsTable(testmodus) {
  return supabase.schema(schemaNaam(testmodus)).from('leads');
}

function tabel(naam, testmodus) {
  return supabase.schema(schemaNaam(testmodus)).from(naam);
}

// --- Ontdubbeling ---

export function haalDomein(url) {
  if (!url) return null;
  return url.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0] || null;
}

export function normaliseerBedrijfsnaam(naam) {
  if (!naam) return '';
  return naam.toLowerCase()
    .replace(/[.,'"`&()-]/g, ' ')
    .replace(/\b(b ?v|n ?v|v o f|vof|cv|holding|group|groep)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

export async function zoekDuplicaat({ bedrijfsnaam, website_url }, testmodus) {
  if (bedrijfsnaam) {
    const genormaliseerd = normaliseerBedrijfsnaam(bedrijfsnaam);
    const eersteWoord = genormaliseerd.split(' ')[0];
    if (eersteWoord) {
      const { data, error } = await leadsTable(testmodus)
        .select('*').ilike('bedrijfsnaam', `%${eersteWoord}%`).limit(50);
      if (error) throw error;
      const match = data.find((l) =>
        normaliseerBedrijfsnaam(l.bedrijfsnaam) === genormaliseerd
      );
      if (match) return match;
    }
  }
  const domein = haalDomein(website_url);
  if (domein) {
    const { data, error } = await leadsTable(testmodus)
      .select('*').ilike('website_url', `%${domein}%`).limit(1);
    if (error) throw error;
    if (data.length) return data[0];
  }
  return null;
}

// --- CRUD ---

export async function fetchLeads(filters = {}, testmodus) {
  let query = leadsTable(testmodus).select('*')
    .order('aangemaakt_op', { ascending: false, nullsFirst: false });

  query = query.eq('verwijderd', Boolean(filters.toonVerwijderd));
  if (filters.zoekterm) query = query.ilike('bedrijfsnaam', `%${filters.zoekterm}%`);
  if (filters.branche) query = query.ilike('branche', `%${filters.branche}%`);
  if (filters.locatie) query = query.ilike('locatie', `%${filters.locatie}%`);
  if (filters.grootte) query = query.eq('bedrijfsgrootte', filters.grootte);
  if (filters.statussen?.length) query = query.in('status', filters.statussen);
  if (filters.minLeadscore) query = query.gte('leadscore', filters.minLeadscore);
  query = query.limit(filters.limit || 20);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchLeadById(id, testmodus) {
  const { data, error } = await leadsTable(testmodus)
    .select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createLead(lead, testmodus) {
  const { data, error } = await leadsTable(testmodus)
    .insert(lead).select().single();
  if (error) throw error;
  return data;
}

export async function updateLead(id, patch, testmodus) {
  const { data, error } = await leadsTable(testmodus)
    .update(patch).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function createNotitie(leadId, tekst, testmodus) {
  const { data, error } = await tabel('notities', testmodus)
    .insert({ lead_id: leadId, tekst }).select().single();
  if (error) throw error;
  return data;
}

export async function fetchFollowUps(testmodus) {
  const vandaag = new Date().toISOString().slice(0, 10);
  const { data, error } = await leadsTable(testmodus).select('*')
    .not('follow_up_datum', 'is', null)
    .lte('follow_up_datum', vandaag)
    .in('status', ['nieuw', 'benaderd', 'gereageerd', 'afspraak'])
    .order('follow_up_datum', { ascending: true });
  if (error) throw error;
  return data;
}

export async function telMailsVandaag() {
  const gisteren = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let totaal = 0;
  for (const s of ['public', 'testfase_leadgeneration']) {
    const { count } = await supabase.schema(s)
      .from('mail_historie')
      .select('id', { count: 'exact', head: true })
      .gte('verzonden_op', gisteren);
    totaal += count || 0;
  }
  return totaal;
}
