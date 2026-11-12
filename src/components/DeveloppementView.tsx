import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  COULEURS_KANBAN_IDS,
  estAttenteCloturee,
  estColonneBroderie,
  estColonneBrodeuse,
  estColonneLaboConfection,
  estSectionBrodeuse,
  estSectionBroderieMain,
  KANBAN_COULEURS,
  KANBAN_STATUTS_PERSONNE,
  KanbanBloc,
  KanbanCarte,
  KanbanCouleurId,
  KanbanData,
  KanbanColonne,
  KanbanDeplacement,
  KanbanAttente,
  KanbanAttenteEtape,
  KanbanAttenteStatut,
  KanbanHistoriqueCategorie,
  KanbanHistoriqueEntree,
  KanbanPersonne,
  KanbanSection,
  KanbanStatutPersonne,
} from '../types/kanban.ts';
import { chargerKanban, chargerKanbanServeur, KanbanEnvironnement, nouvelId, sauverKanban, sauverKanbanServeur } from '../utils/kanbanStorage.ts';
import { AppPage, ViewSwitcher } from '@/src/components/layout/ViewSwitcher.tsx';
import { SessionBadge } from '@/src/components/layout/SessionBadge.tsx';
import { EditableItemName } from '@/src/components/ui/EditableItemName.tsx';
import { dateISOFromDateTime, estDateISO, FUSEAU_HORAIRE, getDateISOSite, getNowParis, joursEntreDatesISO, joursOuvresEntreDatesISO, joursOuvresHorsPeriodes, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { Profil } from '@/src/utils/auth.ts';
import { AlertTriangle, ArrowLeftRight, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Copy, GitMerge, GripVertical, History, LayoutGrid, MoreHorizontal, MoveRight, Pause, Plus, Scissors, SquareKanban, Trash2, X } from 'lucide-react';

interface DeveloppementViewProps {
  onChangePage: (page: AppPage) => void;
  profil: Profil;
  onDeconnexion: () => void;
}

/** Élément en cours de glissement (carte ou colonne). */
type DragInfo = { type: 'carte'; id: string } | { type: 'colonne'; id: string };

interface AlerteCarteOuverte {
  anchor: HTMLButtonElement;
  carteId: string;
  titreCarte: string;
  titreAlerte: string;
  details: string;
  classes: string;
  icone: React.ReactNode;
}

interface DestinationDeplacement {
  key: string;
  colonneId: string;
  sectionId?: string;
  personneId?: string;
  label: string;
}

interface DeplacementOuvert {
  anchor: HTMLButtonElement;
  carteId: string;
  destinationKey: string;
}

/** Couleurs des pastilles de statut d'une personne, par statut. */
const STATUT_PERSONNE_ACTIF: Record<KanbanStatutPersonne, string> = {
  RM: 'bg-violet-600 border-violet-600 text-white',
  Recup: 'bg-sky-600 border-sky-600 text-white',
  Mater: 'bg-pink-600 border-pink-600 text-white',
  Abs: 'bg-rose-600 border-rose-600 text-white',
  Conge: 'bg-orange-500 border-orange-500 text-white',
  Present: 'bg-emerald-600 border-emerald-600 text-white',
};

/** Quick edit on card click, full card fields through the "…" button. */
type ModeEdition = 'simple' | 'complet';

/** Brouillon d'édition d'une carte (panneau modal). */
interface BrouillonEdition {
  id: string;
  titre: string;
  etat: string;
  description: string;
  traiteur: string;
  client: string;
  commercial: string;
  remarques: string;
  couleur: KanbanCouleurId;
  /** Date d'expédition (optionnelle) */
  dateExpedition?: string;
  attentes: KanbanAttente[];
}

function trierParOrdre<T extends { ordre: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.ordre - b.ordre);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Affiche une date ISO (`YYYY-MM-DD` ou horodatage) au format français. */
function formatDateFr(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const [annee, mois, jour] = valeur.slice(0, 10).split('-');
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : valeur;
}

/** Formats an ISO date as a short French label (`28 oct.`). */
function formatDateCourte(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const [annee, mois, jour] = valeur.slice(0, 10).split('-');
  if (!annee || !mois || !jour) return formatDateFr(valeur);
  const moisCourts = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${jour} ${moisCourts[Number(mois) - 1] ?? mois}`;
}

/** Affiche une date ISO au format très court `JJ/MM`. */
function formatDateJourMois(valeur: string | null | undefined): string {
  return formatDateFr(valeur).slice(0, 5);
}

/** Affiche un horodatage d'étape d'attente au format français (`04/11/2026 14:32`). */
function formatHorodatage(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  // Étape amorcée depuis une date seule (anciennes données) : pas d'heure.
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return formatDateFr(valeur);
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return formatDateFr(valeur);
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_HORAIRE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Construit une étape d'historique pour une période d'attente. */
function etapeAttente(statut: KanbanAttenteStatut): KanbanAttenteEtape {
  return { date: new Date().toISOString(), statut };
}

/** Construit une entrée du journal d'une carte. */
function entreeHistorique(
  categorie: KanbanHistoriqueCategorie,
  description: string
): KanbanHistoriqueEntree {
  return {
    id: `HIS-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`,
    date: new Date().toISOString(),
    categorie,
    description,
  };
}

/** Gap between the anchor card and the edit popover, and viewport safety margin. */
const POPOVER_GAP = 12;
const POPOVER_MARGE = 8;
/** Preferred width of the compact card edit popover. */
const POPOVER_LARGEUR = 460;

/** Construit une entrée d'historique de déplacement. */
function entreeDeplacement(
  date: string,
  colonneId: string,
  sectionId?: string,
  personneId?: string
): KanbanDeplacement {
  return {
    date,
    colonneId,
    ...(sectionId ? { sectionId } : {}),
    ...(personneId ? { personneId } : {}),
  };
}

/**
 * Vue « Développement » : un kanban type Trello (colonnes et tâches de
 * développement propres à cet onglet), glisser-déposer natif, tout persisté
 * dans le localStorage. Indépendante des cartes de production.
 */
export const DeveloppementView: React.FC<DeveloppementViewProps> = ({ onChangePage, profil, onDeconnexion }) => {
  const estDirecteur = profil.id === 'direction';
  const [board, setBoard] = useState<{ environnement: KanbanEnvironnement; data: KanbanData }>(
    {
      environnement: 'developpement',
      data: chargerKanban(),
    }
  );
  const data = board.data;
  const environnement = board.environnement;
  const setData: React.Dispatch<React.SetStateAction<KanbanData>> = (maj) => {
    setBoard((prev) => ({
      ...prev,
      data:
        typeof maj === 'function'
          ? (maj as (d: KanbanData) => KanbanData)(prev.data)
          : maj,
    }));
  };
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [carteAnimeeId, setCarteAnimeeId] = useState<string | null>(null);
  const [colonneCible, setColonneCible] = useState<string | null>(null);
  /** Où déposer la carte : `colonneId` (+ `sectionId` si la colonne est scindée, `personneId` pour BRODERIE MAIN). */
  const [insertion, setInsertion] = useState<{
    colonneId: string;
    sectionId?: string;
    personneId?: string;
    index: number;
  } | null>(null);
  /** Position d'insertion d'une colonne dans la rangée (liste complète). */
  const [insertionColonne, setInsertionColonne] = useState<number | null>(null);
  /** Colonne survolée pendant un glissement de colonne (surlignage ciblé). */
  const [rangeeCible, setRangeeCible] = useState<string | null>(null);
  /** Page d'étapes survolée pendant un glissement de colonne (dépôt inter-pages). */
  const [pageCible, setPageCible] = useState<number | null>(null);
  const [edition, setEdition] = useState<BrouillonEdition | null>(null);
  const [modeEdition, setModeEdition] = useState<ModeEdition>('simple');
  /** Card that opened the edit popover: the panel follows it while scrolling. */
  const [ancreEdition, setAncreEdition] = useState<HTMLElement | null>(null);
  /** Viewport coordinates computed from the anchor (popover presentation only). */
  const [positionEdition, setPositionEdition] = useState<{ top: number; left: number } | null>(null);
  /** Waiting periods are collapsed by default to keep the quick-edit panel short. */
  const [attenteDepliee, setAttenteDepliee] = useState(false);
  const [alerteOuverte, setAlerteOuverte] = useState<AlerteCarteOuverte | null>(null);
  const [positionAlerte, setPositionAlerte] = useState<{ top: number; left: number } | null>(null);
  const [deplacementOuvert, setDeplacementOuvert] = useState<DeplacementOuvert | null>(null);
  const [positionDeplacement, setPositionDeplacement] = useState<{ top: number; left: number } | null>(null);
  const [composerAlerteOuvert, setComposerAlerteOuvert] = useState(false);
  const [texteAlerte, setTexteAlerte] = useState('');
  /** Panneau de suivi ouvert : un seul à la fois pour ne pas encombrer le tableau. */
  const [panneauSuivi, setPanneauSuivi] = useState<'attente' | 'historique' | null>(null);
  const panneauEditionRef = useRef<HTMLDivElement>(null);
  const panneauAlerteRef = useRef<HTMLDivElement>(null);
  const panneauDeplacementRef = useRef<HTMLDivElement>(null);
  const [composerOuverte, setComposerOuverte] = useState<string | null>(null);
  const [composerNom, setComposerNom] = useState('');
  const [composerEtat, setComposerEtat] = useState('');
  const [composerTraiteur, setComposerTraiteur] = useState('');
  const [composerClient, setComposerClient] = useState('');
  const [composerCommercial, setComposerCommercial] = useState('');
  const [composerRemarques, setComposerRemarques] = useState('');
  const [composerCouleur, setComposerCouleur] = useState<KanbanCouleurId | null>(null);
  const [composerDateEcheance, setComposerDateEcheance] = useState<string>('');
  const [composerDateExpedition, setComposerDateExpedition] = useState<string>('');
  const [nouvelleColonne, setNouvelleColonne] = useState(false);
  const [nouveauTitre, setNouveauTitre] = useState('');
  const [copieOk, setCopieOk] = useState<string | null>(null);
  const [ongletDirection, setOngletDirection] = useState<'alerte' | 'attente' | 'encours'>('alerte');
  /** Currently displayed stage page (5 columns per page, view only). */
  const [pageEtapes, setPageEtapes] = useState(0);
  /** Slide direction of the page transition (1 = next, -1 = previous). */
  const [sensPage, setSensPage] = useState<1 | -1>(1);

  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();

  useEffect(() => {
    const timer = setInterval(() => setParisTime(getNowParis().timeStr), 15000);
    return () => clearInterval(timer);
  }, []);

  // Évite de réécrire le localStorage au simple montage (ou après un HMR) :
  // on ne sauvegarde que lorsque les données ont réellement changé.
  const derniereSauvegarde = useRef(JSON.stringify(board.data));
  /** Dernière donnée en mémoire, pour les sauvegardes asynchrones. */
  const donneesActuelles = useRef(board.data);
  donneesActuelles.current = board.data;
  /** Vrai dès qu'une modification locale a été sauvegardée. */
  const modifieDepuisMontage = useRef(false);

  // Charge la sauvegarde partagée du serveur au montage. Si le serveur n'a pas
  // encore de tableau, on y pousse l'état local (ou le tableau de démarrage),
  // pour que la première saisie soit elle aussi persistée côté serveur.
  useEffect(() => {
    let annule = false;
    void (async () => {
      const serveur = await chargerKanbanServeur();
      if (annule) return;
      // Une modification locale est arrivée pendant le chargement : elle est
      // prioritaire, on ne l'écrase pas avec une sauvegarde serveur plus ancienne.
      if (modifieDepuisMontage.current) {
        void sauverKanbanServeur(donneesActuelles.current);
        return;
      }
      if (serveur) {
        const serialise = JSON.stringify(serveur);
        if (serialise !== derniereSauvegarde.current) {
          derniereSauvegarde.current = serialise;
          setBoard((prev) => ({ ...prev, data: serveur }));
        }
      } else {
        void sauverKanbanServeur(donneesActuelles.current);
      }
    })();
    return () => {
      annule = true;
    };
    // Chargement unique au montage : `board.data` n'est lu que pour l'amorçage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // L'environnement Direction est une vue du tableau Développement : les
    // modifications faites depuis les onglets Direction sont persistées dans
    // la même sauvegarde.
    const serialise = JSON.stringify(board.data);
    if (serialise === derniereSauvegarde.current) return;
    modifieDepuisMontage.current = true;
    sauverKanban(board.data);
    derniereSauvegarde.current = serialise;
    // Sauvegarde partagée côté serveur (SQLite) : c'est elle qui rend les
    // données durables et accessibles depuis les autres postes.
    void sauverKanbanServeur(board.data);
  }, [board.data]);

  useEffect(() => {
    if (!estDirecteur && board.environnement === 'direction') {
      setBoard({ environnement: 'developpement', data: chargerKanban() });
    }
  }, [estDirecteur, board.environnement]);

  const changerEnvironnement = (env: KanbanEnvironnement) => {
    if (env === 'direction' && !estDirecteur) return;
    if (env === board.environnement) return;
    setEdition(null);
    setComposerOuverte(null);
    setDrag(null);
    setColonneCible(null);
    setInsertion(null);
    setInsertionColonne(null);
    setRangeeCible(null);
    setPageCible(null);
    setNouvelleColonne(false);
    // Les deux environnements partagent les mêmes cartes : seul l'affichage change.
    setBoard((prev) => ({ ...prev, environnement: env }));
  };

  const colonnes = useMemo(() => trierParOrdre(data.colonnes), [data.colonnes]);
  const ETAPES_PAR_PAGE = 5;
  const totalPages = Math.max(1, Math.ceil(colonnes.length / ETAPES_PAR_PAGE));
  const pageCourante = Math.min(pageEtapes, totalPages - 1);
  const debutPage = pageCourante * ETAPES_PAR_PAGE;
  const colonnesPage = colonnes.slice(debutPage, debutPage + ETAPES_PAR_PAGE);

  /** Changes the visible stage page and records the slide direction for the animation. */
  const allerPageEtapes = (page: number) => {
    setSensPage(page >= pageCourante ? 1 : -1);
    setPageEtapes(page);
  };

  useEffect(() => {
    if (pageEtapes > totalPages - 1) setPageEtapes(totalPages - 1);
  }, [pageEtapes, totalPages]);
  const cartesDe = (colonneId: string): KanbanCarte[] =>
    trierParOrdre(data.cartes.filter((c) => c.colonneId === colonneId));

  /**
   * Calcule l'alarme d'une carte. Les anciennes cartes n'ont pas
   * `dateEntreeZone` : on retombe alors sur leur date de création.
   */
  const getAlarmeInfo = (carte: KanbanCarte): { active: boolean; type: 'zone' | 'global' | null; diffZone: number; seuilZone: number; diffTotal: number; estBroderieMain: boolean; dateEntree: string | null; estDerniereColonne: boolean } => {
    const colonne = data.colonnes.find((c) => c.id === carte.colonneId);
    const section = carte.sectionId ? colonne?.sections?.find((s) => s.id === carte.sectionId) : undefined;
    const estBroderieMain = Boolean(section && estSectionBroderieMain(section));
    const seuilZone = estBroderieMain ? 4 : 2;
    const dateEntree = estDateISO(carte.dateEntreeZone) ? carte.dateEntreeZone : dateISOFromDateTime(carte.creeLe);
    const creation = dateISOFromDateTime(carte.creeLe);
    // Les périodes d'attente gèlent le compteur de l'étape : leurs jours ne
    // sont pas comptés. Le samedi et le dimanche sont exclus du décompte.
    const diffZone = dateEntree
      ? joursOuvresHorsPeriodes(
          dateEntree,
          getDateISOSite(),
          (carte.attentes ?? []).map((attente) => ({
            debut: attente.dateEntree,
            // Une attente non clôturée gèle jusqu'à aujourd'hui, même si une
            // date de sortie prévisionnelle est renseignée.
            fin: estAttenteCloturee(attente) ? attente.dateSortie : undefined,
          }))
        )
      : 0;
    const diffTotal = creation ? joursOuvresEntreDatesISO(creation) : diffZone;
    const derniereColonne = data.colonnes.reduce((max, c) => (c.ordre > max.ordre ? c : max), data.colonnes[0]);
    const estDerniereColonne = Boolean(derniereColonne && carte.colonneId === derniereColonne.id);
    const inactive = { active: false, type: null as null, diffZone, seuilZone, diffTotal, estBroderieMain, dateEntree, estDerniereColonne };

    if (!dateEntree) return inactive;

    // Alarme 1 : délai dans la zone actuelle (2j ou 4j selon section BRODERIE MAIN).
    if (diffZone >= seuilZone) {
      return { active: true, type: 'zone', diffZone, seuilZone, diffTotal, estBroderieMain, dateEntree, estDerniereColonne };
    }
    // Alarme 2 : délai global depuis création (12j max pour atteindre la dernière colonne).
    if (!estDerniereColonne && diffTotal >= 12) {
      return { active: true, type: 'global', diffZone, seuilZone, diffTotal, estBroderieMain, dateEntree, estDerniereColonne };
    }
    return inactive;
  };

  /**
   * Alerte d'attente :
   * - « orange » à partir de la moitié du délai (date d'entrée → date de sortie),
   *   calculée en date calendaire avec arrondi inférieur,
   * - « rouge » une fois la date de sortie dépassée.
   * `jours` = jours restants avant la sortie (orange) ou jours de retard (rouge).
   */
  const getAlerteAttente = (
    carte: KanbanCarte
  ): { niveau: 'orange' | 'rouge'; attente: KanbanAttente; jours: number } | null => {
    let alerte: { niveau: 'orange' | 'rouge'; attente: KanbanAttente; jours: number } | null = null;
    for (const attente of carte.attentes ?? []) {
      if (estAttenteCloturee(attente)) continue;
      if (!estDateISO(attente.dateSortie)) continue;
      // Date de sortie dépassée : alerte rouge, même sans date d'entrée exploitable.
      const joursAvantSortie = -joursEntreDatesISO(attente.dateSortie);
      if (joursAvantSortie < 0) {
        const jours = -joursAvantSortie;
        if (!alerte || alerte.niveau !== 'rouge' || jours > alerte.jours) {
          alerte = { niveau: 'rouge', attente, jours };
        }
        continue;
      }
      // Alerte orange à partir de la moitié du délai (entrée → sortie).
      if (!estDateISO(attente.dateEntree)) continue;
      const duree = joursEntreDatesISO(attente.dateEntree, attente.dateSortie);
      if (duree < 0) continue;
      const ecoules = joursEntreDatesISO(attente.dateEntree);
      if (ecoules >= Math.floor(duree / 2)) {
        const jours = duree - ecoules;
        if (!alerte || (alerte.niveau === 'orange' && jours < alerte.jours)) {
          alerte = { niveau: 'orange', attente, jours };
        }
      }
    }
    return alerte;
  };

  /** Répartit une carte dans les 3 onglets de l'environnement Direction. */
  const categorieDirection = (carte: KanbanCarte): 'alerte' | 'attente' | 'encours' => {
    const alerteAttente = getAlerteAttente(carte);
    const alarmeInfo = getAlarmeInfo(carte);
    const attenteEnCours = (carte.attentes ?? []).some((a) => !estAttenteCloturee(a));
    // Une attente en cours écrase l'alerte 2j/4j de l'étape.
    const alarme = alarmeInfo.active && !(attenteEnCours && alarmeInfo.type === 'zone');
    const echeanceAtteinte =
      estDateISO(carte.date) && joursEntreDatesISO(carte.date) >= 0;
    if (alarme || alerteAttente?.niveau === 'rouge' || echeanceAtteinte) {
      return 'alerte';
    }
    const etapeAttente = (carte.etat ?? '').trim().toUpperCase().includes('ATTENTE');
    if (alerteAttente?.niveau === 'orange' || attenteEnCours || etapeAttente) {
      return 'attente';
    }
    return 'encours';
  };

  /**
   * Score d'urgence pour trier l'onglet ALERTE :
   * attente dépassée > échéance atteinte > retard global > retard de zone.
   * À catégorie égale, le nombre de jours de retard départage.
   */
  const urgenceDirection = (carte: KanbanCarte): number => {
    const alerteAttente = getAlerteAttente(carte);
    if (alerteAttente?.niveau === 'rouge') {
      return 400_000 + alerteAttente.jours * 100;
    }
    if (estDateISO(carte.date)) {
      const retardEcheance = joursEntreDatesISO(carte.date);
      if (retardEcheance >= 0) return 300_000 + retardEcheance * 100;
    }
    const alarme = getAlarmeInfo(carte);
    const attenteEnCours = (carte.attentes ?? []).some((a) => !estAttenteCloturee(a));
    const retardGlobal = !alarme.estDerniereColonne && alarme.diffTotal >= 12;
    if (retardGlobal) {
      return 200_000 + Math.max(0, alarme.diffTotal - 12) * 100;
    }
    if (alarme.diffZone >= alarme.seuilZone && !attenteEnCours) {
      return 100_000 + Math.max(0, alarme.diffZone - alarme.seuilZone) * 100;
    }
    return 0;
  };

  /** Les cartes terminées ou archivées ne remontent pas dans la vue Direction. */
  const carteTermineeDirection = (carte: KanbanCarte): boolean => {
    const colonne = data.colonnes.find((c) => c.id === carte.colonneId);
    const titre = (colonne?.titre ?? '').trim().toUpperCase();
    const etape = (carte.etat ?? '').trim().toUpperCase();
    return (
      titre.includes('TERMIN') ||
      titre.includes('ARCHIVE') ||
      etape.includes('TERMIN') ||
      etape.includes('ARCHIVE')
    );
  };

  const cartesDeSection = (colonne: KanbanColonne, sectionId?: string): KanbanCarte[] => {
    const premiere = colonne.sections?.[0]?.id;
    return trierParOrdre(
      data.cartes.filter(
        (c) => c.colonneId === colonne.id && (c.sectionId ?? premiere) === sectionId
      )
    );
  };

  /** Clé d'ouverture du composer : une par zone (colonne simple ou section). */
  const cleZone = (colonneId: string, sectionId?: string) =>
    sectionId ? `${colonneId}::${sectionId}` : colonneId;

  const arreterDrag = () => {
    setDrag(null);
    setColonneCible(null);
    setInsertion(null);
    setInsertionColonne(null);
    setRangeeCible(null);
    setPageCible(null);
  };

  /* ------------------------------- Colonnes ------------------------------ */

  const ajouterColonne = (titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: [
        ...prev.colonnes,
        { id: nouvelId(), titre: trimmed, ordre: prev.colonnes.length, couleur: 'blanc' },
      ],
    }));
  };

  const renommerColonne = (id: string, titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) => (c.id === id ? { ...c, titre: trimmed } : c)),
    }));
  };

  /**
   * Scinde une colonne simple en 4 sections empilées. Les parties du titre
   * séparées par « / » (ex. « Punching/PDF/… ») nomment les sections ; les
   * parties manquantes s'appellent « Partie N ». Les cartes déjà présentes
   * passent dans la section du haut.
   */
  const scinderColonne = (id: string) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === id);
      if (!colonne || colonne.sections?.length) return prev;
      const parties = colonne.titre.split('/').map((p) => p.trim()).filter(Boolean);
      const sections: KanbanSection[] = Array.from({ length: 4 }, (_, index) => ({
        id: nouvelId(),
        titre: parties[index] || `Partie ${index + 1}`,
        ordre: index,
      }));
      return {
        colonnes: prev.colonnes.map((c) => (c.id === id ? { ...c, sections } : c)),
        cartes: prev.cartes.map((k) =>
          k.colonneId === id ? { ...k, sectionId: sections[0].id } : k
        ),
      };
    });
  };

  /** Réassemble les sections d'une colonne en une seule liste. */
  const fusionnerColonne = (id: string) => {
    setData((prev) => ({
      colonnes: prev.colonnes.map((c) => (c.id === id ? { ...c, sections: undefined } : c)),
      cartes: prev.cartes.map((k) => (k.colonneId === id ? { ...k, sectionId: undefined } : k)),
    }));
  };

  const renommerSection = (colonneId: string, sectionId: string, titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId && c.sections
          ? {
              ...c,
              sections: c.sections.map((s) =>
                s.id === sectionId ? { ...s, titre: trimmed } : s
              ),
            }
          : c
      ),
    }));
  };

  /* ------------------------- Personnes (section BRODERIE MAIN) ------------- */

  /** Ajoute une personne dans la section BRODERIE MAIN. */
  const ajouterPersonne = (colonneId: string, sectionId: string, bloc: KanbanBloc) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!colonne) return prev;
      const section = colonne.sections?.find((s) => s.id === sectionId);
      if (!section) return prev;
      const personnes = section.personnes ?? [];
      const ordre = personnes.reduce((max, p) => Math.max(max, p.ordre), -1) + 1;
      return {
        ...prev,
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? {
                ...c,
                sections: c.sections?.map((s) =>
                  s.id === sectionId
                    ? { ...s, personnes: [...personnes, { id: nouvelId(), titre: '', bloc, ordre }] }
                    : s
                ),
              }
            : c
        ),
      };
    });
  };

  /**
   * Supprime une personne de la section BRODERIE MAIN (avec ses tâches).
   */
  const supprimerPersonne = (colonneId: string, sectionId: string, personneId: string) => {
    const section = data.colonnes
      .find((c) => c.id === colonneId)
      ?.sections?.find((s) => s.id === sectionId);
    const personne = section?.personnes?.find((p) => p.id === personneId);
    if (!personne) return;
    const nb = data.cartes.filter(
      (c) => c.colonneId === colonneId && c.sectionId === sectionId && c.personneId === personneId
    ).length;
    const nom = personne.titre.trim() || 'sans nom';
    const message =
      nb > 0
        ? `Supprimer la personne « ${nom} » et ses ${nb} tâche(s) ?`
        : `Supprimer la personne « ${nom} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? {
              ...c,
              sections: c.sections?.map((s) =>
                s.id === sectionId ? { ...s, personnes: s.personnes?.filter((p) => p.id !== personneId) } : s
              ),
            }
          : c
      ),
      cartes: prev.cartes.filter(
        (k) => !(k.colonneId === colonneId && k.sectionId === sectionId && k.personneId === personneId)
      ),
    }));
  };

  /**
   * Supprime une section classique (avec ses cartes) — pas de section BRODERIE MAIN.
   */
  const supprimerSection = (colonneId: string, sectionId: string) => {
    const colonne = data.colonnes.find((c) => c.id === colonneId);
    const section = colonne?.sections?.find((s) => s.id === sectionId);
    // Le tableau BRODERIE MAIN reste rattaché à sa colonne : sa section ne se supprime pas.
    const estMainDediee = !!colonne && estColonneBroderie(colonne) && !estColonneBrodeuse(colonne);
    const sectionMain = estMainDediee
      ? colonne?.sections?.find((s) => estSectionBroderieMain(s)) ?? colonne?.sections?.[0]
      : undefined;
    if (!section || estSectionBroderieMain(section) || section.id === sectionMain?.id) return;
    const nb = data.cartes.filter((c) => c.colonneId === colonneId && c.sectionId === sectionId).length;
    const nom = section.titre.trim() || 'sans nom';
    const message =
      nb > 0
        ? `Supprimer la section « ${nom} » et ses ${nb} carte(s) ?`
        : `Supprimer la section « ${nom} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? { ...c, sections: c.sections?.filter((s) => s.id !== sectionId) }
          : c
      ),
      cartes: prev.cartes.filter((k) => !(k.colonneId === colonneId && k.sectionId === sectionId)),
    }));
  };

  /** Renomme une personne de la section BRODERIE MAIN. */
  const renommerPersonne = (colonneId: string, sectionId: string, personneId: string, titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? {
              ...c,
              sections: c.sections?.map((s) =>
                s.id === sectionId
                  ? { ...s, personnes: s.personnes?.map((p) => (p.id === personneId ? { ...p, titre: trimmed } : p)) }
                  : s
              ),
            }
          : c
      ),
    }));
  };

  /** Change le statut d'une personne (re-cliquer sur le statut actif l'efface). */
  const changerStatutPersonne = (
    colonneId: string,
    sectionId: string,
    personneId: string,
    statut: KanbanStatutPersonne | undefined
  ) => {
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? {
              ...c,
              sections: c.sections?.map((s) =>
                s.id === sectionId
                  ? {
                      ...s,
                      personnes: s.personnes?.map((p) =>
                        p.id === personneId ? { ...p, statut } : p
                      ),
                    }
                  : s
              ),
            }
          : c
      ),
    }));
  };

  /** Pastilles de statut affichées sous le nom d'une personne. */
  const renduStatutsPersonne = (
    colonneId: string,
    sectionId: string,
    personne: KanbanPersonne
  ) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {KANBAN_STATUTS_PERSONNE.map((s) => {
        const actif = personne.statut === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() =>
              changerStatutPersonne(colonneId, sectionId, personne.id, actif ? undefined : s.id)
            }
            title={actif ? `${s.label} (statut actuel)` : s.label}
            className={`cursor-pointer rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none transition-colors ${
              actif
                ? STATUT_PERSONNE_ACTIF[s.id]
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );

  /* --------------------------- Brodeuses (BRODERIE MACHINE / LABO CONFECTION) -------------------------- */

  /** Retourne l'id de la section « Brodeuses » de la colonne, ou l'indéfini. */
  const getSectionBrodeuseId = (colonneId: string): string | undefined => {
    const colonne = data.colonnes.find((c) => c.id === colonneId);
    return colonne?.sections?.find((s) => estSectionBrodeuse(s))?.id;
  };

  /** Ajoute une brodeuse dans la colonne (crée la section « Brodeuses » au besoin). */
  const ajouterBrodeuse = (colonneId: string) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!colonne) return prev;
      const sections = colonne.sections ?? [];
      const existante = sections.find((s) => estSectionBrodeuse(s));
      const ordreSection = sections.reduce((max, s) => Math.max(max, s.ordre), -1) + 1;
      const section: KanbanSection =
        existante ?? { id: nouvelId(), titre: 'Brodeuses', ordre: ordreSection };
      const personnes = section.personnes ?? [];
      const ordre = personnes.reduce((max, p) => Math.max(max, p.ordre), -1) + 1;
      return {
        ...prev,
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? {
                ...c,
                sections: existante
                  ? sections.map((s) =>
                      s.id === section.id
                        ? { ...s, personnes: [...personnes, { id: nouvelId(), titre: '', ordre }] }
                        : s
                    )
                  : [
                      ...sections,
                      { ...section, personnes: [{ id: nouvelId(), titre: '', ordre }] },
                    ],
              }
            : c
        ),
      };
    });
  };

  /** Supprime une brodeuse (et ses cartes assignées). */
  const supprimerBrodeuse = (colonneId: string, personneId: string) => {
    const sectionId = getSectionBrodeuseId(colonneId);
    if (!sectionId) return;
    const section = data.colonnes.find((c) => c.id === colonneId)?.sections?.find((s) => s.id === sectionId);
    const personne = section?.personnes?.find((p) => p.id === personneId);
    if (!personne) return;
    const nb = data.cartes.filter(
      (c) => c.colonneId === colonneId && c.sectionId === sectionId && c.personneId === personneId
    ).length;
    const nom = personne.titre.trim() || 'sans nom';
    const message =
      nb > 0
        ? `Supprimer la brodeuse « ${nom} » et ses ${nb} carte(s) assignées ?`
        : `Supprimer la brodeuse « ${nom} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? {
              ...c,
              sections: c.sections?.map((s) =>
                s.id === sectionId ? { ...s, personnes: s.personnes?.filter((p) => p.id !== personneId) } : s
              ),
            }
          : c
      ),
      cartes: prev.cartes.filter(
        (k) => !(k.colonneId === colonneId && k.sectionId === sectionId && k.personneId === personneId)
      ),
    }));
  };

  /** Déplace une carte vers la brodeuse ciblée (glisser-déposer). */
  const deplacerCarteBrodeuse = (
    carteId: string,
    colonneId: string,
    sectionId: string,
    personneId: string,
    index: number
  ) => {
    const today = getDateISOSite();
    setData((prev) => {
      const carte = prev.cartes.find((c) => c.id === carteId);
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!carte || !colonne) return prev;
      const section = colonne.sections?.find((s) => s.id === sectionId);
      const personne = section?.personnes?.find((p) => p.id === personneId);
      if (!section || !personne) return prev;
      const cibles = trierParOrdre(
        prev.cartes.filter(
          (c) =>
            c.colonneId === colonneId &&
            c.sectionId === sectionId &&
            c.personneId === personneId &&
            c.id !== carteId
        )
      );
      const position = clamp(index, 0, cibles.length);
      const ordonnees = [
        ...cibles.slice(0, position),
        {
          ...carte,
          colonneId,
          sectionId,
          personneId,
          dateEntreeZone: today,
          date: undefined,
          historiqueDeplacements: [...(carte.historiqueDeplacements ?? []), entreeDeplacement(today, colonneId, sectionId, personneId)],
        },
        ...cibles.slice(position),
      ].map((c, i) => ({ ...c, ordre: i }));
      const hors = prev.cartes.filter(
        (c) => c.id !== carteId && !(c.colonneId === colonneId && c.sectionId === sectionId && c.personneId === personneId)
      );
      return { ...prev, cartes: [...hors, ...ordonnees] };
    });
  };

  /** Ajoute une section classique dans la colonne. */
  const ajouterSection = (colonneId: string) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!colonne) return prev;
      const sections = colonne.sections ?? [];
      const ordre = sections.reduce((max, s) => Math.max(max, s.ordre), -1) + 1;
      return {
        ...prev,
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? { ...c, sections: [...sections, { id: nouvelId(), titre: '', ordre }] }
            : c
        ),
      };
    });
  };

  const supprimerColonne = (id: string) => {
    const colonne = data.colonnes.find((c) => c.id === id);
    if (!colonne) return;
    const nb = data.cartes.filter((c) => c.colonneId === id).length;
    const message =
      nb > 0
        ? `Supprimer la colonne « ${colonne.titre} » et ses ${nb} carte(s) ?`
        : `Supprimer la colonne « ${colonne.titre} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      colonnes: prev.colonnes.filter((c) => c.id !== id),
      cartes: prev.cartes.filter((c) => c.colonneId !== id),
    }));
  };

  const deplacerColonne = (colonneId: string, index: number) => {
    setData((prev) => {
      const liste = trierParOrdre(prev.colonnes);
      const origine = liste.findIndex((c) => c.id === colonneId);
      if (origine === -1) return prev;
      const sans = liste.filter((c) => c.id !== colonneId);
      // L'index est calculé sur la liste complète (colonne glissée incluse) :
      // en partant vers la droite, on retranche la place que prend la colonne.
      const cible = clamp(origine < index ? index - 1 : index, 0, sans.length);
      const ordonnees = [...sans.slice(0, cible), liste[origine], ...sans.slice(cible)].map(
        (c, i) => ({ ...c, ordre: i })
      );
      return { ...prev, colonnes: ordonnees };
    });
  };

  /**
   * Déplace une colonne à la dernière place d'une page d'étapes. Sert au
   * dépôt sur une pastille de pagination, seule façon d'atteindre une page
   * dont les colonnes ne sont pas visibles pendant le glissement.
   */
  const deplacerColonneVersPage = (colonneId: string, page: number) => {
    setData((prev) => {
      const liste = trierParOrdre(prev.colonnes);
      const origine = liste.findIndex((c) => c.id === colonneId);
      if (origine === -1) return prev;
      const sans = liste.filter((c) => c.id !== colonneId);
      const cible = clamp((page + 1) * ETAPES_PAR_PAGE - 1, 0, sans.length);
      const ordonnees = [...sans.slice(0, cible), liste[origine], ...sans.slice(cible)].map(
        (c, i) => ({ ...c, ordre: i })
      );
      return { ...prev, colonnes: ordonnees };
    });
  };

  /* -------------------------------- Cartes ------------------------------- */

  const ajouterCarte = (
    colonneId: string,
    sectionId: string | undefined,
    titre: string,
    etat: string,
    traiteur: string,
    client: string,
    commercial: string,
    remarques: string,
    couleur: KanbanCouleurId,
    date?: string,
    dateExpedition?: string
  ) => {
    const trimmed = titre.trim();
    if (!trimmed || !couleur) return;
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      const premiere = colonne?.sections?.[0]?.id;
      // Colonne scindée : la carte rejoint sa section (défaut : la première).
      const zone = colonne?.sections?.length ? (sectionId ?? premiere) : undefined;
      const memeZone = (c: KanbanCarte) => (c.sectionId ?? premiere) === zone;
      return {
        ...prev,
        cartes: [
          ...prev.cartes,
          {
            id: nouvelId(),
            titre: trimmed,
            etat: etat.trim() || undefined,
            traiteur: traiteur.trim() || undefined,
            client: client.trim() || undefined,
            commercial: commercial.trim() || undefined,
            remarques: remarques.trim() || undefined,
            couleur,
            colonneId,
            sectionId: zone,
            date: date || undefined,
            dateExpedition: dateExpedition || undefined,
            dateEntreeZone: getDateISOSite(),
            ordre: prev.cartes.filter((c) => c.colonneId === colonneId && memeZone(c)).length,
            creeLe: new Date().toISOString(),
            historiqueDeplacements: [entreeDeplacement(getDateISOSite(), colonneId, zone)],
            historique: [entreeHistorique('carte', 'Carte créée')],
            attentes: [],
          },
        ],
      };
    });
  };

  const majCarte = (
    id: string,
    updates: Partial<KanbanCarte>,
    entrees?: KanbanHistoriqueEntree[]
  ) => {
    setData((prev) => ({
      ...prev,
      cartes: prev.cartes.map((c) =>
        c.id === id
          ? {
              ...c,
              ...updates,
              ...(entrees?.length
                ? { historique: [...(c.historique ?? []), ...entrees] }
                : {}),
            }
          : c
      ),
    }));
  };

  /** Applique une modification à une période d'attente précise d'une carte. */
  const majAttente = (
    carteId: string,
    attenteId: string,
    maj: (attente: KanbanAttente) => KanbanAttente,
    description?: string
  ) => {
    setData((prev) => ({
      ...prev,
      cartes: prev.cartes.map((c) => {
        if (c.id !== carteId) return c;
        const attentes = (c.attentes ?? []).map((a) => (a.id === attenteId ? maj(a) : a));
        const historique = c.historique ?? [];
        const dejaJournalise =
          !!description &&
          historique.some(
            (h) =>
              h.description === description &&
              dateISOFromDateTime(h.date) === getDateISOSite()
          );
        return {
          ...c,
          attentes,
          ...(description && !dejaJournalise
            ? { historique: [...historique, entreeHistorique('attente', description)] }
            : {}),
        };
      }),
    }));
  };

  /** Confirme qu'une attente est toujours en cours et journalise la vérification. */
  const marquerAttenteEnCours = (carteId: string, attenteId: string) => {
    const attente = data.cartes
      .find((c) => c.id === carteId)
      ?.attentes?.find((a) => a.id === attenteId);
    if (!attente) return;
    const motif = attente.libelle?.trim() || 'sans motif';
    majAttente(
      carteId,
      attenteId,
      (a) => {
        const etapes = a.historique ?? [];
        const derniere = etapes[etapes.length - 1];
        const dejaVerifieeAujourdhui =
          derniere?.statut === 'en-cours' &&
          dateISOFromDateTime(derniere.date) === getDateISOSite();
        return {
          ...a,
          statut: 'en-cours',
          historique: dejaVerifieeAujourdhui ? etapes : [...etapes, etapeAttente('en-cours')],
        };
      },
      `Attente « ${motif} » confirmée en cours`
    );
  };

  /**
   * Clôture une attente : elle quitte la zone ATTENTE, sa date de sortie est
   * renseignée et ses étapes restent consultables dans la zone HISTORIQUE.
   */
  const cloturerAttente = (carteId: string, attenteId: string) => {
    const attente = data.cartes
      .find((c) => c.id === carteId)
      ?.attentes?.find((a) => a.id === attenteId);
    if (!attente || estAttenteCloturee(attente)) return;
    const motif = attente.libelle?.trim() || 'sans motif';
    majAttente(
      carteId,
      attenteId,
      (a) => ({
        ...a,
        statut: 'cloture',
        dateSortie: estDateISO(a.dateSortie) ? a.dateSortie : getDateISOSite(),
        historique: [...(a.historique ?? []), etapeAttente('cloture')],
      }),
      `Attente « ${motif} » clôturée`
    );
  };

  /** Deletes a card after confirmation; returns whether the card was removed. */
  const supprimerCarte = (id: string): boolean => {
    const carte = data.cartes.find((c) => c.id === id);
    if (!carte) return false;
    if (!window.confirm(`Supprimer la tâche « ${carte.titre} » ?`)) return false;
    setData((prev) => ({ ...prev, cartes: prev.cartes.filter((c) => c.id !== id) }));
    return true;
  };

  const deplacerCarte = (
    carteId: string,
    colonneId: string,
    sectionId: string | undefined,
    index: number
  ) => {
    const today = getDateISOSite();
    setData((prev) => {
      const carte = prev.cartes.find((c) => c.id === carteId);
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!carte || !colonne) return prev;
      const premiere = colonne.sections?.[0]?.id;
      // Colonne scindée : on replace dans sa section (défaut : la première).
      const zone = colonne.sections?.length ? (sectionId ?? premiere) : undefined;
      const memeZone = (c: KanbanCarte) => (c.sectionId ?? premiere) === zone;
      const cibles = trierParOrdre(
        prev.cartes.filter((c) => c.colonneId === colonneId && c.id !== carteId && memeZone(c))
      );
      const position = clamp(index, 0, cibles.length);
      const changeZone = carte.colonneId !== colonneId || carte.sectionId !== zone;
      const ordonnees = [
        ...cibles.slice(0, position),
        {
          ...carte,
          colonneId,
          sectionId: zone,
          personneId: undefined,
          bloc: undefined,
          dateEntreeZone: changeZone ? today : carte.dateEntreeZone,
          date: changeZone ? undefined : carte.date,
          historiqueDeplacements: changeZone
            ? [...(carte.historiqueDeplacements ?? []), entreeDeplacement(today, colonneId, zone)]
            : carte.historiqueDeplacements,
        },
        ...cibles.slice(position),
      ].map((c, i) => ({ ...c, ordre: i }));
      // Les cartes hors zone (autres sections, autres colonnes) ne bougent pas.
      const hors = prev.cartes.filter(
        (c) => c.id !== carteId && (c.colonneId !== colonneId || !memeZone(c))
      );
      return { ...prev, cartes: [...hors, ...ordonnees] };
    });
  };

  /** Déplace une carte vers une personne de la section BRODERIE MAIN. */
  const deplacerCartePersonne = (
    carteId: string,
    colonneId: string,
    sectionId: string,
    personneId: string,
    index: number
  ) => {
    const today = getDateISOSite();
    setData((prev) => {
      const carte = prev.cartes.find((c) => c.id === carteId);
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!carte || !colonne) return prev;
      const section = colonne.sections?.find((s) => s.id === sectionId);
      if (!section || !estSectionBroderieMain(section)) return prev;
      const personne = section.personnes?.find((p) => p.id === personneId);
      if (!personne) return prev;
      const cibles = trierParOrdre(
        prev.cartes.filter(
          (c) =>
            c.colonneId === colonneId &&
            c.sectionId === sectionId &&
            c.personneId === personneId &&
            c.id !== carteId
        )
      );
      const position = clamp(index, 0, cibles.length);
      const ordonnees = [
        ...cibles.slice(0, position),
        {
          ...carte,
          colonneId,
          sectionId,
          personneId,
          bloc: personne.bloc,
          dateEntreeZone: today,
          date: undefined,
          historiqueDeplacements: [...(carte.historiqueDeplacements ?? []), entreeDeplacement(today, colonneId, sectionId, personneId)],
        },
        ...cibles.slice(position),
      ].map((c, i) => ({ ...c, ordre: i }));
      const hors = prev.cartes.filter(
        (c) => c.id !== carteId && !(c.colonneId === colonneId && c.sectionId === sectionId && c.personneId === personneId)
      );
      return { ...prev, cartes: [...hors, ...ordonnees] };
    });
  };

  /* --------------------------- Glisser-déposer --------------------------- */

  const dragCarte = (e: React.DragEvent, carteId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', carteId);
    setDrag({ type: 'carte', id: carteId });
  };

  const dragColonne = (e: React.DragEvent, colonneId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colonneId);
    setDrag({ type: 'colonne', id: colonneId });
  };

  const survolCarte = (
    e: React.DragEvent,
    carte: KanbanCarte,
    position: number,
    sectionId?: string
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const avant = e.clientY < rect.top + rect.height / 2;
    setColonneCible(carte.colonneId);
    // Si la carte est dans une zone d'affectation, inclure personneId.
    const colonne = data.colonnes.find((c) => c.id === carte.colonneId);
    const section = colonne?.sections?.find((s) => s.id === carte.sectionId);
    const estAffectee = !!section && (estSectionBroderieMain(section) || estSectionBrodeuse(section));
    setInsertion({
      colonneId: carte.colonneId,
      sectionId,
      personneId: estAffectee ? carte.personneId : undefined,
      index: avant ? position : position + 1,
    });
  };

  /** Survol du vide d'une zone (ou de son en-tête) : insertion en fin de zone. */
  const survolZone = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string | undefined,
    position: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setColonneCible(colonneId);
    setInsertion({ colonneId, sectionId, index: position });
  };

  /** Survol de l'en-tête d'une colonne : insertion par défaut (fin de zone). */
  const survolEnteteColonne = (e: React.DragEvent, colonne: KanbanColonne) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setColonneCible(colonne.id);
    // Si la colonne a une section BRODERIE MAIN ou Brodeuses, l'en-tête n'est pas une zone de dépôt valide.
    const sectionBroderie = colonne.sections?.find((s) => estSectionBroderieMain(s));
    const sectionBrodeuse = colonne.sections?.find((s) => estSectionBrodeuse(s));
    if (sectionBroderie || sectionBrodeuse || estColonneBrodeuse(colonne) || estColonneBroderie(colonne)) {
      // Pas de zone de dépôt valide sur l'en-tête : ne pas setInsertion.
      return;
    }
    const premiere = colonne.sections?.[0]?.id;
    const nb = premiere ? cartesDeSection(colonne, premiere).length : cartesDe(colonne.id).length;
    setInsertion({ colonneId: colonne.id, sectionId: premiere, index: nb });
  };

  /** Survol d'une pastille de pagination pendant un glissement de colonne. */
  const survolPage = (e: React.DragEvent, page: number) => {
    if (drag?.type !== 'colonne') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setPageCible(page);
  };

  /** Chute sur une pastille de pagination : la colonne rejoint la fin de cette page. */
  const deposerSurPage = (e: React.DragEvent, page: number) => {
    if (drag?.type !== 'colonne') return;
    e.preventDefault();
    e.stopPropagation();
    const index = Math.min((page + 1) * ETAPES_PAR_PAGE, colonnes.length);
    deplacerColonneVersPage(drag.id, page);
    arreterDrag();
    allerPageEtapes(page);
  };

  const survolRangee = (e: React.DragEvent, colonneId: string, index: number) => {
    if (drag?.type !== 'colonne') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const apres = e.clientX > rect.left + rect.width / 2;
    setRangeeCible(colonneId);
    setInsertionColonne(index + (apres ? 1 : 0));
  };

  /**
   * Chute dans une zone (liste ou en-tête de section). Retourne silencieusement
   * si c'est une colonne qui est glissée, pour laisser remonter à la rangée.
   */
  const deposerDansZone = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string | undefined,
    finZone: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    // L'insertion vient du dernier survol ; sinon : fin de zone.
    const memeZone =
      insertion &&
      insertion.colonneId === colonneId &&
      (insertion.sectionId ?? null) === (sectionId ?? null);
    deplacerCarte(drag.id, colonneId, sectionId, memeZone ? insertion.index : finZone);
    arreterDrag();
  };

  /** Chute sur l'en-tête d'une colonne (carte) ou sur la rangée (colonne glissée). */
  const deposerSurColonne = (e: React.DragEvent, colonne: KanbanColonne) => {
    e.preventDefault();
    if (drag?.type === 'carte') {
      // Si la colonne a une section BRODERIE MAIN ou est une colonne Brodeuse, l'en-tête n'accepte pas les dépôts.
      const sectionBroderie = colonne.sections?.find((s) => estSectionBroderieMain(s));
      if (sectionBroderie || estColonneBrodeuse(colonne) || estColonneBroderie(colonne)) {
        arreterDrag();
        return;
      }
      const premiere = colonne.sections?.[0]?.id;
      if (insertion && insertion.colonneId === colonne.id) {
        deplacerCarte(drag.id, colonne.id, insertion.sectionId ?? premiere, insertion.index);
      } else {
        const nb = premiere ? cartesDeSection(colonne, premiere).length : cartesDe(colonne.id).length;
        deplacerCarte(drag.id, colonne.id, premiere, nb);
      }
    } else if (drag?.type === 'colonne' && insertionColonne !== null) {
      deplacerColonne(drag.id, insertionColonne);
    }
    arreterDrag();
  };

  /** Survol d'une cellule personne (section BRODERIE MAIN). */
  const survolZonePersonne = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string,
    personneId: string,
    position: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setColonneCible(colonneId);
    setInsertion({ colonneId, sectionId, personneId, index: position });
  };

  /** Chute dans une cellule personne (section BRODERIE MAIN). */
  const deposerZonePersonne = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string,
    personneId: string,
    finZone: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    const memeZone =
      insertion &&
      insertion.colonneId === colonneId &&
      insertion.sectionId === sectionId &&
      insertion.personneId === personneId;
    deplacerCartePersonne(drag.id, colonneId, sectionId, personneId, memeZone ? insertion.index : finZone);
    arreterDrag();
  };

  /** Chute dans une cellule brodeuse (colonne BRODERIE MACHINE / LABO CONFECTION). */
  const deposerZoneBrodeuse = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string,
    personneId: string,
    finZone: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    const memeZone =
      insertion &&
      insertion.colonneId === colonneId &&
      insertion.sectionId === sectionId &&
      insertion.personneId === personneId;
    deplacerCarteBrodeuse(drag.id, colonneId, sectionId, personneId, memeZone ? insertion.index : finZone);
    arreterDrag();
  };

  /* -------------------------------- Rendu -------------------------------- */

  /** Closes the edit panel and forgets its anchor. */
  const fermerEdition = useCallback(() => {
    setEdition(null);
    setModeEdition('simple');
    setAncreEdition(null);
    setPositionEdition(null);
    setAttenteDepliee(false);
  }, []);

  const fermerAlerte = useCallback(() => {
    setAlerteOuverte(null);
    setPositionAlerte(null);
    setComposerAlerteOuvert(false);
    setTexteAlerte('');
  }, []);

  const ajouterAlerte = (carteId: string) => {
    const texte = texteAlerte.trim();
    if (!texte) return;
    const carte = data.cartes.find((item) => item.id === carteId);
    if (!carte) return;
    majCarte(carteId, { alertes: [...(carte.alertes ?? []), texte] }, [
      entreeHistorique('carte', `Alerte ajoutée : ${texte}`),
    ]);
    setTexteAlerte('');
    setComposerAlerteOuvert(false);
  };

  const supprimerAlerte = (carteId: string, index: number) => {
    const carte = data.cartes.find((item) => item.id === carteId);
    const texte = carte?.alertes?.[index];
    if (!carte || texte === undefined) return;
    majCarte(carteId, { alertes: carte.alertes?.filter((_, i) => i !== index) }, [
      entreeHistorique('carte', `Alerte supprimée : ${texte}`),
    ]);
  };

  const placerAlerte = useCallback(() => {
    if (!alerteOuverte) return;
    if (!alerteOuverte.anchor.isConnected) {
      fermerAlerte();
      return;
    }

    const rect = alerteOuverte.anchor.getBoundingClientRect();
    const panneau = panneauAlerteRef.current;
    const largeur = panneau?.offsetWidth ?? 280;
    const hauteur = panneau?.offsetHeight ?? 160;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + POPOVER_GAP;
    if (left + largeur + POPOVER_MARGE > vw) {
      left = Math.max(POPOVER_MARGE, rect.left - POPOVER_GAP - largeur);
    }
    let top = rect.top;
    if (top + hauteur + POPOVER_MARGE > vh) top = vh - hauteur - POPOVER_MARGE;
    top = clamp(top, POPOVER_MARGE, Math.max(POPOVER_MARGE, vh - hauteur - POPOVER_MARGE));
    setPositionAlerte((position) =>
      position?.top === top && position.left === left ? position : { top, left }
    );
  }, [alerteOuverte, fermerAlerte]);

  useLayoutEffect(() => {
    if (alerteOuverte) placerAlerte();
  }, [alerteOuverte, placerAlerte]);

  useEffect(() => {
    if (!alerteOuverte) return;
    const onMove = () => placerAlerte();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fermerAlerte();
    };
    const onMouseDown = (event: MouseEvent) => {
      const cible = event.target as Node | null;
      if (!cible || panneauAlerteRef.current?.contains(cible) || alerteOuverte.anchor.contains(cible)) return;
      fermerAlerte();
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [alerteOuverte, fermerAlerte, placerAlerte]);

  const fermerDeplacement = useCallback(() => {
    setDeplacementOuvert(null);
    setPositionDeplacement(null);
  }, []);

  const placerDeplacement = useCallback(() => {
    if (!deplacementOuvert) return;
    if (!deplacementOuvert.anchor.isConnected) {
      fermerDeplacement();
      return;
    }

    const rect = deplacementOuvert.anchor.getBoundingClientRect();
    const panneau = panneauDeplacementRef.current;
    const largeur = panneau?.offsetWidth ?? 300;
    const hauteur = panneau?.offsetHeight ?? 220;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.right + POPOVER_GAP;
    if (left + largeur + POPOVER_MARGE > vw) {
      left = Math.max(POPOVER_MARGE, rect.left - POPOVER_GAP - largeur);
    }
    let top = rect.top;
    if (top + hauteur + POPOVER_MARGE > vh) top = vh - hauteur - POPOVER_MARGE;
    top = clamp(top, POPOVER_MARGE, Math.max(POPOVER_MARGE, vh - hauteur - POPOVER_MARGE));
    setPositionDeplacement((position) =>
      position?.top === top && position.left === left ? position : { top, left }
    );
  }, [deplacementOuvert, fermerDeplacement]);

  useLayoutEffect(() => {
    if (deplacementOuvert) placerDeplacement();
  }, [deplacementOuvert, placerDeplacement]);

  useEffect(() => {
    if (!deplacementOuvert) return;
    const onMove = () => placerDeplacement();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') fermerDeplacement();
    };
    const onMouseDown = (event: MouseEvent) => {
      const cible = event.target as Node | null;
      if (
        !cible ||
        panneauDeplacementRef.current?.contains(cible) ||
        deplacementOuvert.anchor.contains(cible)
      ) {
        return;
      }
      fermerDeplacement();
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [deplacementOuvert, fermerDeplacement, placerDeplacement]);

  const ouvrirEdition = (
    carte: KanbanCarte,
    ancre?: HTMLElement | null,
    mode: ModeEdition = 'simple'
  ) => {
    setModeEdition(mode);
    // Clicking the card that is already open must not discard the draft.
    if (edition?.id === carte.id) {
      setAncreEdition(ancre ?? null);
      return;
    }
    setAncreEdition(ancre ?? null);
    setPositionEdition(null);
    setAttenteDepliee(false);
    setEdition({
      id: carte.id,
      titre: carte.titre,
      etat: carte.etat ?? '',
      description: carte.description ?? '',
      traiteur: carte.traiteur ?? '',
      client: carte.client ?? '',
      commercial: carte.commercial ?? '',
      remarques: carte.remarques ?? '',
      // La couleur affichée sert de défaut : le post-it a toujours une couleur.
      couleur: carte.couleur ?? 'jaune',
      dateExpedition: carte.dateExpedition,
      attentes: (carte.attentes ?? []).map((a) => ({ ...a })),
    });
  };

  const enregistrerEdition = () => {
    if (!edition) return;
    const titre = edition.titre.trim() || 'Tâche sans titre';
    const attentes: KanbanAttente[] = edition.attentes
      .filter((a) => a.dateEntree)
      .map((a) => ({
        id: a.id,
        libelle: a.libelle?.trim() || undefined,
        dateEntree: a.dateEntree,
        ...(a.dateSortie ? { dateSortie: a.dateSortie } : {}),
        statut: a.statut ?? 'en-cours',
        ...(a.historique?.length ? { historique: a.historique } : {}),
      }));

    // Journalise chaque modification avant d'appliquer la mise à jour.
    const entrees: KanbanHistoriqueEntree[] = [];
    const journaliser = (categorie: KanbanHistoriqueCategorie, description: string) => {
      entrees.push(entreeHistorique(categorie, description));
    };
    const carteAvant = data.cartes.find((c) => c.id === edition.id);
    if (carteAvant) {
      if (titre !== carteAvant.titre) {
        journaliser('carte', `Titre modifié : « ${carteAvant.titre} » → « ${titre} »`);
      }
      if ((carteAvant.description ?? '') !== edition.description.trim()) {
        journaliser('carte', 'Description modifiée');
      }
      const champs: [string, string, string][] = [
        ['État', carteAvant.etat ?? '', edition.etat.trim()],
        ['Traiteur', carteAvant.traiteur ?? '', edition.traiteur.trim()],
        ['Client', carteAvant.client ?? '', edition.client.trim()],
        ['Commercial', carteAvant.commercial ?? '', edition.commercial.trim()],
      ];
      for (const [libelle, avant, apres] of champs) {
        if (avant !== apres) {
          journaliser(
            'carte',
            `${libelle} modifié : « ${avant || '—'} » → « ${apres || '—'} »`
          );
        }
      }
      if ((carteAvant.couleur ?? 'jaune') !== edition.couleur) {
        journaliser(
          'carte',
          `Couleur modifiée : ${KANBAN_COULEURS[carteAvant.couleur ?? 'jaune'].label} → ${
            KANBAN_COULEURS[edition.couleur].label
          }`
        );
      }
      if ((carteAvant.dateExpedition ?? '') !== (edition.dateExpedition ?? '')) {
        journaliser(
          'carte',
          `Envoi modifié : ${formatDateFr(carteAvant.dateExpedition)} → ${formatDateFr(
            edition.dateExpedition
          )}`
        );
      }
      if ((carteAvant.remarques ?? '') !== edition.remarques.trim()) {
        journaliser('carte', 'Remarques modifiées');
      }

      const avantParId = new Map((carteAvant.attentes ?? []).map((a) => [a.id, a]));
      const apresParId = new Map(attentes.map((a) => [a.id, a]));
      for (const attente of attentes) {
        if (avantParId.has(attente.id)) continue;
        journaliser(
          'attente',
          `Attente ajoutée : « ${attente.libelle ?? 'sans motif'} » (entrée ${formatDateFr(
            attente.dateEntree
          )})`
        );
      }
      for (const attente of carteAvant.attentes ?? []) {
        if (apresParId.has(attente.id)) continue;
        journaliser(
          'attente',
          `Attente supprimée : « ${attente.libelle?.trim() || 'sans motif'} »`
        );
      }
      for (const attente of attentes) {
        const avant = avantParId.get(attente.id);
        if (!avant) continue;
        const motif = attente.libelle ?? 'sans motif';
        const avantStatut = avant.statut ?? 'en-cours';
        const apresStatut = attente.statut ?? 'en-cours';
        if (avantStatut !== apresStatut) {
          journaliser(
            'attente',
            `Attente « ${motif} » ${
              apresStatut === 'cloture' ? 'clôturée' : 'remise en cours'
            }`
          );
        }
        if ((avant.libelle ?? '') !== (attente.libelle ?? '')) {
          journaliser(
            'attente',
            `Motif d'attente modifié : « ${avant.libelle?.trim() || '—'} » → « ${
              attente.libelle ?? '—'
            } »`
          );
        }
        if ((avant.dateEntree ?? '') !== (attente.dateEntree ?? '')) {
          journaliser(
            'attente',
            `Date d'entrée d'attente modifiée : ${formatDateFr(
              avant.dateEntree
            )} → ${formatDateFr(attente.dateEntree)}`
          );
        }
        if ((avant.dateSortie ?? '') !== (attente.dateSortie ?? '')) {
          journaliser(
            'attente',
            `Date de sortie d'attente modifiée : ${formatDateFr(
              avant.dateSortie
            )} → ${formatDateFr(attente.dateSortie)}`
          );
        }
      }
    }

    majCarte(
      edition.id,
      {
        titre,
        etat: edition.etat.trim() || undefined,
        description: edition.description.trim() || undefined,
        traiteur: edition.traiteur.trim() || undefined,
        client: edition.client.trim() || undefined,
        commercial: edition.commercial.trim() || undefined,
        remarques: edition.remarques.trim() || undefined,
        couleur: edition.couleur,
        dateExpedition: edition.dateExpedition || undefined,
        attentes,
      },
      entrees
    );
    fermerEdition();
  };

  /* --------------------- Card edit panel (presentation) -------------------- */

  const carteEdition = edition ? data.cartes.find((c) => c.id === edition.id) : undefined;
  const carteAlerte = alerteOuverte
    ? data.cartes.find((carte) => carte.id === alerteOuverte.carteId)
    : undefined;
  const carteDeplacement = deplacementOuvert
    ? data.cartes.find((carte) => carte.id === deplacementOuvert.carteId)
    : undefined;

  /** Existing values used to populate the full-edit selects (no new data fields). */
  const valeursTraiteur = Array.from(
    new Set(data.cartes.map((c) => c.traiteur?.trim()).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b, 'fr'));
  const valeursCommercial = Array.from(
    new Set(data.cartes.map((c) => c.commercial?.trim()).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b, 'fr'));
  const suggestionsClient = Array.from(
    new Set(data.cartes.map((c) => c.client?.trim()).filter((v): v is string => !!v))
  ).sort((a, b) => a.localeCompare(b, 'fr'));

  const dateDeplacementEdition = carteEdition
    ? getAlarmeInfo(carteEdition).dateEntree ?? carteEdition.dateEntreeZone ?? carteEdition.creeLe
    : undefined;
  const dateDeplacementISO = dateDeplacementEdition?.slice(0, 10);

  const erreurExpedition =
    modeEdition === 'complet' &&
    edition?.dateExpedition &&
    dateDeplacementISO &&
    edition.dateExpedition < dateDeplacementISO
      ? "La date d'envoi doit être postérieure ou égale à la date de déplacement."
      : null;

  const erreursAttentes: (string | null)[] = (edition?.attentes ?? []).map((a) =>
    a.dateEntree && a.dateSortie && a.dateSortie < a.dateEntree
      ? "La date de sortie doit être postérieure ou égale à la date d'entrée."
      : null
  );
  const formulaireInvalide = !!erreurExpedition || erreursAttentes.some(Boolean);

  const normaliserAttentes = (attentes: KanbanAttente[]) =>
    attentes.map((a) => ({
      id: a.id,
      libelle: a.libelle ?? '',
      dateEntree: a.dateEntree ?? '',
      dateSortie: a.dateSortie ?? '',
      statut: a.statut ?? 'en-cours',
      historique: (a.historique ?? []).map((h) => ({ date: h.date, statut: h.statut })),
    }));

  const editionModifiee = !!(
    edition &&
    carteEdition &&
    (edition.titre !== carteEdition.titre ||
      edition.etat !== (carteEdition.etat ?? '') ||
      edition.description !== (carteEdition.description ?? '') ||
      edition.traiteur !== (carteEdition.traiteur ?? '') ||
      edition.client !== (carteEdition.client ?? '') ||
      edition.commercial !== (carteEdition.commercial ?? '') ||
      edition.remarques !== (carteEdition.remarques ?? '') ||
      edition.couleur !== (carteEdition.couleur ?? 'jaune') ||
      (edition.dateExpedition ?? '') !== (carteEdition.dateExpedition ?? '') ||
      JSON.stringify(normaliserAttentes(edition.attentes)) !==
        JSON.stringify(normaliserAttentes(carteEdition.attentes ?? [])))
  );

  const enregistrementAutorise = !!edition && !formulaireInvalide;

  // Keep the latest save handler without re-subscribing the keyboard listener.
  const enregistrerEditionRef = useRef(enregistrerEdition);
  useEffect(() => {
    enregistrerEditionRef.current = enregistrerEdition;
  });

  useEffect(() => {
    if (!edition) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        fermerEdition();
      } else if (event.key === 'Enter' && !event.shiftKey) {
        const cible = event.target;
        if (event.isComposing || (cible instanceof HTMLElement && cible.closest('button'))) {
          return;
        }
        event.preventDefault();
        if (formulaireInvalide) return;
        if (editionModifiee) enregistrerEditionRef.current();
        else fermerEdition();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [edition, formulaireInvalide, editionModifiee, fermerEdition]);

  /**
   * Adaptive popover placement: opens to the right of the card, flips left or
   * above when it would overflow, and stays clamped inside the viewport.
   */
  const placerEdition = useCallback(() => {
    if (!ancreEdition) return;
    if (!ancreEdition.isConnected) {
      fermerEdition();
      return;
    }
    const rect = ancreEdition.getBoundingClientRect();
    const panneau = panneauEditionRef.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const largeur = panneau?.offsetWidth ?? Math.min(POPOVER_LARGEUR, vw - POPOVER_MARGE * 2);
    const hauteur = Math.min(
      panneau?.offsetHeight ?? vh - POPOVER_MARGE * 2,
      vh - POPOVER_MARGE * 2
    );

    let left = rect.right + POPOVER_GAP;
    if (left + largeur + POPOVER_MARGE > vw) {
      const aGauche = rect.left - POPOVER_GAP - largeur;
      left = aGauche >= POPOVER_MARGE ? aGauche : Math.max(POPOVER_MARGE, vw - POPOVER_MARGE - largeur);
    }

    let top = rect.top;
    if (top + hauteur + POPOVER_MARGE > vh) top = rect.top - POPOVER_GAP - hauteur;
    top = clamp(top, POPOVER_MARGE, Math.max(POPOVER_MARGE, vh - POPOVER_MARGE - hauteur));

    setPositionEdition((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, [ancreEdition, fermerEdition]);

  useLayoutEffect(() => {
    if (!edition) return;
    placerEdition();
  }, [edition, placerEdition]);

  // Follow the anchor card on any scroll (board included) and on resize.
  useEffect(() => {
    if (!edition) return;
    const onMove = () => placerEdition();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [edition, placerEdition]);

  // Outside click closes the popover, but clicking the anchor card keeps the draft.
  useEffect(() => {
    if (!edition) return;
    const onDown = (event: MouseEvent) => {
      const cible = event.target as Node | null;
      if (!cible) return;
      if (panneauEditionRef.current?.contains(cible)) return;
      if (ancreEdition?.contains(cible)) return;
      fermerEdition();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [edition, ancreEdition, fermerEdition]);

  const validerComposer = (colonneId: string, sectionId?: string) => {
    if (!composerNom.trim() || !composerCouleur) return;
    ajouterCarte(colonneId, sectionId, composerNom, composerEtat, composerTraiteur, composerClient, composerCommercial, composerRemarques, composerCouleur, composerDateEcheance, composerDateExpedition);
    setComposerNom('');
    setComposerEtat('');
    setComposerTraiteur('');
    setComposerClient('');
    setComposerCommercial('');
    setComposerRemarques('');
    setComposerCouleur(null);
    setComposerDateEcheance('');
    setComposerDateExpedition('');
  };

  const fermerComposer = () => {
    setComposerOuverte(null);
    setComposerNom('');
    setComposerEtat('');
    setComposerTraiteur('');
    setComposerClient('');
    setComposerCommercial('');
    setComposerRemarques('');
    setComposerCouleur(null);
    setComposerDateEcheance('');
    setComposerDateExpedition('');
  };

  const copierCarte = (carte: KanbanCarte) => {
    const lignes = [
      `Titre : ${carte.titre}`,
      carte.etat ? `Étape : ${carte.etat}` : null,
      carte.description ? `Description : ${carte.description}` : null,
      carte.traiteur ? `Traiteur : ${carte.traiteur}` : null,
      carte.client ? `Client : ${carte.client}` : null,
      carte.commercial ? `Commercial : ${carte.commercial}` : null,
      carte.date ? `Date d'échéance : ${formatDateFr(carte.date)}` : null,
      carte.dateExpedition ? `Date d'envoi : ${formatDateFr(carte.dateExpedition)}` : null,
      carte.remarques ? `Remarques : ${carte.remarques}` : null,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lignes);
    setCopieOk(carte.id);
    setTimeout(() => setCopieOk(null), 1200);
  };

  const destinationsCarte = (carte: KanbanCarte): DestinationDeplacement[] => {
    const destinations: DestinationDeplacement[] = [];
    for (const colonne of trierParOrdre(data.colonnes)) {
      const sections = trierParOrdre(colonne.sections ?? []);
      const estBrodeuse = estColonneBrodeuse(colonne);
      const estBroderieMain = estColonneBroderie(colonne);
      const zones = estBrodeuse
        ? sections.filter(
            (section) => !estSectionBrodeuse(section) && !estSectionBroderieMain(section)
          )
        : sections.filter((section) => !estBroderieMain || !estSectionBroderieMain(section));

      for (const section of zones) {
        destinations.push({
          key: `${colonne.id}::${section.id}`,
          colonneId: colonne.id,
          sectionId: section.id,
          label: `${colonne.titre} · ${section.titre}`,
        });
      }

      if (estBrodeuse) {
        const section = sections.find((item) => estSectionBrodeuse(item));
        if (section) {
          destinations.push({
            key: `${colonne.id}::${section.id}::non-assignee`,
            colonneId: colonne.id,
            sectionId: section.id,
            label: `${colonne.titre} · Non assignées`,
          });
          for (const personne of trierParOrdre(section.personnes ?? [])) {
            destinations.push({
              key: `${colonne.id}::${section.id}::${personne.id}`,
              colonneId: colonne.id,
              sectionId: section.id,
              personneId: personne.id,
              label: `${colonne.titre} · ${personne.titre}`,
            });
          }
        } else if (sections.length === 0) {
          destinations.push({
            key: `${colonne.id}::non-assignee`,
            colonneId: colonne.id,
            label: `${colonne.titre} · Non assignées`,
          });
        }
      } else if (estBroderieMain || sections.some(estSectionBroderieMain)) {
        for (const section of sections.filter(estSectionBroderieMain)) {
          for (const personne of trierParOrdre(section.personnes ?? [])) {
            destinations.push({
              key: `${colonne.id}::${section.id}::${personne.id}`,
              colonneId: colonne.id,
              sectionId: section.id,
              personneId: personne.id,
              label: `${colonne.titre} · ${personne.titre}`,
            });
          }
        }
        if (sections.length === 0) {
          destinations.push({
            key: colonne.id,
            colonneId: colonne.id,
            label: colonne.titre,
          });
        }
      } else if (sections.length === 0) {
        destinations.push({
          key: `${colonne.id}`,
          colonneId: colonne.id,
          label: colonne.titre,
        });
      }
    }

    return destinations.filter(
      (destination) =>
        destination.colonneId !== carte.colonneId ||
        (destination.sectionId ?? undefined) !== (carte.sectionId ?? undefined) ||
        (destination.personneId ?? undefined) !== (carte.personneId ?? undefined)
    );
  };

  const destinationsDeplacement = carteDeplacement
    ? destinationsCarte(carteDeplacement)
    : [];

  const executerDeplacement = (carteId: string, destinationKey: string) => {
    const carte = data.cartes.find((item) => item.id === carteId);
    if (!carte) return;
    const destination = destinationsCarte(carte).find((item) => item.key === destinationKey);
    if (!destination) return;

    setCarteAnimeeId(null);
    window.requestAnimationFrame(() => {
      setCarteAnimeeId(carteId);
    });

    if (destination.personneId && destination.sectionId) {
      const colonne = data.colonnes.find((item) => item.id === destination.colonneId);
      const section = colonne?.sections?.find((item) => item.id === destination.sectionId);
      const personnesCartes = data.cartes.filter(
        (item) =>
          item.id !== carteId &&
          item.colonneId === destination.colonneId &&
          item.sectionId === destination.sectionId &&
          item.personneId === destination.personneId
      );
      if (section && estSectionBroderieMain(section)) {
        deplacerCartePersonne(
          carteId,
          destination.colonneId,
          destination.sectionId,
          destination.personneId,
          personnesCartes.length
        );
      } else {
        deplacerCarteBrodeuse(
          carteId,
          destination.colonneId,
          destination.sectionId,
          destination.personneId,
          personnesCartes.length
        );
      }
    } else {
      const cartesZone = data.cartes.filter(
        (item) =>
          item.id !== carteId &&
          item.colonneId === destination.colonneId &&
          (item.sectionId ?? undefined) === (destination.sectionId ?? undefined)
      );
      deplacerCarte(
        carteId,
        destination.colonneId,
        destination.sectionId,
        cartesZone.length
      );
    }
    const indexDestination = colonnes.findIndex(
      (colonne) => colonne.id === destination.colonneId
    );
    if (indexDestination >= 0) {
      allerPageEtapes(Math.floor(indexDestination / ETAPES_PAR_PAGE));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          const colonneDestination = Array.from(
            document.querySelectorAll<HTMLElement>('[data-kanban-column]')
          ).find((element) => element.dataset.kanbanColumn === destination.colonneId);
          colonneDestination?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
          });
        });
      });
    }
    fermerDeplacement();
  };

  /** Post-its d'une zone : formes carrées, 2 par ligne, édition via la fiche. */
  const rendreCartes = (zone: { sectionId?: string }, cartesZone: KanbanCarte[]) =>
    cartesZone.map((carte, position) => {
      const enDrag = drag?.type === 'carte' && drag.id === carte.id;
      const colonneCarte = data.colonnes.find((c) => c.id === carte.colonneId);
      const estArchive = !!colonneCarte && colonneCarte.titre.toUpperCase().includes('ARCHIVE');
      const alarmeInfo = getAlarmeInfo(carte);
      const alarme = alarmeInfo.active;
      const { diffZone, diffTotal } = alarmeInfo;
      const postIt = KANBAN_COULEURS[carte.couleur ?? 'jaune'];
      const alerteAttente = getAlerteAttente(carte);
      const attenteEstOrange = alerteAttente?.niveau === 'orange';
      const attenteEstRouge = alerteAttente?.niveau === 'rouge';
      const attenteJours = alerteAttente?.jours ?? 0;
      const attenteOuverte = (carte.attentes ?? []).find((a) => !estAttenteCloturee(a));
      const attenteEnCours = !!attenteOuverte;
      // L'alerte d'attente en cours écrase l'alerte 2j/4j de l'étape ; l'alerte
      // globale (12 jours) reste visible.
      const alarmeAffichee =
        alarme && (alarmeInfo.type === 'global' || (alarmeInfo.type === 'zone' && !attenteEnCours));
      const echeanceJours = estDateISO(carte.date) ? -joursEntreDatesISO(carte.date) : null;
      const retardJours = alarmeInfo.type === 'global' ? diffTotal : diffZone;

      let alerteIcone = <Check className="h-3.5 w-3.5 shrink-0" />;
      let alerteTexte = 'Aucune alerte';
      let alerteClasses = 'bg-emerald-50 text-emerald-700';
      if (attenteEstRouge) {
        alerteIcone = <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = `Attente en retard${alerteAttente?.attente.libelle ? ` · ${alerteAttente.attente.libelle}` : ''} · ${attenteJours} j`;
        alerteClasses = 'bg-red-100 text-red-700';
      } else if (alarmeAffichee) {
        alerteIcone = <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = `${retardJours} jour${retardJours > 1 ? 's' : ''} de retard`;
        alerteClasses = 'bg-red-100 text-red-700';
      } else if (echeanceJours !== null && echeanceJours < 0) {
        alerteIcone = <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = `${-echeanceJours} jour${-echeanceJours > 1 ? 's' : ''} de retard`;
        alerteClasses = 'bg-red-100 text-red-700';
      } else if (attenteEstOrange) {
        alerteIcone = <Pause className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = `Attente${alerteAttente?.attente.libelle ? ` : ${alerteAttente.attente.libelle}` : ''} · ${attenteJours} j`;
        alerteClasses = 'bg-orange-100 text-orange-800 ring-1 ring-orange-300';
      } else if (attenteOuverte) {
        alerteIcone = <Pause className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = `Attente${attenteOuverte.libelle ? ` : ${attenteOuverte.libelle}` : ''}`;
        alerteClasses = 'bg-slate-100 text-slate-600';
      } else if (echeanceJours === 0) {
        alerteIcone = <Clock className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = "À rendre aujourd'hui";
        alerteClasses = 'bg-amber-100 text-amber-800';
      } else if (echeanceJours === 1) {
        alerteIcone = <Clock className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = 'À rendre demain';
        alerteClasses = 'bg-amber-100 text-amber-800';
      } else if (echeanceJours === 2) {
        alerteIcone = <Clock className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = 'À rendre dans 2 jours';
        alerteClasses = 'bg-amber-100 text-amber-800';
      }

      let detailsAlerte = '';
      if (attenteEstRouge && alerteAttente) {
        detailsAlerte = `L'attente « ${alerteAttente.attente.libelle?.trim() || 'sans motif'} » a dépassé sa date de sortie du ${formatDateFr(alerteAttente.attente.dateSortie)}.`;
      } else if (alarmeAffichee) {
        detailsAlerte =
          alarmeInfo.type === 'global'
            ? `La carte est dans l'étape « ${colonneCarte?.titre ?? '—'} » depuis ${diffTotal} jours. Le délai global de 12 jours pour atteindre la dernière étape est dépassé.`
            : `La carte est dans l'étape « ${colonneCarte?.titre ?? '—'} » depuis ${diffZone} jours, au-delà du seuil de ${alarmeInfo.seuilZone} jours.`;
      } else if (echeanceJours !== null && echeanceJours < 0) {
        detailsAlerte = `L'échéance du ${formatDateFr(carte.date)} est dépassée de ${-echeanceJours} jour${-echeanceJours > 1 ? 's' : ''}.`;
      } else if (attenteEstOrange && alerteAttente) {
        detailsAlerte = `L'attente « ${alerteAttente.attente.libelle?.trim() || 'sans motif'} » arrive à sa date de sortie le ${formatDateFr(alerteAttente.attente.dateSortie)}.`;
      } else if (attenteOuverte) {
        detailsAlerte = `Une attente est en cours${attenteOuverte.libelle?.trim() ? ` : « ${attenteOuverte.libelle.trim()} »` : ''}${attenteOuverte.dateSortie ? ` jusqu'au ${formatDateFr(attenteOuverte.dateSortie)}` : ''}.`;
      } else if (echeanceJours !== null) {
        detailsAlerte = `L'échéance est fixée au ${formatDateFr(carte.date)}.`;
      }

      const alertesManuelles = carte.alertes ?? [];
      const aAlerteAutomatique = alerteTexte !== 'Aucune alerte';
      const texteBoutonAlerte = aAlerteAutomatique
        ? alerteTexte
        : alertesManuelles.length > 0
          ? `Alertes ajoutées · ${alertesManuelles.length}`
          : 'Ajouter une alerte';
      const classesBoutonAlerte = aAlerteAutomatique
        ? alerteClasses
        : alertesManuelles.length > 0
          ? 'bg-rose-100 text-rose-800'
          : 'bg-white/80 text-slate-500 ring-1 ring-slate-200';
      const iconeBoutonAlerte = aAlerteAutomatique
        ? alerteIcone
        : alertesManuelles.length > 0
          ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          : <Plus className="h-3.5 w-3.5 shrink-0" />;

      const proprietaire = [carte.client, carte.traiteur].filter(Boolean).join(' / ');
      const description = carte.description?.trim();
      const remarque = carte.remarques?.trim();
      return (
        <div
          key={carte.id}
          draggable
          data-carte-id={carte.id}
          onDragStart={(e) => dragCarte(e, carte.id)}
          onDragEnd={arreterDrag}
          onDragOver={(e) => survolCarte(e, carte, position, zone.sectionId)}
          onClick={(e) => ouvrirEdition(carte, e.currentTarget)}
          className={`w-full cursor-pointer rounded-xl border p-3.5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${postIt.fond} ${postIt.bordure} ${
            enDrag ? 'opacity-40' : ''
          } ${carteAnimeeId === carte.id ? 'animate-carte-deplacee' : ''}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex shrink-0 flex-col items-start gap-1 text-[10px] leading-tight">
              <span
                title={`Création : ${formatDateFr(carte.creeLe)}`}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white/80 px-1.5 py-1 font-bold text-violet-800"
              >
                <Calendar aria-hidden="true" className="h-3 w-3" />
                <span>Créée</span>
                {formatDateJourMois(carte.creeLe)}
              </span>
              <span
                title={`Envoi : ${formatDateFr(carte.dateExpedition)}`}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white/80 px-1.5 py-1 font-bold text-violet-800"
              >
                <Calendar aria-hidden="true" className="h-3 w-3" />
                <span>Envoi</span>
                {formatDateJourMois(carte.dateExpedition)}
              </span>
            </div>
            <div className="flex min-w-0 items-start justify-end gap-1">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={alerteOuverte?.carteId === carte.id}
                onClick={(event) => {
                  event.stopPropagation();
                  const anchor = event.currentTarget;
                  if (alerteOuverte?.carteId === carte.id) {
                    fermerAlerte();
                    return;
                  }
                  setAlerteOuverte({
                    anchor,
                    carteId: carte.id,
                    titreCarte: carte.titre,
                    titreAlerte: texteBoutonAlerte,
                    details: aAlerteAutomatique
                      ? detailsAlerte
                      : alertesManuelles.length > 0
                        ? 'Cette carte contient des alertes ajoutées manuellement.'
                        : 'Aucune alerte automatique actuellement.',
                    classes: classesBoutonAlerte,
                    icone: iconeBoutonAlerte,
                  });
                }}
                className={`inline-flex max-w-[65%] cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-shadow hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400 ${classesBoutonAlerte}`}
              >
                {iconeBoutonAlerte}
                <span className="min-w-0 truncate">{texteBoutonAlerte}</span>
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  const anchor = event.currentTarget;
                  if (deplacementOuvert?.carteId === carte.id) {
                    fermerDeplacement();
                    return;
                  }
                  fermerAlerte();
                  setPositionDeplacement(null);
                  setDeplacementOuvert({ anchor, carteId: carte.id, destinationKey: '' });
                }}
                aria-label={`Déplacer ${carte.titre}`}
                title="Déplacer le post-it"
                className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-violet-700"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-1 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug text-slate-900">
                {carte.titre}
              </p>
              {proprietaire && (
                <p className="mt-0.5 truncate text-xs text-slate-500">{proprietaire}</p>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (estArchive) copierCarte(carte);
                else {
                  const ancre = e.currentTarget.closest<HTMLElement>('[data-carte-id]');
                  ouvrirEdition(carte, ancre ?? e.currentTarget, 'complet');
                }
              }}
              title={
                estArchive
                  ? copieOk === carte.id
                    ? 'Copié !'
                    : 'Copier la carte'
                  : 'Ouvrir la fiche complète'
              }
              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-700"
            >
              {estArchive ? (
                copieOk === carte.id ? (
                  <Check className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </button>
          </div>

          {(description || remarque || (carte.attentes?.length ?? 0) > 0) && (
            <div className="mt-1.5 space-y-1">
              {description && (
                <p className="line-clamp-2 text-[11px] leading-snug text-slate-600">
                  {description}
                </p>
              )}
              {remarque && (
                <p className="line-clamp-2 text-[11px] italic leading-snug text-slate-500">
                  Remarque : {remarque}
                </p>
              )}
              {(carte.attentes ?? []).map((attente) => {
                const cloturee = estAttenteCloturee(attente);
                return (
                  <div
                    key={attente.id}
                    className="flex items-center gap-1 text-[10px] font-semibold text-slate-600"
                  >
                    <span className="min-w-0 truncate">
                      en attente : {attente.libelle?.trim() || 'sans motif'} °{' '}
                      {formatDateJourMois(attente.dateSortie)} °
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (cloturee) marquerAttenteEnCours(carte.id, attente.id);
                        else cloturerAttente(carte.id, attente.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={cloturee ? "Remettre l'attente en cours" : "Clôturer l'attente"}
                      aria-label={cloturee ? "Remettre l'attente en cours" : "Clôturer l'attente"}
                      className="shrink-0 rounded p-0.5 transition-colors hover:bg-white/70"
                    >
                      {cloturee ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <X className="h-3 w-3 text-orange-500" />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                Statut
              </span>
              <span
                className={`min-w-0 truncate rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  carte.etat?.trim()
                    ? 'border border-violet-200 bg-violet-100 text-violet-800'
                    : 'border border-slate-200 bg-slate-100 text-slate-500'
                }`}
              >
                {carte.etat?.trim() || '—'}
              </span>
            </div>
            <span
              title={`Échéance : ${formatDateFr(carte.date)}`}
              onClick={(event) => {
                event.stopPropagation();
                const input = event.currentTarget.querySelector('input');
                if (input?.showPicker) input.showPicker();
                else input?.click();
              }}
              className="relative inline-flex w-[58px] shrink-0 cursor-pointer items-center gap-1 overflow-hidden rounded-md border border-slate-200 bg-white/75 px-1 py-0.5 font-semibold text-slate-700"
            >
              <Calendar aria-hidden="true" className="h-3 w-3 text-violet-600" />
              <span className="whitespace-nowrap text-[10px]">
                {carte.date ? formatDateJourMois(carte.date) : 'JJ/MM'}
              </span>
              <input
                type="date"
                aria-label={`Modifier l’échéance de ${carte.titre}`}
                title="Modifier l’échéance"
                value={carte.date ?? ''}
                onClick={(event) => event.stopPropagation()}
                onDragStart={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                onChange={(event) => {
                  event.stopPropagation();
                  const date = event.target.value;
                  if (date === (carte.date ?? '')) return;
                  majCarte(carte.id, { date: date || undefined }, [
                    entreeHistorique(
                      'carte',
                      `Échéance modifiée : ${formatDateFr(carte.date)} → ${formatDateFr(date)}`
                    ),
                  ]);
                }}
                tabIndex={-1}
                className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
              />
            </span>
          </div>
        </div>
      );
    });

  /** Fiche identitaire d'un nouveau post-it, ou bouton d'ouverture de la fiche. */
  const rendreComposer = (colonne: KanbanColonne, zone: { sectionId?: string }) =>
    composerOuverte === cleZone(colonne.id, zone.sectionId) ? (
      <div className="w-full bg-white rounded-xl border-2 border-violet-300 shadow-sm p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600">
            Fiche identitaire
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
              <span>Date de création</span>
              <span className="text-xs font-semibold text-slate-700 font-mono bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                {new Date().toLocaleDateString('fr-FR')}
              </span>
            </div>
            <button
              type="button"
              onClick={fermerComposer}
              title="Fermer la fiche"
              className="p-0.5 rounded text-slate-300 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Nom
          </label>
          <input
            autoFocus
            value={composerNom}
            onChange={(e) => setComposerNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Nom de la tâche"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Étape
          </label>
          <input
            value={composerEtat}
            onChange={(e) => setComposerEtat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Étape (ex: En cours, En attente, Terminé)"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Traiteur
          </label>
          <input
            value={composerTraiteur}
            onChange={(e) => setComposerTraiteur(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Traiteur (nom du responsable)"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Client
          </label>
          <input
            value={composerClient}
            onChange={(e) => setComposerClient(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Nom du client"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Commercial
          </label>
          <input
            value={composerCommercial}
            onChange={(e) => setComposerCommercial(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Nom du commercial"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Remarques
          </label>
          <textarea
            rows={3}
            value={composerRemarques}
            onChange={(e) => setComposerRemarques(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Remarques libres…"
            className="w-full text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
            Date d'échéance
            <input
              type="date"
              value={composerDateEcheance}
              onChange={(e) => setComposerDateEcheance(e.target.value)}
              className="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-hidden focus:border-violet-400 w-auto"
            />
          </label>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
            Date d'envoi
            <input
              type="date"
              value={composerDateExpedition}
              onChange={(e) => setComposerDateExpedition(e.target.value)}
              className="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-hidden focus:border-violet-400 w-auto"
            />
          </label>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Couleur du post-it
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {COULEURS_KANBAN_IDS.map((couleurId) => {
              const meta = KANBAN_COULEURS[couleurId];
              const actif = composerCouleur === couleurId;
              return (
                <button
                  key={couleurId}
                  type="button"
                  onClick={() => setComposerCouleur(couleurId)}
                  className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-1.5 py-1.5 rounded-md border ${meta.fond} ${meta.bordure} transition cursor-pointer ${
                    actif
                      ? 'ring-2 ring-offset-1 ring-slate-700 shadow-sm'
                      : 'opacity-70 hover:opacity-100 hover:shadow-sm'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.point}`} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            disabled={!composerNom.trim() || !composerCouleur}
            onClick={() => validerComposer(colonne.id, zone.sectionId)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md px-2 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Ajouter
          </button>
          <button
            type="button"
            onClick={fermerComposer}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            Annuler
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => {
          setComposerOuverte(cleZone(colonne.id, zone.sectionId));
          setComposerNom('');
          setComposerEtat('');
          setComposerTraiteur('');
          setComposerClient('');
          setComposerCommercial('');
          setComposerRemarques('');
          setComposerCouleur(null);
          setComposerDateEcheance('');
          setComposerDateExpedition('');
        }}
        className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-violet-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Nouvelle Carte
      </button>
    );

  /**
   * Liste de cartes d'une zone : grille de 2 post-its par ligne, état vide et
   * fiche identitaire. `avecComposer` masque la création dans les cellules
   * « personne » de BRODERIE MAIN (assignation par glisser-déposer).
   */
  const construireListe = (
    colonne: KanbanColonne,
    zone: { section?: KanbanSection; sectionId?: string },
    avecComposer = true
  ) => {
    const cartesZone = cartesDeSection(colonne, zone.sectionId);
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    // Surlignage : zone de section ciblée, ou colonne simple ciblée.
    const surligne = zone.section
      ? enCible &&
        insertion?.colonneId === colonne.id &&
        (insertion?.sectionId ?? null) === (zone.sectionId ?? null)
      : enCible;
    return (
      <div
        key={zone.sectionId ?? 'unique'}
        onDragOver={(e) => survolZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        onDrop={(e) => deposerDansZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        className={`flex flex-col gap-2 content-start transition-colors ${
          zone.section ? 'min-h-[5rem] px-1' : 'min-h-[7rem] rounded-b-2xl'
        } ${surligne ? 'bg-violet-50/70' : ''}`}
      >
        {cartesZone.length === 0 && (
          <div className="w-full rounded-lg border border-dashed border-slate-300/80 px-3 py-4 text-center text-[11px] text-slate-400">
            {surligne
              ? 'Déposez la carte ici'
              : avecComposer
                ? 'Aucune tâche'
                : 'Glissez une carte ici'}
          </div>
        )}

        {rendreCartes(zone, cartesZone)}

        {avecComposer && rendreComposer(colonne, zone)}
      </div>
    );
  };

  /**
   * Liste de cartes d'une personne dans le tableau BRODERIE MAIN.
   * Grille 2 post-its/ligne, sans fiche identitaire (assignation par glisser-déposer).
   */
  const construireListePersonne = (
    colonne: KanbanColonne,
    section: KanbanSection,
    personne: KanbanPersonne
  ) => {
    const cartesZone = trierParOrdre(
      data.cartes.filter(
        (c) => c.colonneId === colonne.id && c.sectionId === section.id && c.personneId === personne.id
      )
    );
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    const surligne =
      enCible &&
      insertion?.colonneId === colonne.id &&
      insertion?.sectionId === section.id &&
      insertion?.personneId === personne.id;
    return (
      <div
        key={personne.id}
        onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personne.id, cartesZone.length)}
        onDrop={(e) => deposerZonePersonne(e, colonne.id, section.id, personne.id, cartesZone.length)}
        className={`flex flex-col gap-2 content-start min-h-[5rem] px-1 transition-colors ${
          surligne ? 'bg-violet-50/70' : ''
        }`}
      >
        {cartesZone.length === 0 && (
          <div className="w-full rounded-lg border border-dashed border-slate-300/80 px-3 py-4 text-center text-[11px] text-slate-400">
            {surligne ? 'Déposez la carte ici' : 'Glissez une carte ici'}
          </div>
        )}
        {rendreCartes({ sectionId: section.id }, cartesZone)}
      </div>
    );
  };

  /** Liste de cartes d'une brodeuse (colonne BRODERIE MACHINE / LABO CONFECTION). */
  const construireListeBrodeuse = (
    colonne: KanbanColonne,
    section: KanbanSection,
    personne: KanbanPersonne
  ) => {
    const cartesZone = trierParOrdre(
      data.cartes.filter(
        (c) => c.colonneId === colonne.id && c.sectionId === section.id && c.personneId === personne.id
      )
    );
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    const surligne =
      enCible &&
      insertion?.colonneId === colonne.id &&
      insertion?.sectionId === section.id &&
      insertion?.personneId === personne.id;
    return (
      <div
        key={personne.id}
        onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personne.id, cartesZone.length)}
        onDrop={(e) => deposerZoneBrodeuse(e, colonne.id, section.id, personne.id, cartesZone.length)}
        className={`flex flex-col gap-2 content-start min-h-[5rem] px-1 transition-colors ${
          surligne ? 'bg-violet-50/70' : ''
        }`}
      >
        {cartesZone.length === 0 && (
          <div className="w-full rounded-lg border border-dashed border-slate-300/80 px-3 py-4 text-center text-[11px] text-slate-400">
            {surligne ? 'Déposez la carte ici' : 'Glissez une carte ici'}
          </div>
        )}
        {rendreCartes({ sectionId: section.id }, cartesZone)}
      </div>
    );
  };

  /** Zone complète : liste simple, ou liste encadrée avec son en-tête. */
  const renduZone = (
    colonne: KanbanColonne,
    zone: { section?: KanbanSection; sectionId?: string }
  ) => {
    const liste = construireListe(colonne, zone);
    const section = zone.section;
    if (!section) return liste;
    const cartesZone = cartesDeSection(colonne, zone.sectionId);
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    const surligne =
      enCible &&
      insertion?.colonneId === colonne.id &&
      (insertion?.sectionId ?? null) === (zone.sectionId ?? null);
    return (
      <div
        key={section.id}
        onDragOver={(e) => survolZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        onDrop={(e) => deposerDansZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        className={`rounded-xl border p-1.5 transition-all ${
          surligne
            ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/60'
            : 'border-slate-200/80 bg-white/50'
        }`}
      >
        <div
          onDragOver={(e) => survolZone(e, colonne.id, zone.sectionId, 0)}
          onDrop={(e) => deposerDansZone(e, colonne.id, zone.sectionId, 0)}
          className="flex items-center gap-1 px-1 pb-1"
        >
          <EditableItemName
            value={section.titre}
            onSave={(titre) => renommerSection(colonne.id, section.id, titre)}
            placeholder="Section"
            className="min-w-0"
          />
          <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
            {cartesZone.length}
          </span>
          <button
            type="button"
            onClick={() => supprimerSection(colonne.id, section.id)}
            title="Supprimer la section"
            className="ml-2 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {liste}
      </div>
    );
  };

  /**
   * Colonne « BRODERIE MAIN » (sous « Broderie Machine ») : tableau à 4
   * colonnes, une ligne par personne, deux listes indépendantes (client /
   * initiatives). Les post-its créés ici atterrissent dans la zone
* d'attente « Non assignées », puis se glissent sur une personne.
    */
  /** Zone simple (colonne non scindée) : une seule liste. */
  const zonesSimple = (colonne: KanbanColonne) =>
    renduZone(colonne, { sectionId: undefined });

  /**
   * Tableau 4 colonnes de la section BRODERIE MAIN (personnes × post-its).
   * Deux listes indépendantes (client / initiatives), une ligne par personne.
   */
  const renduBroderieMain = (colonne: KanbanColonne, section: KanbanSection) => {
    const personnes = section.personnes ?? [];
    const client = trierParOrdre(personnes.filter((p) => p.bloc === 'client'));
    const initiatives = trierParOrdre(personnes.filter((p) => p.bloc === 'initiatives'));
    const nbLignes = Math.max(client.length, initiatives.length);
    const grille = 'grid grid-cols-[11rem_minmax(0,1fr)_11rem_minmax(0,1fr)]';

    const cartesDeSection = trierParOrdre(
      data.cartes.filter((c) => c.colonneId === colonne.id && c.sectionId === section.id)
    );

    const cartesDePersonne = (personneId: string): KanbanCarte[] =>
      trierParOrdre(
        data.cartes.filter(
          (c) => c.colonneId === colonne.id && c.sectionId === section.id && c.personneId === personneId
        )
      );

    const cellulePersonne = (personne: KanbanPersonne, bordureDroite: boolean) => {
      const nb = cartesDePersonne(personne.id).length;
      return (
        <div
          key={personne.id}
          className={`group px-2 py-1 space-y-0.5 ${bordureDroite ? 'border-r border-slate-200' : ''}`}
          onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personne.id, nb)}
          onDrop={(e) => deposerZonePersonne(e, colonne.id, section.id, personne.id, nb)}
        >
          <EditableItemName
            value={personne.titre}
            onSave={(titre) => renommerPersonne(colonne.id, section.id, personne.id, titre)}
            placeholder="Nom"
            className="w-full min-w-0"
          />
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums">
              {nb}
            </span>
            <button
              type="button"
              onClick={() => supprimerPersonne(colonne.id, section.id, personne.id)}
              title="Supprimer la personne"
              className="ml-auto p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {renduStatutsPersonne(colonne.id, section.id, personne)}
        </div>
      );
    };

    const celluleCartes = (personne: KanbanPersonne, bordureDroite: boolean) => (
      <div className={`px-1 py-1 ${bordureDroite ? 'border-r border-slate-200' : ''}`}>
        {construireListePersonne(colonne, section, personne)}
      </div>
    );

    const celluleVide = (bordureDroite: boolean) => (
      <div className={`bg-slate-50/50 ${bordureDroite ? 'border-r border-slate-200' : ''}`} />
    );

    const boutonPersonne = (bloc: KanbanBloc) => (
      <button
        type="button"
        onClick={() => ajouterPersonne(colonne.id, section.id, bloc)}
        className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-violet-700 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter une personne
      </button>
    );

    /** Remet à zéro la section BRODERIE MAIN (cartes + personnes). */
    const resetBroderieMain = (colonneId: string, sectionId: string) => {
      if (!window.confirm('Vider la section BRODERIE MAIN (supprime toutes les cartes et personnes) ?')) return;
      setData((prev) => ({
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? { ...c, sections: c.sections?.map((s) => (s.id === sectionId ? { ...s, personnes: [] } : s)) }
            : c
        ),
        cartes: prev.cartes.filter((k) => !(k.colonneId === colonneId && k.sectionId === sectionId)),
      }));
    };

    return (
      <div className="px-2 pb-2 space-y-2">
        {/* En-tête de section (comme les autres sections) */}
        <div
          onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personnes[0]?.id ?? '', 0)}
          onDrop={(e) => deposerZonePersonne(e, colonne.id, section.id, personnes[0]?.id ?? '', 0)}
          className="flex items-center gap-1 px-1 pb-1"
        >
          <EditableItemName
            value={section.titre}
            onSave={(titre) => renommerSection(colonne.id, section.id, titre)}
            placeholder="Section"
            className="min-w-0"
          />
          <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
            {cartesDeSection.length}
          </span>
          <button
            type="button"
            onClick={() => resetBroderieMain(colonne.id, section.id)}
            title="Vider la section BRODERIE MAIN"
            className="ml-2 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/60 overflow-hidden">
          <div className={`${grille} bg-slate-50 border-b border-slate-200`}>
            {['Brodeuse', 'Développement client', 'Brodeuse', 'Développement initiatives'].map(
              (titre, i) => (
                <div
                  key={`${titre}-${i}`}
                  className={`px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    i % 2 === 0 ? 'text-violet-700' : 'text-slate-500'
                  } ${i < 3 ? 'border-r border-slate-200' : ''}`}
                >
                  {titre}
                </div>
              )
            )}
          </div>
          {nbLignes === 0 && (
            <div className="px-3 py-3 text-center text-[11px] text-slate-400">
              Aucune personne : ajoutez une brodeuse de chaque côté ci-dessous.
            </div>
          )}
          {Array.from({ length: nbLignes }, (_, i) => (
            <div key={`ligne-${i}`} className={`${grille} border-b border-slate-200/70 last:border-b-0`}>
              {client[i] ? cellulePersonne(client[i], true) : celluleVide(true)}
              {client[i] ? celluleCartes(client[i], true) : celluleVide(true)}
              {initiatives[i] ? cellulePersonne(initiatives[i], true) : celluleVide(true)}
              {initiatives[i] ? celluleCartes(initiatives[i], false) : celluleVide(false)}
            </div>
          ))}
          <div className={`${grille} bg-slate-50 border-t border-slate-200`}>
            <div className="col-span-2 border-r border-slate-200 px-2 py-1.5">
              {boutonPersonne('client')}
            </div>
            <div className="col-span-2 px-2 py-1.5">{boutonPersonne('initiatives')}</div>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Tableau des brodeuses d'une colonne « BRODERIE MACHINE » / « LABO
   * CONFECTION » : une tuile par brodeuse, affectation par glisser-déposer.
   */
  const renduBrodeuse = (colonne: KanbanColonne) => {
    const section = colonne.sections?.find((s) => estSectionBrodeuse(s));
    // Sans section « Brodeuses », la zone « Non assignées » accepte les dépôts
    // tant que la colonne n'a pas d'autres sections (ex. PATRONNAGE).
    const peutDeposerNon = !!section || !colonne.sections?.length;
    const personnes = trierParOrdre(section?.personnes ?? []);
    const nbCartes = section
      ? data.cartes.filter((c) => c.colonneId === colonne.id && c.sectionId === section.id).length
      : 0;
    const estLabo = true;
    // Libellé de la colonne selon son titre
    const libelleBrodeuse =
      colonne.titre?.includes('PATRONNAGE')
        ? 'PATRONNIER'
        : colonne.titre?.includes('PUNCHING')
          ? 'AGENT PUNCHING'
          : 'Brodeuse';
    const estBrodeuse = libelleBrodeuse === 'Brodeuse';
    const libelleUnitaire = estBrodeuse ? 'une brodeuse' : `un ${libelleBrodeuse}`;
    const libelleNom = estBrodeuse ? 'Nom de la brodeuse' : 'Nom';
    // Cartes présentes dans la colonne mais pas encore affectées à une brodeuse.
    const nonAssignees = trierParOrdre(
      data.cartes.filter(
        (c) =>
          c.colonneId === colonne.id &&
          !c.personneId &&
          (!c.sectionId || (!!section && c.sectionId === section.id))
      )
    );
    const surligneNon =
      colonneCible === colonne.id &&
      drag?.type === 'carte' &&
      insertion?.colonneId === colonne.id &&
      (section ? insertion.sectionId === section.id : !insertion?.sectionId) &&
      !insertion?.personneId;

    return (
      <div className="space-y-2">
        <div
          onDragOver={(e) => {
            if (!peutDeposerNon || drag?.type !== 'carte') return;
            survolZone(e, colonne.id, section?.id, nonAssignees.length);
          }}
          onDrop={(e) => {
            if (!peutDeposerNon || drag?.type !== 'carte') return;
            deposerDansZone(e, colonne.id, section?.id, nonAssignees.length);
          }}
          className={`rounded-xl border p-1.5 transition-all ${
            surligneNon ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/60' : 'border-slate-200/80 bg-white/50'
          }`}
        >
          <div className="flex items-center gap-1 px-1 pb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
              Non assignées
            </span>
            <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
              {nonAssignees.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 content-start min-h-[4rem] px-1">
            {nonAssignees.length === 0 ? (
              <div className="w-full rounded-lg border border-dashed border-slate-300/80 px-3 py-3 text-center text-[11px] text-slate-400">
                {section ? 'Déposez une carte ici pour la désassigner' : 'Aucune carte en attente'}
              </div>
            ) : (
              rendreCartes({ sectionId: section?.id }, nonAssignees)
            )}
            {peutDeposerNon && rendreComposer(colonne, { sectionId: section?.id })}
          </div>
        </div>

        {section && (
          <div className="flex items-center gap-1 px-1 pb-1">
            <EditableItemName
              value={section.titre}
              onSave={(titre) => renommerSection(colonne.id, section.id, titre)}
              placeholder="Section"
              className="min-w-0"
            />
            <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
              {nbCartes}
            </span>
            <button
              type="button"
              onClick={() => supprimerSection(colonne.id, section.id)}
              title="Supprimer la section Brodeuses"
              className="ml-2 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="rounded-xl border border-slate-200/80 bg-white/60 overflow-hidden">
          {estLabo ? (
            <>
              <div className="grid grid-cols-[11rem_minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
                <div className="border-r border-slate-200 px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-violet-700">
                  {libelleBrodeuse}
                </div>
                <div className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Modèles
                </div>
              </div>
              {personnes.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                  {estBrodeuse ? 'Aucune brodeuse : ajoutez-en une ci-dessous.' : `Aucun ${libelleBrodeuse} : ajoutez-en un ci-dessous.`}
                </div>
              ) : (
                personnes.map((personne) => {
                  if (!section) return null;
                  const nb = data.cartes.filter(
                    (c) =>
                      c.colonneId === colonne.id &&
                      c.sectionId === section.id &&
                      c.personneId === personne.id
                  ).length;
                  const surligne =
                    colonneCible === colonne.id &&
                    drag?.type === 'carte' &&
                    insertion?.colonneId === colonne.id &&
                    insertion.sectionId === section.id &&
                    insertion.personneId === personne.id;
                  return (
                    <div
                      key={personne.id}
                      onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personne.id, nb)}
                      onDrop={(e) => deposerZoneBrodeuse(e, colonne.id, section.id, personne.id, nb)}
                      className={`grid grid-cols-[11rem_minmax(0,1fr)] border-b border-slate-200/70 last:border-b-0 transition-colors ${
                        surligne ? 'bg-violet-50/60' : ''
                      }`}
                    >
                      <div className="group flex items-start gap-1 border-r border-slate-200 px-2 py-2">
                        <div className="min-w-0 flex-1">
                          <EditableItemName
                            value={personne.titre}
                            onSave={(titre) => renommerPersonne(colonne.id, section.id, personne.id, titre)}
                            placeholder={libelleNom}
                            className="min-w-0"
                          />
                          <span className="mt-1 inline-block text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums">
                            {nb}
                          </span>
                          {renduStatutsPersonne(colonne.id, section.id, personne)}
                        </div>
                        <button
                          type="button"
                          onClick={() => supprimerBrodeuse(colonne.id, personne.id)}
                          title={estBrodeuse ? 'Supprimer la brodeuse' : `Supprimer ${libelleBrodeuse}`}
                          className="shrink-0 p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="px-1 py-1">
                        {construireListeBrodeuse(colonne, section, personne)}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : personnes.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-slate-400">
              {estBrodeuse ? 'Aucune brodeuse : ajoutez-en une ci-dessous.' : `Aucun ${libelleBrodeuse} : ajoutez-en un ci-dessous.`}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
              {personnes.map((personne) => (
                <div key={personne.id} className="group p-2 space-y-1">
                  <div className="flex items-center gap-1">
                    <EditableItemName
                      value={personne.titre}
                      onSave={(titre) => {
                        if (section) renommerPersonne(colonne.id, section.id, personne.id, titre);
                      }}
                      placeholder={libelleNom}
                      className="min-w-0"
                    />
                    <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
                      {data.cartes.filter(
                        (c) =>
                          c.colonneId === colonne.id &&
                          c.sectionId === section?.id &&
                          c.personneId === personne.id
                      ).length}
                    </span>
                    <button
                      type="button"
                      onClick={() => supprimerBrodeuse(colonne.id, personne.id)}
                      title={estBrodeuse ? 'Supprimer la brodeuse' : `Supprimer ${libelleBrodeuse}`}
                      className="ml-auto p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {section && construireListeBrodeuse(colonne, section, personne)}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-slate-200 bg-slate-50 px-2 py-1.5">
            <button
              type="button"
              onClick={() => ajouterBrodeuse(colonne.id)}
              className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-violet-700 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter {libelleUnitaire}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renduDirection = () => {
    const groupes: Record<'alerte' | 'attente' | 'encours', KanbanCarte[]> = {
      alerte: [],
      attente: [],
      encours: [],
    };
    for (const carte of trierParOrdre(data.cartes)) {
      if (carteTermineeDirection(carte)) continue;
      groupes[categorieDirection(carte)].push(carte);
    }
    groupes.alerte.sort((a, b) => urgenceDirection(b) - urgenceDirection(a));
    groupes.attente.sort((a, b) => {
      const joursA = getAlerteAttente(a)?.jours ?? Number.MAX_SAFE_INTEGER;
      const joursB = getAlerteAttente(b)?.jours ?? Number.MAX_SAFE_INTEGER;
      return joursA - joursB;
    });
    const onglets = [
      { id: 'alerte' as const, label: 'ALERTE', detail: '(Urgence)' },
      { id: 'attente' as const, label: 'EN ATTENTE', detail: '' },
      { id: 'encours' as const, label: 'EN COURS', detail: '' },
    ];
    const styles = {
      alerte: {
        actif: 'border-red-600 bg-red-600 text-white',
        inactif: 'border-red-200 bg-white text-red-700 hover:border-red-400',
        badge: 'bg-red-100 text-red-700',
      },
      attente: {
        actif: 'border-orange-500 bg-orange-500 text-white',
        inactif: 'border-orange-200 bg-white text-orange-700 hover:border-orange-400',
        badge: 'bg-orange-100 text-orange-700',
      },
      encours: {
        actif: 'border-violet-600 bg-violet-600 text-white',
        inactif: 'border-violet-200 bg-white text-violet-700 hover:border-violet-400',
        badge: 'bg-violet-100 text-violet-700',
      },
    };
    const actif = onglets.find((o) => o.id === ongletDirection) ?? onglets[0];
    const cartesActives = groupes[ongletDirection];
    const premiereColonne = colonnes[0];
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {onglets.map((onglet) => {
              const selectionne = onglet.id === ongletDirection;
              const style = styles[onglet.id];
              return (
                <button
                  key={onglet.id}
                  type="button"
                  aria-pressed={selectionne}
                  onClick={() => setOngletDirection(onglet.id)}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                    selectionne ? style.actif : style.inactif
                  }`}
                >
                  <span className="flex items-baseline gap-1.5">
                    <span className="text-sm font-extrabold tracking-wide">{onglet.label}</span>
                    {onglet.detail && (
                      <span className="text-[10px] font-semibold opacity-80">{onglet.detail}</span>
                    )}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                      selectionne ? 'bg-white/20 text-white' : style.badge
                    }`}
                  >
                    {groupes[onglet.id].length}
                  </span>
                </button>
              );
            })}
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
                {actif.label}
                {actif.detail ? ` ${actif.detail}` : ''}
              </h2>
              <span className="text-xs font-semibold text-slate-500">
                {cartesActives.length} carte{cartesActives.length > 1 ? 's' : ''} · tableau
                Développement
              </span>
            </div>
            {premiereColonne ? (
              <>
                {/* Direction cards reuse the kanban card presentation. */}
                <div className="grid grid-cols-1 items-start gap-3 content-start sm:grid-cols-2 xl:grid-cols-3">
                  {rendreCartes({}, cartesActives)}
                </div>
                {cartesActives.length === 0 && (
                  <p className="mt-2 text-center text-[11px] text-slate-400">
                    Aucune carte dans cet onglet.
                  </p>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center">
                <p className="text-xs font-semibold text-slate-500">
                  Aucun espace de cartes dans cet environnement.
                </p>
                <button
                  type="button"
                  onClick={() => ajouterColonne('DEBRIEF')}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-violet-700 hover:text-violet-800 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Créer un espace de cartes
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  /**
   * Zone de suivi. « ATTENTE » regroupe les périodes encore ouvertes ;
   * « HISTORIQUE », à sa droite, journalise toutes les modifications des
   * cartes. Les entrées liées à une attente sont encadrées en rose.
   */
  const renduZoneAttente = () => {
    const attentesEnCours: { carte: KanbanCarte; attente: KanbanAttente }[] = [];
    for (const carte of data.cartes) {
      for (const attente of carte.attentes ?? []) {
        if (!estAttenteCloturee(attente)) attentesEnCours.push({ carte, attente });
      }
    }

    if (data.cartes.length === 0) return null;

    const resteJours = (attente: KanbanAttente): number | null =>
      estDateISO(attente.dateSortie) ? -joursEntreDatesISO(attente.dateSortie) : null;

    attentesEnCours.sort((a, b) => {
      const resteA = resteJours(a.attente);
      const resteB = resteJours(b.attente);
      if (resteA === null && resteB === null) return a.attente.dateEntree.localeCompare(b.attente.dateEntree);
      if (resteA === null) return 1;
      if (resteB === null) return -1;
      return resteA - resteB;
    });

    const decrireDeplacement = (deplacement: KanbanDeplacement): string => {
      const colonne = data.colonnes.find((c) => c.id === deplacement.colonneId);
      const section = deplacement.sectionId
        ? colonne?.sections?.find((s) => s.id === deplacement.sectionId)
        : undefined;
      const personne = deplacement.personneId
        ? section?.personnes?.find((p) => p.id === deplacement.personneId)
        : undefined;
      const lieu = [colonne?.titre, section?.titre, personne?.titre]
        .filter((v): v is string => !!v)
        .join(' · ');
      return `Déplacée vers ${lieu || 'une autre zone'}`;
    };

    const evenements: {
      id: string;
      carte: KanbanCarte;
      date: string;
      categorie: KanbanHistoriqueCategorie;
      description: string;
    }[] = [];
    for (const carte of data.cartes) {
      for (const entree of carte.historique ?? []) {
        evenements.push({
          id: entree.id,
          carte,
          date: entree.date,
          categorie: entree.categorie,
          description: entree.description,
        });
      }
      // La première entrée de déplacement correspond à la création : elle est
      // déjà couverte par « Carte créée ».
      (carte.historiqueDeplacements ?? []).slice(1).forEach((deplacement, index) => {
        evenements.push({
          id: `${carte.id}-dep-${index + 1}`,
          carte,
          date: deplacement.date,
          categorie: 'carte',
          description: decrireDeplacement(deplacement),
        });
      });
    }
    evenements.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return (Number.isNaN(dateB) ? 0 : dateB) - (Number.isNaN(dateA) ? 0 : dateA);
    });

    return (
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={panneauSuivi === 'attente'}
              aria-controls="zone-suivi-attente"
              onClick={() =>
                setPanneauSuivi((actuel) => (actuel === 'attente' ? null : 'attente'))
              }
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors cursor-pointer ${
                panneauSuivi === 'attente'
                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:text-orange-700'
              }`}
            >
              <Pause className="h-3.5 w-3.5" />
              Attente
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  panneauSuivi === 'attente'
                    ? 'bg-orange-100 text-orange-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {attentesEnCours.length}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  panneauSuivi === 'attente' ? 'rotate-180' : ''
                }`}
              />
            </button>

            <button
              type="button"
              aria-expanded={panneauSuivi === 'historique'}
              aria-controls="zone-suivi-historique"
              onClick={() =>
                setPanneauSuivi((actuel) => (actuel === 'historique' ? null : 'historique'))
              }
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition-colors cursor-pointer ${
                panneauSuivi === 'historique'
                  ? 'border-slate-300 bg-slate-100 text-slate-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Historique
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                  panneauSuivi === 'historique'
                    ? 'bg-slate-200 text-slate-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {evenements.length}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  panneauSuivi === 'historique' ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {panneauSuivi === 'attente' && (
            <div
              id="zone-suivi-attente"
              className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-orange-200 bg-white p-2 shadow-xs"
            >
              {attentesEnCours.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
                  Aucune attente en cours.
                </p>
              ) : (
                attentesEnCours.map(({ carte, attente }) => {
                  const reste = resteJours(attente);
                  const enRetard = reste !== null && reste < 0;
                  const badge =
                    reste === null
                      ? { texte: 'Sans sortie', classes: 'bg-slate-100 text-slate-600' }
                      : enRetard
                        ? { texte: `Retard de ${-reste} j`, classes: 'bg-red-100 text-red-700' }
                        : reste === 0
                          ? { texte: "Sortie aujourd'hui", classes: 'bg-amber-100 text-amber-800' }
                          : { texte: `Sortie dans ${reste} j`, classes: 'bg-slate-100 text-slate-600' };

                  return (
                    <article
                      key={`${carte.id}-${attente.id}`}
                      className="rounded-lg border border-slate-200 bg-slate-50/70 p-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {carte.titre}
                          </p>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            Motif : {attente.libelle?.trim() || '—'}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.classes}`}
                        >
                          {badge.texte}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="block font-bold uppercase tracking-wide text-slate-400">
                            Entrée
                          </span>
                          <span className="font-semibold text-slate-700">
                            {formatDateFr(attente.dateEntree)}
                          </span>
                        </div>
                        <div>
                          <span className="block font-bold uppercase tracking-wide text-slate-400">
                            Sortie
                          </span>
                          <span className="font-semibold text-slate-700">
                            {formatDateFr(attente.dateSortie)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => marquerAttenteEnCours(carte.id, attente.id)}
                          title="Confirmer que l’attente est toujours en cours"
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 cursor-pointer"
                        >
                          <Pause className="h-3 w-3" />
                          En cours
                        </button>
                        <button
                          type="button"
                          onClick={() => cloturerAttente(carte.id, attente.id)}
                          title="Clôturer l’attente et l’archiver dans l’historique"
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 transition-colors hover:border-emerald-300 hover:text-emerald-700 cursor-pointer"
                        >
                          <Check className="h-3 w-3" />
                          Clôturé
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          )}

          {panneauSuivi === 'historique' && (
            <div
              id="zone-suivi-historique"
              className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xs"
            >
              {evenements.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-400">
                  Aucune modification enregistrée.
                </p>
              ) : (
                evenements.map((evenement) => {
                  const estAttente = evenement.categorie === 'attente';
                  return (
                    <article
                      key={evenement.id}
                      className={`rounded-lg border p-2.5 ${
                        estAttente
                          ? 'border-2 border-rose-300 bg-rose-50'
                          : 'border-slate-200 bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {evenement.carte.titre}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                            {evenement.description}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            estAttente
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {estAttente ? 'Attente' : 'Carte'}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] font-medium text-slate-400">
                        {formatHorodatage(evenement.date)}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="kanban-app min-h-screen bg-slate-50 text-slate-800 flex flex-col">
      {/* Bandeau haut : titre, date/heure, sélecteur de vue (même trame que les autres vues) */}
      <div className="relative z-20 border-b border-slate-200 bg-white shadow-xs">
        <div className="w-full px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-6">
            {/* Brand */}
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-sm shadow-brand/30">
                <SquareKanban className="h-6 w-6" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h1 className="m-0 whitespace-normal text-[22px] font-semibold leading-[1.2] text-slate-900 min-[900px]:overflow-hidden min-[900px]:text-ellipsis min-[900px]:whitespace-nowrap">
                  Développement
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {fullFrenchDate}
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2 py-0.5 font-medium tabular-nums text-slate-900">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-brand" />
                    <span>{parisTime}</span>
                    <span className="text-[11px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                  </span>
                </div>
                {estDirecteur && (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold uppercase tracking-wide text-slate-400">
                      Environnement
                    </span>
                    <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5">
                      {(['developpement', 'direction'] as const).map((env) => (
                        <button
                          key={env}
                          type="button"
                          aria-pressed={environnement === env}
                          onClick={() => changerEnvironnement(env)}
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                            environnement === env
                              ? 'bg-brand text-white shadow-sm'
                              : 'bg-white text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {env === 'developpement' ? 'Développement' : 'Direction'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 min-[900px]:justify-end">
              <span className="hidden items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 md:inline-flex">
                <span>
                  {data.cartes.length} tâche{data.cartes.length > 1 ? 's' : ''}
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>
                  {environnement === 'direction'
                    ? '3 onglets'
                    : `${colonnes.length} colonne${colonnes.length > 1 ? 's' : ''}`}
                </span>
              </span>
              <SessionBadge profil={profil} onDeconnexion={onDeconnexion} />
            </div>

            </div>

            {/* Onglets de vue + légende des couleurs alignée à droite */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <ViewSwitcher currentPage="developpement" onChangePage={onChangePage} variant="solid" />
              </div>

              {/* Légende des couleurs : repères visuels des cartes */}
              <div
                aria-label="Repères visuels des couleurs de cartes"
                className="ml-auto flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
              >
                {COULEURS_KANBAN_IDS.map((couleurId) => (
                  <span
                    key={couleurId}
                    className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-slate-800 shadow-xs ${KANBAN_COULEURS[couleurId].fond} ${KANBAN_COULEURS[couleurId].bordure}`}
                  >
                    <span
                      className={`h-4 w-3.5 shrink-0 rounded-[3px] border shadow-xs ${KANBAN_COULEURS[couleurId].point} ${KANBAN_COULEURS[couleurId].bordure}`}
                      aria-hidden="true"
                    />
                    {KANBAN_COULEURS[couleurId].label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {environnement === 'direction' ? (
        renduDirection()
      ) : (
        <>
          {/* Stage pagination: 5 visible columns per page */}
          <div className="border-b border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Étapes {colonnes.length === 0 ? 0 : debutPage + 1} à{' '}
                  {Math.min(debutPage + ETAPES_PAR_PAGE, colonnes.length)} sur {colonnes.length}{' '}
                  étape{colonnes.length > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-1" role="tablist" aria-label="Pages d'étapes">
                  {Array.from({ length: totalPages }, (_, i) => {
                    const active = i === pageCourante;
                    const debut = i * ETAPES_PAR_PAGE + 1;
                    const fin = Math.min((i + 1) * ETAPES_PAR_PAGE, colonnes.length);
                    return (
                      <button
                        key={i}
                        type="button"
                        role="tab"
                        aria-label={`Étapes ${debut} à ${fin}`}
                        aria-selected={active}
                        onClick={() => allerPageEtapes(i)}
                        onDragOver={(e) => survolPage(e, i)}
                        onDrop={(e) => deposerSurPage(e, i)}
                        className={`h-1.5 cursor-pointer rounded-full transition-all p-2 ${active ? 'w-6 bg-brand' : 'w-3 bg-slate-300 hover:bg-slate-400'} ${pageCible !== null && pageCible === i ? 'scale-105' : ''}`}
                      />
                    );
                  })}
                </div>
                <span className="hidden text-[11px] text-slate-400 sm:inline">
                  Progression des dossiers de gauche à droite →
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => allerPageEtapes(Math.max(0, pageCourante - 1))}
                  disabled={pageCourante === 0}
                  title="Étapes précédentes"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => allerPageEtapes(Math.min(totalPages - 1, pageCourante + 1))}
                  disabled={pageCourante >= totalPages - 1}
                  title="Étapes suivantes"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {renduZoneAttente()}

          {/* Tableau kanban : rangée horizontale de colonnes */}
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <div
              key={pageCourante}
              className={`inline-flex min-w-full items-start gap-4 px-4 py-6 sm:px-6 ${
                sensPage === 1 ? 'kanban-page-next' : 'kanban-page-prev'
              }`}
            >
              {colonnesPage.map((colonne, indexPage) => {
                const indexColonne = debutPage + indexPage;
            const cartes = cartesDe(colonne.id);
            const enCible = colonneCible === colonne.id && drag?.type === 'carte';
            const colonneEnCible = rangeeCible === colonne.id && drag?.type === 'colonne';
            const sections = colonne.sections?.length ? colonne.sections : undefined;
            const aBrodeuse = estColonneBrodeuse(colonne);
            const estPatronnage = colonne.titre.toUpperCase().includes('PATRONNAGE');
            // Colonne dédiée BRODERIE MAIN : son tableau 4 colonnes est rattaché à la colonne.
            const estMainDediee = estColonneBroderie(colonne) && !aBrodeuse;
            const sectionMain = estMainDediee
              ? sections?.find((s) => estSectionBroderieMain(s)) ?? sections?.[0]
              : undefined;
            // Colonne large si BRODERIE MAIN (section ou colonne dédiée) ou Brodeuse.
            const aBroderieMain = estMainDediee || sections?.some((s) => estSectionBroderieMain(s));
            return (
              <section
                key={colonne.id}
                data-kanban-column={colonne.id}
                onDragOver={(e) => {
                  survolRangee(e, colonne.id, indexColonne);
                  survolEnteteColonne(e, colonne);
                }}
                onDrop={(e) => deposerSurColonne(e, colonne)}
                className={`group/col ${
                  aBroderieMain
                    ? 'w-[34rem]'
                    : aBrodeuse
                      ? estPatronnage
                        ? 'w-[22rem]'
                        : 'w-[26rem]'
                      : 'w-72'
                } shrink-0 bg-slate-100/80 rounded-2xl border transition-all ${
                  enCible || colonneEnCible
                    ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/60'
                    : 'border-slate-200'
                }`}
              >
                {/* En-tête de colonne */}
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                  <span
                    draggable
                    onDragStart={(e) => dragColonne(e, colonne.id)}
                    onDragEnd={arreterDrag}
                    title="Glisser pour déplacer la colonne"
                    className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span className="shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">
                    {String(indexColonne + 1).padStart(2, '0')}
                  </span>
                  <EditableItemName
                    value={colonne.titre}
                    onSave={(titre) => renommerColonne(colonne.id, titre)}
                    placeholder="Titre de la colonne"
                    className="min-w-0"
                  />
                  <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
                    {cartes.length}
                  </span>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/col:opacity-100">
                    {sections ? (
                      <button
                        type="button"
                        onClick={() => fusionnerColonne(colonne.id)}
                        title="Réassembler les sections en une seule liste"
                        className="p-1 rounded text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => scinderColonne(colonne.id)}
                        title="Scinder la colonne en 4 sections empilées"
                        className="p-1 rounded text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => ajouterSection(colonne.id)}
                      title="Ajouter une section"
                      className="p-1 rounded text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => supprimerColonne(colonne.id)}
                      title="Supprimer la colonne"
                      className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Sections : liste simple ou 2 sections empilées ; section BRODERIE MAIN = tableau 4 colonnes ; colonnes BRODERIE MACHINE / LABO CONFECTION = tableau brodeuses */}
                <div className="px-2 pb-2 space-y-2">
                  {estColonneBrodeuse(colonne) ? (
                    <>
                      {sections
                        ?.filter(
                          (section) =>
                            !estSectionBrodeuse(section) && !estSectionBroderieMain(section)
                        )
                        .map((section) =>
                          renduZone(colonne, { section, sectionId: section.id })
                        )}
                      {renduBrodeuse(colonne)}
                    </>
                  ) : estMainDediee ? (
                    sectionMain
                      ? renduBroderieMain(colonne, sectionMain)
                      : zonesSimple(colonne)
                  ) : sections
                    ? sections.map((section) =>
                        estSectionBroderieMain(section)
                          ? renduBroderieMain(colonne, section)
                          : renduZone(colonne, { section, sectionId: section.id })
                      )
                    : zonesSimple(colonne)}
                </div>
              </section>
            );
          })}

          {/* Add column (last page only) */}
          {pageCourante === totalPages - 1 && (
          <div className="w-72 shrink-0">
            {nouvelleColonne ? (
              <div className="bg-slate-100/80 border border-violet-300 rounded-2xl p-3 space-y-2">
                <input
                  autoFocus
                  value={nouveauTitre}
                  onChange={(e) => setNouveauTitre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      ajouterColonne(nouveauTitre);
                      allerPageEtapes(Math.ceil((colonnes.length + 1) / ETAPES_PAR_PAGE) - 1);
                      setNouveauTitre('');
                      setNouvelleColonne(false);
                    } else if (e.key === 'Escape') {
                      setNouvelleColonne(false);
                      setNouveauTitre('');
                    }
                  }}
                  placeholder="Titre de la colonne"
                  className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-md px-2.5 py-2 focus:outline-hidden focus:border-violet-400"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      ajouterColonne(nouveauTitre);
                      allerPageEtapes(Math.ceil((colonnes.length + 1) / ETAPES_PAR_PAGE) - 1);
                      setNouveauTitre('');
                      setNouvelleColonne(false);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md px-2 py-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNouvelleColonne(false);
                      setNouveauTitre('');
                    }}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNouvelleColonne(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100/80 hover:bg-slate-200/80 border border-dashed border-slate-300 rounded-2xl px-3 py-3 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Ajouter une colonne
              </button>
            )}
          </div>
          )}
              </div>
            </div>
        </>
      )}

      {/* Card edit popover: anchored to the clicked card, presentation only. */}
      {edition && carteEdition && (
        <div
          ref={panneauEditionRef}
          role="dialog"
          aria-label="Modifier la carte"
          style={{
            top: positionEdition?.top ?? 0,
            left: positionEdition?.left ?? 0,
            width: `min(${POPOVER_LARGEUR}px, calc(100vw - ${POPOVER_MARGE * 2}px))`,
            maxHeight: `calc(100vh - ${(positionEdition?.top ?? 0) + POPOVER_MARGE}px)`,
          }}
          className={`fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ${
            positionEdition ? 'animate-popover-in' : 'invisible'
          }`}
        >
          {/* Header: mode title, close */}
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 pl-4 pr-3">
            <h2 className="m-0 shrink-0 text-xs font-bold uppercase tracking-[0.05em] text-slate-900">
              {modeEdition === 'complet' ? 'Fiche complète' : 'Modifier la carte'}
            </h2>
            <button
              type="button"
              onClick={fermerEdition}
              aria-label="Fermer"
              className="ml-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Scrollable body: keeps header and footer visible. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="@container flex flex-col gap-[9px] px-4 pb-2.5 pt-3">
              {modeEdition === 'simple' ? (
                <div className="space-y-[9px]">
                  <div>
                    <label htmlFor="carte-etape" className="kanban-label">
                      Étape
                    </label>
                    <input
                      id="carte-etape"
                      autoFocus
                      value={edition.etat}
                      onChange={(event) => setEdition({ ...edition, etat: event.target.value })}
                      className="kanban-field"
                      placeholder="Saisir l’étape…"
                    />
                  </div>

                  <div>
                    <label htmlFor="carte-remarques" className="kanban-label">
                      Remarque
                    </label>
                    <textarea
                      id="carte-remarques"
                      rows={3}
                      value={edition.remarques}
                      onChange={(event) =>
                        setEdition({ ...edition, remarques: event.target.value })
                      }
                      className="kanban-field kanban-textarea"
                      placeholder="Remarque…"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-[9px]">
                  <div className="grid grid-cols-1 gap-2.5 @min-[400px]:grid-cols-2">
                    <div className="min-w-0">
                      <label htmlFor="carte-titre" className="kanban-label">
                        Titre
                      </label>
                      <input
                        id="carte-titre"
                        autoFocus
                        value={edition.titre}
                        onChange={(event) =>
                          setEdition({ ...edition, titre: event.target.value })
                        }
                        className="kanban-field"
                        placeholder="Titre de la tâche"
                      />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="carte-etape" className="kanban-label">
                        Étape
                      </label>
                      <input
                        id="carte-etape"
                        value={edition.etat}
                        onChange={(event) => setEdition({ ...edition, etat: event.target.value })}
                        className="kanban-field"
                        placeholder="Saisir l’étape…"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="carte-description" className="kanban-label">
                      Description
                    </label>
                    <textarea
                      id="carte-description"
                      rows={2}
                      value={edition.description}
                      onChange={(event) =>
                        setEdition({ ...edition, description: event.target.value })
                      }
                      className="kanban-field kanban-textarea"
                      placeholder="Description de la carte…"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2.5 @min-[400px]:grid-cols-[1fr_1.2fr_1fr]">
                    <div>
                      <label htmlFor="carte-traiteur" className="kanban-label">
                        Traiteur
                      </label>
                      <select
                        id="carte-traiteur"
                        value={edition.traiteur}
                        onChange={(event) =>
                          setEdition({ ...edition, traiteur: event.target.value })
                        }
                        className="kanban-field"
                      >
                        <option value="">—</option>
                        {edition.traiteur && !valeursTraiteur.includes(edition.traiteur) && (
                          <option value={edition.traiteur}>{edition.traiteur}</option>
                        )}
                        {valeursTraiteur.map((valeur) => (
                          <option key={valeur} value={valeur}>
                            {valeur}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="carte-client" className="kanban-label">
                        Client
                      </label>
                      <input
                        id="carte-client"
                        list="clients-suggestions"
                        value={edition.client}
                        onChange={(event) => setEdition({ ...edition, client: event.target.value })}
                        className="kanban-field"
                        placeholder="Nom du client"
                      />
                      <datalist id="clients-suggestions">
                        {suggestionsClient.map((valeur) => (
                          <option key={valeur} value={valeur} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label htmlFor="carte-commercial" className="kanban-label">
                        Commercial
                      </label>
                      <select
                        id="carte-commercial"
                        value={edition.commercial}
                        onChange={(event) =>
                          setEdition({ ...edition, commercial: event.target.value })
                        }
                        className="kanban-field"
                      >
                        <option value="">—</option>
                        {edition.commercial && !valeursCommercial.includes(edition.commercial) && (
                          <option value={edition.commercial}>{edition.commercial}</option>
                        )}
                        {valeursCommercial.map((valeur) => (
                          <option key={valeur} value={valeur}>
                            {valeur}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <span className="kanban-label">Type</span>
                    <div
                      role="group"
                      aria-label="Type de carte"
                      className="flex h-7 items-center gap-2"
                    >
                      {COULEURS_KANBAN_IDS.map((couleurId) => {
                        const actif = edition.couleur === couleurId;
                        const couleur = KANBAN_COULEURS[couleurId];
                        return (
                          <button
                            key={couleurId}
                            type="button"
                            aria-pressed={actif}
                            aria-label={couleur.label}
                            title={couleur.label}
                            onClick={() => setEdition({ ...edition, couleur: couleurId })}
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-md transition-shadow ${couleur.point} ${
                              actif
                                ? 'ring-2 ring-slate-900 ring-offset-2'
                                : 'hover:ring-2 hover:ring-slate-300'
                            }`}
                          >
                            {actif && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                          </button>
                        );
                      })}
                      <span className="ml-1.5 truncate text-xs font-medium text-slate-500">
                        {KANBAN_COULEURS[edition.couleur].label}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="carte-expedition" className="kanban-label">
                        Envoi
                      </label>
                      <input
                        id="carte-expedition"
                        type="date"
                        value={edition.dateExpedition ?? ''}
                        onChange={(event) =>
                          setEdition({
                            ...edition,
                            dateExpedition: event.target.value || undefined,
                          })
                        }
                        className={`kanban-field ${erreurExpedition ? 'kanban-field-error' : ''}`}
                        aria-invalid={!!erreurExpedition}
                        aria-describedby={erreurExpedition ? 'erreur-expedition' : undefined}
                      />
                      {erreurExpedition && (
                        <p
                          id="erreur-expedition"
                          className="mt-1 text-[11px] font-medium text-rose-600"
                        >
                          {erreurExpedition}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label htmlFor="carte-creation" className="kanban-label">
                        Création
                      </label>
                      <input
                        id="carte-creation"
                        type="date"
                        value={edition.dateCreation ?? ''}
                        onChange={(event) =>
                          setEdition({
                            ...edition,
                            dateCreation: event.target.value || undefined,
                          })
                        }
                        className={`kanban-field ${erreurExpedition ? 'kanban-field-error' : ''}`}
                        aria-invalid={!!erreurExpedition}
                        aria-describedby={erreurExpedition ? 'erreur-expedition' : undefined}
                      />
                      {erreurExpedition && (
                        <p
                          id="erreur-expedition"
                          className="mt-1 text-[11px] font-medium text-rose-600"
                        >
                          {erreurExpedition}
                        </p>
                      )}
                    </div>
                  </div>

              {/* Waiting periods: collapsed by default, one click to expand. */}
              <div className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <div className="flex h-8 items-center gap-2 px-2.5">
                  <button
                    type="button"
                    aria-expanded={attenteDepliee}
                    onClick={() => setAttenteDepliee((ouvert) => !ouvert)}
                    className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.06em] text-slate-700"
                  >
                    <ChevronRight
                      className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${attenteDepliee ? 'rotate-90' : ''}`}
                    />
                    Attente
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-slate-200/80 px-1 text-[11px] font-semibold text-slate-600">
                      {edition.attentes.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEdition({
                        ...edition,
                        attentes: [
                          ...edition.attentes,
                          {
                            id: `ATT-${Date.now().toString(36).toUpperCase()}`,
                            dateEntree: getDateISOSite(),
                            statut: 'en-cours',
                            historique: [etapeAttente('en-cours')],
                          },
                        ],
                      });
                      setAttenteDepliee(true);
                    }}
                    className="ml-auto inline-flex items-center text-xs font-semibold text-brand-strong transition-colors hover:text-brand"
                  >
                    + Ajouter
                  </button>
                </div>

                {attenteDepliee && (
                  <div className="space-y-1.5 border-t border-slate-200 bg-white p-2">
                    {edition.attentes.length === 0 && (
                      <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-2 text-center text-[10px] text-slate-400">
                        Aucune période d’attente
                      </p>
                    )}
                  {edition.attentes.map((attente, index) => {
                    const enCours = !estAttenteCloturee(attente);
                    const duree = attente.dateEntree
                      ? Math.max(
                          0,
                          joursEntreDatesISO(attente.dateEntree, attente.dateSortie || getDateISOSite())
                        )
                      : null;
                    const erreurAttente = erreursAttentes[index];

                    return (
                      <div
                        key={attente.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                      >
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <label
                              htmlFor={`attente-motif-${attente.id}`}
                              className="kanban-label-compact"
                            >
                              Motif
                            </label>
                            <input
                              id={`attente-motif-${attente.id}`}
                              aria-label={`Motif de l’attente ${index + 1}`}
                              value={attente.libelle ?? ''}
                              onChange={(event) => {
                                const attentes = [...edition.attentes];
                                attentes[index] = { ...attente, libelle: event.target.value };
                                setEdition({ ...edition, attentes });
                              }}
                              placeholder="Motif de l’attente…"
                              className="kanban-field-compact w-full"
                            />
                          </div>
                          <button
                            type="button"
                            aria-label="Supprimer cette attente"
                            onClick={() => {
                              if (window.confirm('Supprimer cette période d’attente ?')) {
                                setEdition({
                                  ...edition,
                                  attentes: edition.attentes.filter((_, i) => i !== index),
                                });
                              }
                            }}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <label
                              htmlFor={`attente-entree-${attente.id}`}
                              className="kanban-label-compact"
                            >
                              Entrée
                            </label>
                            <input
                              id={`attente-entree-${attente.id}`}
                              type="date"
                              value={attente.dateEntree ?? ''}
                              onChange={(event) => {
                                const attentes = [...edition.attentes];
                                attentes[index] = { ...attente, dateEntree: event.target.value };
                                setEdition({ ...edition, attentes });
                              }}
                              className={`kanban-field-compact w-full ${
                                erreurAttente ? 'kanban-field-error' : ''
                              }`}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor={`attente-sortie-${attente.id}`}
                              className="kanban-label-compact"
                            >
                              Sortie
                            </label>
                            <input
                              id={`attente-sortie-${attente.id}`}
                              type="date"
                              value={attente.dateSortie ?? ''}
                              aria-invalid={!!erreurAttente}
                              onChange={(event) => {
                                const attentes = [...edition.attentes];
                                attentes[index] = {
                                  ...attente,
                                  dateSortie: event.target.value || undefined,
                                };
                                setEdition({ ...edition, attentes });
                              }}
                              className={`kanban-field-compact w-full ${
                                erreurAttente ? 'kanban-field-error' : ''
                              }`}
                            />
                          </div>
                        </div>

                        {erreurAttente && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600">{erreurAttente}</p>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-600">
                            <input
                              type="checkbox"
                              checked={enCours}
                              onChange={(event) => {
                                const attentes = [...edition.attentes];
                                const statut: KanbanAttenteStatut = event.target.checked
                                  ? 'en-cours'
                                  : 'cloture';
                                attentes[index] = {
                                  ...attente,
                                  statut,
                                  // La sortie est conservée si elle existe ; sinon la
                                  // clôture renseigne la date du jour.
                                  dateSortie: event.target.checked
                                    ? attente.dateSortie
                                    : attente.dateSortie || getDateISOSite(),
                                  historique: [
                                    ...(attente.historique ?? []),
                                    etapeAttente(statut),
                                  ],
                                };
                                setEdition({ ...edition, attentes });
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-brand text-brand focus:ring-brand/30"
                            />
                            En cours
                          </label>
                          <span className="text-[11px] font-semibold text-slate-500">
                            Durée :{' '}
                            {duree === null
                              ? '—'
                              : `${duree} jour${duree > 1 ? 's' : ''}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex h-[50px] shrink-0 items-center gap-2 border-t border-slate-100 px-4">
            <button
              type="button"
              onClick={() => {
                // supprimerCarte owns the confirmation dialog.
                if (supprimerCarte(edition.id)) fermerEdition();
              }}
              className="inline-flex h-[30px] items-center gap-1.5 rounded-md px-1.5 text-xs font-semibold text-rose-600 transition-colors hover:text-rose-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={fermerEdition}
                className="inline-flex h-[30px] items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={enregistrerEdition}
                disabled={!enregistrementAutorise}
                className="inline-flex h-[30px] items-center justify-center gap-1.5 rounded-md bg-brand px-3.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
      {deplacementOuvert && carteDeplacement && (
        <div
          ref={panneauDeplacementRef}
          role="dialog"
          aria-label={`Déplacer le post-it ${carteDeplacement.titre}`}
          style={{
            top: positionDeplacement?.top ?? 0,
            left: positionDeplacement?.left ?? 0,
            width: `min(300px, calc(100vw - ${POPOVER_MARGE * 2}px))`,
            maxHeight: `calc(100vh - ${POPOVER_MARGE * 2}px)`,
          }}
          className={`fixed z-[70] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl ${
            positionDeplacement ? 'animate-popover-in' : 'invisible'
          }`}
        >
          <div className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5">
            <MoveRight className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[11px] font-bold uppercase tracking-wide text-slate-800">
                Déplacer le post-it
              </h2>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                {carteDeplacement.titre}
              </p>
            </div>
            <button
              type="button"
              onClick={fermerDeplacement}
              aria-label="Fermer le déplacement"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-2.5 p-3">
            <label
              htmlFor="destination-post-it"
              className="block text-[10px] font-bold uppercase tracking-wide text-slate-500"
            >
              Choisir une partie
            </label>
            <select
              id="destination-post-it"
              autoFocus
              value={deplacementOuvert.destinationKey}
              onChange={(event) =>
                setDeplacementOuvert((ouvert) =>
                  ouvert ? { ...ouvert, destinationKey: event.target.value } : ouvert
                )
              }
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              <option value="">Choisir une destination…</option>
              {destinationsDeplacement.map((destination) => (
                <option key={destination.key} value={destination.key}>
                  {destination.label}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={fermerDeplacement}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!deplacementOuvert.destinationKey}
                onClick={() =>
                  executerDeplacement(
                    deplacementOuvert.carteId,
                    deplacementOuvert.destinationKey
                  )
                }
                className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                <MoveRight className="h-3 w-3" />
                Déplacer
              </button>
            </div>
          </div>
        </div>
      )}
      {alerteOuverte && (
        <div
          ref={panneauAlerteRef}
          role="dialog"
          aria-label={`Détail de l'alerte pour ${alerteOuverte.titreCarte}`}
          style={{
            top: positionAlerte?.top ?? 0,
            left: positionAlerte?.left ?? 0,
            width: `min(280px, calc(100vw - ${POPOVER_MARGE * 2}px))`,
          }}
          className={`fixed z-[70] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ${
            positionAlerte ? 'animate-popover-in' : 'invisible'
          }`}
        >
          <div className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5">
            <div className={`mt-0.5 rounded-md p-1 ${alerteOuverte.classes}`}>
              {alerteOuverte.icone}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[11px] font-bold uppercase tracking-wide text-slate-800">
                Détail de l’alerte
              </h2>
              <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                {alerteOuverte.titreCarte}
              </p>
            </div>
            <button
              type="button"
              onClick={fermerAlerte}
              aria-label="Fermer le détail de l’alerte"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-3">
            <div className={`flex items-start gap-2 rounded-lg px-2.5 py-2 ${alerteOuverte.classes}`}>
              {alerteOuverte.icone}
              <div className="min-w-0">
                <p className="text-xs font-bold">{alerteOuverte.titreAlerte}</p>
                <p className="mt-1 text-[11px] leading-relaxed">{alerteOuverte.details}</p>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Alertes ajoutées{carteAlerte?.alertes?.length ? ` (${carteAlerte.alertes.length})` : ''}
                </h3>
                <button
                  type="button"
                  aria-label="Ajouter une alerte"
                  title="Ajouter une alerte"
                  onClick={() => {
                    setComposerAlerteOuvert((ouvert) => !ouvert);
                    setTexteAlerte('');
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {carteAlerte?.alertes?.length ? (
                <ul className="mt-2 space-y-1.5">
                  {carteAlerte.alertes.map((alerte, index) => (
                    <li
                      key={`${index}-${alerte}`}
                      className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-2"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                      <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[11px] font-medium text-rose-800">
                        {alerte}
                      </span>
                      <button
                        type="button"
                        aria-label="Supprimer cette alerte"
                        title="Supprimer cette alerte"
                        onClick={() => supprimerAlerte(alerteOuverte.carteId, index)}
                        className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-white hover:text-rose-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-2.5 py-2 text-[11px] text-slate-400">
                  Aucune alerte ajoutée.
                </p>
              )}
              {composerAlerteOuvert && (
                <div className="mt-2 space-y-1.5">
                  <textarea
                    autoFocus
                    value={texteAlerte}
                    onChange={(event) => setTexteAlerte(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        ajouterAlerte(alerteOuverte.carteId);
                      }
                    }}
                    rows={2}
                    aria-label="Texte de la nouvelle alerte"
                    placeholder="Saisir une alerte…"
                    className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setComposerAlerteOuvert(false);
                        setTexteAlerte('');
                      }}
                      className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-500 hover:bg-slate-100"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={!texteAlerte.trim()}
                      onClick={() => ajouterAlerte(alerteOuverte.carteId)}
                      className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-1 text-[10px] font-bold text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" />
                      Ajouter
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
