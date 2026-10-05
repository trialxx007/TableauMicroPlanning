export interface ChaineSlotCard {
  cardId?: string; // ID de la carte liée (ex: 'CRD-001')
  customLabel?: string; // Si saisie manuelle libre
  dateExpedition?: string; // Utile pour la colonne Expédition
  statutExpedition?: 'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE';
}

export interface ChaineRow {
  id: string;
  categorieId: 'BRODERIE_MAIN' | 'CONFECTION' | string;
  nom: string;
  dotColor: string;
  // Modèle en cours (carte liée)
  modeleEnCoursCard?: ChaineSlotCard;
  // Objectif et réalisation (propres à la ligne)
  objectifJour: number | string;
  realisationJour: number | string;
  remarque: string;
  // 5 Prochains Lancements (chacun peut contenir une carte du point journalier)
  prochainsLancementsCards: [
    ChaineSlotCard | null,
    ChaineSlotCard | null,
    ChaineSlotCard | null,
    ChaineSlotCard | null,
    ChaineSlotCard | null
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
