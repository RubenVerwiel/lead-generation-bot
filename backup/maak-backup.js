#!/usr/bin/env node
// Maakt een back-up van alle tabellen uit beide omgevingen.
//
// Gebruik:   npm run backup
//
// De bestanden komen NAAST je projectmap terecht, in:
//   ~/Downloads/AI-Minor/Lead generation bot - backups/YYYY-MM-DD/
//
// Bewust buiten de projectmap, zodat je back-ups niet in git belanden en je
// projectmap overzichtelijk blijft.

import { writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'xmhxctvtkjyppwpgeher';
const SCHEMAS = ['public', 'testfase_leadgeneration'];
const TABELLEN = ['leads', 'notities', 'mail_historie', 'status_historie'];

function leesToken() {
  try {
    const inhoud = readFileSync(new URL('../.env.supabase', import.meta.url), 'utf8');
    const regel = inhoud.split('\n').find((r) => r.startsWith('SUPABASE_ACCESS_TOKEN='));
    return regel?.split('=')[1]?.trim();
  } catch {
    return null;
  }
}

async function query(token, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

// Eén regel per rij, met dubbele aanhalingstekens verdubbeld zoals CSV vereist.
function naarCsv(rijen) {
  if (rijen.length === 0) return '';
  const kolommen = Object.keys(rijen[0]);
  const cel = (w) => `"${String(w ?? '').replace(/"/g, '""')}"`;
  return [
    kolommen.join(';'),
    ...rijen.map((rij) => kolommen.map((k) => cel(rij[k])).join(';')),
  ].join('\n');
}

async function main() {
  const token = leesToken();
  if (!token) {
    console.error('Geen SUPABASE_ACCESS_TOKEN gevonden in .env.supabase.');
    console.error('Maak een nieuwe aan via supabase.com → Account → Access Tokens.');
    process.exit(1);
  }

  const datum = new Date().toISOString().slice(0, 10);
  const map = join(homedir(), 'Downloads', 'AI-Minor', 'Lead generation bot - backups', datum);
  await mkdir(map, { recursive: true });

  const alles = {};
  let totaalRijen = 0;

  for (const schema of SCHEMAS) {
    for (const tabel of TABELLEN) {
      const naam = `${schema}.${tabel}`;
      try {
        const rijen = await query(token, `select * from ${schema}.${tabel};`);
        alles[naam] = rijen;
        totaalRijen += rijen.length;

        if (rijen.length > 0) {
          await writeFile(join(map, `${schema}__${tabel}.csv`), '﻿' + naarCsv(rijen), 'utf8');
        }
        console.log(`  ${naam.padEnd(42)} ${String(rijen.length).padStart(5)} rijen`);
      } catch (err) {
        console.error(`  ${naam.padEnd(42)} MISLUKT: ${err.message}`);
      }
    }
  }

  // Eén JSON-bestand met alles erin, als volledige kopie om van te herstellen.
  await writeFile(join(map, 'volledige-backup.json'), JSON.stringify(alles, null, 2), 'utf8');

  console.log(`\nKlaar: ${totaalRijen} rijen weggeschreven naar\n  ${map}`);
}

main().catch((err) => {
  console.error('Back-up mislukt:', err.message);
  process.exit(1);
});
