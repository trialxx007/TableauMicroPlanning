import { ChaineRow, CategorieConfig } from '../types/suiviGlobal.ts';

export const CATEGORIES_CONFIG: Record<string, CategorieConfig> = {
  BRODERIE_MAIN: {
    id: 'BRODERIE_MAIN',
    titre: 'BRODERIE MAIN',
    titreVerticalLignes: [
      ['B', 'R', 'O', 'D', 'E', 'R', 'I', 'E'],
      ['M', 'A', 'I', 'N'],
    ],
    bgClass: 'bg-[#fbe7e2]',
    borderClass: 'border-[#f6c2b7]',
    textClass: 'text-[#881337]',
    defaultDotColor: '#f8b4a6',
  },
  CONFECTION: {
    id: 'CONFECTION',
    titre: 'CONFECTION',
    titreVerticalLignes: [
      ['C', 'O', 'N', 'F', 'E', 'C', 'T', 'I', 'O', 'N'],
    ],
    bgClass: 'bg-[#e0f2fe]',
    borderClass: 'border-[#bae6fd]',
    textClass: 'text-[#0369a1]',
    defaultDotColor: '#7dd3fc',
  },
};

export interface ChaineOption {
  id: string;
  nom: string;
  categorieId: 'BRODERIE_MAIN' | 'CONFECTION';
  categorieTitre: string;
  dotColor: string;
}

