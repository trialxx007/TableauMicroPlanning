import type { JalonCategorie, JalonCatalogue, TypeCarte } from '../types/card.ts';

/**
 * Catalogue de départ des types de jalons. Les nomenclatures ne sont pas
 * communes à toutes les cartes : elles dépendent du type R (Raphia) ou T (Tissus),
 * décrit par `NOMENCLATURES_PAR_TYPE`. Les statuts, eux, sont communs.
 *
 * Partagé par le premier démarrage de la base (serveur) et par le repli hors ligne
 * du client, pour qu'il n'y ait qu'une seule source de vérité.
 */
export const CATALOGUE_INITIAL: JalonCatalogue[] = [
  { code: 'DT', libelle: 'Dossier Technique', categorie: 'STATUT', ordre: 10 },
  { code: 'TC', libelle: 'Type Conforme', categorie: 'STATUT', ordre: 20 },
  { code: 'FT', libelle: 'Fiche Technique', categorie: 'STATUT', ordre: 30 },
  { code: 'RDL', libelle: 'Reunion De Lancement', categorie: 'STATUT', ordre: 40 },
];

/**
 * Nomenclatures propres à chaque nature de matière. Un code listé ici est une
 * nomenclature verte ; les 4 statuts de `CATALOGUE_INITIAL` complètent la carte.
 * L'ordre est celui d'affichage demandé : R, AC, AF, AI pour le Raphia ;
 * AI, AF, AC pour les Tissus.
 */
export const NOMENCLATURES_PAR_TYPE: Record<TypeCarte, { code: string; libelle: string }[]> = {
  R: [
    { code: 'R', libelle: 'Relevé de mesures' },
    { code: 'AC', libelle: 'Article Coupe' },
    { code: 'AF', libelle: 'Article Fini' },
    { code: 'AI', libelle: 'Articles Inclus' },
  ],
  T: [
    { code: 'AI', libelle: 'Articles Inclus' },
    { code: 'AF', libelle: 'Article Fini' },
    { code: 'AC', libelle: 'Article Coupe' },
  ],
};

/** Statuts communs aux deux natures de matière : tout en bleu, même ordre partout. */
export const STATUTS_COMMUNS: { code: string; libelle: string }[] = [
  { code: 'RDL', libelle: 'Reunion De Lancement' },
  { code: 'FT', libelle: 'Fiche Technique' },
  { code: 'TC', libelle: 'Type Conforme' },
  { code: 'DT', libelle: 'Dossier Technique' },
];

/** Catalogue complet d'une carte de ce type : statuts puis nomenclatures. */
export function cataloguePourType(type: TypeCarte): JalonCatalogue[] {
  return [
    ...STATUTS_COMMUNS.map((s, i) => ({
      code: s.code,
      libelle: s.libelle,
      categorie: 'STATUT' as JalonCategorie,
      ordre: (i + 1) * 10,
    })),
    ...NOMENCLATURES_PAR_TYPE[type].map((n, i) => ({
      code: n.code,
      libelle: n.libelle,
      categorie: 'NOMENCLATURE' as JalonCategorie,
      ordre: 100 + (i + 1) * 10,
    })),
  ];
}

/** Codes qu'une carte de ce type porte par défaut : statuts puis nomenclatures. */
export function codesPourType(type: TypeCarte): string[] {
  return cataloguePourType(type).map((j) => j.code);
}

/**
 * Grandeur déduite du code, pour les jalons saisis sans choix explicite. Un code
 * inconnu tombe par défaut en STATUT : le bleu est la valeur la plus fréquente.
 * Exportée pour la migration de base : les codes déjà saisis avant le classement
 * par grandeur doivent le retrouver sans que l'utilisateur les reprenne un à un.
 */
export const CATEGORIES_PAR_CODE: Record<string, JalonCategorie> = {
  // Nomenclatures — vert
  R: 'NOMENCLATURE',
  AC: 'NOMENCLATURE',
  AF: 'NOMENCLATURE',
  AI: 'NOMENCLATURE',
  // Statuts — bleu
  DT: 'STATUT',
  TC: 'STATUT',
  RDL: 'STATUT',
  FT: 'STATUT',
};

export function categorieParCode(code: string): JalonCategorie {
  return CATEGORIES_PAR_CODE[String(code ?? '').trim().toUpperCase()] ?? 'STATUT';
}