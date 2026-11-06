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

/** Statut de disponibilité d'une personne (brodeuse / patronnier / agent punching). */
export type KanbanStatutPersonne = 'RM' | 'Recup' | 'Mater' | 'Abs' | 'Conge' | 'Present';

/** Statuts proposés sous le nom d'une personne, avec leur libellé affiché. */
export const KANBAN_STATUTS_PERSONNE: { id: KanbanStatutPersonne; label: string }[] = [
  { id: 'RM', label: 'RM' },
  { id: 'Recup', label: 'Récup' },
  { id: 'Mater', label: 'C.matérnité' },
  { id: 'Abs', label: 'Abs' },
  { id: 'Conge', label: 'Congé' },
  { id: 'Present', label: 'Present(e)' },
];

/** Vrai si la valeur est un statut de personne connu. */
export function estStatutPersonne(value: unknown): value is KanbanStatutPersonne {
  return KANBAN_STATUTS_PERSONNE.some((s) => s.id === value);
}

/**
 * Personne d'une section à affectation : BRODERIE MAIN (bloc client /
 * initiatives) ou Brodeuses (bloc absent).
 */
export interface KanbanPersonne {
  id: string;
  titre: string;
  /** Côté client/initiatives ; absent pour une brodeuse. */
  bloc?: KanbanBloc;
  /** Statut de disponibilité affiché sous le nom ; absent = non renseigné. */
  statut?: KanbanStatutPersonne;
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
 * Colonne dédiée aux brodeuses (« BRODERIE MACHINE », « LABO CONFECTION »,
 * « PATRONNAGE », « PUNCHING »). Elle peut cohabiter avec d'autres sections
 * (dont BRODERIE MAIN).
 */
export function estColonneBrodeuse(colonne: { titre: string; sections?: { titre: string }[] }): boolean {
  const t = colonne.titre.trim().toUpperCase().replace(/\s+/g, ' ');
  return (
    t.includes('BRODERIE MACHINE') ||
    estColonneLaboConfection(colonne) ||
    t.includes('PATRONNAGE') ||
    t.includes('PUNCHING')
  );
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

/** Statut d'une période d'attente, contrôlé depuis la zone « ATTENTE ». */
export type KanbanAttenteStatut = 'en-cours' | 'cloture';

/** Étape enregistrée dans l'historique d'une période d'attente. */
export interface KanbanAttenteEtape {
  /** Date ISO (`YYYY-MM-DD` ou horodatage). */
  date: string;
  statut: KanbanAttenteStatut;
}

/** Période d'attente avec date d'entrée/sortie et suivi de son statut. */
export interface KanbanAttente {
  id: string;
  libelle?: string;
  dateEntree: string;
  dateSortie?: string;
  /** Absent = attente encore en cours (compatibilité avec les anciennes données). */
  statut?: KanbanAttenteStatut;
  /** Étapes successives de l'attente (en cours / clôturée). */
  historique?: KanbanAttenteEtape[];
}

/** Vrai si la période d'attente a été clôturée manuellement. */
export function estAttenteCloturee(attente: KanbanAttente): boolean {
  return attente.statut === 'cloture';
}

/** Une entrée d'historique : arrivée d'une carte dans une colonne/section. */
export interface KanbanDeplacement {
  /** Date d'arrivée au format YYYY-MM-DD. */
  date: string;
  colonneId: string;
  sectionId?: string;
  personneId?: string;
}

/** Catégorie d'une entrée du journal d'une carte. */
export type KanbanHistoriqueCategorie = 'carte' | 'attente';

/** Modification enregistrée dans le journal d'une carte. */
export interface KanbanHistoriqueEntree {
  id: string;
  /** Date ISO (`YYYY-MM-DD` ou horodatage). */
  date: string;
  categorie: KanbanHistoriqueCategorie;
  description: string;
}

/** Une carte (tâche de développement) placée dans une colonne. */
export interface KanbanCarte {
  id: string;
  titre: string;
  /** Étape de la carte (ex: "En cours", "En attente", "Terminé"…). */
  etat?: string;
  /** Description libre de la carte. */
  description?: string;
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
  /** Journal des modifications (création, édition, attentes…). */
  historique?: KanbanHistoriqueEntree[];
  /** Périodes d'attente (avec date d'entrée/sortie). */
  attentes?: KanbanAttente[];
  /** Alertes libres ajoutées depuis le popover de la carte. */
  alertes?: string[];
  ordre: number;
  /** Date de création au format ISO. */
  creeLe: string;
}

/** Contenu complet du tableau kanban, sérialisé dans le localStorage. */
export interface KanbanData {
  colonnes: KanbanColonne[];
  cartes: KanbanCarte[];
}
