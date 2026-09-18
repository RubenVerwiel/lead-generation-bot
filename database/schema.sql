-- ============================================================================
-- Lead Generation Bot — complete databasestructuur
--
-- Dit script brengt de database naar de juiste eindtoestand, ongeacht wat er
-- al staat. Het is veilig om meerdere keren te draaien: bestaande tabellen,
-- kolommen en gegevens blijven behouden, ontbrekende onderdelen worden
-- aangemaakt en bestaande regels worden opnieuw gezet.
--
-- Beide schema's krijgen exact dezelfde structuur:
--   testfase_leadgeneration = testomgeving (nepdata)
--   public                  = productie (echte leads)
--
-- Gebruik: open dit bestand, kopieer alles, plak het in de Supabase
-- SQL Editor en klik op Run.
-- ============================================================================

create extension if not exists pgcrypto;
create schema if not exists testfase_leadgeneration;

-- Toegang tot het eigen schema. Row Level Security (verderop) bepaalt daarna
-- wie er werkelijk bij welke gegevens mag.
grant usage on schema testfase_leadgeneration to authenticated, service_role;
alter default privileges in schema testfase_leadgeneration
  grant select, insert, update, delete on tables to authenticated, service_role;


-- ============================================================================
-- TESTOMGEVING: testfase_leadgeneration
-- ============================================================================

create table if not exists testfase_leadgeneration.leads (
  id uuid primary key default gen_random_uuid(),
  bedrijfsnaam text,
  branche text,
  locatie text,
  bedrijfsgrootte text,
  contactpersoon text,
  email text,
  telefoon text,
  status text not null default 'nieuw',
  notities text,
  mail_concept text,
  aangemaakt_op timestamptz not null default now()
);

-- Kolommen die later zijn toegevoegd (overslaan als ze er al zijn)
alter table testfase_leadgeneration.leads
  add column if not exists bron text not null default 'handmatig',
  add column if not exists laatste_contact timestamptz,
  add column if not exists leadscore integer,
  add column if not exists opgericht_jaar integer,
  add column if not exists heeft_website boolean not null default false,
  add column if not exists website_url text,
  add column if not exists follow_up_datum date,
  add column if not exists niet_benaderen boolean not null default false;

-- Oude statuswaarden (met hoofdletters) omzetten naar de huidige set
alter table testfase_leadgeneration.leads drop constraint if exists leads_status_check;

update testfase_leadgeneration.leads set status = case status
  when 'Nieuw'     then 'nieuw'
  when 'Benaderd'  then 'benaderd'
  when 'Reactie'   then 'gereageerd'
  when 'Klant'     then 'klant'
  when 'Afgewezen' then 'afgewezen'
  else lower(status)
end
where status <> lower(status) or status = 'Reactie';

alter table testfase_leadgeneration.leads alter column status set default 'nieuw';

-- Toegestane waarden vastleggen
alter table testfase_leadgeneration.leads
  add constraint leads_status_check
    check (status in ('nieuw','benaderd','gereageerd','afspraak','klant','afgewezen'));

alter table testfase_leadgeneration.leads drop constraint if exists leads_bron_check;
alter table testfase_leadgeneration.leads
  add constraint leads_bron_check
    check (bron in ('scraper','linkedin','handmatig','website','overig'));

alter table testfase_leadgeneration.leads drop constraint if exists leads_leadscore_check;
alter table testfase_leadgeneration.leads
  add constraint leads_leadscore_check
    check (leadscore is null or leadscore between 1 and 5);

alter table testfase_leadgeneration.leads drop constraint if exists leads_opgericht_jaar_check;
alter table testfase_leadgeneration.leads
  add constraint leads_opgericht_jaar_check
    check (opgericht_jaar is null or opgericht_jaar between 1800 and 2100);

-- Losse notities per lead (tijdlijn)
create table if not exists testfase_leadgeneration.notities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references testfase_leadgeneration.leads(id) on delete cascade,
  tekst text not null,
  aangemaakt_op timestamptz not null default now()
);
create index if not exists notities_lead_id_idx
  on testfase_leadgeneration.notities(lead_id);

-- Verstuurde mails per lead
create table if not exists testfase_leadgeneration.mail_historie (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references testfase_leadgeneration.leads(id) on delete cascade,
  onderwerp text,
  inhoud text,
  verzonden_op timestamptz not null default now(),
  type text not null default 'eerste_mail'
);
create index if not exists mail_historie_lead_id_idx
  on testfase_leadgeneration.mail_historie(lead_id);

alter table testfase_leadgeneration.mail_historie drop constraint if exists mail_historie_type_check;
alter table testfase_leadgeneration.mail_historie
  add constraint mail_historie_type_check
    check (type in ('eerste_mail','follow_up'));

