// Instellingen voor de AI-mailfunctie worden bewust in localStorage bewaard
// (niet in Supabase) — simpeler, en er is toch maar één gebruiker.
const STORAGE_KEY = 'leadbot_settings';

const DEFAULT_SETTINGS = {
  naam: '',
  bedrijf: '',
  aanbod: '',
  toon: 'zakelijk',
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
