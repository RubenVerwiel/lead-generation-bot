import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// De Supabase-bibliotheek wordt geladen via een gewone <script>-regel in de
// HTML (zie vendor/supabase.js) en niet meer vanaf een externe server. Dat
// scheelt bij elke paginalading een stuk of zes losse verzoeken naar internet,
// die allemaal moesten zijn afgerond voordat de app iets kon doen.
const { createClient } = window.supabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