-- Statuswijzigingen per lead (wordt automatisch gevuld door de trigger hieronder)
create table if not exists testfase_leadgeneration.status_historie (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references testfase_leadgeneration.leads(id) on delete cascade,
  oude_status text,
  nieuwe_status text not null,
  gewijzigd_op timestamptz not null default now()
);
create index if not exists status_historie_lead_id_idx
  on testfase_leadgeneration.status_historie(lead_id);

-- Rechten expliciet per tabel, zodat er gegarandeerd geen tabel wordt overgeslagen
grant select, insert, update, delete on
  testfase_leadgeneration.leads,
  testfase_leadgeneration.notities,
  testfase_leadgeneration.mail_historie,
  testfase_leadgeneration.status_historie
to authenticated, service_role;

-- Beveiliging: alleen ingelogde gebruikers mogen bij de gegevens
alter table testfase_leadgeneration.leads enable row level security;
alter table testfase_leadgeneration.notities enable row level security;
alter table testfase_leadgeneration.mail_historie enable row level security;
alter table testfase_leadgeneration.status_historie enable row level security;

-- Oude policynamen opruimen, zodat er geen dubbele regels blijven staan
drop policy if exists "Ingelogde gebruikers kunnen lezen" on testfase_leadgeneration.leads;
drop policy if exists "Ingelogde gebruikers kunnen invoegen" on testfase_leadgeneration.leads;
drop policy if exists "Ingelogde gebruikers kunnen bijwerken" on testfase_leadgeneration.leads;
drop policy if exists "Ingelogde gebruikers kunnen verwijderen" on testfase_leadgeneration.leads;
drop policy if exists "Ingelogde gebruikers kunnen lezen" on testfase_leadgeneration.notities;
drop policy if exists "Ingelogde gebruikers kunnen invoegen" on testfase_leadgeneration.notities;
drop policy if exists "Ingelogde gebruikers kunnen bijwerken" on testfase_leadgeneration.notities;
drop policy if exists "Ingelogde gebruikers kunnen verwijderen" on testfase_leadgeneration.notities;
drop policy if exists "Ingelogde gebruikers kunnen lezen" on testfase_leadgeneration.mail_historie;
drop policy if exists "Ingelogde gebruikers kunnen invoegen" on testfase_leadgeneration.mail_historie;
drop policy if exists "Ingelogde gebruikers kunnen bijwerken" on testfase_leadgeneration.mail_historie;
drop policy if exists "Ingelogde gebruikers kunnen verwijderen" on testfase_leadgeneration.mail_historie;
drop policy if exists "Lezen" on testfase_leadgeneration.status_historie;
drop policy if exists "Invoegen" on testfase_leadgeneration.status_historie;

drop policy if exists "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.leads;
drop policy if exists "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.notities;
drop policy if exists "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.mail_historie;
drop policy if exists "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.status_historie;

-- Eén policy per tabel die lezen, invoegen, bijwerken en verwijderen dekt
create policy "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.notities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.mail_historie
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Toegang voor ingelogde gebruikers" on testfase_leadgeneration.status_historie
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Statuswijzigingen automatisch loggen, ongeacht waar de wijziging vandaan komt
-- security definer: de logging draait met de rechten van de eigenaar, zodat
-- een statuswijziging nooit stukloopt op ontbrekende rechten van de gebruiker.
create or replace function testfase_leadgeneration.log_status_wijziging()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into testfase_leadgeneration.status_historie (lead_id, oude_status, nieuwe_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_status_historie on testfase_leadgeneration.leads;
create trigger leads_status_historie
  after update on testfase_leadgeneration.leads
  for each row execute function testfase_leadgeneration.log_status_wijziging();


-- ============================================================================
-- PRODUCTIE: public
-- ============================================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  bedrijfsnaam text,
  branche text,
  locatie text,
  bedrijfsgrootte text,
  contactpersoon text,
  email text,
  telefoon text,
  status text not null default 'nieuw',
  notities text,
  mail_concept text,
  aangemaakt_op timestamptz not null default now()
);

alter table public.leads
  add column if not exists bron text not null default 'handmatig',
  add column if not exists laatste_contact timestamptz,
  add column if not exists leadscore integer,
  add column if not exists opgericht_jaar integer,
  add column if not exists heeft_website boolean not null default false,
  add column if not exists website_url text,
  add column if not exists follow_up_datum date,
  add column if not exists niet_benaderen boolean not null default false;

alter table public.leads drop constraint if exists leads_status_check;

