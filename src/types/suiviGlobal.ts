export interface ChaineSlotCard {
  cardId?: string; // ID de la carte liée (ex: 'CRD-001')
  customLabel?: string; // Si saisie manuelle libre
  dateExpedition?: string; // Utile pour la colonne Expédition
  statutExpedition?: 'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE';
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

/** Une valeur ajoutée dans la colonne Inspection : `I 50% : 06/10 Pass` ou `OF1 : 06/10 Fail`. */
export interface InspectionValeur {
  id: string;
  type: 'I' | 'OF';
  pct?: 50 | 100;
  date: string;
  resultat: 'P' | 'F' | null;
}

/** Bloc d'inspection : valeurs OF / I à 50-100 % et commentaire. */
export interface InspectionBloc {
  valeurs: InspectionValeur[];
  commentaire: string;
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
  // 5 Prochains Lancements (chacun peut contenir 2 cartes empilées)
  prochainsLancementsCards: [
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null],
    [ChaineSlotCard | null, ChaineSlotCard | null]
  ];
  // Nouvelle colonne Expédition après Prochains Lancements (carte liée)
  expeditionCard?: ChaineSlotCard | null;
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
