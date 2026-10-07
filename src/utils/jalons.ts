import type {
  CardItem,
  CardJalon,
  JalonCategorie,
  JalonCode,
  JalonCatalogue,
} from '../types/card.ts';
import { getSemaineISO } from './dateFrance.ts';
import { CATALOGUE_INITIAL, categorieParCode } from '../data/mockJalons.ts';

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
  /** Grandeur du jalon : vert pour une nomenclature, bleu pour un statut. */
  categorie: JalonCategorie;
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
    categorie: catalogue.categorie ?? categorieParCode(catalogue.code),
    etat: etatFinal,
    etatLibelle: etatFinal === 'VALIDE' ? 'Validé' : 'En attente',
    semaine: s,
    enRetard,
  };
}

/* ------------------------------------------------------------------ regroupement */

/**
 * Ordre d'affichage des grandeurs : les nomenclatures d'abord, puis les statuts.
 * C'est la seule règle qui compte — le rang du catalogue ne sert plus qu'à
 * ordonner les jalons à l'intérieur d'une même grandeur.
 */
export const ORDRE_CATEGORIES: readonly JalonCategorie[] = ['NOMENCLATURE', 'STATUT'];

/** Position d'une grandeur dans l'ordre d'affichage ; inconnu passe en fin de liste. */
export function rangCategorie(categorie: JalonCategorie): number {
  const index = ORDRE_CATEGORIES.indexOf(categorie);
  return index === -1 ? ORDRE_CATEGORIES.length : index;
}

/**
 * Catalogue reclassé par grandeur : tous les jalons d'une même catégorie se suivent.
 * L'ordre du catalogue est conservé à l'intérieur de chaque groupe.
 */
export function trierParCategorie(catalogue: JalonCatalogue[]): JalonCatalogue[] {
  return [...catalogue].sort(
    (a, b) =>
      rangCategorie(a.categorie) - rangCategorie(b.categorie) ||
      a.ordre - b.ordre ||
      a.code.localeCompare(b.code)
  );
}

/**
 * Rangs d'affichage (code -> position) d'un catalogue reclassé. Les trois vues —
 * tableau des cartes, fiche et suivi global — s'en servent pour s'aligner sur le
 * même ordre, avec les mêmes groupes.
 */
export function rangsParCategorie(catalogue: JalonCatalogue[]): Map<JalonCode, number> {
  return new Map(trierParCategorie(catalogue).map((j, i) => [j.code, i]));
}

/** Un groupe de jalons de même grandeur, prêt à être rendu avec son intitulé. */
export interface GroupeJalons {
  categorie: JalonCategorie;
  jalons: JalonCatalogue[];
}

/**
 * Catalogue découpé en groupes contigus, dans l'ordre d'affichage. Les groupes
 * vides sont écartés : une carte qui ne porte que des statuts n'affiche pas un
 * intitulé « Nomenclature » suivi de rien.
 */
export function groupesParCategorie(catalogue: JalonCatalogue[]): GroupeJalons[] {
  const groupes: GroupeJalons[] = [];
  for (const jalon of trierParCategorie(catalogue)) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.categorie === jalon.categorie) dernier.jalons.push(jalon);
    else groupes.push({ categorie: jalon.categorie, jalons: [jalon] });
  }
  return groupes;
}

/**
 * Les jalons d'une carte, dans l'ordre du catalogue partagé. La carte fait foi :
 * seuls les codes qu'elle porte sont affichés, un jalon ajouté sur une autre carte
 * n'apparaît pas ici. Un code absent du catalogue est affiché tel quel plutôt que
 * masqué, pour qu'une définition en retard n'efface pas l'information.
 */
export function getJalonsCard(
  card: CardItem,
  catalogue: JalonCatalogue[],
  semaineActuelle = getSemaineISO()
): JalonInfo[] {
  const parCode = new Map(catalogue.map((j) => [j.code, j]));
  const rang = rangsParCategorie(catalogue);
  return (card.jalons ?? [])
    .map((j) => {
      const entree = parCode.get(j.code);
      return getJalonInfo(
        entree ?? {
          code: j.code,
          libelle: j.code,
          categorie: categorieParCode(j.code),
          ordre: 0,
        },
        j,
        semaineActuelle
      );
    })
    .sort((a, b) => (rang.get(a.code) ?? 999) - (rang.get(b.code) ?? 999));
}

/** Jalons non validés dont la semaine est dépassée, parmi ceux que la carte porte. */
export function getJalonsEnRetard(
  card: CardItem,
  catalogue: JalonCatalogue[],
  semaineActuelle = getSemaineISO()
): JalonInfo[] {
  return getJalonsCard(card, catalogue, semaineActuelle).filter((j) => j.enRetard);
}

