// Alle datums in de app worden hier omgezet naar Nederlands formaat.

export function formatDatum(waarde) {
  if (!waarde) return '—';
  const d = new Date(waarde);
  if (Number.isNaN(d.getTime())) return '—';

  const dag = String(d.getDate()).padStart(2, '0');
  const maand = String(d.getMonth() + 1).padStart(2, '0');
  return `${dag}-${maand}-${d.getFullYear()}`;
}

export function formatDatumTijd(waarde) {
  if (!waarde) return '—';
  const d = new Date(waarde);
  if (Number.isNaN(d.getTime())) return '—';

  const uur = String(d.getHours()).padStart(2, '0');
  const minuut = String(d.getMinutes()).padStart(2, '0');
  return `${formatDatum(waarde)} ${uur}:${minuut}`;
}
