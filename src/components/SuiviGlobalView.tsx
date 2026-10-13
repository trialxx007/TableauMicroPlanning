import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import { CardFormData, CardItem } from '../types/card.ts';
import {
  ChaineRow,
  ChaineSlotCard,
  CategorieConfig,
  InspectionBloc,
  InspectionValeur,
  AlerteChamp,
  TEINTE_ALERTE_DEFAUT,
  normaliserTeinteAlerte,
} from '../types/suiviGlobal.ts';
import { CATEGORIES_CONFIG, INITIAL_CHAINE_ROWS } from '../data/mockSuiviGlobal.ts';
import { CardPickerModal } from './CardPickerModal.tsx';
import { SlotActionModal } from './SlotActionModal.tsx';
import { InspectionEtatMenu } from './InspectionEtatMenu.tsx';
import { OfPopover } from './OfPopover.tsx';
import { AlertePopover } from './AlertePopover.tsx';
import { useAlertesManuelles } from '../utils/alertesManuelles.ts';
import { getJalonsCard, type JalonInfo } from '../utils/jalons.ts';
import { getNowParis, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import {
  blocInspectionVide,
  dateDuJourISO,
  normaliserBloc,
} from '../utils/inspections.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { ViewSwitcher } from './ViewSwitcher.tsx';
import { suiviGlobalApi, type SuiviGlobalLayoutRow } from '../services/api.ts';
import {
  LigneTableSuivi,
  NOMBRE_LANCEMENTS,
  PastilleJalon,
  type AlerteOuverteGlobal,
  type ApercuBanniere,
  type MenuEtatInspection,
  type OfOuvertGlobal,
  type TypeSlotGlobal,
} from './LigneTableSuivi.tsx';
import {
  Sparkles,
  Truck,
  ClipboardList,
  Calendar,
  Clock,
} from 'lucide-react';


interface SuiviGlobalViewProps {
  onBackToPointJournalier: () => void;
  cards: CardItem[];
  onOpenCardModal?: (card: CardItem) => void;
  onOpenCreateCard?: (
    prefillData: Partial<CardFormData> | null,
    onCreatedCallback: (createdCard: CardItem) => void
  ) => void;
}

interface ActiveSlotPicker {
  rowId: string;
  slotType: 'modeleEnCours' | 'lancement' | 'expedition';
  /** Colonne « Prochain Lancement » (0..4). */
  lancementIndex?: number;
  /** Rang dans la pile de 2 cartes de la case (0 = haut, 1 = bas). */
  slotIndex?: number;
  slotTitle: string;
}

/** Pour SlotActionModal : case en attente de choix (nouvelle carte ou existante). */
interface ActiveSlotAction {
  rowId: string;
  slotType: 'modeleEnCours' | 'lancement' | 'expedition';
  lancementIndex?: number;
  slotIndex?: number;
  slotTitle: string;
}

/** Alias historiques : la ligne du suivi global et la pile de deux cartes. */
type SuiviRow = ChaineRow;
type PileDeCartes = ChaineRow['modeleEnCoursCards'];

/** Coordonnées d'une case du tableau (pour déplacer une carte par glisser-déposer). */
interface CoordCase {
  rowId: string;
  slotType: TypeSlotGlobal;
  lancementIndex?: number;
  slotIndex?: number;
}

/** Carte posée dans une case, ou null si la case est vide. */
function lireCarteEnCase(lignes: SuiviRow[], c: CoordCase): ChaineSlotCard | null {
  const ligne = lignes.find((r) => r.id === c.rowId);
  if (!ligne) return null;
  if (c.slotType === 'modeleEnCours') return ligne.modeleEnCoursCards[c.slotIndex ?? 0] ?? null;
  if (c.slotType === 'expedition') return ligne.expeditionCard ?? null;
  return ligne.prochainsLancementsCards[c.lancementIndex ?? 0]?.[c.slotIndex ?? 0] ?? null;
}

/** Remplace la carte d'une case (null pour la vider), sans toucher aux autres. */
function ecrireCarteEnCase(lignes: SuiviRow[], c: CoordCase, carte: ChaineSlotCard | null): SuiviRow[] {
  return lignes.map((r) => {
    if (r.id !== c.rowId) return r;
    if (c.slotType === 'modeleEnCours') {
      const pile = [...r.modeleEnCoursCards] as PileDeCartes;
      pile[c.slotIndex ?? 0] = carte;
      return { ...r, modeleEnCoursCards: pile };
    }
    if (c.slotType === 'expedition') {
      return { ...r, expeditionCard: carte ?? null };
    }
    const lancements = [...r.prochainsLancementsCards] as ChaineRow['prochainsLancementsCards'];
    const pile = [...(lancements[c.lancementIndex ?? 0] ?? [null, null])] as PileDeCartes;
    pile[c.slotIndex ?? 0] = carte;
    lancements[c.lancementIndex ?? 0] = pile;
    return { ...r, prochainsLancementsCards: lancements };
  });
}

/** Retire cette carte de toutes les cases où elle apparaît (une carte = une case). */
function retirerCarteDePartout(lignes: SuiviRow[], cardId: string): SuiviRow[] {
  return lignes.map((r) => {
    const modelePile = (r.modeleEnCoursCards as PileDeCartes).map((s) =>
      s?.cardId === cardId ? null : s
    ) as PileDeCartes;
    const lancementsPiles = (r.prochainsLancementsCards as ChaineRow['prochainsLancementsCards']).map(
      (pile) => (pile ?? [null, null]).map((s) => (s?.cardId === cardId ? null : s))
    ) as ChaineRow['prochainsLancementsCards'];
    return {
      ...r,
      modeleEnCoursCards: modelePile,
      prochainsLancementsCards: lancementsPiles,
      expeditionCard: r.expeditionCard?.cardId === cardId ? null : r.expeditionCard,
    };
  });
}

/** Localise l'unique case où est posée cette carte, si elle est dans le tableau. */
function localiserCarte(lignes: SuiviRow[], cardId: string): CoordCase | null {
  for (const r of lignes) {
    for (const [i, s] of r.modeleEnCoursCards.entries()) {
      if (s?.cardId === cardId) return { rowId: r.id, slotType: 'modeleEnCours', slotIndex: i };
    }
    for (let li = 0; li < r.prochainsLancementsCards.length; li++) {
      const pile = r.prochainsLancementsCards[li] ?? [];
      for (let si = 0; si < pile.length; si++) {
        if (pile[si]?.cardId === cardId) {
          return { rowId: r.id, slotType: 'lancement', lancementIndex: li, slotIndex: si };
        }
      }
    }
    if (r.expeditionCard?.cardId === cardId) return { rowId: r.id, slotType: 'expedition' };
  }
  return null;
}

/** Un ancien cache peut stocker une carte seule : on la remonte en pile. */
function enPile(brut: unknown): PileDeCartes {
  if (Array.isArray(brut)) return [brut[0] ?? null, brut[1] ?? null];
  if (brut && typeof brut === 'object') return [brut as ChaineSlotCard, null];
  return [null, null];
}

function lancementsVides(): ChaineRow['prochainsLancementsCards'] {
  return Array.from({ length: NOMBRE_LANCEMENTS }, () => [
    null,
    null,
  ]) as unknown as ChaineRow['prochainsLancementsCards'];
}

/** Reconstruit des lignes valides quel que soit le format du cache :
 *  cartes uniques, lancements à plat, inspections manquantes… */
function normaliserLignes(brut: unknown): SuiviRow[] {
  if (!Array.isArray(brut)) return INITIAL_CHAINE_ROWS;
  const lignes = brut
    .filter((r) => r && typeof r === 'object')
    .map((brutLigne) => {
      const r = brutLigne as Record<string, unknown>;
      // L'ancien champ unique « modeleEnCoursCard » est remplacé par la pile.
      const { modeleEnCoursCard: _ancienneCarte, ...reste } = r;
      const lancements = Array.isArray(reste.prochainsLancementsCards)
        ? reste.prochainsLancementsCards
        : [];
      const inspections = Array.isArray(reste.inspections) ? reste.inspections : [];
      
      // Migration ancienne structure (remarque, remarque2) -> nouvelles alertes[]
      let alertes: AlerteChamp[] = [];
      if (Array.isArray(reste.alertes)) {
        alertes = (reste.alertes as unknown[]).map((a: unknown) => {
          const obj = a as Record<string, unknown>;
          return {
            texte: typeof obj.texte === 'string' ? obj.texte : '',
            teinte: normaliserTeinteAlerte(obj.teinte),
          };
        });
      } else {
        // Ancien format
        const r1 = typeof r.remarque === 'string' ? r.remarque : '';
        const r2 = typeof r.remarque2 === 'string' ? r.remarque2 : '';
        const t1 = normaliserTeinteAlerte(r.remarqueTeinte);
        const t2 = normaliserTeinteAlerte(r.remarque2Teinte);
        if (r1) alertes.push({ texte: r1, teinte: t1 });
        if (r2) alertes.push({ texte: r2, teinte: t2 });
      }
      // Toujours au moins une alerte vide pour permettre l'ajout
      if (alertes.length === 0) alertes.push({ texte: '', teinte: TEINTE_ALERTE_DEFAUT });

      return {
        ...reste,
        id: typeof reste.id === 'string' ? reste.id : `chaine-${Math.random().toString(36).slice(2, 8)}`,
        categorieId:
          reste.categorieId === 'BRODERIE_MAIN' || reste.categorieId === 'CONFECTION'
            ? reste.categorieId
            : 'CONFECTION',
        nom: typeof reste.nom === 'string' ? reste.nom.toUpperCase() : '',
        dotColor: typeof reste.dotColor === 'string' ? reste.dotColor : '#94a3b8',
        modeleEnCoursCards: enPile(reste.modeleEnCoursCards),
        inspections: [
          inspections[0] ? normaliserBloc(inspections[0]) : blocInspectionVide(),
          inspections[1] ? normaliserBloc(inspections[1]) : blocInspectionVide(),
        ] as ChaineRow['inspections'],
        prochainsLancementsCards: Array.from(
          { length: NOMBRE_LANCEMENTS },
          (_, i) => enPile(lancements[i])
        ) as unknown as ChaineRow['prochainsLancementsCards'],
        expeditionCard: (reste.expeditionCard as ChaineSlotCard | null | undefined) ?? null,
        alertes,
      } satisfies SuiviRow;
    });
  // Chaînes renommées / ajoutées / retirées après la mise en place initiale : on
  // les applique aussi au cache local, sinon une session déjà ouverte garde
  // l'ancien jeu (INITIAL_CHAINE_ROWS n'est lu qu'au tout premier lancement).
  const renommages: Record<string, string> = { 'conf-tan': 'TANA', 'conf-mar': 'MARGUERITE' };
  const supprimes = new Set(['conf-bleu']);
  const ajouts = ['conf-pose-cuir', 'conf-sst'];
  const migrees: SuiviRow[] = lignes
    .filter((l) => !supprimes.has(l.id))
    .map((l) => (renommages[l.id] ? { ...l, nom: renommages[l.id] } : l));
  for (const id of ajouts) {
    if (!migrees.some((l) => l.id === id)) {
      const seed = INITIAL_CHAINE_ROWS.find((r) => r.id === id);
      if (seed) migrees.push(seed);
    }
  }
  return migrees.length > 0 ? migrees : INITIAL_CHAINE_ROWS;
}

const BANNER_LINE_RATIO = 1.06;
const BANNER_WORD_GAP = 0.45;
const BANNER_FILL_W = 0.72;
const BANNER_FILL_H = 0.88;
const BANNER_GLYPH_W_RATIO = 0.66;

function buildBanner(
  catConfig: CategorieConfig,
  availW: number,
  availH: number
): {
  glyphs: { char: string; x: number; y: number; size: number }[];
  vbW: number;
  vbH: number;
} {
  const lines = catConfig.titreVerticalLignes;
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  const stackUnits =
    totalChars * BANNER_LINE_RATIO + (lines.length - 1) * BANNER_WORD_GAP;

  if (!(availW > 0) || !(availH > 0) || !(stackUnits > 0)) {
    return { glyphs: [], vbW: 1, vbH: 1 };
  }

  const size = Math.min(
    (availW * BANNER_FILL_W) / BANNER_GLYPH_W_RATIO,
    (availH * BANNER_FILL_H) / stackUnits
  );

  const glyphs: { char: string; x: number; y: number; size: number }[] = [];
  let cursor = 0;

  lines.forEach((line, lineIdx) => {
    if (lineIdx > 0) cursor += size * BANNER_WORD_GAP;
    line.forEach((char) => {
      cursor += size * BANNER_LINE_RATIO;
      glyphs.push({
        char,
        x: availW / 2,
        y: cursor - size * 0.18,
        size,
      });
    });
  });

  const offset = (availH - cursor) / 2;
  return {
    vbW: availW,
    vbH: availH,
    glyphs: glyphs.map((glyph) => ({ ...glyph, y: glyph.y + offset })),
  };
}

export const SuiviGlobalView: React.FC<SuiviGlobalViewProps> = ({
  onBackToPointJournalier,
  cards,
  onOpenCardModal,
  onOpenCreateCard,
}) => {
  const catalogue = useJalonCatalogue();
  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();
  const [layoutLoading, setLayoutLoading] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setParisTime(getNowParis().timeStr), 15000);
    return () => clearInterval(timer);
  }, []);

  // Layout partagé via API (DB SQLite) avec polling + localStorage fallback
  const [rows, setRows] = useState<SuiviRow[]>(() => INITIAL_CHAINE_ROWS);

  const loadLayout = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) console.log('[SuiviGlobal] Chargement layout via API...');
      const data = await suiviGlobalApi.getLayout();
      if (isInitial) console.log('[SuiviGlobal] Layout reçu:', data.length, 'lignes');
      if (data.length > 0) {
        const normalized = normaliserLignes(data);
        setRows((prev) => {
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(normalized);
          if (prevStr !== nextStr) {
            if (!isInitial) console.log('[SuiviGlobal] Layout mis à jour depuis le serveur');
            return normalized;
          }
          return prev;
        });
      } else if (isInitial) {
        console.log('[SuiviGlobal] Layout vide, utilisation INITIAL_CHAINE_ROWS');
      }
    } catch (e) {
      console.warn('[SuiviGlobal] Erreur chargement layout', e);
    } finally {
      if (isInitial) setLayoutLoading(false);
    }
  }, []);

  // Chargement initial
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      await loadLayout(true);
    };
    init();
    return () => { mounted = false; };
  }, [loadLayout]);

  // Polling toutes les 3s pour synchroniser avec les autres postes
  useEffect(() => {
    const interval = setInterval(() => {
      loadLayout(false);
    }, 3000);
    return () => clearInterval(interval);
  }, [loadLayout]);

  const [activePicker, setActivePicker] = useState<ActiveSlotPicker | null>(null);

  // Alertes saisies à la main dans le popover : source partagée (localStorage),
  // écrites par le popover, lues ici pour allumer la bande de la ligne.
  const alertesManuelles = useAlertesManuelles();

  // --- Caches de lecture rendu par rendu -------------------------------
  // Le tableau affiche jusqu'à ~12 lignes × 13 cases : sans cache, chaque rendu
  // refait getCardById (find linéaire) et getJalonsCard (construction d'un Map +
  // tri) des dizaines de fois. Ces caches ne se recalculent que quand les cartes
  // ou le catalogue changent, pas à chaque rendu (horloge 15 s, saisie, etc.).
  const cardsParId = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards]
  );
  const jalonInfosParCarte = useMemo(() => {
    const m = new Map<string, JalonInfo[]>();
    for (const c of cards) m.set(c.id, getJalonsCard(c, catalogue));
    return m;
  }, [cards, catalogue]);
  const cartesAlerteRetard = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) {
      const infos = jalonInfosParCarte.get(c.id);
      if (infos?.some((j) => j.enRetard)) s.add(c.id);
    }
    return s;
  }, [cards, jalonInfosParCarte]);

  // Popover d'alerte ouvert : la carte concernée, son titre de case, l'ancre DOM.
  const [alerteOuverte, setAlerteOuverte] = useState<AlerteOuverteGlobal | null>(null);

  // Taille réelle de chaque bandeau vertical, pour dimensionner le texte
  // proportionnellement à la hauteur cumulée des modèles en cours de la catégorie.
  const [bannerSizes, setBannerSizes] = useState<Record<string, { w: number; h: number }>>({});
  const bannerNodesRef = useRef<Record<string, HTMLTableCellElement | null>>({});
  const bannerObserverRef = useRef<ResizeObserver | null>(null);
  const bannerRefCacheRef = useRef<Record<string, (el: HTMLTableCellElement | null) => void>>({});

  // Conteneur défilant de la table : pendant le défilement, on met en pause les
  // animations de pulsation pour éviter de repeindre chaque frame (fluide au
  // scroll horizontal). La classe est retirée ~200 ms après l'arrêt.
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    let fin: number | undefined;
    const stop = () => {
      el.classList.remove('suivi-table-au-scroll');
      fin = undefined;
    };
    const onScroll = () => {
      el.classList.add('suivi-table-au-scroll');
      if (fin) window.clearTimeout(fin);
      fin = window.setTimeout(stop, 200);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (fin) window.clearTimeout(fin);
    };
  }, []);

  const getBannerRef = (catId: string) => {
    const cache = bannerRefCacheRef.current;
    if (!cache[catId]) {
      cache[catId] = (el: HTMLTableCellElement | null) => {
        const previous = bannerNodesRef.current[catId];
        if (previous && previous !== el) {
          bannerObserverRef.current?.unobserve(previous);
        }
        bannerNodesRef.current[catId] = el;
        if (el) {
          bannerObserverRef.current?.observe(el);
        } else {
          delete bannerNodesRef.current[catId];
        }
      };
    }
    return cache[catId];
  };

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setBannerSizes((prev) => {
        let changed = false;
        const next: Record<string, { w: number; h: number }> = { ...prev };
        for (const entry of entries) {
          const catId = (entry.target as HTMLTableCellElement).dataset.bannerCat;
          if (!catId) continue;
          const w = Math.round(entry.contentRect.width);
          const h = Math.round(entry.contentRect.height);
          if (prev[catId]?.w !== w || prev[catId]?.h !== h) {
            next[catId] = { w, h };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    bannerObserverRef.current = observer;
    Object.values(bannerNodesRef.current).forEach((node) => {
      if (node) observer.observe(node);
    });
    return () => {
      observer.disconnect();
      bannerObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (layoutLoading) return; // Ne pas sauvegarder pendant le chargement initial
    // Sauvegarde locale immédiate (réactivité)
    try {
      localStorage.setItem('suivi_global_rows_v3', JSON.stringify(rows));
    } catch {}
    // Sauvegarde serveur (partagée) - debounced via timeout
    const timeout = setTimeout(() => {
      suiviGlobalApi.setLayout(rows).catch(console.warn);
    }, 500);
    return () => clearTimeout(timeout);
  }, [rows, layoutLoading]);

  // Flush avant fermeture page (recharge, onglet fermé)
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem('suivi_global_rows_v3', JSON.stringify(rows));
      } catch {}
      // sendBeacon pour serveur même si page déchargée
      navigator.sendBeacon('/api/v1/suivi-layout', JSON.stringify({ rows }));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [rows]);

  // État pour SlotActionModal (choix nouvelle carte / carte existante)
  const [selectedSlotAction, setSelectedSlotAction] = useState<ActiveSlotAction | null>(null);

  const handleAssignSlotCard = useCallback(
    (
      rowId: string,
      slotType: 'modeleEnCours' | 'lancement' | 'expedition',
      slotCard: ChaineSlotCard | null,
      lancementIndex?: number,
      slotIndex = 0
    ) => {
      // Affectation purement manuelle : OK Prod ne déplace jamais une carte ici.
      // Une même carte ne peut occuper qu'une seule case du tableau : si elle est
      // déjà posée ailleurs, elle en est retirée avant d'être placée à la demande.
      const cardId = slotCard?.cardId;

      setRows((prev) => {
        const retrait = cardId ? retirerCarteDePartout(prev, cardId) : prev;
        return ecrireCarteEnCase(
          retrait,
          { rowId, slotType, lancementIndex, slotIndex },
          slotCard
        );
      });
    },
    []
  );

  // Glisser-déposer d'une carte déjà posée vers une autre case : la carte de la
  // case cible reprend la place de celle qu'on déplace (échange), plutôt que
  // d'être écartée, pour ne jamais perdre une affectation.
  const handleDropCarte = useCallback(
    (
      rowId: string,
      slotType: TypeSlotGlobal,
      cardId: string,
      lancementIndex?: number,
      slotIndex?: number
    ) => {
      const carte = cardsParId.get(cardId);
      if (!carte) return;
      const cible: CoordCase = { rowId, slotType, lancementIndex, slotIndex };
      const carteDeposee: ChaineSlotCard = { cardId: carte.id, customLabel: carte.modele };

      setRows((prev) => {
        const source = localiserCarte(prev, carte.id);
        const memeCase =
          source &&
          source.rowId === cible.rowId &&
          source.slotType === cible.slotType &&
          (source.lancementIndex ?? 0) === (cible.lancementIndex ?? 0) &&
          (source.slotIndex ?? 0) === (cible.slotIndex ?? 0);
        if (memeCase) return prev;

        const carteEnCible = lireCarteEnCase(prev, cible);
        let prochain = retirerCarteDePartout(prev, carte.id);
        prochain = ecrireCarteEnCase(prochain, cible, carteDeposee);
        if (carteEnCible && source) prochain = ecrireCarteEnCase(prochain, source, carteEnCible);
        return prochain;
      });
    },
    [cardsParId]
  );

  // --- Glisser-déposer (géré par @dnd-kit) -----------------------
  // Les cartes ont une « vraie » présence pendant le glisser : le DragOverlay
  // affiche la carte soulevée et la fait suivre le curseur, puis l'anime vers
  // sa case de dépôt (drop animation) avant que l'état des lignes ne change.
  const [cardIdEnVol, setCardIdEnVol] = useState<string | null>(null);
  // Case d'arrivée capturée au lâcher : la drop animation y fait voler la carte
  // soulevée, et c'est seulement une fois posée (sideEffects) que l'état des
  // lignes est échangé — on ne démonte pas la case source pendant le vol, sinon
  // dnd-kit abandonnerait l'animation.
  const cibleVolRef = useRef<{
    cardId: string;
    rowId: string;
    slotType: TypeSlotGlobal;
    lancementIndex?: number;
    slotIndex?: number;
    rect: { left: number; top: number; width: number; height: number } | null;
  } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    cibleVolRef.current = null;
    setCardIdEnVol(String(event.active.id));
  }, []);

  const onDragCancel = useCallback((_event: DragCancelEvent) => {
    cibleVolRef.current = null;
    setCardIdEnVol(null);
  }, []);

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) {
      cibleVolRef.current = null;
      setCardIdEnVol(null);
      return;
    }
    const cible = over.data.current as
      | { rowId: string; slotType: TypeSlotGlobal; lancementIndex?: number; slotIndex?: number }
      | undefined;
    const carteSource = active.data.current as { cardId?: string } | undefined;
    const rect = over.rect;
    if (
      !cible ||
      !carteSource?.cardId ||
      !rect
    ) {
      cibleVolRef.current = null;
      setCardIdEnVol(null);
      return;
    }
    // On ne modifie PAS encore les lignes : l'échange sera appliqué par
    // sideEffects de la drop animation, une fois la carte arrivée à destination.
    cibleVolRef.current = {
      cardId: carteSource.cardId,
      rowId: cible.rowId,
      slotType: cible.slotType,
      lancementIndex: cible.lancementIndex,
      slotIndex: cible.slotIndex,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    };
  }, []);

  const dropAnimation = useMemo<DropAnimation>(
    () => ({
      duration: 220,
      easing: 'cubic-bezier(0.25, 0.9, 0.3, 1.05)',
      keyframes: (params) => {
        const cible = cibleVolRef.current;
        const cur = params.dragOverlay.rect;
        const startX = cur.left;
        const startY = cur.top;
        let destX = startX;
        let destY = startY;
        if (cible?.rect) {
          destX = cible.rect.left + (cible.rect.width - cur.width) / 2;
          destY = cible.rect.top + 4;
        }
        return [
          { transform: `translate3d(${startX}px, ${startY}px, 0) scale(1.02)`, opacity: 1 },
          { transform: `translate3d(${destX}px, ${destY}px, 0) scale(0.97)`, opacity: 0.2 },
        ];
      },
      sideEffects: () => {
        const vol = cibleVolRef.current;
        cibleVolRef.current = null;
        setCardIdEnVol(null);
        if (vol) {
          handleDropCarte(vol.rowId, vol.slotType, vol.cardId, vol.lancementIndex, vol.slotIndex);
        }
      },
    }),
    [handleDropCarte]
  );

  const carteSoulevee = useMemo(() => {
    const card = cardIdEnVol ? cardsParId.get(cardIdEnVol) : undefined;
    const jalons = card ? (jalonInfosParCarte.get(card.id) ?? []) : [];
    return { card, jalons };
  }, [cardIdEnVol, cardsParId, jalonInfosParCarte]);

  // Ouvre SlotActionModal au lieu de CardPickerModal direct
  const handleSlotActionChooseNew = () => {
    if (!selectedSlotAction || !onOpenCreateCard) return;
    const { rowId, slotType, lancementIndex, slotIndex } = selectedSlotAction;
    const isModeleEnCours = slotType === 'modeleEnCours';
    const prefill: Partial<CardFormData> = {
      ...(isModeleEnCours ? { okProd: true, statut: 'EN_COURS' } : { okProd: false, statut: 'EN_ATTENTE' }),
    };
    onOpenCreateCard(prefill, (createdCard) => {
      handleAssignSlotCard(rowId, slotType, { cardId: createdCard.id, customLabel: createdCard.modele }, lancementIndex, slotIndex);
      setSelectedSlotAction(null);
    });
  };

  const handleSlotActionChooseExisting = () => {
    if (!selectedSlotAction) return;
    // Ouvre CardPickerModal pour choisir une carte existante
    const { rowId, slotType, lancementIndex, slotIndex } = selectedSlotAction;
    setActivePicker({
      rowId,
      slotType,
      lancementIndex,
      slotIndex,
      slotTitle: selectedSlotAction.slotTitle,
    });
    setSelectedSlotAction(null);
  };

  // --- Inspections (un bloc par modèle en cours) -------------------------
  const majBlocInspection = (
    rowId: string,
    blocIndex: number,
    maj: (bloc: InspectionBloc) => InspectionBloc
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        const inspections = [...r.inspections] as ChaineRow['inspections'];
        if (!inspections[blocIndex]) return r;
        inspections[blocIndex] = maj(inspections[blocIndex]);
        return { ...r, inspections };
      })
    );
  };

  const majValeur = useCallback(
    (
      rowId: string,
      blocIndex: number,
      valeurId: string,
      maj: (valeur: InspectionValeur) => InspectionValeur
    ) =>
      majBlocInspection(rowId, blocIndex, (bloc) => ({
        ...bloc,
        valeurs: bloc.valeurs.map((v) => (v.id === valeurId ? maj(v) : v)),
      })),
    [majBlocInspection]
  );

  const ajouterValeur = useCallback(
    (
      rowId: string,
      blocIndex: number,
      type: 'I' | 'OF',
      pct?: 50 | 100
    ) =>
      majBlocInspection(rowId, blocIndex, (bloc) => ({
        ...bloc,
        valeurs: [
          ...bloc.valeurs,
          {
            id: `val-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            ...(type === 'I' ? { pct: pct ?? 50 } : {}),
            date: dateDuJourISO(),
            resultat: null,
          },
        ],
      })),
    [majBlocInspection]
  );

  const [menuEtat, setMenuEtat] = useState<MenuEtatInspection | null>(null);
  const [ofOuvert, setOfOuvert] = useState<OfOuvertGlobal | null>(null);

  const categoriesList = ['BRODERIE_MAIN', 'CONFECTION'];

  const filteredRows = rows;

  // Le bandeau vertical est propre à la catégorie (pas à chaque ligne) :
  // calculé une seule fois par catégorie, et stable pour un même bannerSizes,
  // pour préserver la mémoïsation des lignes.
  const catBanners = useMemo(() => {
    const out: Record<string, ApercuBanniere> = {};
    for (const catKey of categoriesList) {
      const cfg = CATEGORIES_CONFIG[catKey];
      const size = bannerSizes[catKey];
      out[catKey] = buildBanner(cfg, size?.w ?? 0, size?.h ?? 0);
    }
    return out;
  }, [categoriesList, bannerSizes]);

  /** Ouvre le menu d'action (nouvelle carte / carte existante) pour une case. */
  const onOuvrirActionSlot = useCallback(
    (
      rowId: string,
      titreSlot: string,
      slotType: TypeSlotGlobal,
      lancementIndex?: number,
      slotIndex?: number
    ) => {
      setSelectedSlotAction({ rowId, slotType, lancementIndex, slotIndex, slotTitle: titreSlot });
    },
    []
  );

  /** Ouvre le sélecteur de carte existante pour une case. */
  const onOuvrirPicker = useCallback(
    (
      rowId: string,
      titreSlot: string,
      slotType: TypeSlotGlobal,
      lancementIndex?: number,
      slotIndex?: number
    ) => {
      setActivePicker({ rowId, slotType, lancementIndex, slotIndex, slotTitle: titreSlot });
    },
    []
  );

  /** Ouvre la fiche carte. */
  const onCarteClick = useCallback(
    (card: CardItem) => {
      if (onOpenCardModal) onOpenCardModal(card);
    },
    [onOpenCardModal]
  );

  // Currently selected slot for CardPickerModal
  const currentSlotForPicker = (() => {
    if (!activePicker) return null;
    const row = rows.find((r) => r.id === activePicker.rowId);
    if (!row) return null;
    const slotIndex = activePicker.slotIndex ?? 0;
    if (activePicker.slotType === 'modeleEnCours') {
      return row.modeleEnCoursCards[slotIndex] ?? null;
    }
    if (activePicker.slotType === 'expedition') {
      return row.expeditionCard ?? null;
    }
    return row.prochainsLancementsCards[activePicker.lancementIndex ?? 0]?.[slotIndex] ?? null;
  })();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-16">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white border-b border-slate-200 relative z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          {/* Gauche : titre + date & heure, comme le Point Commande Journalière */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Tableau AIC
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-slate-500 mt-0.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {fullFrenchDate}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 font-semibold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  {parisTime}
                  <span className="text-[10px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Centre : sélecteur de vue (Point Commande / Suivi Global) */}
          <div className="flex md:justify-center">
            <ViewSwitcher
              currentPage="suivi-global"
              onChangePage={(page) => page === 'point-journalier' && onBackToPointJournalier()}
            />
          </div>

          {/* Droite : vide, pour équilibrer et garder le sélecteur centré */}
          <div aria-hidden="true" />
        </div>
      </div>

      {/* Main Board Container */}
      <div className="max-w-[1850px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* The Exact Table matching the PNG + Expedition column */}
        <div
          ref={tableScrollRef}
          className="bg-[#eef2f6]/90 p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto overscroll-x-contain"
        >
          <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 min-w-[2900px]">
            {/* Header Row */}
            <thead>
              <tr>
                {/* Type */}
                <th className="w-14 min-w-[56px] max-w-[56px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 ">
                    Type
                  </div>
                </th>

                {/* Chaîne */}
                <th className="w-36 min-w-[130px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 ">
                    Chaîne
                  </div>
                </th>

                {/* Modèle en cours (Carte) */}
                <th className="w-[330px] min-w-[290px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 ">
                    Modèle en cours
                  </div>
                </th>

                {/* Inspection (OF / I du jour, un bloc par modèle en cours) */}
                <th className="w-[260px] min-w-[230px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 ">
                    Inspection
                  </div>
                </th>

                {/* Alertes */}
                <th className="w-60 min-w-[190px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 ">
                    Alertes
                  </div>
                </th>

                {/* PROCHAINS LANCEMENTS (Spans 5 columns) */}
                <th colSpan={NOMBRE_LANCEMENTS}>
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-4 text-center text-xs sm:text-sm font-extrabold text-[#1e40af] tracking-wider uppercase ">
                    PROCHAINS LANCEMENTS
                  </div>
                </th>

                {/* EXPÉDITION (Nouvelle colonne après Prochains Lancements) */}
                <th className="w-52 min-w-[170px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-extrabold text-emerald-800 tracking-wider uppercase  flex items-center justify-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Expédition</span>
                  </div>
                </th>
              </tr>
            </thead>

{/* Table Body with Categorized Rows */}
            <tbody>
              <DndContext
                sensors={sensors}
                collisionDetection={pointerWithin}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={onDragCancel}
              >
                {categoriesList.map((catKey) => {
                  const catConfig = CATEGORIES_CONFIG[catKey];
                  const catRows = filteredRows.filter((r) => r.categorieId === catKey);

                  if (catRows.length === 0) return null;

                  const catBanner = catBanners[catKey];

                  return catRows.map((row, index) => (
                    <LigneTableSuivi
                      key={row.id}
                      row={row}
                      isFirstRowOfCategory={index === 0}
                      rowSpan={catRows.length}
                      catConfig={catConfig}
                      catBanner={catBanner}
                      bannerRef={getBannerRef(catKey)}
                      cardsParId={cardsParId}
                      jalonInfosParCarte={jalonInfosParCarte}
                      cartesAlerteRetard={cartesAlerteRetard}
                      alertesManuelles={alertesManuelles}
                      onCarteClick={onCarteClick}
                      onOuvrirActionSlot={onOuvrirActionSlot}
                      onOuvrirPicker={onOuvrirPicker}
                      onAssignerSlot={handleAssignSlotCard}
                      onMajBloc={majBlocInspection}
                      onAjouterValeur={ajouterValeur}
                      onMajValeur={majValeur}
                      setAlerteOuverte={setAlerteOuverte}
                      setOfOuvert={setOfOuvert}
                      setMenuEtat={setMenuEtat}
                    />
                  ));
                })}

                {/* Carte soulevée : suit le curseur, puis « vole » vers sa case
                    au lâcher (drop animation gérée par @dnd-kit). */}
                <DragOverlay dropAnimation={dropAnimation}>
                  {carteSoulevee.card ? (
                    <CarteSoulevee card={carteSoulevee.card} jalons={carteSoulevee.jalons} />
                  ) : null}
                </DragOverlay>
              </DndContext>
            </tbody>
          </table>
        </div>

        {/* Footer Summary / Quick stats */}
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3 ">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Total chaînes : <strong>{rows.length}</strong>
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f8b4a6]" />
              Broderie Main (
              {rows.filter((r) => r.categorieId === 'BRODERIE_MAIN').length})
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7dd3fc]" />
              Confection (
              {rows.filter((r) => r.categorieId === 'CONFECTION').length})
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
              <Truck className="w-3.5 h-3.5 text-emerald-600" />
              Colonne Expédition activée
            </span>
          </div>

          <div className="flex items-center gap-2 text-slate-600">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>
              Cliquez sur une case pour lier une carte de commande, ou glissez-déposez
              une carte vers une autre case.
            </span>
          </div>
        </div>
      </div>

      {/* SlotActionModal : choix Nouvelle Carte / Carte Existante */}
      {selectedSlotAction && (
        <SlotActionModal
          isOpen={true}
          onClose={() => setSelectedSlotAction(null)}
          slotTitle={selectedSlotAction.slotTitle}
          slotType={selectedSlotAction.slotType}
          onChooseNewCard={handleSlotActionChooseNew}
          onChooseExistingCard={handleSlotActionChooseExisting}
        />
      )}

      {/* Card Picker Modal */}
      {activePicker && (
        <CardPickerModal
          isOpen={true}
          onClose={() => setActivePicker(null)}
          cards={cards}
          currentSlot={currentSlotForPicker}
          slotTitle={activePicker.slotTitle}
          isExpeditionSlot={activePicker.slotType === 'expedition'}
          onSelectCard={(slotCard) => {
            handleAssignSlotCard(
              activePicker.rowId,
              activePicker.slotType,
              slotCard,
              activePicker.lancementIndex,
              activePicker.slotIndex
            );
          }}
        />
      )}

      {/* Menu Pass/Fail d'un contrôle d'inspection */}
      {menuEtat && (
        <InspectionEtatMenu
          anchor={menuEtat.anchor}
          actuel={menuEtat.actuel}
          onChoisir={(etat) => {
            majValeur(menuEtat.rowId, menuEtat.blocIndex, menuEtat.valeurId, (v) => ({
              ...v,
              resultat: etat,
            }));
            setMenuEtat(null);
          }}
          onClose={() => setMenuEtat(null)}
        />
      )}

      {/* Détail des alertes d'une ligne : jalons en retard + alertes saisies à la main */}
      {/* Detail dun OF clique depuis la colonne Inspection */}
      {ofOuvert && (
        <OfPopover
          card={ofOuvert.card}
          numero={ofOuvert.numero}
          slotTitle={ofOuvert.slotTitle}
          anchor={ofOuvert.anchor}
          onClose={() => setOfOuvert(null)}
        />
      )}

      {alerteOuverte && (
        <AlertePopover
          card={alerteOuverte.card}
          slotTitle={alerteOuverte.slotTitle}
          anchor={alerteOuverte.anchor}
          onClose={() => setAlerteOuverte(null)}
        />
      )}
    </div>
  );
};
 
/** Aperçu de la carte soulevée, affiché dans le DragOverlay du Suivi Global :
 *  elle suit le curseur puis « vole » vers sa case d'arrivée à lâcher. */
function CarteSoulevee({ card, jalons }: { card: CardItem; jalons: JalonInfo[] }) {
  const progress =
    card.quantiteDemandee > 0
      ? Math.min(100, Math.round((card.quantiteFinie / card.quantiteDemandee) * 100))
      : null;
  const jalonsNomenclatures = jalons.filter((j) => j.categorie === 'NOMENCLATURE');
  const jalonsStatuts = jalons.filter((j) => j.categorie === 'STATUT');

  return (
    <div
      className="w-[300px] select-none rounded-xl border border-blue-300 bg-slate-50 px-2 py-1.5 shadow-[0_18px_36px_rgba(15,23,42,.28),0_4px_8px_rgba(15,23,42,.15)]"
      style={{ transform: 'rotate(-1deg) scale(1.03)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-[11px] sm:text-xs leading-snug text-slate-900 truncate">
          {card.modele}
        </span>
        {progress !== null && (
          <div className="flex items-center gap-1.5 ml-2 shrink-0">
            <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] font-bold font-mono text-slate-600 w-[28px] text-right">
              {progress}%
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 mt-1">
        {jalonsNomenclatures.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {jalonsNomenclatures.map((j, i) => (
              <PastilleJalon key={`${j.code}-${i}`} jalon={j} />
            ))}
          </div>
        )}
        {jalonsStatuts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {jalonsStatuts.map((j, i) => (
              <PastilleJalon key={`${j.code}-${i}`} jalon={j} />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            <div className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-medium w-fit">
              {card.statut === 'TERMINE'
                ? 'Terminé'
                : card.statut === 'EN_COURS'
                ? 'En cours'
                : card.statut === 'BLOQUE'
                ? 'Bloqué'
                : 'À démarrer'}
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 text-[10px] text-slate-500 font-mono truncate mt-0.5">
        {card.reference} • {card.client}
      </div>
    </div>
  );
}

export default SuiviGlobalView;

