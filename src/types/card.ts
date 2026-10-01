export type CardStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';

export type OFType = 'INTERNE' | 'SOUS_TRAITANCE';

export interface SousOrdreFabrication {
  id: string;
  codeSousOF: string; // ex: 'OF1.1'
  titre: string; // Titre ou nom personnalisé (ex: 'Sous-OF 1.1', 'Taille 38 - Bleu', 'Broderie Devant')
  type?: OFType;
  nomExecutant?: string;
  quantiteDemandee: number;
  quantiteFinie: number;
  statut: CardStatus;
  nbCases: number; // Option sélectionnée de 3 à 5 cases
  casesEnCours: number[]; // Nombres des en cours de prod remplis manuellement
  casesLabels?: string[]; // Libellés des cases (ex: ['Poste 1', 'Poste 2', 'Poste 3'])
  notes?: string;
}

export interface OrdreFabrication {
  id: string;
  codeOF: string; // ex: OF1, OF2, OF3
  titre?: string; // Nom personnalisé de l'OF (ex: 'OF1', 'Veste Principale', etc. par défaut codeOF)
  ordreRDL: number; // Ordre de passage / priorité déterminé durant la RDL
  type: OFType; // Interne (Atelier de l'entreprise) ou Sous-traitance (en dehors de l'entreprise)
  nomExecutant: string; // 'Atelier Interne' ou nom du sous-traitant (ex: 'Atelier Duval', 'Couture Marigny')
  quantiteDemandee: number;
  quantiteFinie: number;
  resteAProduire: number;
  statut: CardStatus;
  notes?: string;
  // Sous-OFs personnalisés
  sousOfs?: SousOrdreFabrication[];
  // Si l'OF n'a pas de sous-OF, présentation identique avec ses propres cases :
  nbCases?: number; // 3 à 5 cases
  casesEnCours?: number[]; // Nombres des en cours de prod remplis manuellement
  casesLabels?: string[];
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
  chaineId?: string; // ID de la chaîne de production (ex: 'bm-glaieul', 'conf-tan')
  chaineNom?: string; // Nom de la chaîne en charge de traiter la carte (ex: 'Glaïeul', 'Tan')
  chaineCategorie?: string; // 'BRODERIE_MAIN' ou 'CONFECTION'
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
  chaineId?: string;
  chaineNom?: string;
  chaineCategorie?: string;
};
