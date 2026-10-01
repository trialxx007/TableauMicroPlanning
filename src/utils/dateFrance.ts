/**
 * Utilitaires dates et heures configurés pour la France (fuseau horaire Europe/Paris).
 */

export function getNowParis() {
  const now = new Date();

  // Date au format français : JJ/MM/AAAA
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  // Heure au format français : HH:mm
  const timeStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  // Date complète textuelle en français (ex: "Lundi 28 Septembre 2026")
  const rawFull = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);

  const fullFrenchDate = rawFull.charAt(0).toUpperCase() + rawFull.slice(1);

  return { dateStr, timeStr, fullFrenchDate };
}

export function formatTimeParis(date = new Date()) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
