import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  COULEURS_KANBAN_IDS,
  estColonneBroderie,
  estColonneBrodeuse,
  estColonneLaboConfection,
  estSectionBrodeuse,
  estSectionBroderieMain,
  KANBAN_COULEURS,
  KanbanBloc,
  KanbanCarte,
  KanbanCouleurId,
  KanbanData,
  KanbanColonne,
  KanbanDeplacement,
  KanbanAttente,
  KanbanPersonne,
  KanbanSection,
} from '../types/kanban.ts';
import { chargerKanban, KanbanEnvironnement, nouvelId, sauverKanban } from '../utils/kanbanStorage.ts';
import { AppPage, ViewSwitcher } from '@/src/components/layout/ViewSwitcher.tsx';
import { SessionBadge } from '@/src/components/layout/SessionBadge.tsx';
import { EditableItemName } from '@/src/components/ui/EditableItemName.tsx';
import { dateISOFromDateTime, estDateISO, getDateISOSite, getNowParis, joursEntreDatesISO, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { Profil } from '@/src/utils/auth.ts';
import { AlertTriangle, Calendar, Check, ChevronLeft, ChevronRight, Clock, Copy, FileText, GitMerge, GripVertical, LayoutGrid, MoreHorizontal, Pause, Plus, Scissors, SquareKanban, Trash2, X } from 'lucide-react';

interface DeveloppementViewProps {
  onChangePage: (page: AppPage) => void;
  profil: Profil;
  onDeconnexion: () => void;
}

/** Élément en cours de glissement (carte ou colonne). */
type DragInfo = { type: 'carte'; id: string } | { type: 'colonne'; id: string };

/** Brouillon d'édition d'une carte (panneau modal). */
interface BrouillonEdition {
  id: string;
  titre: string;
  etat: string;
  traiteur: string;
  client: string;
  commercial: string;
  remarques: string;
  couleur: KanbanCouleurId;
  /** Date d'échéance (optionnelle) */
  dateEcheance?: string;
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

/** Gap between the anchor card and the edit popover, and viewport safety margin. */
const POPOVER_GAP = 12;
const POPOVER_MARGE = 8;
/** Preferred width of the compact card edit popover. */
const POPOVER_LARGEUR = 460;

/** Preset waiting reasons offered in the card edit panel. */
const MOTIFS_ATTENTE = ['Attente de mesures client', 'Attente du brief client'];
/** Sentinel option that reveals the free-text reason field. */
const MOTIF_ATTENTE_AUTRE = 'Autre…';

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
  const [edition, setEdition] = useState<BrouillonEdition | null>(null);
  /** Card that opened the edit popover: the panel follows it while scrolling. */
  const [ancreEdition, setAncreEdition] = useState<HTMLElement | null>(null);
  /** Viewport coordinates computed from the anchor (popover presentation only). */
  const [positionEdition, setPositionEdition] = useState<{ top: number; left: number } | null>(null);
  /** Waiting periods are collapsed by default to keep the quick-edit panel short. */
  const [attenteDepliee, setAttenteDepliee] = useState(false);
  const panneauEditionRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    // L'environnement Direction est une vue du tableau Développement : les
    // modifications faites depuis les onglets Direction sont persistées dans
    // la même sauvegarde.
    const serialise = JSON.stringify(board.data);
    if (serialise === derniereSauvegarde.current) return;
    sauverKanban(board.data);
    derniereSauvegarde.current = serialise;
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
    const diffZone = dateEntree ? joursEntreDatesISO(dateEntree) : 0;
    const diffTotal = creation ? joursEntreDatesISO(creation) : diffZone;
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
    const alarme = getAlarmeInfo(carte).active;
    const echeanceAtteinte =
      estDateISO(carte.date) && joursEntreDatesISO(carte.date) >= 0;
    if (alarme || alerteAttente?.niveau === 'rouge' || echeanceAtteinte) {
      return 'alerte';
    }
    const attenteEnCours = (carte.attentes ?? []).some((a) => {
      if (!estDateISO(a.dateSortie)) return true;
      return -joursEntreDatesISO(a.dateSortie) >= 0;
    });
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
    const retardGlobal = !alarme.estDerniereColonne && alarme.diffTotal >= 12;
    if (retardGlobal) {
      return 200_000 + Math.max(0, alarme.diffTotal - 12) * 100;
    }
    if (alarme.diffZone >= alarme.seuilZone) {
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
   * Scinde une colonne simple en 2 sections empilées. Si le titre contient
   * « / » (ex. « Punching/PDF »), il est découpé en deux titres de section.
   * Les cartes déjà présentes passent en section du haut.
   */
  const scinderColonne = (id: string) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === id);
      if (!colonne || colonne.sections?.length) return prev;
      const parties = colonne.titre.split('/').map((p) => p.trim()).filter(Boolean);
      const sections: KanbanSection[] = [
        { id: nouvelId(), titre: parties[0] || 'Partie 1', ordre: 0 },
        { id: nouvelId(), titre: parties[1] || 'Partie 2', ordre: 1 },
      ];
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
            attentes: [],
          },
        ],
      };
    });
  };

  const majCarte = (id: string, updates: Partial<KanbanCarte>) => {
    setData((prev) => ({
      ...prev,
      cartes: prev.cartes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
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
    setAncreEdition(null);
    setPositionEdition(null);
    setAttenteDepliee(false);
  }, []);

  const ouvrirEdition = (carte: KanbanCarte, ancre?: HTMLElement | null) => {
    // Clicking the card that is already open must not discard the draft.
    if (edition?.id === carte.id) return;
    setAncreEdition(ancre ?? null);
    setPositionEdition(null);
    setAttenteDepliee(false);
    setEdition({
      id: carte.id,
      titre: carte.titre,
      etat: carte.etat ?? '',
      traiteur: carte.traiteur ?? '',
      client: carte.client ?? '',
      commercial: carte.commercial ?? '',
      remarques: carte.remarques ?? '',
      // La couleur affichée sert de défaut : le post-it a toujours une couleur.
      couleur: carte.couleur ?? 'jaune',
      dateEcheance: carte.date,
      dateExpedition: carte.dateExpedition,
      attentes: (carte.attentes ?? []).map((a) => ({ ...a })),
    });
  };

  const enregistrerEdition = () => {
    if (!edition) return;
    const titre = edition.titre.trim();
    majCarte(edition.id, {
      titre: titre || 'Tâche sans titre',
      etat: edition.etat.trim() || undefined,
      traiteur: edition.traiteur.trim() || undefined,
      client: edition.client.trim() || undefined,
      commercial: edition.commercial.trim() || undefined,
      remarques: edition.remarques.trim() || undefined,
      couleur: edition.couleur,
      date: edition.dateEcheance || undefined,
      dateExpedition: edition.dateExpedition || undefined,
      attentes: edition.attentes
        .filter((a) => a.dateEntree)
        .map((a) => ({
          id: a.id,
          libelle: a.libelle?.trim() || undefined,
          dateEntree: a.dateEntree,
          ...(a.dateSortie ? { dateSortie: a.dateSortie } : {}),
        })),
    });
    fermerEdition();
  };

  /* --------------------- Card edit panel (presentation) -------------------- */

  const carteEdition = edition ? data.cartes.find((c) => c.id === edition.id) : undefined;

  /** Existing values used to populate the selects (no new data fields). */
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
  const colonneEdition = carteEdition
    ? data.colonnes.find((c) => c.id === carteEdition.colonneId)
    : undefined;
  const sectionEdition =
    carteEdition?.sectionId && colonneEdition?.sections
      ? colonneEdition.sections.find((s) => s.id === carteEdition.sectionId)
      : undefined;
  const emplacementEdition = sectionEdition
    ? `${colonneEdition?.titre ?? ''} · ${sectionEdition.titre}`
    : colonneEdition?.titre ?? '';

  const erreurExpedition =
    edition?.dateExpedition && dateDeplacementISO && edition.dateExpedition < dateDeplacementISO
      ? "La date d'expédition doit être postérieure ou égale à la date de déplacement."
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
    }));

  const editionModifiee = !!(
    edition &&
    carteEdition &&
    (edition.titre !== carteEdition.titre ||
      edition.etat !== (carteEdition.etat ?? '') ||
      edition.traiteur !== (carteEdition.traiteur ?? '') ||
      edition.client !== (carteEdition.client ?? '') ||
      edition.commercial !== (carteEdition.commercial ?? '') ||
      edition.remarques !== (carteEdition.remarques ?? '') ||
      edition.couleur !== (carteEdition.couleur ?? 'jaune') ||
      (edition.dateEcheance ?? '') !== (carteEdition.date ?? '') ||
      (edition.dateExpedition ?? '') !== (carteEdition.dateExpedition ?? '') ||
      JSON.stringify(normaliserAttentes(edition.attentes)) !==
        JSON.stringify(normaliserAttentes(carteEdition.attentes ?? [])))
  );

  const enregistrementAutorise = !!edition && !formulaireInvalide && editionModifiee;

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
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        if (!formulaireInvalide && editionModifiee) enregistrerEditionRef.current();
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
      carte.traiteur ? `Traiteur : ${carte.traiteur}` : null,
      carte.client ? `Client : ${carte.client}` : null,
      carte.commercial ? `Commercial : ${carte.commercial}` : null,
      carte.date ? `Date d'échéance : ${formatDateFr(carte.date)}` : null,
      carte.dateExpedition ? `Date d'expédition : ${formatDateFr(carte.dateExpedition)}` : null,
      carte.remarques ? `Remarques : ${carte.remarques}` : null,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lignes);
    setCopieOk(carte.id);
    setTimeout(() => setCopieOk(null), 1200);
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
      const dateDeplacementFr = formatDateFr(alarmeInfo.dateEntree ?? carte.dateEntreeZone ?? carte.creeLe);
      const postIt = KANBAN_COULEURS[carte.couleur ?? 'jaune'];
      const alerteAttente = getAlerteAttente(carte);
      const attenteEstOrange = alerteAttente?.niveau === 'orange';
      const attenteEstRouge = alerteAttente?.niveau === 'rouge';
      const attenteJours = alerteAttente?.jours ?? 0;
      const attenteOuverte = (carte.attentes ?? []).find((a) => !estDateISO(a.dateSortie));
      const echeanceJours = estDateISO(carte.date) ? -joursEntreDatesISO(carte.date) : null;
      const retardJours = alarmeInfo.type === 'global' ? diffTotal : diffZone;

      let alerteIcone = <Check className="h-3.5 w-3.5 shrink-0" />;
      let alerteTexte = 'Aucune alerte';
      let alerteClasses = 'bg-emerald-50 text-emerald-700';
      if (attenteEstRouge) {
        alerteIcone = <AlertTriangle className="h-3.5 w-3.5 shrink-0" />;
        alerteTexte = `Attente en retard${alerteAttente?.attente.libelle ? ` · ${alerteAttente.attente.libelle}` : ''} · ${attenteJours} j`;
        alerteClasses = 'bg-red-100 text-red-700';
      } else if (alarme) {
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
        alerteClasses = 'bg-slate-100 text-slate-600';
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

      const proprietaire = [carte.client, carte.traiteur].filter(Boolean).join(' · ');
      return (
        <div
          key={carte.id}
          draggable
          data-carte-id={carte.id}
          onDragStart={(e) => dragCarte(e, carte.id)}
          onDragEnd={arreterDrag}
          onDragOver={(e) => survolCarte(e, carte, position, zone.sectionId)}
          onClick={(e) => ouvrirEdition(carte, e.currentTarget)}
          className={`group/carte relative w-full cursor-pointer rounded-xl border p-3.5 shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md ${postIt.fond} ${postIt.bordure} ${
            enDrag ? 'opacity-40' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
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
                  ouvrirEdition(carte, ancre ?? e.currentTarget);
                }
              }}
              title={
                estArchive
                  ? copieOk === carte.id
                    ? 'Copié !'
                    : 'Copier la carte'
                  : 'Ouvrir la fiche'
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

          <span
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full border ${postIt.bordure} bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-700`}
          >
            <FileText className="h-3 w-3 shrink-0 text-slate-500" />
            {postIt.label}
          </span>

          <div
            className={`mt-2.5 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold ${alerteClasses}`}
          >
            {alerteIcone}
            <span className="min-w-0 truncate">{alerteTexte}</span>
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px]">
            <span className="min-w-0 truncate text-slate-500">
              Étape :{' '}
              <span className="font-medium text-slate-700">{carte.etat?.trim() || '—'}</span>
            </span>
            <span className="shrink-0 font-medium text-slate-500">
              Éch. {formatDateCourte(carte.date ?? carte.dateExpedition)}
            </span>
          </div>

          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 hidden rounded-lg border border-white/10 bg-slate-900/95 p-2 text-[9px] leading-tight text-white shadow-xl backdrop-blur-sm group-hover/carte:block">
            <div>
              <span className="text-white/60">Création :</span>{' '}
              <span className="font-semibold">{formatDateFr(carte.creeLe)}</span>
            </div>
            <div>
              <span className="text-white/60">Dernier déplacement :</span>{' '}
              <span className="font-semibold">{dateDeplacementFr}</span>
            </div>
            <div>
              <span className="text-white/60">Expédition :</span>{' '}
              <span className="font-semibold">
                {carte.dateExpedition ? formatDateFr(carte.dateExpedition) : '—'}
              </span>
            </div>
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
            Date d'expédition
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
            {['Chaîne', 'Développement client', 'Chaîne', 'Développement initiatives'].map(
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
              Aucune personne : ajoutez une chaîne de chaque côté ci-dessous.
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
    const personnes = trierParOrdre(section?.personnes ?? []);
    const nbCartes = section
      ? data.cartes.filter((c) => c.colonneId === colonne.id && c.sectionId === section.id).length
      : 0;
    const estLabo = estColonneLaboConfection(colonne);
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

        <div
          onDragOver={(e) => {
            if (!section || drag?.type !== 'carte') return;
            survolZone(e, colonne.id, section.id, nonAssignees.length);
          }}
          onDrop={(e) => {
            if (!section || drag?.type !== 'carte') return;
            deposerDansZone(e, colonne.id, section.id, nonAssignees.length);
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
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/60 overflow-hidden">
          {estLabo ? (
            <>
              <div className="grid grid-cols-[11rem_minmax(0,1fr)] border-b border-slate-200 bg-slate-50">
                <div className="border-r border-slate-200 px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-violet-700">
                  Brodeuse
                </div>
                <div className="px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  Modèles
                </div>
              </div>
              {personnes.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-slate-400">
                  Aucune brodeuse : ajoutez-en une ci-dessous.
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
                            placeholder="Nom de la brodeuse"
                            className="min-w-0"
                          />
                          <span className="mt-1 inline-block text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums">
                            {nb}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => supprimerBrodeuse(colonne.id, personne.id)}
                          title="Supprimer la brodeuse"
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
              Aucune brodeuse : ajoutez-en une ci-dessous.
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
                      placeholder="Nom de la brodeuse"
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
                      title="Supprimer la brodeuse"
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
              Ajouter une brodeuse
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
                        className={`h-1.5 cursor-pointer rounded-full transition-all ${
                          active ? 'w-6 bg-brand' : 'w-3 bg-slate-300 hover:bg-slate-400'
                        }`}
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
                onDragOver={(e) => {
                  survolRangee(e, colonne.id, indexColonne);
                  survolEnteteColonne(e, colonne);
                }}
                onDrop={(e) => deposerSurColonne(e, colonne)}
                className={`group/col ${
                  aBroderieMain || aBrodeuse ? 'w-[50rem]' : 'w-72'
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
                        title="Scinder la colonne en 2 sections empilées"
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
          {/* Header: title, move info, close */}
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-slate-100 pl-4 pr-3">
            <h2 className="m-0 shrink-0 text-xs font-bold uppercase tracking-[0.05em] text-slate-900">
              Modifier la carte
            </h2>
            <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-[3px] text-[11px] font-medium text-brand-strong">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">
                Déplacée le {formatDateFr(dateDeplacementISO)}
                {emplacementEdition ? ` · ${emplacementEdition}` : ''}
              </span>
            </span>
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
              {/* Main fields */}
              <div className="space-y-[9px]">
                {/* Title + stage */}
                <div className="grid grid-cols-1 gap-2.5 @min-[400px]:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <label htmlFor="carte-titre" className="kanban-label">
                      Titre
                    </label>
                    <input
                      id="carte-titre"
                      autoFocus
                      value={edition.titre}
                      onChange={(event) => setEdition({ ...edition, titre: event.target.value })}
                      className="kanban-field"
                      placeholder="Titre de la tâche"
                    />
                  </div>
                  <div className="min-w-0">
                    <span className="kanban-label">Étape</span>
                    <div
                      role="group"
                      aria-label="Étape"
                      className="inline-flex h-[30px] w-full items-center gap-0.5 rounded-[7px] bg-slate-100 p-0.5 @min-[400px]:w-auto"
                    >
                      {(['proto', 'dt'] as const).map((etape) => (
                        <button
                          key={etape}
                          type="button"
                          aria-pressed={edition.etat === etape}
                          onClick={() => setEdition({ ...edition, etat: etape })}
                          className={`h-full min-w-[44px] flex-1 rounded-[5px] px-3 text-[11px] font-semibold uppercase tracking-[0.04em] transition-colors @min-[400px]:flex-none ${
                            edition.etat === etape
                              ? 'bg-brand font-bold text-white'
                              : 'text-slate-600 hover:bg-white'
                          }`}
                        >
                          {etape}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Traiteur / Client / Commercial */}
                <div className="grid grid-cols-1 gap-2.5 @min-[400px]:grid-cols-[1fr_1.2fr_1fr]">
                  <div>
                    <label htmlFor="carte-traiteur" className="kanban-label">
                      Traiteur
                    </label>
                    <select
                      id="carte-traiteur"
                      value={edition.traiteur}
                      onChange={(event) => setEdition({ ...edition, traiteur: event.target.value })}
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

                {/* Type */}
                <div>
                  <span className="kanban-label">Type</span>
                  <div role="group" aria-label="Type de carte" className="flex h-7 items-center gap-2">
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

                {/* Dates */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label htmlFor="carte-echeance" className="kanban-label">
                      Échéance
                    </label>
                    <input
                      id="carte-echeance"
                      type="date"
                      value={edition.dateEcheance ?? ''}
                      onChange={(event) =>
                        setEdition({ ...edition, dateEcheance: event.target.value || undefined })
                      }
                      className="kanban-field"
                    />
                  </div>
                  <div>
                    <label htmlFor="carte-expedition" className="kanban-label">
                      Expédition
                    </label>
                    <input
                      id="carte-expedition"
                      type="date"
                      value={edition.dateExpedition ?? ''}
                      onChange={(event) =>
                        setEdition({ ...edition, dateExpedition: event.target.value || undefined })
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

                {/* Notes */}
                <div>
                  <label htmlFor="carte-remarques" className="kanban-label">
                    Remarques
                  </label>
                  <textarea
                    id="carte-remarques"
                    rows={2}
                    value={edition.remarques}
                    onChange={(event) => setEdition({ ...edition, remarques: event.target.value })}
                    className="kanban-field kanban-textarea"
                    placeholder="Remarques libres…"
                  />
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
                    const libelle = attente.libelle?.trim() ?? '';
                    const motifConnu = MOTIFS_ATTENTE.includes(libelle);
                    const valeurSelect = libelle === '' ? MOTIF_ATTENTE_AUTRE : libelle;
                    const enCours = !attente.dateSortie;
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
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Motif de l’attente ${index + 1}`}
                            value={motifConnu || libelle === '' ? valeurSelect : libelle}
                            onChange={(event) => {
                              const valeur = event.target.value;
                              const attentes = [...edition.attentes];
                              attentes[index] = {
                                ...attente,
                                libelle: valeur === MOTIF_ATTENTE_AUTRE ? '' : valeur,
                              };
                              setEdition({ ...edition, attentes });
                            }}
                            className="kanban-field-compact min-w-0 flex-1"
                          >
                            {MOTIFS_ATTENTE.map((motif) => (
                              <option key={motif} value={motif}>
                                {motif}
                              </option>
                            ))}
                            {libelle !== '' && !motifConnu && (
                              <option value={libelle}>{libelle}</option>
                            )}
                            <option value={MOTIF_ATTENTE_AUTRE}>{MOTIF_ATTENTE_AUTRE}</option>
                          </select>
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

                        {(!motifConnu || libelle === '') && (
                          <input
                            aria-label={`Motif personnalisé de l’attente ${index + 1}`}
                            value={attente.libelle ?? ''}
                            onChange={(event) => {
                              const attentes = [...edition.attentes];
                              attentes[index] = { ...attente, libelle: event.target.value };
                              setEdition({ ...edition, attentes });
                            }}
                            placeholder="Précisez le motif…"
                            className="kanban-field-compact mt-2 w-full"
                          />
                        )}

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
                              disabled={enCours}
                              aria-invalid={!!erreurAttente}
                              onChange={(event) => {
                                const attentes = [...edition.attentes];
                                attentes[index] = {
                                  ...attente,
                                  dateSortie: event.target.value || undefined,
                                };
                                setEdition({ ...edition, attentes });
                              }}
                              className={`kanban-field-compact w-full disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${
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
                                attentes[index] = {
                                  ...attente,
                                  // Checking "En cours" clears the exit date; unchecking seeds it with today.
                                  dateSortie: event.target.checked
                                    ? undefined
                                    : attente.dateSortie || getDateISOSite(),
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
    </div>
  );
};