update public.leads set status = case status
  when 'Nieuw'     then 'nieuw'
  when 'Benaderd'  then 'benaderd'
  when 'Reactie'   then 'gereageerd'
  when 'Klant'     then 'klant'
  when 'Afgewezen' then 'afgewezen'
  else lower(status)
end
where status <> lower(status) or status = 'Reactie';

alter table public.leads alter column status set default 'nieuw';

alter table public.leads
  add constraint leads_status_check
    check (status in ('nieuw','benaderd','gereageerd','afspraak','klant','afgewezen'));

alter table public.leads drop constraint if exists leads_bron_check;
alter table public.leads
  add constraint leads_bron_check
    check (bron in ('scraper','linkedin','handmatig','website','overig'));

alter table public.leads drop constraint if exists leads_leadscore_check;
alter table public.leads
  add constraint leads_leadscore_check
    check (leadscore is null or leadscore between 1 and 5);

alter table public.leads drop constraint if exists leads_opgericht_jaar_check;
alter table public.leads
  add constraint leads_opgericht_jaar_check
    check (opgericht_jaar is null or opgericht_jaar between 1800 and 2100);

create table if not exists public.notities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tekst text not null,
  aangemaakt_op timestamptz not null default now()
);
create index if not exists notities_lead_id_idx on public.notities(lead_id);

create table if not exists public.mail_historie (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  onderwerp text,
  inhoud text,
  verzonden_op timestamptz not null default now(),
  type text not null default 'eerste_mail'
);
create index if not exists mail_historie_lead_id_idx on public.mail_historie(lead_id);

alter table public.mail_historie drop constraint if exists mail_historie_type_check;
alter table public.mail_historie
  add constraint mail_historie_type_check
    check (type in ('eerste_mail','follow_up'));

create table if not exists public.status_historie (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  oude_status text,
  nieuwe_status text not null,
  gewijzigd_op timestamptz not null default now()
);
create index if not exists status_historie_lead_id_idx on public.status_historie(lead_id);

grant select, insert, update, delete on
  public.leads,
  public.notities,
  public.mail_historie,
  public.status_historie
to authenticated, service_role;

alter table public.leads enable row level security;
alter table public.notities enable row level security;
alter table public.mail_historie enable row level security;
alter table public.status_historie enable row level security;

drop policy if exists "Ingelogde gebruikers kunnen lezen" on public.leads;
drop policy if exists "Ingelogde gebruikers kunnen invoegen" on public.leads;
drop policy if exists "Ingelogde gebruikers kunnen bijwerken" on public.leads;
drop policy if exists "Ingelogde gebruikers kunnen verwijderen" on public.leads;
drop policy if exists "Ingelogde gebruikers kunnen lezen" on public.notities;
drop policy if exists "Ingelogde gebruikers kunnen invoegen" on public.notities;
drop policy if exists "Ingelogde gebruikers kunnen bijwerken" on public.notities;
drop policy if exists "Ingelogde gebruikers kunnen verwijderen" on public.notities;
drop policy if exists "Ingelogde gebruikers kunnen lezen" on public.mail_historie;
drop policy if exists "Ingelogde gebruikers kunnen invoegen" on public.mail_historie;
drop policy if exists "Ingelogde gebruikers kunnen bijwerken" on public.mail_historie;
drop policy if exists "Ingelogde gebruikers kunnen verwijderen" on public.mail_historie;
drop policy if exists "Lezen" on public.status_historie;
drop policy if exists "Invoegen" on public.status_historie;

drop policy if exists "Toegang voor ingelogde gebruikers" on public.leads;
drop policy if exists "Toegang voor ingelogde gebruikers" on public.notities;
drop policy if exists "Toegang voor ingelogde gebruikers" on public.mail_historie;
drop policy if exists "Toegang voor ingelogde gebruikers" on public.status_historie;

create policy "Toegang voor ingelogde gebruikers" on public.leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Toegang voor ingelogde gebruikers" on public.notities
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Toegang voor ingelogde gebruikers" on public.mail_historie
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Toegang voor ingelogde gebruikers" on public.status_historie
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function public.log_status_wijziging()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.status_historie (lead_id, oude_status, nieuwe_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_status_historie on public.leads;
create trigger leads_status_historie
  after update on public.leads
  for each row execute function public.log_status_wijziging();


-- ============================================================================
-- Controle: draai dit los om te zien of alles klopt.
-- Verwacht: leads (20 kolommen), mail_historie (6), notities (4),
-- status_historie (5) — in beide schema's.
-- ============================================================================
-- select table_schema, table_name, count(*) as kolommen
-- from information_schema.columns
-- where table_schema in ('testfase_leadgeneration', 'public')
--   and table_name in ('leads', 'notities', 'mail_historie', 'status_historie')
-- group by table_schema, table_name
-- order by table_schema, table_name;
