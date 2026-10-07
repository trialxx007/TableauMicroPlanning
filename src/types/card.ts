export type CardStatus = 'EN_ATTENTE' | 'EN_COURS' | 'TERMINE' | 'BLOQUE';

export type OFType = 'INTERNE' | 'SOUS_TRAITANCE';

/**
 * Code d'un jalon technique. Dynamique : le catalogue est alimenté par l'utilisateur,
 * il n'est plus figé à DT/TC/SMS/RDL.
 */
export type JalonCode = string;

/**
 * Grandeur d'un jalon. Elle décide de la couleur de la pastille, pas de son état :
 *   NOMENCLATURE — vert : le jalon nomme la pièce et sa conformité (DT, TC, R, A…).
 *   STATUT       — bleu : le jalon décrit l'avancement du dossier (RDL, FT…).
 * L'état (validé / semaine / en attente) reste porté par la marque et l'alerte de
 * retard, pour que la couleur soit stable d'une ligne à l'autre.
 */
export type JalonCategorie = 'NOMENCLATURE' | 'STATUT';

/**
 * Nature de matière d'une carte. Elle décide du jeu de nomenclatures qui lui
 * est propre : le Raphia porte R, AC, AF et AI, les Tissus AI, AF et AC.
 * Les statuts (RDL, FT, TC, DT) sont communs aux deux.
 */
export type TypeCarte = 'R' | 'T';

/** Libellés des deux natures de matière, pour les sélecteurs. */
export const LIBELLE_TYPE_CARTE: Record<TypeCarte, string> = {
  R: 'Raphia',
  T: 'Tissus',
};

/** Entrée du catalogue global des types de jalons, partagé par toutes les cartes. */
export interface JalonCatalogue {
  code: JalonCode;
  /** Intitulé long, affiché dans les infobulles et la légende : « Dossier Technique ». */
  libelle: string;
  /** Grandeur du jalon : vert pour une nomenclature, bleu pour un statut. */
  categorie: JalonCategorie;
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
  /**
   * Grandeur du jalon, envoyée uniquement à la création d'une carte : le code
   * n'existe pas encore au catalogue, sa grandeur n'a donc pas pu être stockée.
   * Le catalogue fait foi ensuite, ce champ n'est plus relu.
   */
  categorie?: JalonCategorie;
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
   * Nature de matière de la carte (R = Raphia, T = Tissus). Elle détermine le jeu
   * de nomenclatures proposé à la création. Absente sur les cartes antérieures :
   * elles sont alors lues comme Raphia, le type le plus courant.
   */
  typeCarte?: TypeCarte;
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
