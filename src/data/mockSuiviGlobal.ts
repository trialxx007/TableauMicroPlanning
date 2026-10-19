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
  { id: 'bm-glaieul', nom: 'GLAÏEUL', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-petunia', nom: 'PÉTUNIA', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-dhalia', nom: 'DHALIA', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-rose', nom: 'ROSE', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-orchidee', nom: 'ORCHIDÉE', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'bm-mimosa', nom: 'MIMOSA', categorieId: 'BRODERIE_MAIN', categorieTitre: 'Broderie Main', dotColor: '#f8b4a6' },
  { id: 'conf-tan', nom: 'TANA', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-mar', nom: 'MARGUERITE', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-pose-cuir', nom: 'POSE CUIR', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-sst', nom: 'SST', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-fen', nom: 'FEN', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-lotus', nom: 'LOTUS', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
  { id: 'conf-orchidee', nom: 'ORCHIDÉE', categorieId: 'CONFECTION', categorieTitre: 'Confection', dotColor: '#7dd3fc' },
];

/** Ligne de chaîne vide : seule la structure (id, nom, catégorie) existe, aucune
 *  case (modèle en cours, inspection, alerte, lancement, expédition) n'est remplie. */
function ligneVide(
  id: string,
  categorieId: 'BRODERIE_MAIN' | 'CONFECTION',
  nom: string,
  dotColor: string
): ChaineRow {
  return {
    id,
    categorieId,
    nom,
    dotColor,
    modeleEnCoursCards: [null, null],
    inspections: [blocInspectionVide(), blocInspectionVide()],
    prochainsLancementsCards: Array.from({ length: 5 }, () => [
      null,
      null,
    ]) as ChaineRow['prochainsLancementsCards'],
    expeditionCards: [null, null],
  };
}

/** Nouvelle chaîne créée à la main : même structure vide que les lignes initiales,
 *  la couleur de point venant du type choisi. L'id est unique et stable. */
export function nouvelleChaineVide(
  categorieId: 'BRODERIE_MAIN' | 'CONFECTION',
  nom: string
): ChaineRow {
  const id = `chaine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const dotColor = CATEGORIES_CONFIG[categorieId]?.defaultDotColor ?? '#94a3b8';
  return ligneVide(id, categorieId, nom, dotColor);
}

/** Lignes de chaînes au premier lancement : entièrement vides, sans jeu de démonstration.
 *  Les modèles en cours, inspections, lancements et expéditions se remplissent au
 *  fil des cartes réelles saisies dans le Point Commande Journalière. */
export const INITIAL_CHAINE_ROWS: ChaineRow[] = [
  ligneVide('bm-glaieul', 'BRODERIE_MAIN', 'GLAÏEUL', '#f8b4a6'),
  ligneVide('bm-petunia', 'BRODERIE_MAIN', 'PÉTUNIA', '#f8b4a6'),
  ligneVide('bm-dhalia', 'BRODERIE_MAIN', 'DHALIA', '#f8b4a6'),
  ligneVide('bm-rose', 'BRODERIE_MAIN', 'ROSE', '#f8b4a6'),
  ligneVide('bm-orchidee', 'BRODERIE_MAIN', 'ORCHIDÉE', '#f8b4a6'),
  ligneVide('bm-mimosa', 'BRODERIE_MAIN', 'MIMOSA', '#f8b4a6'),
  ligneVide('conf-tan', 'CONFECTION', 'TANA', '#7dd3fc'),
  ligneVide('conf-mar', 'CONFECTION', 'MARGUERITE', '#7dd3fc'),
  ligneVide('conf-pose-cuir', 'CONFECTION', 'POSE CUIR', '#7dd3fc'),
  ligneVide('conf-sst', 'CONFECTION', 'SST', '#7dd3fc'),
  ligneVide('conf-fen', 'CONFECTION', 'FEN', '#7dd3fc'),
  ligneVide('conf-lotus', 'CONFECTION', 'LOTUS', '#7dd3fc'),
];