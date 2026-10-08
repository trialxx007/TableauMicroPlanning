import { ChaineRow, CategorieConfig } from '../types/suiviGlobal.ts';
import { blocInspectionVide } from '../utils/inspections.ts';

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
    textColor: '#881337',
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
    textColor: '#0369a1',
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
  { id: 'bm-glaieul', nom: 'Glaïeul', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-petunia', nom: 'Pétunia', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-dhalia', nom: 'Dhalia', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-rose', nom: 'Rose', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-orchidee', nom: 'Orchidée', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-mimosa', nom: 'Mimosa', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'conf-tan', nom: 'Tan', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-mar', nom: 'Mar', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-bleu', nom: 'Bleu', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-fen', nom: 'Fen', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-lotus', nom: 'Lotus', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-orchidee', nom: 'Orchidée', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
];

export const INITIAL_CHAINE_ROWS: ChaineRow[] = [
  // --- BRODERIE MAIN ---
  {
    id: 'bm-glaieul',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Glaïeul',
    dotColor: '#f8b4a6',
    modeleEnCoursCards: [{ cardId: 'CRD-001', customLabel: 'Robe Soirée Haute Couture' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Broderie col et poignets en cours',
    prochainsLancementsCards: [
      [{ cardId: 'CRD-003', customLabel: 'Veste Tweed Broderie Perles' }, null],
      [{ customLabel: 'Jupe Plissée Soie' }, null],
      [{ customLabel: 'Top Organza Brodé' }, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: { cardId: 'CRD-001', dateExpedition: '05/10/2026', statutExpedition: 'A_EXPEDIER' },
  },
  {
    id: 'bm-petunia',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Pétunia',
    dotColor: '#f8b4a6',
    modeleEnCoursCards: [{ cardId: 'CRD-003', customLabel: 'Veste Tweed Broderie Perles' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: '',
    prochainsLancementsCards: [
      [null, null],
      [null, null],
      [{ customLabel: 'Blouse Lin Brodé' }, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: null,
  },
  {
    id: 'bm-dhalia',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Dhalia',
    dotColor: '#f8b4a6',
    modeleEnCoursCards: [{ customLabel: 'Jupon Étoile Volants' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Bonne cadence, fin prévue 16h',
    prochainsLancementsCards: [
      [{ customLabel: 'Chemisier Brodé Coton' }, null],
      [{ cardId: 'CRD-005', customLabel: 'Robe Dentelle Fête' }, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: { customLabel: 'Lot Jupons 50 pcs', dateExpedition: '02/10/2026', statutExpedition: 'A_EXPEDIER' },
  },
  {
    id: 'bm-lotus',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Lotus',
    dotColor: '#f8b4a6',
    modeleEnCoursCards: [{ customLabel: 'Chemisier Soie Brodé Main' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Attente fils dorés',
    prochainsLancementsCards: [
      [null, null],
      [{ customLabel: 'Robe Mariée Broderie Perles' }, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: null,
  },
  {
    id: 'bm-orchidee',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Orchidée',
    dotColor: '#f8b4a6',
    modeleEnCoursCards: [{ cardId: 'CRD-004', customLabel: 'Chemisier Soie Lavallière' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Cadence nominale atteinte',
    prochainsLancementsCards: [
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: null,
  },
  {
    id: 'bm-mimosa',
    categorieId: 'BRODERIE_MAIN',
    nom: 'Mimosa',
    dotColor: '#f8b4a6',
    modeleEnCoursCards: [{ customLabel: 'Écharpe Broderie Florale' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'OF interne bientôt soldé',
    prochainsLancementsCards: [
      [{ customLabel: 'Tablier Technique Brodé' }, null],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: { customLabel: 'Étole Brodée 60 pcs', dateExpedition: '01/10/2026', statutExpedition: 'EN_TRANSIT' },
  },

  // --- CONFECTION ---
  {
    id: 'conf-tan',
    categorieId: 'CONFECTION',
    nom: 'Tan',
    dotColor: '#7dd3fc',
    modeleEnCoursCards: [{ cardId: 'CRD-005', customLabel: 'Pantalon Gabardine Laine' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Montage ceintures et fermetures',
    prochainsLancementsCards: [
      [{ cardId: 'CRD-002', customLabel: 'Manteau Cachemire Double-Face' }, null],
      [{ customLabel: 'Bermuda Crêpe' }, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: { cardId: 'CRD-005', dateExpedition: '06/10/2026', statutExpedition: 'A_EXPEDIER' },
  },
  {
    id: 'conf-mar',
    categorieId: 'CONFECTION',
    nom: 'Mar',
    dotColor: '#7dd3fc',
    modeleEnCoursCards: [{ cardId: 'CRD-002', customLabel: 'Manteau Cachemire Double-Face' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Assemblage col et manchettes OK',
    prochainsLancementsCards: [
      [{ cardId: 'CRD-002', customLabel: 'Chemise Travail' }, null],
      [{ customLabel: 'Veste Softshell' }, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: null,
  },
  {
    id: 'conf-fen',
    categorieId: 'CONFECTION',
    nom: 'Fen',
    dotColor: '#7dd3fc',
    modeleEnCoursCards: [{ cardId: 'CRD-001' }, null],
    inspections: [blocInspectionVide(''), blocInspectionVide('')],
    alerte: 'Réglage machine ourlet invisible',
    prochainsLancementsCards: [
      [{ customLabel: 'Veste Costume Homme' }, null],
      [{ customLabel: 'Pantalon Chino Homme' }, null],
      [null, null],
      [null, null],
      [null, null],
    ],
    expeditionCard: null,
  },
];
