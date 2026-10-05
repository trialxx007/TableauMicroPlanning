export type CardStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';

export type OFType = 'INTERNE' | 'SOUS_TRAITANCE';

/**
 * Code d'un jalon technique. Dynamique : le catalogue est alimenté par l'utilisateur,
 * il n'est plus figé à DT/TC/SMS/RDL.
 */
export type JalonCode = string;

/** Entrée du catalogue global des types de jalons, partagé par toutes les cartes. */
export interface JalonCatalogue {
  code: JalonCode;
  /** Intitulé long, affiché dans les infobulles et la légende : « Dossier Technique ». */
  libelle: string;
  /** Rang d'affichage dans la section JALONS. */
  ordre: number;
}

/**
 * État d'un jalon pour une carte donnée.
 * Trois combinaisons possibles, sans ambiguïté :
 *   valide=true                    -> VALIDE      (la semaine est ignorée)
 *   valide=false, semaine renseignée -> SEMAINE
 *   valide=false, pas de semaine     -> EN_ATTENTE
 */
export interface CardJalon {
  code: JalonCode;
  valide: boolean;
  /** Semaine ISO cible (1-53), uniquement pour l'état SEMAINE. */
  semaine?: number;
}

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
  /**
   * États des jalons techniques de la carte. Le contenu suit le catalogue global :
   * un code absent de la table est lu comme « En attente » sans échéance.
   */
  jalons: CardJalon[];
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
  jalons?: CardJalon[];
  dateRdl?: string;
  okProd?: boolean;
  dateOkProd?: string;
  ofs?: OrdreFabrication[];
  decisionReunion?: string;
  notes?: string;
};
