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
    label: 'Demande client',
    point: 'bg-white ring-1 ring-slate-300',
    fond: 'bg-white',
    bordure: 'border-slate-200',
  },
  jaune: {
    label: 'Robrak essai',
    point: 'bg-yellow-300',
    fond: 'bg-yellow-200',
    bordure: 'border-yellow-300',
  },
  vert: {
    label: 'Robrak essai validé',
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

/** Personne dans la section « BRODERIE MAIN » (tableau 4 colonnes). */
export interface KanbanPersonne {
  id: string;
  titre: string;
  bloc: KanbanBloc;
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
 * Colonne spéciale « BRODERIE MAIN » (sous « Broderie Machine ») : rendue en
 * tableau 4 colonnes (chaîne + post-its de chaque côté) au lieu d'une liste.
 * Détection par titre de colonne (exact, insensible casse/tirets).
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

/** Une colonne du tableau kanban (type liste Trello). */
export interface KanbanColonne {
  id: string;
  titre: string;
  ordre: number;
  couleur: KanbanCouleurId;
  /** Présent = colonne scindée en sections empilées ; absent = colonne simple. */
  sections?: KanbanSection[];
}

/** Une carte (tâche de développement) placée dans une colonne. */
export interface KanbanCarte {
  id: string;
  titre: string;
  /** État de la carte (ex: "En cours", "En attente", "Terminé"…). */
  etat?: string;
  /** Traiteur qui traite le modèle. */
  traiteur?: string;
  /** Nom du client pour ce modèle. */
  client?: string;
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
  ordre: number;
  /** Date de création au format ISO. */
  creeLe: string;
}

/** Contenu complet du tableau kanban, sérialisé dans le localStorage. */
export interface KanbanData {
  colonnes: KanbanColonne[];
  cartes: KanbanCarte[];
}
