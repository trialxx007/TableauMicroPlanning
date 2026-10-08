export type CardStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';

export type OFType = 'I' | 'O' | 'L';

export const OF_TYPES: Record<OFType, { label: string; classe: string }> = {
  I: { label: 'Initiatives', classe: 'bg-blue-50 text-blue-800 border-blue-200' },
  O: { label: 'ONY', classe: 'bg-violet-50 text-violet-800 border-violet-200' },
  L: { label: 'LOI', classe: 'bg-amber-50 text-amber-800 border-amber-200' },
};

const LEGACY_OF_TYPES: Record<string, OFType> = {
  INTERNE: 'I',
  SOUS_TRAITANCE: 'O',
};

export function normalizeOFType(type: unknown): OFType {
  if (type === 'I' || type === 'O' || type === 'L') return type;
  const legacy = typeof type === 'string' ? LEGACY_OF_TYPES[type] : undefined;
  return legacy || 'I';
}

export interface SousOrdreFabrication {
  id: string;
  codeSousOF: string;
  titre: string;
  type?: OFType;
  nomExecutant?: string;
  quantiteDemandee: number;
  quantiteFinie: number;
  statut: CardStatus;
  nbCases: number;
  casesEnCours: number[];
  casesLabels?: string[];
  notes?: string;
}

export interface OrdreFabrication {
  id: string;
  codeOF: string;
  titre?: string;
  ordreRDL: number;
  type: OFType;
  nomExecutant: string;
  quantiteDemandee: number;
  quantiteFinie: number;
  resteAProduire: number;
  statut: CardStatus;
  notes?: string;
  sousOfs?: SousOrdreFabrication[];
  nbCases?: number;
  casesEnCours?: number[];
  casesLabels?: string[];
}

export type JalonCode = string;

export type JalonCategorie = 'NOMENCLATURE' | 'STATUT';

export type TypeCarte = 'R' | 'T';

export const LIBELLE_TYPE_CARTE: Record<TypeCarte, string> = {
  R: 'Raphia',
  T: 'Tissus',
};

export interface JalonCatalogue {
  code: JalonCode;
  libelle: string;
  categorie: JalonCategorie;
  ordre: number;
}

export interface CardJalon {
  code: JalonCode;
  valide: boolean;
  semaine?: number;
  categorie?: JalonCategorie;
}

export interface CardItem {
  id: string;
  client: string;
  nom: string;
  reference: string;
  modele: string;
  typeCarte?: TypeCarte;
  jalons: CardJalon[];
  dateRdl?: string;
  okProd: boolean;
  dateOkProd?: string;
  ofs: OrdreFabrication[];
  quantiteDemandee: number;
  quantiteFinie: number;
  resteAProduire: number;
  statut: CardStatus;
  dateCreation: string;
  dateDernierPoint?: string;
  heureDernierPoint?: string;
  pointFaitAujourdhui?: boolean;
  decisionReunion?: string;
  notes?: string;
  chaineId?: string;
  chaineNom?: string;
  chaineCategorie?: string;
}

export type CardFormData = Omit<
  CardItem,
  'id' | 'resteAProduire' | 'dateCreation' | 'dateDernierPoint' | 'heureDernierPoint' | 'pointFaitAujourdhui'
> & {
  jalons?: CardJalon[];
  dateRdl?: string;
  okProd?: boolean;
  dateOkProd?: string;
  ofs?: OrdreFabrication[];
  decisionReunion?: string;
  notes?: string;
  chaineId?: string;
  chaineNom?: string;
  chaineCategorie?: string;
};