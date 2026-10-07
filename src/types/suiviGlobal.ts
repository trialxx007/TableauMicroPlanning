export interface ChaineSlotCard {
  cardId?: string; // ID de la carte liée (ex: 'CRD-001')
  customLabel?: string; // Si saisie manuelle libre
  dateExpedition?: string; // Utile pour la colonne Expédition
  statutExpedition?: 'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE';
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
