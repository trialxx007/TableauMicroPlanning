import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { CardFormData, CardItem } from '../types/card.ts';
import {
  ChaineRow,
  ChaineSlotCard,
  CategorieConfig,
  InspectionBloc,
  InspectionValeur,
  InspectionEvenement,
  ExpeditionOF,
  AlerteChamp,
  TEINTE_ALERTE_DEFAUT,
  normaliserTeinteAlerte,
} from '../types/suiviGlobal.ts';
import { CATEGORIES_CONFIG, INITIAL_CHAINE_ROWS, nouvelleChaineVide } from '../data/mockSuiviGlobal.ts';
import { CardPickerModal } from './CardPickerModal.tsx';
import { ExpeditionModal } from './ExpeditionModal.tsx';
import { NouvelleChaineModal } from './NouvelleChaineModal.tsx';
import { InspectionEtatMenu } from './InspectionEtatMenu.tsx';
import { OfPopover } from './OfPopover.tsx';
import { AlertePopover } from './AlertePopover.tsx';
import { useAlertesManuelles } from '../utils/alertesManuelles.ts';
import { getJalonsCard, type JalonInfo } from '../utils/jalons.ts';
import { getNowParis, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { demarrerGlisser } from '../utils/glisserCarte.ts';
import {
  blocInspectionVide,
  dateDuJourISO,
  normaliserBloc,
} from '../utils/inspections.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { ViewSwitcher, AppPage } from './ViewSwitcher.tsx';
import { suiviGlobalApi, type SuiviGlobalLayoutRow } from '../services/api.ts';
import {
  LigneTableSuivi,
  NOMBRE_LANCEMENTS,
  type AlerteOuverteGlobal,
  type ApercuBanniere,
  type MenuEtatInspection,
  type OfOuvertGlobal,
  type TypeSlotGlobal,
} from './LigneTableSuivi.tsx';
import {
  Sparkles,
  Truck,
  TableProperties,
  Calendar,
  Clock,
  Plus,
} from 'lucide-react';


interface SuiviGlobalViewProps {
  onChangePage: (page: AppPage) => void;
  cards: CardItem[];
  /** Persiste des modifications partielles d'une carte (juron validé…). */
  onUpdateCard?: (id: string, updates: Partial<CardItem>) => Promise<void>;
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
  if (c.slotType === 'expedition') return ligne.expeditionCards[c.slotIndex ?? 0] ?? null;
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
      const pile = [...r.expeditionCards] as PileDeCartes;
      pile[c.slotIndex ?? 0] = carte;
      return { ...r, expeditionCards: pile };
    }
    const lancements = [...r.prochainsLancementsCards] as ChaineRow['prochainsLancementsCards'];
    const pile = [...(lancements[c.lancementIndex ?? 0] ?? [null, null])] as PileDeCartes;
    pile[c.slotIndex ?? 0] = carte;
    lancements[c.lancementIndex ?? 0] = pile;
    return { ...r, prochainsLancementsCards: lancements };
  });
}

/** Groupe de colonnes : le « planning » (modèle en cours + prochains
 *  lancements) et l'« expédition » sont indépendants. Une carte peut donc être
 *  à la fois en production (planning) et en expédition, mais reste unique à
 *  l'intérieur de chaque groupe. */
type GroupeSlot = 'planning' | 'expedition';

function groupeDe(slotType: TypeSlotGlobal): GroupeSlot {
  return slotType === 'expedition' ? 'expedition' : 'planning';
}

/** Suivi d'expédition initial d'une carte : un OF par OF, à expédier. La date
 *  d'envoi est choisie par l'utilisateur dans la fenêtre Expédition. */
function expeditionOfsDepuisCarte(carte: CardItem | undefined): ExpeditionOF[] {
  return (carte?.ofs ?? []).map((_, i) => ({
    ofIndex: i,
    statutExpedition: 'A_EXPEDIER' as const,
  }));
}

/** Retire cette carte des cases de ce groupe uniquement. */
function retirerCarteDuGroupe(lignes: SuiviRow[], cardId: string, groupe: GroupeSlot): SuiviRow[] {
  return lignes.map((r) => {
    if (groupe === 'expedition') {
      const pile = (r.expeditionCards as PileDeCartes).map((s) =>
        s?.cardId === cardId ? null : s
      ) as PileDeCartes;
      return { ...r, expeditionCards: pile };
    }
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
    };
  });
}

