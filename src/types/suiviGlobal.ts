export type StatutExpedition = 'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE';

export const STATUTS_EXPEDITION: { code: StatutExpedition; label: string }[] = [
  { code: 'A_EXPEDIER', label: 'À expédier' },
  { code: 'EN_TRANSIT', label: 'En transit' },
  { code: 'LIVRE', label: 'Livré au client' },
];

/** Expédition d'un OF d'un modèle, suivie petit à petit (OF1, OF2…). */
export interface ExpeditionOF {
  /** Position de l'OF dans la carte (0 = OF1). */
  ofIndex: number;
  dateExpedition?: string;
  statutExpedition?: StatutExpedition;
}

export interface ChaineSlotCard {
  cardId?: string; // ID de la carte liée (ex: 'CRD-001')
  customLabel?: string; // Si saisie manuelle libre
  dateExpedition?: string; // Utile pour la colonne Expédition
  statutExpedition?: 'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE';
  /** Expédition OF par OF de la carte liée (colonne Expédition). */
  expeditionOfs?: ExpeditionOF[];
  /** Alertes spécifiques à cette carte dans ce slot. */
  alertes?: AlerteChamp[];
}

export interface AlerteChamp {
  texte: string;
  teinte: TeinteAlerte;
}

export type TeinteAlerte = 'rouge' | 'orange' | 'ambre' | 'bleu' | 'violet' | 'vert';

export const TEINTES_ALERTE: Record<
  TeinteAlerte,
  { nom: string; fond: string; bordure: string; pastille: string }
> = {
  rouge: { nom: 'Rouge', fond: 'bg-rose-600', bordure: 'border-rose-700', pastille: 'bg-rose-600' },
  orange: { nom: 'Orange', fond: 'bg-orange-500', bordure: 'border-orange-600', pastille: 'bg-orange-500' },
  ambre: { nom: 'Ambre', fond: 'bg-amber-500', bordure: 'border-amber-600', pastille: 'bg-amber-500' },
  bleu: { nom: 'Bleu', fond: 'bg-blue-600', bordure: 'border-blue-700', pastille: 'bg-blue-600' },
  violet: { nom: 'Violet', fond: 'bg-violet-600', bordure: 'border-violet-700', pastille: 'bg-violet-600' },
  vert: { nom: 'Vert', fond: 'bg-emerald-600', bordure: 'border-emerald-700', pastille: 'bg-emerald-600' },
};

export const TEINTE_ALERTE_DEFAUT: TeinteAlerte = 'rouge';

export function normaliserTeinteAlerte(valeur: unknown): TeinteAlerte {
  return typeof valeur === 'string' && valeur in TEINTES_ALERTE
    ? (valeur as TeinteAlerte)
    : TEINTE_ALERTE_DEFAUT;
}

/** Une valeur ajoutée dans la colonne Inspection : `I 50% : 06/10 Pass`, `OF1 : 06/10 Fail` ou `CC : Carton Check`. */
export interface InspectionValeur {
  id: string;
  type: 'I' | 'OF' | 'CC';
  pct?: 50 | 100;
  date: string;
  resultat: 'P' | 'F' | null;
  /** Date (ISO) à laquelle Pass/Fail a été choisi ; absente tant qu'aucun état. */
  dateResultat?: string;
  /** OF auquel ce contrôle d'inspection appartient (0 = OF1, 1 = OF2…). */
  ofIndex?: number;
}

/** Une modification journalisée dans l'historique d'inspection : état choisi sur un contrôle. */
export interface InspectionEvenement {
  id: string;
  /** Date (ISO) de la modification. */
  date: string;
  ofIndex: number;
  /** Rang du I dans son OF (1, 2…) ; 0 pour un CC. */
  rang: number;
  pct?: 50 | 100;
  estCC: boolean;
  resultat: 'P' | 'F' | null;
}

/** Bloc d'inspection : valeurs OF / I à 50-100 % et commentaire. */
export interface InspectionBloc {
  valeurs: InspectionValeur[];
  commentaire: string;
  /** Journal des états choisis (Pass/Fail/Non défini), du plus ancien au plus récent. */
  historique?: InspectionEvenement[];
}

export interface ChaineRow {
  id: string;
  categorieId: 'BRODERIE_MAIN' | 'CONFECTION' | string;
  nom: string;
  dotColor: string;
  // Modèles en cours : une même chaîne peut tourner plusieurs modèles à la fois
  modeleEnCoursCards: [ChaineSlotCard | null, ChaineSlotCard | null];
  // Inspection du jour par modèle (un bloc par modèle en cours)
  inspections: [InspectionBloc, InspectionBloc];
  // Alerte
  alerte?: string;
  // Alertes saisies par chaîne (nouveau format multi-champs)
  alertes?: AlerteChamp[];
  // 5 Prochains Lancements (chacun peut contenir 2 cartes empilées)
  prochainsLancementsCards: [
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null]
  ];
  // Nouvelle colonne Expédition après Prochains Lancements (pile de 2 cartes)
  expeditionCards: [ChaineSlotCard | null, ChaineSlotCard | null];
}

export interface CategorieConfig {
  id: string;
  titre: string;
  titreVerticalLignes: string[][];
  bgClass: string;
  borderClass: string;
  textClass: string;
  textColor: string;
  defaultDotColor: string;
}
