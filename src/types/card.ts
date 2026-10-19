export type CardStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';

/** Destination d'un OF : pays vers lequel il est expédié. */
export type DestinationOF = 'FR' | 'US' | 'ES' | 'MX';

export const OF_DESTINATIONS: {
  code: DestinationOF;
  label: string;
  classe: string;
}[] = [
  { code: 'FR', label: 'France', classe: 'bg-blue-50 text-blue-800 border-blue-200' },
  { code: 'US', label: 'États-Unis', classe: 'bg-violet-50 text-violet-800 border-violet-200' },
  { code: 'ES', label: 'Espagne', classe: 'bg-amber-50 text-amber-800 border-amber-200' },
  { code: 'MX', label: 'Mexique', classe: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
];

export type OFType = 'I' | 'O' | 'L' | 'BDA';

export const OF_TYPES: Record<OFType, { label: string; classe: string }> = {
  I: { label: 'Initiatives', classe: 'bg-blue-50 text-blue-800 border-blue-200' },
  O: { label: 'ONY', classe: 'bg-violet-50 text-violet-800 border-violet-200' },
  L: { label: 'LOI', classe: 'bg-amber-50 text-amber-800 border-amber-200' },
  BDA: { label: 'BDA', classe: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
};

const LEGACY_OF_TYPES: Record<string, OFType> = {
  INTERNE: 'I',
  SOUS_TRAITANCE: 'O',
};

export function normalizeOFType(type: unknown): OFType {
  if (type === 'I' || type === 'O' || type === 'L' || type === 'BDA') return type;
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
  /** Destination (pays) de l'OF : FR, US, ES, MX… */
  destination?: DestinationOF;
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
  /**
   * Semaine de fin (nomenclature R uniquement) : la plage [semaine, semaineFin]
   * borne la marge. La pastille passe en orange dans cette plage, au rouge
   * au-delà. Sans elle, la semaine n'a pas de marge.
   */
  semaineFin?: number;
  /** Échéance calendaire (ISO `AAAA-MM-JJ`), alternative à `semaine`. */
  date?: string;
  /** Échéance non encore confirmée (« to be confirmed »). */
  tbc?: boolean;
  categorie?: JalonCategorie;
  /** Date/heure à laquelle ce jalon est passé à l'état validé (historique). */
  valideLe?: string;
}

export interface CardItem {
  id: string;
  client: string;
  batch: string;
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