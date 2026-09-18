-- ============================================================================
-- Lead Generation Bot — extra nep-leads voor de testomgeving
--
-- LET OP: dit voegt elke keer dat je het draait 30 nieuwe leads toe.
-- Draai het dus maar één keer, of verwijder eerst de bestaande testleads met:
--   delete from testfase_leadgeneration.leads;
--
-- Raakt alleen de testomgeving aan; public.leads blijft ongemoeid.
-- ============================================================================

insert into testfase_leadgeneration.leads
  (bedrijfsnaam, branche, locatie, bedrijfsgrootte, contactpersoon, email, telefoon,
   status, notities, bron, leadscore, opgericht_jaar, heeft_website, website_url,
   follow_up_datum, laatste_contact, niet_benaderen)
values
  ('Bouwbedrijf Hoekstra','Bouw','Leeuwarden','11-50 medewerkers','Jelle Hoekstra','jelle@bouwhoekstra.nl','058-2223344','nieuw','Via LinkedIn gevonden.','linkedin',4,2005,true,'https://www.bouwhoekstra.nl',current_date+2,null,false),
  ('Kapsalon Elegance','Persoonlijke verzorging','Almelo','1-10 medewerkers','Samira Bakkali','info@kapsalonelegance.nl','0546-334455','nieuw',null,'scraper',2,2018,false,null,null,null,false),
  ('Installatiebedrijf Van Rooij','Installatietechniek','Oss','11-50 medewerkers','Twan van Rooij','t.vanrooij@vanrooij-installatie.nl','0412-445566','benaderd','Eerste mail verstuurd.','handmatig',3,1998,true,'https://www.vanrooij-installatie.nl',null,now()-interval '5 days',false),
  ('Praktijk Fysio Plus','Zorg','Amstelveen','1-10 medewerkers','Marit de Lange','marit@fysioplus.nl','020-5566778','gereageerd','Wil een demo inplannen.','website',4,2012,true,'https://www.fysioplus.nl',current_date+5,now()-interval '2 days',false),
  ('Tandartspraktijk Centrum','Zorg','Zoetermeer','11-50 medewerkers','Erik Blom','e.blom@tandartscentrum.nl','079-6677889','nieuw',null,'scraper',3,2009,true,'https://www.tandartscentrum.nl',null,null,false),
  ('Webshop Tuinmeubel Direct','E-commerce','Veenendaal','11-50 medewerkers','Sanne Kuipers','sanne@tuinmeubeldirect.nl','0318-778899','afspraak','Afspraak staat voor volgende week.','linkedin',5,2016,true,'https://www.tuinmeubeldirect.nl',current_date+1,now()-interval '1 day',false),
  ('Accountantskantoor Berends','Financiën','Apeldoorn','11-50 medewerkers','Geert Berends','g.berends@berendsaccountants.nl','055-889900','benaderd','Lang geen reactie.','handmatig',3,1995,true,'https://www.berendsaccountants.nl',null,now()-interval '30 days',false),
  ('Drukkerij De Snelle Pers','Grafische industrie','Zwolle','11-50 medewerkers','Linda Vos','linda@snellepers.nl','038-990011','afgewezen','Geen interesse.','scraper',1,1988,true,'https://www.snellepers.nl',null,now()-interval '45 days',false),
  ('Schildersbedrijf Kleurrijk','Bouw','Hoorn','1-10 medewerkers','Patrick Zeeman','patrick@kleurrijkschilders.nl','0229-101112','nieuw','Verzocht om niet meer benaderd te worden.','scraper',2,2014,false,null,null,null,true),
  ('Cateringservice Smaakvol','Horeca','Ede','11-50 medewerkers','Nadia Haddad','nadia@smaakvolcatering.nl','0318-121314','gereageerd','Vraagt om offerte.','website',4,2011,true,'https://www.smaakvolcatering.nl',current_date+7,now()-interval '3 days',false),
  ('Fietsenwinkel De Trapper','Retail','Assen','1-10 medewerkers','Henk Dijkstra','henk@detrapper.nl','0592-131415','nieuw',null,'handmatig',2,2001,false,null,null,null,false),
  ('Softwarehuis Codebase','IT','Utrecht','51-200 medewerkers','Ruben Mol','r.mol@codebase.nl','030-141516','klant','Contract loopt sinds mei.','linkedin',5,2013,true,'https://www.codebase.nl',null,now()-interval '10 days',false),
  ('Tuincentrum Groenrijk Zuid','Retail','Weert','51-200 medewerkers','Anja Peeters','anja@groenrijkzuid.nl','0495-151617','benaderd','Follow-up staat open.','scraper',3,1992,true,'https://www.groenrijkzuid.nl',current_date-2,now()-interval '18 days',false),
  ('Koeriersdienst Sprint','Logistiek','Nieuwegein','11-50 medewerkers','Dave Willemsen','dave@sprintkoeriers.nl','030-161718','nieuw',null,'scraper',3,2019,true,'https://www.sprintkoeriers.nl',null,null,false),
  ('Architectenbureau Lijn & Vorm','Architectuur','Groningen','1-10 medewerkers','Fleur Bakker','fleur@lijnenvorm.nl','050-171819','afspraak','Kennismaking ingepland.','linkedin',5,2015,true,'https://www.lijnenvorm.nl',current_date+3,now()-interval '4 days',false),
  ('Sportschool PowerFit','Sport & Recreatie','Tilburg','11-50 medewerkers','Mo Ouahabi','mo@powerfit.nl','013-181920','nieuw',null,'website',3,2017,true,'https://www.powerfit.nl',null,null,false),
  ('Elektrotechniek Van Gelder','Installatietechniek','Dordrecht','51-200 medewerkers','Rob van Gelder','r.vangelder@vangelder-et.nl','078-192021','gereageerd','Vraagt naar referenties.','handmatig',4,1979,true,'https://www.vangelder-et.nl',current_date+4,now()-interval '6 days',false),
  ('Uitvaartzorg Sereen','Dienstverlening','Alphen aan den Rijn','1-10 medewerkers','Miriam de Vos','miriam@uitvaartsereen.nl','0172-202122','nieuw','Opt-out aangevraagd.','scraper',2,2008,true,'https://www.uitvaartsereen.nl',null,null,true),
  ('Glasbedrijf Helder Zicht','Bouwmaterialen','Purmerend','11-50 medewerkers','Kees Blom','kees@helderzicht.nl','0299-212223','afgewezen','Kiest voor concurrent.','scraper',1,2003,false,null,null,now()-interval '60 days',false),
  ('Reclamebureau Vonk','Marketing','Breda','11-50 medewerkers','Isa Martens','isa@bureauvonk.nl','076-222324','klant','Vaste klant.','linkedin',5,2014,true,'https://www.bureauvonk.nl',null,now()-interval '8 days',false),
  ('Bloemist Flora & Fauna','Retail','Leiden','1-10 medewerkers','Tessa Groen','tessa@floraenfauna.nl','071-232425','nieuw',null,'handmatig',2,2006,false,null,null,null,false),
  ('Beveiligingsdienst Waakzaam','Beveiliging','Rotterdam','51-200 medewerkers','Ahmed Saleh','a.saleh@waakzaam.nl','010-242526','benaderd','Wacht op reactie.','scraper',3,2010,true,'https://www.waakzaam.nl',null,now()-interval '12 days',false),
  ('Autoschade Herstel Snel','Automotive','Zaandam','11-50 medewerkers','Peter Does','peter@herstelsnel.nl','075-252627','nieuw',null,'scraper',3,1999,true,'https://www.herstelsnel.nl',null,null,false),
  ('Zonnepanelen Specialist Solar4U','Energie','Amersfoort','11-50 medewerkers','Wendy Maas','wendy@solar4u.nl','033-262728','afspraak','Afspraak vandaag opvolgen.','website',5,2020,true,'https://www.solar4u.nl',current_date,now()-interval '1 day',false),
  ('Kinderopvang Het Zonnetje','Onderwijs','Gouda','51-200 medewerkers','Priya Sharma','priya@hetzonnetje.nl','0182-272829','nieuw',null,'handmatig',3,2004,true,'https://www.hetzonnetje.nl',null,null,false),
  ('Schoonmaakgroep Spotless','Schoonmaak','Den Bosch','200+ medewerkers','Bert Lammers','b.lammers@spotless.nl','073-282930','gereageerd','Interesse in jaarcontract.','linkedin',4,1996,true,'https://www.spotless.nl',current_date+6,now()-interval '7 days',false),
  ('Meubelmakerij Eiken & Es','Interieur','Deventer','1-10 medewerkers','Joost Brinkman','joost@eikenenes.nl','0570-293031','nieuw',null,'scraper',4,2021,true,'https://www.eikenenes.nl',null,null,false),
  ('Verhuisbedrijf Lichtvoet','Logistiek','Haarlem','11-50 medewerkers','Karim Bouchra','karim@lichtvoet.nl','023-303132','benaderd','Opvolgen na de zomer.','scraper',2,2013,true,'https://www.lichtvoet.nl',null,now()-interval '25 days',false),
  ('Dierenkliniek De Poot','Zorg','Almere','11-50 medewerkers','Lisanne Vermeer','lisanne@dierenkliniekdepoot.nl','036-313233','nieuw',null,'website',3,2007,true,'https://www.dierenkliniekdepoot.nl',null,null,false),
  ('Evenementenbureau Spotlight','Media','Eindhoven','11-50 medewerkers','Jorn Klaassen','jorn@spotlight-events.nl','040-323334','klant','Boekt jaarlijks.','linkedin',5,2018,true,'https://www.spotlight-events.nl',null,now()-interval '15 days',false);
