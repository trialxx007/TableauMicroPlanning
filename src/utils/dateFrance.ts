/**
 * Utilitaires dates et heures calés sur le fuseau du site : GMT+3 (Etc/GMT-3).
 * Le décalage est fixe, sans changement d'heure : l'heure affichée, les
 * horodatages des points et les numéros de semaine ISO restent donc alignés
 * entre tous les postes, quelle que soit l'heure locale de la machine.
 */

export const FUSEAU_HORAIRE = 'Etc/GMT-3';
export const LIBELLE_FUSEAU = 'GMT+3';

/** Vrai si la valeur est une date ISO `YYYY-MM-DD` (éventuellement suivie d'une heure). */
export function estDateISO(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && /^\d{4}-\d{2}-\d{2}/.test(valeur);
}

/** Date du jour dans le fuseau du site, au format ISO `YYYY-MM-DD`. */
export function getDateISOSite(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_HORAIRE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Convertit un horodatage ISO en date `YYYY-MM-DD` du fuseau du site. */
export function dateISOFromDateTime(valeur: string): string | null {
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;
  return getDateISOSite(date);
}

/** Nombre de jours calendaires entre une date `YYYY-MM-DD` et une référence. */
export function joursEntreDatesISO(depuis: string, jusqua = getDateISOSite()): number {
  const parse = (valeur: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur);
    if (!m) return null;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const debut = parse(depuis);
  const fin = parse(jusqua);
  if (debut === null || fin === null) return 0;
  return Math.round((fin - debut) / 86400000);
}

export function getNowParis() {
  const now = new Date();

  // Date au format français : JJ/MM/AAAA
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_HORAIRE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  // Heure au format français : HH:mm
  const timeStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_HORAIRE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  // Date complète textuelle en français (ex: "Lundi 28 Septembre 2026")
  const rawFull = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_HORAIRE,
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
    timeZone: FUSEAU_HORAIRE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Horodatage français « JJ/MM/AAAA à HH:MM » restitué en bref « JJ/MM à HH:MM »
 *  (historiques). Toute autre forme est renvoyée telle quelle. */
export function horodatageBref(valeur: string | null | undefined): string {
  const m = String(valeur ?? '').match(/^(\d{2})\/(\d{2})\/\d{4}\s*à\s*(\d{2}:\d{2})/);
  return m ? `${m[1]}/${m[2]} à ${m[3]}` : String(valeur ?? '').trim();
}

/**
 * Numéro de semaine ISO (1 à 53) de la date, calculé sur le fuseau du site (GMT+3).
 * ex: lundi 05/10/2026 -> semaine 41.
 */
export function getSemaineISO(date = new Date()): number {
  const [annee, mois, jour] = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_HORAIRE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')
    .map(Number);

  // On travaille en UTC pour neutraliser les changements d'heure.
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  const jourSemaine = d.getUTCDay() || 7; // lundi = 1 ... dimanche = 7
  d.setUTCDate(d.getUTCDate() + 4 - jourSemaine); // jeudi de la semaine courante

  const premierJanvier = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const joursEcoules = Math.round((d.getTime() - premierJanvier.getTime()) / 86400000) + 1;

  return Math.ceil(joursEcoules / 7);
}