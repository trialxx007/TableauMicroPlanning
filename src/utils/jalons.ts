import type { CardItem, CardJalon, JalonCode, JalonCatalogue } from '../types/card.ts';
import { getSemaineISO } from './dateFrance.ts';
import { CATALOGUE_INITIAL } from '../data/mockJalons.ts';

/**
 * États possibles d'un jalon — trois choix distincts :
 * - VALIDE     : validé, la semaine est ignorée.
 * - SEMAINE    : planifié sur une semaine ISO cible (S12, S40...).
 * - EN_ATTENTE : en attente, sans échéance et sans semaine.
 */
export type JalonEtat = 'VALIDE' | 'SEMAINE' | 'EN_ATTENTE';

export interface JalonInfo {
  code: JalonCode;
  /** Intitulé long du catalogue, pour les infobulles : « Dossier Technique ». */
  titre: string;
  etat: JalonEtat;
  /**
   * Libellé de l'état : « Validé » ou « En attente ». L'état SEMAINE n'a pas de
   * libellé, l'affichage de repos montre directement la semaine (`S40`).
   */
  etatLibelle: string;
  /** Semaine cible, uniquement renseignée quand l'état est SEMAINE. */
  semaine: number | null;
  /** Vrai si la semaine cible est déjà dépassée et le jalon non validé. */
  enRetard: boolean;
}

export { CATALOGUE_INITIAL };
export const SEMAINE_MIN = 1;
export const SEMAINE_MAX = 53;

/**
 * Préfixe des valeurs de filtre « jalon manquant ». Il vit ici et non dans App
 * pour que la barre de filtres et le filtrage partagent la même source, sans
 * import circulaire entre les deux.
 */
export const PREFIXE_JALON_MANQUANT = 'JALON_MISSING:';

export function filtreJalonManquant(code: JalonCode): string {
  return `${PREFIXE_JALON_MANQUANT}${code}`;
}

export function normaliserSemaine(valeur: unknown): number | null {
  const n = typeof valeur === 'number' ? valeur : parseInt(String(valeur ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(SEMAINE_MAX, Math.max(SEMAINE_MIN, Math.round(n)));
}

/** Un code du catalogue déjà épuré : 3 caractères maximum, en majuscules. */
export function normaliserCodeJalon(valeur: unknown): string {
  return String(valeur ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 3);
}

export function jalonEnRetard(
  valide: boolean,
  semaine: number | null | undefined,
  semaineActuelle: number
): boolean {
  if (valide) return false;
  if (semaine == null) return false;
  return semaine < semaineActuelle;
}

/** État d'un jalon tel qu'il est stocké ; absent = « En attente » sans échéance. */
export function getEtatJalon(card: CardItem | undefined, code: JalonCode): CardJalon {
  return card?.jalons.find((j) => j.code === code) ?? { code, valide: false };
}

export function getJalonInfo(
  catalogue: JalonCatalogue,
  etat: { valide?: boolean; semaine?: number | null } | undefined,
  semaineActuelle: number
): JalonInfo {
  const valide = Boolean(etat?.valide);
  const s = valide ? null : normaliserSemaine(etat?.semaine);
  const enRetard = jalonEnRetard(valide, s, semaineActuelle);
  const etatFinal: JalonEtat = valide ? 'VALIDE' : s != null ? 'SEMAINE' : 'EN_ATTENTE';
  return {
    code: catalogue.code,
    titre: catalogue.libelle,
    etat: etatFinal,
    etatLibelle: etatFinal === 'VALIDE' ? 'Validé' : 'En attente',
    semaine: s,
    enRetard,
  };
}

/**
 * Tous les jalons d'une carte, dans l'ordre du catalogue. Le catalogue fait foi :
 * un code qu'une carte n'a pas encore en base est lu « En attente », ce qui évite
 * tout remplissage retroactif quand un jalon est ajouté au catalogue.
 */
export function getJalonsCard(
  card: CardItem,
  catalogue: JalonCatalogue[],
  semaineActuelle = getSemaineISO()
): JalonInfo[] {
  return catalogue.map((j) => getJalonInfo(j, getEtatJalon(card, j.code), semaineActuelle));
}

/** Jalons non validés dont la semaine est dépassée. */
export function getJalonsEnRetard(
  card: CardItem,
  catalogue: JalonCatalogue[],
  semaineActuelle = getSemaineISO()
): JalonInfo[] {
  return getJalonsCard(card, catalogue, semaineActuelle).filter((j) => j.enRetard);
}