export const PRODUCTION_CHAINS: ChaineOption[] = [
  // Broderie Main
  { id: 'bm-glaieul', nom: 'Glaïeul', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-petunia', nom: 'Pétunia', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-dhalia', nom: 'Dhalia', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-rose', nom: 'Rose', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-orchidee', nom: 'Orchidée', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-mimosa', nom: 'Mimosa', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  // Confection
  { id: 'conf-tan', nom: 'Tan', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-mar', nom: 'Mar', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-bleu', nom: 'Bleu', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
];

// RÈGLE MÉTIER STRICTE :
// - Seules les cartes avec OK Prod validé (CRD-001, CRD-002, CRD-003, CRD-005) sont en "Modèle en cours"
// - Toutes les cartes en attente d'OK Prod (CRD-004, CRD-006, CRD-007, CRD-008, CRD-009, CRD-010) sont strictement en "PROCHAINS LANCEMENTS"
export const INITIAL_CHAINE_ROWS: ChaineRow[] = [
  // --- BRODERIE MAIN ---
  {
    id: 'bm-glaieul',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Glaïeul',
    dotColor: '#f8b4a6',
    modeleEnCoursCard: { cardId: 'CRD-001', customLabel: 'Robe Soirée Haute Couture' },
    objectifJour: 45,
    realisationJour: 42,
    remarque: 'Broderie col et poignets en cours',
    prochainsLancementsCards: [
      { cardId: 'CRD-004', customLabel: 'Veste Smoking Col Satin' },
      { cardId: 'CRD-007', customLabel: 'Jupon Étoile Volants' },
      null,
      null,
      null,
    ],
    expeditionCard: { cardId: 'CRD-001', dateExpedition: '05/10/2026', statutExpedition: 'A_EXPEDIER' },
  },
  {
    id: 'bm-petunia',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Pétunia',
    dotColor: '#f8b4a6',
    modeleEnCoursCard: { cardId: 'CRD-003', customLabel: 'Veste Iconique 4 Poches' },
    objectifJour: 30,
    realisationJour: 28,
    remarque: 'Attente complément perles dorées',
    prochainsLancementsCards: [
      { cardId: 'CRD-006', customLabel: 'Blouson Oversize Couture' },
      { cardId: 'CRD-008', customLabel: 'Top Dentelle Haute Couture' },
      null,
      null,
      null,
    ],
    expeditionCard: null,
  },
  {
    id: 'bm-dhalia',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Dhalia',
    dotColor: '#f8b4a6',
    modeleEnCoursCard: undefined,
    objectifJour: 50,
    realisationJour: 51,
    remarque: 'Bonne cadence, fin prévue 16h',
    prochainsLancementsCards: [
      { cardId: 'CRD-007', customLabel: 'Jupon Étoile Volants' },
      { cardId: 'CRD-009', customLabel: 'Écharpe Broderie Florale' },
      null,
      null,
      null,
    ],
    expeditionCard: { customLabel: 'Lot Jupons 50 pcs', dateExpedition: '02/10/2026', statutExpedition: 'A_EXPEDIER' },
  },
  {
    id: 'bm-rose',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Rose',
    dotColor: '#f8b4a6',
    modeleEnCoursCard: undefined,
    objectifJour: 40,
    realisationJour: 36,
    remarque: 'Fil lurex délicat - contrôle 100%',
    prochainsLancementsCards: [
      { cardId: 'CRD-008', customLabel: 'Top Dentelle Haute Couture' },
      { cardId: 'CRD-010', customLabel: 'Jupe Plissée Soleil' },
      null,
      null,
      null,
    ],
    expeditionCard: null,
  },
  {
    id: 'bm-orchidee',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Orchidée',
    dotColor: '#f8b4a6',
    modeleEnCoursCard: undefined,
    objectifJour: 35,
    realisationJour: 35,
    remarque: 'Cadence nominale atteinte',
    prochainsLancementsCards: [
      { cardId: 'CRD-004', customLabel: 'Veste Smoking Col Satin' },
      { cardId: 'CRD-006', customLabel: 'Blouson Oversize Couture' },
      null,
      null,
      null,
    ],
    expeditionCard: null,
  },
  {
    id: 'bm-mimosa',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Mimosa',
    dotColor: '#f8b4a6',
    modeleEnCoursCard: undefined,
    objectifJour: 60,
    realisationJour: 58,
    remarque: 'OF interne bientôt soldé',
    prochainsLancementsCards: [
      { cardId: 'CRD-009', customLabel: 'Écharpe Broderie Florale' },
      { cardId: 'CRD-007', customLabel: 'Jupon Étoile Volants' },
      null,
      null,
      null,
    ],
    expeditionCard: { customLabel: 'Étole Brodée 60 pcs', dateExpedition: '01/10/2026', statutExpedition: 'EN_TRANSIT' },
  },

  // --- CONFECTION ---
  {
    id: 'conf-tan',
    categorieId: 'CONFECTION',
    nom: 'Tan',
    dotColor: '#7dd3fc',
    modeleEnCoursCard: { cardId: 'CRD-005', customLabel: 'Trench Croisé Ceinturé' },
    objectifJour: 80,
    realisationJour: 76,
    remarque: 'Montage ceintures et fermetures',
    prochainsLancementsCards: [
      { cardId: 'CRD-004', customLabel: 'Veste Smoking Col Satin' },
      { cardId: 'CRD-010', customLabel: 'Jupe Plissée Soleil' },
      null,
      null,
      null,
    ],
    expeditionCard: { cardId: 'CRD-005', dateExpedition: '06/10/2026', statutExpedition: 'A_EXPEDIER' },
  },
  {
    id: 'conf-mar',
    categorieId: 'CONFECTION',
    nom: 'Mar',
    dotColor: '#7dd3fc',
    modeleEnCoursCard: { cardId: 'CRD-002', customLabel: 'Manteau Cachemire Double-Face' },
    objectifJour: 90,
    realisationJour: 88,
    remarque: 'Assemblage col et manchettes OK',
    prochainsLancementsCards: [
      { cardId: 'CRD-006', customLabel: 'Blouson Oversize Couture' },
      { cardId: 'CRD-008', customLabel: 'Top Dentelle Haute Couture' },
      null,
      null,
      null,
    ],
    expeditionCard: null,
  },
  {
    id: 'conf-bleu',
    categorieId: 'CONFECTION',
    nom: 'Bleu',
    dotColor: '#7dd3fc',
    modeleEnCoursCard: undefined,
    objectifJour: 70,
    realisationJour: 68,
    remarque: 'Réglage machine ourlet invisible',
    prochainsLancementsCards: [
      { cardId: 'CRD-010', customLabel: 'Jupe Plissée Soleil' },
      { cardId: 'CRD-009', customLabel: 'Écharpe Broderie Florale' },
      null,
      null,
      null,
    ],
    expeditionCard: null,
  },
];
