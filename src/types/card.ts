export type CardStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';

export type OFType = 'INTERNE' | 'SOUS_TRAITANCE';

export interface OrdreFabrication {
  id: string;
  codeOF: string; // ex: OF1, OF2, OF3
  ordreRDL: number; // Ordre de passage / priorité déterminé durant la RDL
  type: OFType; // Interne (Atelier de l'entreprise) ou Sous-traitance (en dehors de l'entreprise)
  nomExecutant: string; // 'Atelier Interne' ou nom du sous-traitant (ex: 'Atelier Duval', 'Couture Marigny')
  quantiteDemandee: number;
  quantiteFinie: number;
  resteAProduire: number;
  statut: CardStatus;
  notes?: string;
}

export interface CardItem {
  id: string;
  client: string;
  nom: string;
  reference: string; // Référence modèle / commande
  modele: string;
  dt: boolean; // Dossier Technique
  tc: boolean; // Type Conforme
  sms: boolean; // Sales Man's Sample
  rdl?: boolean; // Réunion De Lancement
  dateRdl?: string;
  okProd: boolean; // Accord OK Prod avant ventilation et lancement des OF
  dateOkProd?: string;
  ofs: OrdreFabrication[]; // Les OFs découpés entre interne et sous-traitants
  quantiteDemandee: number;
  quantiteFinie: number;
  resteAProduire: number;
  statut: CardStatus;
  dateCreation: string; // Format JJ/MM/AAAA
  dateDernierPoint?: string; // Date du dernier point réunion
  heureDernierPoint?: string; // Heure du point
  pointFaitAujourdhui?: boolean; // Carte passée en revue aujourd'hui
  decisionReunion?: string; // Décision ou action actée en réunion
  notes?: string;
}

export type CardFormData = Omit<
  CardItem,
  'id' | 'resteAProduire' | 'dateCreation' | 'dateDernierPoint' | 'heureDernierPoint' | 'pointFaitAujourdhui'
> & {
  rdl?: boolean;
  dateRdl?: string;
  okProd?: boolean;
  dateOkProd?: string;
  ofs?: OrdreFabrication[];
  decisionReunion?: string;
  notes?: string;
};