/** Localise l'unique case de ce groupe où est posée cette carte, si elle y est. */
function localiserCarteDansGroupe(
  lignes: SuiviRow[],
  cardId: string,
  groupe: GroupeSlot
): CoordCase | null {
  for (const r of lignes) {
    if (groupe === 'expedition') {
      for (const [i, s] of (r.expeditionCards as PileDeCartes).entries()) {
        if (s?.cardId === cardId) return { rowId: r.id, slotType: 'expedition', slotIndex: i };
      }
      continue;
    }
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
        // Migration : l'ancienne carte unique « expeditionCard » devient une pile.
        expeditionCards: reste.expeditionCards
          ? enPile(reste.expeditionCards)
          : enPile(reste.expeditionCard),
        alertes,
      } satisfies SuiviRow;
    });
  // Les chaînes créées / renommées / supprimées par l'utilisateur sont respectées
  // telles quelles : plus aucune migration codée en dur ne vient les écraser.
  return lignes.length > 0 ? lignes : INITIAL_CHAINE_ROWS;
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
  onChangePage,
  cards,
  onUpdateCard,
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

  // Synchronisation concurrente : le tableau est partagé entre postes, mais une
  // action locale (créer/renommer/supprimer une chaîne) ne doit JAMAIS être
  // annulée par une réponse serveur arrivée en retard.
  // - `sauvegardeEnAttenteRef` : des modifs locales ne sont pas encore écrites,
  //   le polling ne doit donc pas appliquer l'état (ancien) du serveur.
  // - `derniereEcritureRef` : horodatage de notre dernier envoi réussi ; toute
  //   requête GET démarrée AVANT est ignorée (sa réponse est forcément périmée).
  const sauvegardeEnAttenteRef = useRef(false);
  const derniereEcritureRef = useRef(0);
  // Vrai quand le dernier setRows provient du serveur : inutile de le renvoyer.
  const applicationServeurRef = useRef(false);

  const loadLayout = useCallback(async (isInitial = false) => {
    const debutRequete = Date.now();
    try {
      if (isInitial) console.log('[SuiviGlobal] Chargement layout via API...');
      const data = await suiviGlobalApi.getLayout();
      if (isInitial) console.log('[SuiviGlobal] Layout reçu:', data.length, 'lignes');
      // Réponse périmée (une écriture locale a eu lieu depuis) ou modifs locales
      // en attente : on ne touche pas à l'état local.
      if (sauvegardeEnAttenteRef.current || debutRequete < derniereEcritureRef.current) {
        return;
      }
      if (data.length > 0) {
        const normalized = normaliserLignes(data);
        setRows((prev) => {
          const prevStr = JSON.stringify(prev);
          const nextStr = JSON.stringify(normalized);
          if (prevStr !== nextStr) {
            applicationServeurRef.current = true;
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

  // Fenêtre d'expédition OF par OF : ligne dont la case Expédition est ouverte.
  const [expeditionOuverte, setExpeditionOuverte] = useState<{
    rowId: string;
    slotIndex: number;
  } | null>(null);

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
    // L'état vient du serveur : pas de renvoi inutile.
    if (applicationServeurRef.current) {
      applicationServeurRef.current = false;
      return;
    }
    // Modifs locales : on ouvre la fenêtre pendant laquelle le polling ne doit
    // pas écraser l'état local, puis on écrit (debounced) côté serveur.
    sauvegardeEnAttenteRef.current = true;
    const timeout = setTimeout(() => {
      suiviGlobalApi
        .setLayout(rows)
        .catch(console.warn)
        .finally(() => {
          derniereEcritureRef.current = Date.now();
          sauvegardeEnAttenteRef.current = false;
        });
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

  const handleAssignSlotCard = useCallback(
    (
      rowId: string,
      slotType: 'modeleEnCours' | 'lancement' | 'expedition',
      slotCard: ChaineSlotCard | null,
      lancementIndex?: number,
      slotIndex = 0
    ) => {
      // Affectation purement manuelle : OK Prod ne déplace jamais une carte ici.
      // Une carte reste unique par groupe (planning / expédition) : si elle est
      // déjà posée ailleurs dans le MÊME groupe, elle en est retirée avant
      // d'être placée. Elle peut en revanche figurer aussi dans l'autre groupe
      // (ex. produite en « Modèle en cours » et suivie en « Expédition »).
      const cardId = slotCard?.cardId;
      const groupe = groupeDe(slotType);

      setRows((prev) => {
        // Conserve l'expédition OF par OF si la carte était déjà en expédition.
        let aEcrire = slotCard;
        if (cardId && groupe === 'expedition') {
          const existant = localiserCarteDansGroupe(prev, cardId, 'expedition');
          const slotExistant = existant ? lireCarteEnCase(prev, existant) : null;
          if (slotExistant) {
            aEcrire = { ...slotExistant };
          } else if (aEcrire && !aEcrire.expeditionOfs) {
            // Première mise en expédition : pré-remplit les OF (état + date).
            aEcrire = {
              ...aEcrire,
              expeditionOfs: expeditionOfsDepuisCarte(cardsParId.get(cardId)),
            };
          }
        }
        const retrait = cardId ? retirerCarteDuGroupe(prev, cardId, groupe) : prev;
        return ecrireCarteEnCase(
          retrait,
          { rowId, slotType, lancementIndex, slotIndex },
          aEcrire
        );
      });
    },
    [cardsParId]
  );

  // Met à jour l'expédition OF par OF de la carte posée dans la case Expédition.
  const majExpeditionOfs = useCallback(
    (rowId: string, slotIndex: number, expeditionOfs: ExpeditionOF[]) => {
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          const slot = r.expeditionCards[slotIndex];
          if (!slot) return r;
          const pile = [...r.expeditionCards] as PileDeCartes;
          pile[slotIndex] = { ...slot, expeditionOfs };
          return { ...r, expeditionCards: pile };
        })
      );
    },
    []
  );

  // Envoie le modèle d'un bloc d'inspection vers la colonne Expédition, puis
  // ouvre le suivi OF par OF. Le modèle reste aussi dans « Modèle en cours ».
  const handleEnvoyerExpedition = useCallback(
    (rowId: string, blocIndex: number) => {
      const ligne = rows.find((r) => r.id === rowId);
      const slot = ligne?.modeleEnCoursCards[blocIndex];
      const cardId = slot?.cardId;
      if (!ligne || !cardId) return;
      const pile = ligne.expeditionCards as PileDeCartes;
      const existant = pile.findIndex((s) => s?.cardId === cardId);
      const cibleIndex =
        existant >= 0 ? existant : Math.max(0, pile.findIndex((s) => !s));
      if (existant < 0) {
        const carte = cardsParId.get(cardId);
        handleAssignSlotCard(
          rowId,
          'expedition',
          { cardId, customLabel: carte?.modele ?? slot?.customLabel },
          undefined,
          cibleIndex
        );
      }
      setExpeditionOuverte({ rowId, slotIndex: cibleIndex });
    },
    [rows, cardsParId, handleAssignSlotCard]
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

      setRows((prev) => {
        const groupe = groupeDe(cible.slotType);
        const source = localiserCarteDansGroupe(prev, carte.id, groupe);
        const memeCase =
          source &&
          source.rowId === cible.rowId &&
          source.slotType === cible.slotType &&
          (source.lancementIndex ?? 0) === (cible.lancementIndex ?? 0) &&
          (source.slotIndex ?? 0) === (cible.slotIndex ?? 0);
        if (memeCase) return prev;

        // Réutilise les données du slot source (préserve l'expédition OF par OF).
        const slotSource = source ? lireCarteEnCase(prev, source) : null;
        let carteDeposee: ChaineSlotCard =
          slotSource ?? { cardId: carte.id, customLabel: carte.modele };
        if (groupe === 'expedition' && !carteDeposee.expeditionOfs) {
          carteDeposee = {
            ...carteDeposee,
            expeditionOfs: expeditionOfsDepuisCarte(carte),
          };
        }
        const carteEnCible = lireCarteEnCase(prev, cible);
        let prochain = retirerCarteDuGroupe(prev, carte.id, groupe);
        prochain = ecrireCarteEnCase(prochain, cible, carteDeposee);
        if (carteEnCible && source) prochain = ecrireCarteEnCase(prochain, source, carteEnCible);
        return prochain;
      });
    },
    [cardsParId]
  );

  // --- Glisser-déposer d'une carte « tenue en main » ---------------------
  // Pointer Events : le contrôleur (utils/glisserCarte.ts) clone la carte, la
  // fait décoller et suivre le curseur (transform composé GPU, aucun re-render
  // React pendant le geste), puis appelle handleDropCarte sur la case visée.
  // `event.currentTarget` est lu de façon synchrone, ici dans le onPointerDown.
  const onGlisserCarte = useCallback(
    (card: CardItem, event: React.PointerEvent<HTMLElement>) => {
      const source = event.currentTarget as HTMLElement;
      demarrerGlisser({
        cardId: card.id,
        source,
        clientX: event.clientX,
        clientY: event.clientY,
        scrollContainer: tableScrollRef.current,
        onDeposer: (cardId, coords) =>
          handleDropCarte(
            coords.rowId,
            coords.slotType as TypeSlotGlobal,
            cardId,
            coords.lancementIndex,
            coords.slotIndex
          ),
      });
    },
    [handleDropCarte]
  );

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

  /** Journalise une modification d'état dans l'historique du bloc d'inspection. */
  const consignerEvenement = (
    rowId: string,
    blocIndex: number,
    evt: InspectionEvenement
  ) => {
    majBlocInspection(rowId, blocIndex, (bloc) => ({
      ...bloc,
      historique: [...(bloc.historique ?? []), evt],
    }));
  };

  // --- Renommage d'une chaîne --------------------------------------------
  const renommerChaine = (rowId: string, nouveauNom: string) => {
    setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, nom: nouveauNom } : r)));
  };

  // --- Création d'une chaîne ---------------------------------------------
  const [nouvelleChaineOuverte, setNouvelleChaineOuverte] = useState(false);
  const creerChaine = useCallback(
    (categorieId: 'BRODERIE_MAIN' | 'CONFECTION', nom: string) => {
      const ligne = nouvelleChaineVide(categorieId, nom);
      setRows((prev) => [...prev, ligne]);
    },
    []
  );

  // --- Suppression d'une chaîne ------------------------------------------
  const supprimerChaine = useCallback(
    (rowId: string) => {
      const ligne = rows.find((r) => r.id === rowId);
      if (!ligne) return;
      if (!window.confirm(`Confirmez-vous la suppression de la chaîne "${ligne.nom}" ?`)) return;
      setRows((prev) => prev.filter((r) => r.id !== rowId));
    },
    [rows]
  );

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
      type: 'I' | 'OF' | 'CC',
      pct?: 50 | 100,
      ofIndex?: number
    ) =>
      majBlocInspection(rowId, blocIndex, (bloc) => ({
        ...bloc,
        valeurs: [
          ...bloc.valeurs,
          {
            id: `val-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type,
            ...(type === 'I'
              ? { pct: pct ?? 50, ofIndex }
              : type === 'CC'
              ? { ofIndex }
              : {}),
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

  /** Ouvre le sélecteur de carte (recherche) pour une case vide ou à réassigner. */
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

  /** Depuis le sélecteur : crée une carte qui occupera la case en attente. */
  const handlePickerCreateNew = useCallback(() => {
    if (!activePicker || !onOpenCreateCard) return;
    const { rowId, slotType, lancementIndex, slotIndex } = activePicker;
    const isModeleEnCours = slotType === 'modeleEnCours';
    const prefill: Partial<CardFormData> = {
      ...(isModeleEnCours ? { okProd: true, statut: 'EN_COURS' } : { okProd: false, statut: 'EN_ATTENTE' }),
    };
    setActivePicker(null);
    onOpenCreateCard(prefill, (createdCard) => {
      handleAssignSlotCard(
        rowId,
        slotType,
        { cardId: createdCard.id, customLabel: createdCard.modele },
        lancementIndex,
        slotIndex
      );
    });
  }, [activePicker, onOpenCreateCard, handleAssignSlotCard]);

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
      return row.expeditionCards[slotIndex] ?? null;
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
            <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <TableProperties className="w-5 h-5" />
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
              onChangePage={onChangePage}
            />
          </div>

          {/* Droite : création d'une nouvelle chaîne */}
          <div className="flex items-center justify-end">
            <button
              onClick={() => setNouvelleChaineOuverte(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nouvelle Chaîne</span>
            </button>
          </div>
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
                <th className="w-[360px] min-w-[340px]">
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
                      onOuvrirActionSlot={onOuvrirPicker}
                      onOuvrirPicker={onOuvrirPicker}
                      onOuvrirExpedition={(rowId, slotIndex) =>
                        setExpeditionOuverte({ rowId, slotIndex })
                      }
                      onEnvoyerExpedition={handleEnvoyerExpedition}
                      onAssignerSlot={handleAssignSlotCard}
                      onGlisserCarte={onGlisserCarte}
                      onMajBloc={majBlocInspection}
                      onAjouterValeur={ajouterValeur}
                      onMajValeur={majValeur}
                      onRenommerChaine={renommerChaine}
                      onSupprimerChaine={supprimerChaine}
                      setAlerteOuverte={setAlerteOuverte}
                      setOfOuvert={setOfOuvert}
                      setMenuEtat={setMenuEtat}
                    />
                  ));
                })}
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

      {/* Nouvelle Chaîne : type + nom */}
      <NouvelleChaineModal
        isOpen={nouvelleChaineOuverte}
        onClose={() => setNouvelleChaineOuverte(false)}
        onCreate={creerChaine}
        nomsExistants={rows.map((r) => r.nom)}
      />

      {/* Card Picker Modal */}
      {activePicker && (
        <CardPickerModal
          isOpen={true}
          onClose={() => setActivePicker(null)}
          cards={cards}
          currentSlot={currentSlotForPicker}
          slotTitle={activePicker.slotTitle}
          onSelectCard={(slotCard) => {
            handleAssignSlotCard(
              activePicker.rowId,
              activePicker.slotType,
              slotCard,
              activePicker.lancementIndex,
              activePicker.slotIndex
            );
          }}
          onCreateNewCard={onOpenCreateCard ? handlePickerCreateNew : undefined}
        />
      )}

      {/* Fenêtre d'expédition OF par OF d'une case Expédition */}
      {(() => {
        if (!expeditionOuverte) return null;
        const ligne = rows.find((r) => r.id === expeditionOuverte.rowId);
        const slot = ligne?.expeditionCards[expeditionOuverte.slotIndex];
        const carte = slot?.cardId ? cardsParId.get(slot.cardId) : undefined;
        if (!slot || !carte) return null;
        return (
          <ExpeditionModal
            isOpen={true}
            onClose={() => setExpeditionOuverte(null)}
            card={carte}
            slotCard={slot}
            onChange={(ofs) =>
              majExpeditionOfs(expeditionOuverte.rowId, expeditionOuverte.slotIndex, ofs)
            }
          />
        );
      })()}

      {/* Menu Pass/Fail d'un contrôle d'inspection */}
      {menuEtat && (
        <InspectionEtatMenu
          anchor={menuEtat.anchor}
          actuel={menuEtat.actuel}
          onChoisir={(etat) => {
            const ligne = rows.find((r) => r.id === menuEtat.rowId);
            const bloc = ligne?.inspections[menuEtat.blocIndex];
            const valeur = bloc?.valeurs.find((v) => v.id === menuEtat.valeurId);
            majValeur(menuEtat.rowId, menuEtat.blocIndex, menuEtat.valeurId, (v) => ({
              ...v,
              resultat: etat,
              dateResultat: etat ? dateDuJourISO() : undefined,
            }));
            // Journalisation : on garde trace de chaque modification d'état,
            // même si le contrôle change ensuite de Pass à Fail (ou est remis
            // à « non défini »). Rien à consigner si l'état est inchangé.
            if (bloc && valeur && valeur.resultat !== etat) {
              const ofIndex = valeur.ofIndex ?? 0;
              const estCC = valeur.type === 'CC';
              const rang = estCC
                ? 0
                : bloc.valeurs
                    .filter((v) => v.type === 'I' && (v.ofIndex ?? 0) === ofIndex)
                    .findIndex((v) => v.id === valeur.id) + 1;
              consignerEvenement(menuEtat.rowId, menuEtat.blocIndex, {
                id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                date: dateDuJourISO(),
                ofIndex,
                rang,
                pct: valeur.pct ?? 50,
                estCC,
                resultat: etat,
              });
            }
            // Échec sur le dernier contrôle de l'OF : on enchaîne automatiquement
            // le contrôle suivant (I 50 %) de ce même OF, date du jour.
            if (etat === 'F') {
              const defaillant = bloc?.valeurs.find(
                (v) => v.id === menuEtat.valeurId
              );
              if (bloc && defaillant?.type === 'I') {
                const groupe = bloc.valeurs.filter(
                  (v) =>
                    v.type === 'I' &&
                    (v.ofIndex ?? 0) === (defaillant.ofIndex ?? 0)
                );
                const dernier = groupe[groupe.length - 1];
                if (dernier?.id === menuEtat.valeurId) {
                  ajouterValeur(
                    menuEtat.rowId,
                    menuEtat.blocIndex,
                    'I',
                    50,
                    defaillant.ofIndex ?? 0
                  );
                }
              }
            }
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
          card={cardsParId.get(alerteOuverte.card.id) ?? alerteOuverte.card}
          slotTitle={alerteOuverte.slotTitle}
          anchor={alerteOuverte.anchor}
          onUpdateCard={onUpdateCard}
          onClose={() => setAlerteOuverte(null)}
        />
      )}
    </div>
  );
};

export default SuiviGlobalView;

