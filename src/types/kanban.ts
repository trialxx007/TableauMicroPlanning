/** Identifiant d'une couleur de post-it = catégorie de la tâche. */
export type KanbanCouleurId = 'blanc' | 'jaune' | 'vert' | 'bleu';

/**
 * Palette fermée de post-its : chaque couleur porte une catégorie métier.
 * Les classes Tailwind sont écrites ici en dur pour que le scan du build les
 * inclue, même si la couleur est choisie dans le navigateur. `fond`/`bordure`
 * habillent la carte, `point` la pastille de la colonne.
 */
export const KANBAN_COULEURS: Record<
  KanbanCouleurId,
  { label: string; point: string; fond: string; bordure: string }
> = {
  blanc: {
    label: 'Commande client',
    point: 'bg-white ring-1 ring-slate-300',
    fond: 'bg-white',
    bordure: 'border-slate-200',
  },
  jaune: {
    label: 'RobRAK essai',
    point: 'bg-yellow-300',
    fond: 'bg-yellow-200',
    bordure: 'border-yellow-300',
  },
  vert: {
    label: 'RobRAK client',
    point: 'bg-green-400',
    fond: 'bg-green-200',
    bordure: 'border-green-300',
  },
  bleu: {
    label: 'Keep',
    point: 'bg-blue-400',
    fond: 'bg-blue-200',
    bordure: 'border-blue-300',
  },
};

export const COULEURS_KANBAN_IDS = Object.keys(KANBAN_COULEURS) as KanbanCouleurId[];

/** Côté du tableau de la section BRODERIE MAIN auquel appartient une personne. */
export type KanbanBloc = 'client' | 'initiatives';

/**
 * Personne d'une section à affectation : BRODERIE MAIN (bloc client /
 * initiatives) ou Brodeuses (bloc absent).
 */
export interface KanbanPersonne {
  id: string;
  titre: string;
  /** Côté client/initiatives ; absent pour une brodeuse. */
  bloc?: KanbanBloc;
  ordre: number;
}

/**
 * Sous-liste d'une colonne scindée : une colonne peut être coupée en 2
 * sections empilées (ex. « Punching » en haut, « PDF » en bas).
 * La section « BRODERIE MAIN » contient un tableau de personnes (`personnes`).
 */
export interface KanbanSection {
  id: string;
  titre: string;
  ordre: number;
  /** Personne d'une colonne BRODERIE MAIN (section) ; absent = section classique. */
  bloc?: KanbanBloc;
  /** Personnes de la section BRODERIE MAIN (tableau 4 colonnes). */
  personnes?: KanbanPersonne[];
}

/**
 * Colonne dédiée « BRODERIE MAIN » : rendue en tableau 4 colonnes (chaîne +
 * post-its de chaque côté) au lieu d'une liste. Détection par titre de colonne
 * (insensible casse/tirets).
 */
export function estColonneBroderie(colonne: { titre: string }): boolean {
  const t = colonne.titre.trim().toUpperCase().replace(/\s+/g, ' ');
  return t === 'BRODERIE MAIN' || t === 'BRODERIE-MAIN' || t.includes('BRODERIE MAIN');
}

/** Section « BRODERIE MAIN » : celle qui rend le tableau 4 colonnes. */
export function estSectionBroderieMain(section: { titre: string }): boolean {
  const t = section.titre.trim().toUpperCase().replace(/\s+/g, ' ');
  return t === 'BRODERIE MAIN' || t === 'BRODERIE-MAIN';
}

/** Section « Brodeuses » : tableau d'affectation par brodeuse. */
export function estSectionBrodeuse(section: { titre: string }): boolean {
  const t = section.titre.trim().toUpperCase().replace(/\s+/g, ' ');
  return t.includes('BRODEUSE');
}

/** Colonne « LABO CONFECTION » : tableau Brodeuse / Modèles. */
export function estColonneLaboConfection(colonne: { titre: string }): boolean {
  const t = colonne.titre.trim().toUpperCase().replace(/\s+/g, ' ');
  return t.includes('LABO CONFECTION');
}

/**
 * Colonne dédiée aux brodeuses (« BRODERIE MACHINE », « LABO CONFECTION »).
 * Elle peut cohabiter avec d'autres sections (dont BRODERIE MAIN).
 */
export function estColonneBrodeuse(colonne: { titre: string; sections?: { titre: string }[] }): boolean {
  const t = colonne.titre.trim().toUpperCase().replace(/\s+/g, ' ');
  return t.includes('BRODERIE MACHINE') || estColonneLaboConfection(colonne);
}

/** Une colonne du tableau kanban (type liste Trello). */
export interface KanbanColonne {
  id: string;
  titre: string;
  ordre: number;
  couleur: KanbanCouleurId;
  /** Présent = colonne scindée en sections empilées ; absent = colonne simple. */
  sections?: KanbanSection[];
}

/** Période d'attente avec date d'entrée/sortie. */
export interface KanbanAttente {
  id: string;
  libelle?: string;
  dateEntree: string;
  dateSortie?: string;
}

/** Une entrée d'historique : arrivée d'une carte dans une colonne/section. */
export interface KanbanDeplacement {
  /** Date d'arrivée au format YYYY-MM-DD. */
  date: string;
  colonneId: string;
  sectionId?: string;
  personneId?: string;
}

/** Une carte (tâche de développement) placée dans une colonne. */
export interface KanbanCarte {
  id: string;
  titre: string;
  /** Étape de la carte (ex: "En cours", "En attente", "Terminé"…). */
  etat?: string;
  /** Traiteur qui traite le modèle. */
  traiteur?: string;
  /** Nom du client pour ce modèle. */
  client?: string;
  /** Commercial associé à la carte. */
  commercial?: string;
  /** Date d'expédition au format YYYY-MM-DD ; optionnelle. */
  dateExpedition?: string;
  /** Remarques libres. */
  remarques?: string;
  couleur?: KanbanCouleurId;
  colonneId: string;
  /** Section de la colonne scindée ; absent = colonne simple (ou section 1). */
  sectionId?: string;
  /** Personne de la section BRODERIE MAIN ; absent = hors tableau 4 colonnes. */
  personneId?: string;
  /** Côté client/initiatives dans le tableau BRODERIE MAIN. */
  bloc?: KanbanBloc;
  /** Date cible (échéance) au format YYYY-MM-DD ; optionnelle. */
  date?: string;
  /** Date d'entrée dans la colonne/section actuelle (YYYY-MM-DD) pour alarme. */
  dateEntreeZone?: string;
  /** Historique des entrées dans les colonnes/sections (création incluse). */
  historiqueDeplacements?: KanbanDeplacement[];
  /** Périodes d'attente (avec date d'entrée/sortie). */
  attentes?: KanbanAttente[];
  ordre: number;
  /** Date de création au format ISO. */
  creeLe: string;
}

/** Contenu complet du tableau kanban, sérialisé dans le localStorage. */
export interface KanbanData {
  colonnes: KanbanColonne[];
  cartes: KanbanCarte[];
}