/** Marque courte d'un jalon, Stable en largeur : « ✓ », « S40 » ou « — ». */
export function marqueJalon(j: JalonInfo): string {
  if (j.etat === 'VALIDE') return '✓';
  if (j.etat === 'SEMAINE') return `S${j.semaine}`;
  return '—';
}

/** Phrase d'infobulle d'un jalon : « DT (Dossier Technique) : Semaine S22 — en retard ». */
export function detailJalon(j: JalonInfo): string {
  const etat =
    j.etat === 'VALIDE'
      ? 'Validé'
      : j.etat === 'SEMAINE'
      ? `Semaine S${j.semaine}${j.enRetard ? ' — en retard' : ''}`
      : 'En attente';
  return `${j.code} (${j.titre}) : ${etat}`;
}

/* ------------------------------------------------------------------ couleurs */

interface Teinte {
  /** Fond de la pastille. */
  fond: string;
  /** Texte posé SUR le fond : il doit rester lisible dessus. */
  texte: string;
  /** Contour de la pastille. */
  bordure: string;
  /**
   * Texte posé sur un fond blanc — les contrôles de la fiche, qui sont blancs
   * quelle que soit la couleur de la pastille derrière eux. Il diffère de `texte`
   * parce qu'un jalon validé a un fond plein : son texte y est blanc.
   */
  controle: string;
}

/**
 * Couleur d'une pastille de jalon. La teinte vient de la grandeur du jalon — vert
 * pour une nomenclature, bleu pour un statut — et l'avancement ne change que la
 * nuance : fond plein une fois validé, teinté quand la semaine est posée, contour
 * pointillé en attendant. Source unique, partagée par la carte, la fiche et le
 * suivi global, pour que le même jalon soit de la même couleur partout.
 */
const TEINTES: Record<
  JalonCategorie,
  { valide: Teinte; planifie: Teinte; attente: Teinte }
> = {
  NOMENCLATURE: {
    valide: {
      fond: 'bg-emerald-600',
      texte: 'text-white',
      bordure: 'border-emerald-700',
      controle: 'text-emerald-800',
    },
    planifie: {
      fond: 'bg-emerald-100',
      texte: 'text-emerald-800',
      bordure: 'border-emerald-300',
      controle: 'text-emerald-800',
    },
    attente: {
      fond: 'bg-white',
      texte: 'text-emerald-600',
      bordure: 'border-dashed border-emerald-300',
      controle: 'text-emerald-600',
    },
  },
  STATUT: {
    valide: {
      fond: 'bg-blue-600',
      texte: 'text-white',
      bordure: 'border-blue-700',
      controle: 'text-blue-800',
    },
    planifie: {
      fond: 'bg-blue-100',
      texte: 'text-blue-800',
      bordure: 'border-blue-300',
      controle: 'text-blue-800',
    },
    attente: {
      fond: 'bg-white',
      texte: 'text-blue-600',
      bordure: 'border-dashed border-blue-300',
      controle: 'text-blue-600',
    },
  },
};

/** Le rouge d'alerte prime sur la grandeur : un jalon en retard doit sauter aux yeux. */
const RETARD: Teinte = {
  fond: 'bg-rose-600',
  texte: 'text-white',
  bordure: 'border-rose-700',
  controle: 'text-rose-800',
};

export interface JalonTheme extends Teinte {
  /** Fond, texte et bordure réunis : à poser tel quel sur la pastille. */
  pastille: string;
}

/** Theme d'un jalon pour l'affichage, à partir de sa grandeur et de son avancement. */
export function themeJalon(j: JalonInfo): JalonTheme {
  const teintes = TEINTES[j.categorie] ?? TEINTES.STATUT;
  const base = j.enRetard
    ? RETARD
    : j.etat === 'VALIDE'
    ? teintes.valide
    : j.etat === 'SEMAINE'
    ? teintes.planifie
    : teintes.attente;
  return { ...base, pastille: `${base.fond} ${base.texte} ${base.bordure}` };
}

/** Libellé lisible d'une grandeur, pour les légendes et les infobulles. */
export function libelleCategorie(categorie: JalonCategorie): string {
  return categorie === 'NOMENCLATURE' ? 'Nomenclature' : 'Statut';
}

/**
 * Intitulé de groupe, au pluriel pour les nomenclatures : c'est le titre affiché
 * au-dessus des jalons d'une même grandeur, à la place d'un « Jalons » unique qui
 * ne rendait compte d'aucun classement.
 */
export function titreCategorie(categorie: JalonCategorie): string {
  return categorie === 'NOMENCLATURE' ? 'Nomenclatures' : 'Statut';
}
