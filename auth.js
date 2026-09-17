import { supabase } from './supabaseClient.js';

export async function login(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function logout() {
  return supabase.auth.signOut();
}

// Roept onChange meteen aan met de huidige sessie (of null), en daarna telkens
// opnieuw zodra er wordt ingelogd, uitgelogd, of de sessie ververst wordt.
// Dit is de enige plek die de app hoeft te raadplegen om te weten of iemand
// is ingelogd, ook na een paginaherlaad.
export function watchAuth(onChange) {
  supabase.auth.getSession().then(({ data: { session } }) => onChange(session));
  supabase.auth.onAuthStateChange((_event, session) => onChange(session));
}

// Nodig om de serverless function te bewijzen dat de aanvraag van een
// ingelogde gebruiker komt (zie mail.js + api/generate-mail.js).
export async function getAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
