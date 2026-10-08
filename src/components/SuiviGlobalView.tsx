import React, { useState, useEffect, useRef } from 'react';
import { CardFormData, CardItem } from '../types/card.ts';
import {
  ChaineRow,
  ChaineSlotCard,
  CategorieConfig,
  InspectionBloc,
  InspectionValeur,
} from '../types/suiviGlobal.ts';
import { CATEGORIES_CONFIG, INITIAL_CHAINE_ROWS } from '../data/mockSuiviGlobal.ts';
import { CardPickerModal } from './CardPickerModal.tsx';
import { SlotActionModal } from './SlotActionModal.tsx';
import { InspectionCell } from './InspectionCell.tsx';
import { InspectionEtatMenu } from './InspectionEtatMenu.tsx';
import { AlertePopover } from './AlertePopover.tsx';
import { alertesCarte, useAlertesManuelles } from '../utils/alertesManuelles.ts';
import { getJalonsEnRetard, getJalonsCard, detailJalon, type JalonInfo } from '../utils/jalons.ts';
import { getNowParis } from '../utils/dateFrance.ts';
import {
  blocEnTexte,
  blocInspectionVide,
  dateDuJourISO,
  normaliserBloc,
} from '../utils/inspections.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { ViewSwitcher } from './ViewSwitcher.tsx';
import {
  Plus,
  RotateCcw,
  Download,
  Edit3,
  Check,
  Search,
  Sparkles,
  Info,
  Truck,
  ExternalLink,
  X,
  AlertTriangle,
  ArrowLeftRight,
  Zap,
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

/** Menu Pass/Fail ouvert sur un contrôle d'inspection. */
interface MenuEtatInspection {
  rowId: string;
  blocIndex: number;
  valeurId: string;
  anchor: HTMLElement;
  actuel: 'P' | 'F' | null;
}

/** Pour SlotActionModal : case en attente de choix (nouvelle carte ou existante). */
interface ActiveSlotAction {
  rowId: string;
  slotType: 'modeleEnCours' | 'lancement' | 'expedition';
  lancementIndex?: number;
  slotIndex?: number;
  slotTitle: string;
}

/** Une case du tableau : au plus 2 cartes empilées. */
type PileDeCartes = [ChaineSlotCard | null, ChaineSlotCard | null];

/** Ligne telle que vue ici : le modèle de base, plus les deux colonnes Alerte
 *  (un champ par carte de la pile) qui n'existent que dans ce tableau et dans
 *  le localStorage. */
type SuiviRow = ChaineRow & {
  remarque?: string;
  remarque2?: string;
  /** Teinte du badge d'alerte 1 (rouge par défaut). */
  remarqueTeinte?: TeinteAlerte;
  remarque2Teinte?: TeinteAlerte;
};

/** Teintes disponibles pour une alerte saisie dans la colonne Alertes. */
type TeinteAlerte = 'rouge' | 'orange' | 'ambre' | 'bleu' | 'violet' | 'vert';

const TEINTES_ALERTE: Record<
  TeinteAlerte,
  { nom: string; fond: string; bordure: string; pastille: string }
> = {
  rouge: { nom: 'Rouge', fond: 'bg-rose-600', bordure: 'border-rose-700', pastille: 'bg-rose-600' },
  orange: { nom: 'Orange', fond: 'bg-orange-500', bordure: 'border-orange-600', pastille: 'bg-orange-500' },
  ambre: { nom: 'Ambre', fond: 'bg-amber-500', bordure: 'border-amber-600', pastille: 'bg-amber-500' },
  bleu: { nom: 'Bleu', fond: 'bg-blue-600', bordure: 'border-blue-700', pastille: 'bg-blue-600' },
  violet: { nom: 'Violet', fond: 'bg-violet-600', bordure: 'border-violet-700', pastille: 'bg-violet-600' },
  vert: { nom: 'Vert', fond: 'bg-emerald-600', bordure: 'border-emerald-700', pastille: 'bg-emerald-600' },
};

const TEINTE_ALERTE_DEFAUT: TeinteAlerte = 'rouge';

function normaliserTeinteAlerte(valeur: unknown): TeinteAlerte {
  return typeof valeur === 'string' && valeur in TEINTES_ALERTE
    ? (valeur as TeinteAlerte)
    : TEINTE_ALERTE_DEFAUT;
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
      return {
        ...reste,
        id: typeof reste.id === 'string' ? reste.id : `chaine-${Math.random().toString(36).slice(2, 8)}`,
        categorieId:
          reste.categorieId === 'BRODERIE_MAIN' || reste.categorieId === 'CONFECTION'
            ? reste.categorieId
            : 'CONFECTION',
        nom: typeof reste.nom === 'string' ? reste.nom : '',
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
        remarque: typeof r.remarque === 'string' ? r.remarque : '',
        remarque2: typeof r.remarque2 === 'string' ? r.remarque2 : '',
        remarqueTeinte: normaliserTeinteAlerte(r.remarqueTeinte),
        remarque2Teinte: normaliserTeinteAlerte(r.remarque2Teinte),
      } satisfies SuiviRow;
    });
  return lignes.length > 0 ? lignes : INITIAL_CHAINE_ROWS;
}

/** Nombre de colonnes « Prochains Lancements ». Source unique pour l'affichage
 *  et l'affectation, pour qu'ajouter une colonne ne demande pas deux edits. */
const NOMBRE_LANCEMENTS = 5;

const BANNER_LINE_RATIO = 1.06;
const BANNER_WORD_GAP = 0.45;
const BANNER_FILL_W = 0.72;
const BANNER_FILL_H = 0.88;
const BANNER_GLYPH_W_RATIO = 0.66;

function computeCardProgress(card?: CardItem): number | null {
  return card && card.quantiteDemandee > 0
    ? Math.min(100, Math.round((card.quantiteFinie / card.quantiteDemandee) * 100))
    : null;
}

/**
 * Un champ d'alerte de la colonne Alertes. Saisie libre à l'état vide ; dès que
 * le texte est là, il s'affiche en badge coloré en gras avec le triangle
 * d'alerte. La teinte se choisit dans une petite palette (rouge par défaut).
 */
function ChampAlerte({
  valeur,
  teinte,
  placeholder,
  onChanger,
  onTeinte,
  libelle,
}: {
  valeur: string;
  teinte: TeinteAlerte;
  placeholder: string;
  onChanger: (v: string) => void;
  onTeinte: (t: TeinteAlerte) => void;
  libelle: string;
}) {
  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const t = TEINTES_ALERTE[teinte] ?? TEINTES_ALERTE[TEINTE_ALERTE_DEFAUT];
  const rempli = Boolean(valeur.trim());

  return (
    <div className="relative flex-1 min-w-0">
      <div
        className={`flex items-center gap-1 px-1.5 py-1.5 rounded-lg border transition-colors ${
          rempli
            ? `${t.fond} ${t.bordure} shadow-xs`
            : 'bg-slate-50 border-slate-300 focus-within:border-blue-400 focus-within:bg-white'
        }`}
      >
        <AlertTriangle
          className={`w-3.5 h-3.5 shrink-0 ${rempli ? 'text-white' : 'text-slate-300'}`}
          aria-hidden
        />
        <input
          type="text"
          value={valeur}
          placeholder={placeholder}
          onChange={(e) => onChanger(e.target.value)}
          aria-label={libelle}
          className={`w-full min-w-0 bg-transparent text-[11px] outline-hidden placeholder:text-slate-400 ${
            rempli
              ? 'text-white font-bold placeholder:text-white/70'
              : 'text-slate-700 font-medium'
          }`}
        />
        <button
          type="button"
          onClick={() => setPaletteOuverte((o) => !o)}
          title="Changer la couleur de l'alerte"
          aria-haspopup="menu"
          aria-expanded={paletteOuverte}
          className={`shrink-0 w-4 h-4 rounded-full border-2 transition-transform hover:scale-110 ${
            rempli ? 'border-white/80' : 'border-slate-300'
          } ${t.pastille}`}
        />
      </div>

      {paletteOuverte && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setPaletteOuverte(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-40 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5 shadow-lg"
          >
            {(Object.keys(TEINTES_ALERTE) as TeinteAlerte[]).map((id) => {
              const option = TEINTES_ALERTE[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  title={option.nom}
                  onClick={() => {
                    onTeinte(id);
                    setPaletteOuverte(false);
                  }}
                  className={`w-5 h-5 rounded-full ${option.pastille} transition-transform hover:scale-110 ${
                    teinte === id ? 'ring-2 ring-slate-400 ring-offset-1' : ''
                  }`}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Une pastille de jalon. Vert (nomenclature) ou bleu (statut) à l'état normal ;
 * en cas de retard elle vire au rouge avec un triangle d'alerte, comme une
 * petite punaise posée sur la carte — uniquement pour les retards, les autres
 * états gardent leur couleur d'origine.
 */
function PastilleJalon({ jalon }: { jalon: JalonInfo }) {
  const teinte =
    jalon.categorie === 'NOMENCLATURE'
      ? {
          fond: 'bg-emerald-50',
          bordure: 'border-emerald-200',
          texte: 'text-emerald-800',
          marque: 'text-emerald-600',
        }
      : {
          fond: 'bg-blue-50',
          bordure: 'border-blue-200',
          texte: 'text-blue-800',
          marque: 'text-blue-600',
        };

  const classes = jalon.enRetard
    ? `inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-600 border border-rose-700 text-white text-[10px] font-semibold shadow-xs w-fit motion-safe:animate-pulse`
    : `inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${teinte.fond} ${teinte.bordure} ${teinte.texte} text-[10px] font-semibold shadow-xs w-fit`;

  return (
    <div className={classes} title={detailJalon(jalon)}>
      {jalon.enRetard && <AlertTriangle className="w-3 h-3 shrink-0" aria-hidden />}
      <span className="font-bold">{jalon.code}</span>
      {jalon.etat === 'SEMAINE' && jalon.semaine != null ? (
        <span className="font-mono">S{jalon.semaine}</span>
      ) : jalon.etat === 'VALIDE' ? (
        <span className={jalon.enRetard ? 'text-white' : teinte.marque}>✓</span>
      ) : (
        <span className={jalon.enRetard ? 'text-white/80' : `${teinte.marque}/70`}>—</span>
      )}
    </div>
  );
}

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
}) => {
  const catalogue = useJalonCatalogue();
  const [rows, setRows] = useState<SuiviRow[]>(() => {
      try {
        const saved = localStorage.getItem('suivi_global_rows_v2');
        if (saved) {
          // Le normalisateur accepte les anciens formats (carte unique,
          // lancements à plat) comme le format actuel en piles de 2.
          return normaliserLignes(JSON.parse(saved));
        }
      } catch {
        // Fallback
      }
      return INITIAL_CHAINE_ROWS;
  });

  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [activePicker, setActivePicker] = useState<ActiveSlotPicker | null>(null);

  // Alertes saisies à la main dans le popover : source partagée (localStorage),
  // écrites par le popover, lues ici pour allumer la bande de la ligne.
  const alertesManuelles = useAlertesManuelles();

  // Popover d'alerte ouvert : la carte concernée, son titre de case, l'ancre DOM.
  const [alerteOuverte, setAlerteOuverte] = useState<{
    card: CardItem;
    slotTitle?: string;
    anchor: HTMLElement;
  } | null>(null);

  // Taille réelle de chaque bandeau vertical, pour dimensionner le texte
  // proportionnellement à la hauteur cumulée des modèles en cours de la catégorie.
  const [bannerSizes, setBannerSizes] = useState<Record<string, { w: number; h: number }>>({});
  const bannerNodesRef = useRef<Record<string, HTMLTableCellElement | null>>({});
  const bannerObserverRef = useRef<ResizeObserver | null>(null);
  const bannerRefCacheRef = useRef<Record<string, (el: HTMLTableCellElement | null) => void>>({});

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
    try {
      localStorage.setItem('suivi_global_rows_v2', JSON.stringify(rows));
    } catch {
      // ignore
    }
  }, [rows]);

  // État pour SlotActionModal (choix nouvelle carte / carte existante)
  const [selectedSlotAction, setSelectedSlotAction] = useState<ActiveSlotAction | null>(null);

  // Synchronise automatiquement les cartes selon la règle stricte OK Prod :
  // - Cartes "OK Prod validé" → strictement dans "Modèle en cours"
  // - Cartes "En attente OK Prod" → strictement dans "Prochains Lancements"
  const reconcileRowsWithOkProdRule = (
    currentRows: SuiviRow[],
    allCards: CardItem[]
  ): { newRows: SuiviRow[]; changed: boolean } => {
    let changed = false;
    const newRows = currentRows.map((row) => {
      let currentModelePile = [...row.modeleEnCoursCards] as [ChaineSlotCard | null, ChaineSlotCard | null];
      let nextLancements = [...row.prochainsLancementsCards] as SuiviRow['prochainsLancementsCards'];

      // A) Si une carte en "Modèle en cours" n'a PAS OK Prod -> la migrer vers Prochains Lancements
      currentModelePile = currentModelePile.map((slot, pileIdx) => {
        if (slot?.cardId) {
          const card = allCards.find((c) => c.id === slot.cardId);
          if (card && !card.okProd) {
            // Trouver une place libre dans Prochains Lancements
            for (let i = 0; i < NOMBRE_LANCEMENTS; i++) {
              const pile = nextLancements[i] ?? [null, null];
              for (let j = 0; j < 2; j++) {
                if (!pile[j]) {
                  pile[j] = slot;
                  nextLancements[i] = pile as [ChaineSlotCard | null, ChaineSlotCard | null];
                  changed = true;
                  return null;
                }
              }
            }
          }
        }
        return slot;
      }) as [ChaineSlotCard | null, ChaineSlotCard | null];

      // B) Si une carte en "Prochains Lancements" a l'OK Prod validé -> la glisser vers Modèle en cours
      nextLancements = nextLancements.map((pile, i) => {
        if (!pile) return [null, null];
        const newPile = [...pile] as [ChaineSlotCard | null, ChaineSlotCard | null];
        newPile.forEach((slot, j) => {
          if (slot?.cardId) {
            const card = allCards.find((c) => c.id === slot.cardId);
            if (card && card.okProd) {
              // Trouver une place libre dans Modèle en cours
              const emptyIdx = currentModelePile.findIndex((s) => !s);
              if (emptyIdx !== -1) {
                currentModelePile[emptyIdx] = slot;
                newPile[j] = null;
                changed = true;
              }
            }
          }
        });
        return newPile;
      }) as SuiviRow['prochainsLancementsCards'];

      return {
        ...row,
        modeleEnCoursCards: currentModelePile,
        prochainsLancementsCards: nextLancements,
      };
    });

    // 2) Placer les cartes avec OK Prod validé non encore dans le tableau dans "Modèle en cours"
    const validatedCards = allCards.filter((c) => c.okProd);
    validatedCards.forEach((c) => {
      const alreadyInModeleEnCours = newRows.some((r) =>
        r.modeleEnCoursCards.some((s) => s?.cardId === c.id)
      );

      if (!alreadyInModeleEnCours) {
        const targetRow = c.chaineId
          ? newRows.find((r) => r.id === c.chaineId)
          : c.chaineNom
          ? newRows.find(
              (r) => r.nom.toLowerCase().trim() === c.chaineNom!.toLowerCase().trim()
            )
          : undefined;

        if (targetRow) {
          const emptyIdx = targetRow.modeleEnCoursCards.findIndex((s) => !s);
          if (emptyIdx !== -1) {
            targetRow.modeleEnCoursCards[emptyIdx] = {
              cardId: c.id,
              customLabel: c.modele,
            };
            changed = true;
            return;
          }
        }

        // Sinon trouver la première chaîne qui a son Modèle en cours libre
        for (const r of newRows) {
          const emptyIdx = r.modeleEnCoursCards.findIndex((s) => !s);
          if (emptyIdx !== -1) {
            r.modeleEnCoursCards[emptyIdx] = {
              cardId: c.id,
              customLabel: c.modele,
            };
            changed = true;
            break;
          }
        }
      }
    });

    // 3) Placer les cartes en attente d'OK Prod non encore dans le tableau dans "PROCHAINS LANCEMENTS"
    const nonValidatedCards = allCards.filter((c) => !c.okProd);
    nonValidatedCards.forEach((c) => {
      const alreadyInLancements = newRows.some((r) =>
        r.prochainsLancementsCards.some((pile) => pile?.some((s) => s?.cardId === c.id))
      );

      if (!alreadyInLancements) {
        const targetRow = c.chaineId
          ? newRows.find((r) => r.id === c.chaineId)
          : c.chaineNom
          ? newRows.find(
              (r) => r.nom.toLowerCase().trim() === c.chaineNom!.toLowerCase().trim()
            )
          : undefined;

        if (targetRow) {
          for (let i = 0; i < NOMBRE_LANCEMENTS; i++) {
            const pile = targetRow.prochainsLancementsCards[i] ?? [null, null];
            const emptyIdx = pile.findIndex((s) => !s);
            if (emptyIdx !== -1) {
              pile[emptyIdx] = {
                cardId: c.id,
                customLabel: c.modele,
              };
              targetRow.prochainsLancementsCards[i] = pile as [ChaineSlotCard | null, ChaineSlotCard | null];
              changed = true;
              return;
            }
          }
        }

        for (const r of newRows) {
          for (let i = 0; i < NOMBRE_LANCEMENTS; i++) {
            const pile = r.prochainsLancementsCards[i] ?? [null, null];
            const emptyIdx = pile.findIndex((s) => !s);
            if (emptyIdx !== -1) {
              pile[emptyIdx] = {
                cardId: c.id,
                customLabel: c.modele,
              };
              r.prochainsLancementsCards[i] = pile as [ChaineSlotCard | null, ChaineSlotCard | null];
              changed = true;
              return;
            }
          }
        }
      }
    });

    return { newRows, changed };
  };

  // Re-synchronisation automatique lorsque les cartes du Point Commande Journalière changent
  useEffect(() => {
    if (cards && cards.length > 0) {
      setRows((prev) => {
        const { newRows, changed } = reconcileRowsWithOkProdRule(prev, cards);
        return changed ? newRows : prev;
      });
    }
  }, [cards]);

  // Find CardItem from Point Commande Journalière by cardId
  const getCardById = (cardId?: string): CardItem | undefined => {
    if (!cardId) return undefined;
    return cards.find((c) => c.id === cardId);
  };

  const handleCellChange = (
    rowId: string,
    field: 'nom' | 'remarque' | 'remarque2' | 'remarqueTeinte' | 'remarque2Teinte',
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const handleAssignSlotCard = (
    rowId: string,
    slotType: 'modeleEnCours' | 'lancement' | 'expedition',
    slotCard: ChaineSlotCard | null,
    lancementIndex?: number,
    slotIndex = 0
  ) => {
    // RÈGLE MÉTIER STRICTE :
    // 1) Si affectation en "Modèle en cours" mais que la carte n'a pas OK Prod -> refusée & migrée en Prochains Lancements
    if (slotType === 'modeleEnCours' && slotCard?.cardId) {
      const card = getCardById(slotCard.cardId);
      if (card && !card.okProd) {
        alert(
          `Action refusée : Seules les cartes avec accord "OK Prod validé" sont acceptées dans la colonne "Modèle en cours".\n\nLa carte "${card.modele}" (${card.reference}) est en attente d'OK Prod et a été automatiquement migrée dans "PROCHAINS LANCEMENTS".`
        );
        // Auto-migrer vers Prochains Lancements
        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== rowId) return r;
            const nextLancements = [...r.prochainsLancementsCards] as SuiviRow['prochainsLancementsCards'];
            for (let i = 0; i < NOMBRE_LANCEMENTS; i++) {
              const pile = nextLancements[i] ?? [null, null];
              const emptyIdx = pile.findIndex((s) => !s);
              if (emptyIdx !== -1) {
                pile[emptyIdx] = slotCard;
                nextLancements[i] = pile as [ChaineSlotCard | null, ChaineSlotCard | null];
                return { ...r, prochainsLancementsCards: nextLancements };
              }
            }
            return r;
          })
        );
        return;
      }
    }
    // 2) Si affectation en "Prochains Lancements" mais que la carte a OK Prod -> la glisser vers Modèle en cours
    if (slotType === 'lancement' && slotCard?.cardId) {
      const card = getCardById(slotCard.cardId);
      if (card && card.okProd) {
        alert(
          `Cette carte a l'OK Prod validé : elle a été automatiquement placée dans "Modèle en cours" (règle stricte).`
        );
        setRows((prev) =>
          prev.map((r) => {
            if (r.id !== rowId) return r;
            const emptyIdx = r.modeleEnCoursCards.findIndex((s) => !s);
            if (emptyIdx !== -1) {
              const newModele = [...r.modeleEnCoursCards] as PileDeCartes;
              newModele[emptyIdx] = slotCard;
              // Retirer de Prochains Lancements
              const nextLancements = [...r.prochainsLancementsCards] as SuiviRow['prochainsLancementsCards'];
              const pile = nextLancements[lancementIndex ?? 0] ?? [null, null];
              pile[slotIndex] = null;
              nextLancements[lancementIndex ?? 0] = pile as [ChaineSlotCard | null, ChaineSlotCard | null];
              return { ...r, modeleEnCoursCards: newModele, prochainsLancementsCards: nextLancements };
            }
            return r;
          })
        );
        return;
      }
    }

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (slotType === 'modeleEnCours') {
          const pile = [...r.modeleEnCoursCards] as PileDeCartes;
          pile[slotIndex] = slotCard;
          return { ...r, modeleEnCoursCards: pile };
        }
        if (slotType === 'expedition') {
          return { ...r, expeditionCard: slotCard || null };
        }
        if (slotType === 'lancement' && typeof lancementIndex === 'number') {
          const nextLancements = [...r.prochainsLancementsCards] as ChaineRow['prochainsLancementsCards'];
          const pile = [...(nextLancements[lancementIndex] ?? [null, null])] as PileDeCartes;
          pile[slotIndex] = slotCard;
          nextLancements[lancementIndex] = pile;
          return { ...r, prochainsLancementsCards: nextLancements };
        }
        return r;
      })
    );
  };

  // Synchronisation manuelle OK Prod (bouton dans l'en-tête)
  const handleSyncOkProd = () => {
    const { newRows, changed } = reconcileRowsWithOkProdRule(rows, cards);
    setRows(newRows);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
    alert(
      changed
        ? 'Migration stricte OK Prod effectuée :\n• Les cartes "OK Prod Validé" ont été migrées en colonne "Modèle en cours".\n• Les cartes "En attente OK Prod" ont été migrées en colonne "PROCHAINS LANCEMENTS".'
        : 'Le tableau est déjà parfaitement aligné :\n• Toutes les cartes validées sont en "Modèle en cours".\n• Toutes les cartes en attente sont en "PROCHAINS LANCEMENTS".'
    );
  };

  // Ouvre SlotActionModal au lieu de CardPickerModal direct
  const handleOpenSlotAction = (
    rowId: string,
    slotType: 'modeleEnCours' | 'lancement' | 'expedition',
    lancementIndex?: number,
    slotIndex = 0
  ) => {
    const row = rows.find((r) => r.id === rowId);
    if (!row) return;
    let titreSlot = '';
    if (slotType === 'modeleEnCours') {
      titreSlot = `Modèle en cours${slotIndex === 1 ? ' — 2ᵉ carte' : ''} (${row.nom})`;
    } else if (slotType === 'expedition') {
      titreSlot = `Expédition (${row.nom})`;
    } else {
      titreSlot = `Prochain Lancement #${(lancementIndex || 0) + 1}${slotIndex === 1 ? ' — 2ᵉ carte' : ''} (${row.nom})`;
    }
    setSelectedSlotAction({ rowId, slotType, lancementIndex, slotIndex, slotTitle: titreSlot });
  };

  const handleSlotActionChooseNew = () => {
    if (!selectedSlotAction || !onOpenCreateCard) return;
    const { rowId, slotType, lancementIndex, slotIndex } = selectedSlotAction;
    const isModeleEnCours = slotType === 'modeleEnCours';
    const prefill: Partial<CardFormData> = {
      ...(isModeleEnCours ? { okProd: true, statut: 'EN_COURS' } : { okProd: false, statut: 'A_DEMARRER' }),
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

  const majValeur = (
    rowId: string,
    blocIndex: number,
    valeurId: string,
    maj: (valeur: InspectionValeur) => InspectionValeur
  ) =>
    majBlocInspection(rowId, blocIndex, (bloc) => ({
      ...bloc,
      valeurs: bloc.valeurs.map((v) => (v.id === valeurId ? maj(v) : v)),
    }));

  const ajouterValeur = (
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
    }));

  const [menuEtat, setMenuEtat] = useState<MenuEtatInspection | null>(null);

  const handleResetToDefault = () => {
    if (
      window.confirm(
        'Voulez-vous réinitialiser le tableau du suivi global avec les cartes d’origine ?'
      )
    ) {
      setRows(INITIAL_CHAINE_ROWS);
      localStorage.removeItem('suivi_global_rows_v2');
    }
  };

  const handleAddChaine = (categorieId: 'BRODERIE_MAIN' | 'CONFECTION') => {
    const nomPrompt = window.prompt(
      `Nom de la nouvelle chaîne pour ${
        categorieId === 'BRODERIE_MAIN' ? 'Broderie Main' : 'Confection'
      } :`,
      categorieId === 'BRODERIE_MAIN' ? 'Lys' : 'Ligne 4'
    );
    if (!nomPrompt || !nomPrompt.trim()) return;

    const newRow: SuiviRow = {
      id: `${categorieId.toLowerCase()}-${Date.now()}`,
      categorieId,
      nom: nomPrompt.trim(),
      dotColor: CATEGORIES_CONFIG[categorieId]?.defaultDotColor || '#94a3b8',
      modeleEnCoursCards: [null, null],
      inspections: [blocInspectionVide(), blocInspectionVide()],
      prochainsLancementsCards: lancementsVides(),
      expeditionCard: null,
      remarque: '',
      remarque2: '',
      remarqueTeinte: TEINTE_ALERTE_DEFAUT,
      remarque2Teinte: TEINTE_ALERTE_DEFAUT,
    };

    setRows((prev) => [...prev, newRow]);
  };

  /** Texte d'une case : modèle lié, sinon libellé saisi, sinon vide. */
  const texteSlot = (slot?: ChaineSlotCard | null) =>
    slot ? getCardById(slot.cardId)?.modele || slot.customLabel || '' : '';

  /** Libellé court d'un modèle en cours, pour l'en-tête du bloc d'inspection. */
  const libelleModele = (row: SuiviRow, blocIndex: number) => {
    const slot = row.modeleEnCoursCards[blocIndex];
    return texteSlot(slot) || `Modèle ${blocIndex + 1}`;
  };

  /** Blocs d'inspection à afficher : un par modèle en cours occupé
   *  (le premier seul tant que la deuxième case est vide). */
  const blocsInspectionAffiches = (row: SuiviRow) => {
    const indices = row.modeleEnCoursCards
      .map((slot, i) => (slot ? i : -1))
      .filter((i) => i >= 0);
    return (indices.length > 0 ? indices : [0]).map((blocIndex) => ({
      blocIndex,
      bloc: row.inspections[blocIndex] ?? blocInspectionVide(),
      libelle: libelleModele(row, blocIndex),
    }));
  };

  const handleExportCSV = () => {
    const headers = [
      'Type',
      'Chaîne',
      'Modèle en cours',
      'Inspection',
      'Alerte 1',
      'Alerte 2',
      ...Array.from(
        { length: NOMBRE_LANCEMENTS },
        (_, i) => `Prochain Lancement ${i + 1}`
      ),
      'Expédition',
    ];

    const echapper = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csvRows = [headers.map(echapper).join(';')];
    rows.forEach((r) => {
      const catTitle = CATEGORIES_CONFIG[r.categorieId]?.titre || r.categorieId;
      const modeleEnCoursText = r.modeleEnCoursCards.map(texteSlot).filter(Boolean).join(' / ');

      const lancementsTexts = Array.from(
        { length: NOMBRE_LANCEMENTS },
        (_, i) => (r.prochainsLancementsCards?.[i] ?? []).map(texteSlot).filter(Boolean).join(' / ')
      );

      const inspectionText = r.inspections.map(blocEnTexte).filter(Boolean).join(' | ');

      const expeditionText = texteSlot(r.expeditionCard);

      const values = [
        catTitle,
        r.nom,
        modeleEnCoursText,
        inspectionText,
        r.remarque ?? '',
        r.remarque2 ?? '',
        ...lancementsTexts,
        expeditionText,
      ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`);
      csvRows.push(values.join(';'));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    // Date du jour au format JJ/MM/AAAA, alignée sur le reste de l'application.
    link.download = `Suivi_Global_Chaines_Cartes_${getNowParis().dateStr.replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const categoriesList = ['BRODERIE_MAIN', 'CONFECTION'];

  const filteredRows = rows.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const libellesModeles = [
      ...r.modeleEnCoursCards.map((slot) => getCardById(slot?.cardId)?.modele),
      ...r.modeleEnCoursCards.map((slot) => slot?.customLabel),
    ];
    return (
      r.nom.toLowerCase().includes(q) ||
      libellesModeles.some((l) => l && l.toLowerCase().includes(q)) ||
      (r.remarque ?? '').toLowerCase().includes(q) ||
      (r.remarque2 ?? '').toLowerCase().includes(q) ||
      r.inspections.some((b) => b.commentaire.toLowerCase().includes(q))
    );
  });

  // Cartes liées à une ligne, dans l'ordre d'affichage, sans doublon : une même
  // carte peut occuper plusieurs colonnes de la ligne.
  const cartesLigne = (row: ChaineRow): CardItem[] => {
    const slots = [
      ...row.modeleEnCoursCards,
      ...row.prochainsLancementsCards.flat(),
      row.expeditionCard,
    ];
    const cartes = new Map<string, CardItem>();
    for (const slot of slots) {
      if (!slot?.cardId) continue;
      const card = getCardById(slot.cardId);
      if (card) cartes.set(card.id, card);
    }
    return [...cartes.values()];
  };

  // Une carte mérite sa bande d'alerte si un jalon est en retard ou si une
  // alerte y a été saisie à la main.
  const carteEnAlerte = (card: CardItem): boolean =>
    getJalonsEnRetard(card, catalogue).length > 0 ||
    alertesCarte(alertesManuelles, card.id).length > 0;

  // Helper to render card chip inside table cell
  const renderCardSlotContent = (
    slotCard: ChaineSlotCard | null | undefined,
    row: ChaineRow,
    slotType: 'modeleEnCours' | 'lancement' | 'expedition',
    lancementIndex?: number,
    slotIndex?: number
  ) => {
    const rangSuffixe = slotIndex === 1 ? ' — 2ᵉ carte' : '';
    const titreSlot =
      slotType === 'modeleEnCours'
        ? `Modèle en cours${rangSuffixe} (${row.nom})`
        : slotType === 'expedition'
        ? `Expédition (${row.nom})`
        : `Prochain Lancement #${(lancementIndex || 0) + 1}${rangSuffixe} (${row.nom})`;
    const linkedCard = slotCard?.cardId ? getCardById(slotCard.cardId) : undefined;
          const label = linkedCard ? linkedCard.modele : slotCard?.customLabel;
          const subLabel = linkedCard ? `${linkedCard.reference} • ${linkedCard.client}` : null;
          const jalonsCarte = linkedCard ? getJalonsCard(linkedCard, catalogue) : [];
          const jalonsNomenclatures = jalonsCarte.filter((j) => j.categorie === 'NOMENCLATURE');
          const jalonsStatuts = jalonsCarte.filter((j) => j.categorie === 'STATUT');

    // La case jauge deux cases empilées : si l'autre slot est déjà rempli, le
    // slot vide reste compact (min-h) et la carte occupe tout le reste.
    const pileCourante =
      slotType === 'modeleEnCours'
        ? row.modeleEnCoursCards
        : slotType === 'lancement' && lancementIndex != null
        ? (row.prochainsLancementsCards?.[lancementIndex] ?? [])
        : [];
    const autreSlotRempli =
      slotIndex != null ? Boolean(pileCourante[1 - slotIndex]) : false;

if (!label) {
      return (
        <button
          onClick={() =>
            handleOpenSlotAction(
              row.id,
              slotType,
              lancementIndex,
              slotIndex
            )
          }
          className={`w-full min-h-[50px] flex items-center justify-center text-[11px] font-medium text-slate-300 hover:text-blue-600 hover:bg-blue-50/50 rounded-xl transition-all border border-dashed border-slate-200 hover:border-blue-300 cursor-pointer p-1 ${
            autreSlotRempli ? 'flex-none' : 'flex-1'
          }`}
          title="Cliquez pour assigner une carte du Point Commande Journalière"
        >
          <span className="flex items-center gap-1">
            <Plus className="w-3 h-3" />
            <span>
              {slotType === 'expedition'
                ? '+ Expédition'
                : slotIndex === 1
                ? '+ Carte 2'
                : slotType === 'lancement'
                ? `# ${(lancementIndex || 0) + 1}`
                : '+ Carte'}
            </span>
          </span>
        </button>
      );
    }

    const handleSlotClick = () => {
      if (linkedCard && onOpenCardModal) {
        onOpenCardModal(linkedCard);
      } else {
        handleOpenSlotAction(row.id, slotType, lancementIndex, slotIndex);
      }
    };

    const isMergedModele =
      slotType === 'modeleEnCours' || slotType === 'lancement';
    const progress = computeCardProgress(linkedCard);
    const enAlerte = linkedCard ? carteEnAlerte(linkedCard) : false;

    return (
      <div className="flex flex-col gap-1 flex-1 min-h-0 w-full">
        {/* Conteneur unifié : la ring relie la bande Alerte + la carte */}
        <div
          className={`relative w-full flex flex-col flex-1 min-h-0 ${
            enAlerte ? 'ring-2 ring-rose-300/60 shadow-[0_0_0_1px_rgba(251,113,133,0.5)] rounded-xl' : 'rounded-xl'
          }`}
        >
          {/* Bande d'alerte de la carte : rien que le mot, le détail est au clic. */}
          {enAlerte && linkedCard && (
            <button
              type="button"
              onClick={(event) =>
                setAlerteOuverte({
                  card: linkedCard,
                  slotTitle: titreSlot,
                  anchor: event.currentTarget,
                })
              }
              className="shrink-0 w-full flex items-center justify-center gap-1 px-2 py-1 rounded-t-xl bg-red-600 text-white shadow-2xs motion-safe:animate-pulse text-[10px] font-extrabold uppercase tracking-wider cursor-pointer hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80 transition-colors relative z-20"
              title="Voir le détail de l'alerte"
              aria-haspopup="dialog"
            >
              <AlertTriangle className="w-3 h-3 shrink-0" />
              Alerte
            </button>
          )}
          <div
            className={`group relative w-full min-h-[52px] flex flex-col justify-start px-2 py-1.5 bg-slate-50/90 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 transition-all text-left flex-1 ${
              enAlerte ? 'rounded-b-xl border-t-0' : 'rounded-b-xl'
            }`}
          >
        <div
          onClick={handleSlotClick}
          className="cursor-pointer flex-1 min-h-0 w-full flex flex-col justify-start items-start"
          title={
            linkedCard
              ? `Afficher la fiche identitaire : ${linkedCard.modele} (${linkedCard.reference})`
              : 'Cliquer pour modifier ou assigner une carte'
          }
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`font-bold text-[11px] sm:text-xs leading-snug line-clamp-1 ${
                isMergedModele ? 'text-slate-900' : 'text-slate-900'
              } truncate`}
            >
              {label}
            </span>
            {isMergedModele && progress !== null && (
              <div className="flex items-center gap-1.5 ml-2 shrink-0">
                <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-[10px] font-bold font-mono text-slate-600 w-[28px] text-right">
                  {progress}%
                </span>
              </div>
            )}
          </div>

          {isMergedModele ? (
            <div className="relative z-10 flex flex-col gap-2 mt-1">
              {/* Nomenclatures (vert) - ligne du haut */}
              {jalonsNomenclatures.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  {jalonsNomenclatures.map((j, i) => (
                    <PastilleJalon key={`${j.code}-${i}`} jalon={j} />
                  ))}
                </div>
              ) : null}
              {/* Statuts (bleu) - ligne du bas */}
              {jalonsStatuts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1">
                  {jalonsStatuts.map((j, i) => (
                    <PastilleJalon key={`${j.code}-${i}`} jalon={j} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1">
                  <div className="inline-flex items-center justify-center px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-medium w-fit">
                    {linkedCard?.statut === 'TERMINE' ? 'Terminé' : linkedCard?.statut === 'EN_COURS' ? 'En cours' : linkedCard?.statut === 'BLOQUE' ? 'Bloqué' : 'À démarrer'}
                  </div>
                </div>
              )}
            </div>
          ) : (
            subLabel ? (
              <div className="relative z-10 text-[10px] text-slate-500 font-mono truncate mt-0.5">
                {subLabel}
              </div>
            ) : null
          )}

          <span />

          {/* Expedition Specific Tags */}
          {slotType === 'expedition' && slotCard?.dateExpedition && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.2 rounded mt-0.5 w-fit">
              <Truck className="w-2.5 h-2.5" />
              <span>{slotCard.dateExpedition}</span>
            </div>
          )}
        </div>

        {/* Hover Quick Action Buttons */}
        <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-1 bg-white/95 backdrop-blur-xs p-0.5 rounded-md shadow-xs border border-slate-200 z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActivePicker({
                rowId: row.id,
                slotType,
                lancementIndex,
                slotIndex,
                slotTitle: titreSlot,
              });
            }}
            title="Changer / Réassigner une autre carte"
            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
          >
            <ArrowLeftRight className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAssignSlotCard(row.id, slotType, null, lancementIndex, slotIndex);
            }}
            title="Retirer la carte de cette case"
            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        </div>
      </div>
    </div>
    );
  };

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
        {/* Même grille que l'en-tête Point Commande : titre à gauche,
            sélecteur de vue centré, actions à droite. */}
        <div className="max-w-[1850px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          {/* Left: Page title */}
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                  Suivi Global des Chaînes & Prochains Lancements
                </h1>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  Vue Atelier Connectée aux Cartes
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Les cases de « Modèle en cours », « Prochains Lancements » et « Expédition » reçoivent directement les cartes de commande.
              </p>
            </div>
          </div>

          {/* Center: View switcher — même emplacement que dans l'en-tête Point Commande */}
          <div className="flex md:justify-center">
            <ViewSwitcher
              currentPage="suivi-global"
              onChangePage={(page) => page === 'point-journalier' && onBackToPointJournalier()}
            />
          </div>

          {/* Right: Controls & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrer chaîne, modèle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg w-44 sm:w-56 focus:outline-hidden focus:ring-1 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            {/* Quick edit mode toggle for Chaîne / Alertes */}
            <button
              onClick={() => {
                setIsEditMode(!isEditMode);
                if (isEditMode) {
                  setSavedFeedback(true);
                  setTimeout(() => setSavedFeedback(false), 2000);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                isEditMode
                  ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
              }`}
              title="Modifier directement le nom de la chaîne et sa colonne Alertes"
            >
              {isEditMode ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Enregistrer</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Édition Chaîne & Alertes</span>
                </>
              )}
            </button>

            {savedFeedback && (
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                Enregistré
              </span>
            )}

            {/* Export CSV */}
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Exporter le tableau en format CSV / Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Exporter</span>
            </button>

            {/* Sync OK Prod */}
            <button
              onClick={handleSyncOkProd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
              title="Synchroniser les cartes selon la règle OK Prod (validé → Modèle en cours, en attente → Prochains Lancements)"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Sync OK Prod</span>
            </button>

            {/* Reset */}
            <button
              onClick={handleResetToDefault}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Réinitialiser avec les valeurs par défaut"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Board Container */}
      <div className="max-w-[1850px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Help / Guidance pill */}
        <div className="mb-4 bg-white border border-slate-200/80 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 shadow-2xs">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              <strong>Attribution des cartes :</strong> Cliquez sur n'importe quelle case de <em>Modèle en cours</em>, <em>Prochains Lancements (1 à 5)</em> ou <em>Expédition</em> pour choisir la carte de commande correspondante. Chaque case accueille <strong>2 cartes empilées</strong>. La colonne <em>Inspection</em> suit les contrôles OF / I du jour et la colonne <em>Alertes</em> reste propre à chaque chaîne.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddChaine('BRODERIE_MAIN')}
              className="text-xs font-semibold text-[#881337] bg-[#fbe7e2] hover:bg-[#f6c2b7] px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              + Chaîne Broderie
            </button>
            <button
              onClick={() => handleAddChaine('CONFECTION')}
              className="text-xs font-semibold text-[#0369a1] bg-[#e0f2fe] hover:bg-[#bae6fd] px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              + Chaîne Confection
            </button>
          </div>
        </div>

        {/* The Exact Table matching the PNG + Expedition column */}
        <div className="bg-[#eef2f6]/90 p-3 sm:p-4 rounded-2xl border border-slate-200/90 shadow-xs overflow-x-auto">
          <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 min-w-[2900px]">
            {/* Header Row */}
            <thead>
              <tr>
                {/* Type */}
                <th className="w-14 min-w-[56px] max-w-[56px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Type
                  </div>
                </th>

                {/* Chaîne */}
                <th className="w-36 min-w-[130px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Chaîne
                  </div>
                </th>

                {/* Modèle en cours (Carte) */}
                <th className="w-[330px] min-w-[290px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Modèle en cours
                  </div>
                </th>

                {/* Inspection (OF / I du jour, un bloc par modèle en cours) */}
                <th className="w-[260px] min-w-[230px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Inspection
                  </div>
                </th>

                {/* Alertes */}
                <th className="w-60 min-w-[190px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Alertes
                  </div>
                </th>

                {/* PROCHAINS LANCEMENTS (Spans 5 columns) */}
                <th colSpan={NOMBRE_LANCEMENTS}>
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-4 text-center text-xs sm:text-sm font-extrabold text-[#1e40af] tracking-wider uppercase shadow-2xs">
                    PROCHAINS LANCEMENTS
                  </div>
                </th>

                {/* EXPÉDITION (Nouvelle colonne après Prochains Lancements) */}
                <th className="w-52 min-w-[170px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-extrabold text-emerald-800 tracking-wider uppercase shadow-2xs flex items-center justify-center gap-1.5">
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

                return catRows.map((row, index) => {
                  const isFirstRowOfCategory = index === 0;
                  // La ligne est soulignée de rouge dès qu'une de ses cartes alerte ;
                  // le détail, lui, vit sur la bande de chaque carte.
                  const isRowAlert = cartesLigne(row).some((card) => carteEnAlerte(card));
                  const bannerSize = bannerSizes[catKey];
                  const catBanner = buildBanner(catConfig, bannerSize?.w ?? 0, bannerSize?.h ?? 0);

                  return (
                    <tr key={row.id}>
                      {/* Column 1: Type (Vertical category banner spanning all rows of this category) */}
                      {isFirstRowOfCategory && (
                        <td
                          ref={getBannerRef(catKey)}
                          data-banner-cat={catKey}
                          rowSpan={catRows.length}
                          className={`relative align-middle border-2 rounded-xl sm:rounded-2xl shadow-2xs overflow-hidden ${catConfig.bgClass} ${catConfig.borderClass}`}
                        >
                          <svg
                            viewBox={`0 0 ${catBanner.vbW} ${catBanner.vbH}`}
                            preserveAspectRatio="xMidYMid meet"
                            className="absolute inset-0 w-full h-full select-none"
                          >
                            {catBanner.glyphs.map((glyph, glyphIdx) => (
                              <text
                                key={glyphIdx}
                                x={glyph.x}
                                y={glyph.y}
                                textAnchor="middle"
                                fontSize={glyph.size}
                                fontWeight={800}
                                fill={catConfig.textColor}
                              >
                                {glyph.char}
                              </text>
                            ))}
                          </svg>
                        </td>
                      )}

                      {/* Column 2: Chaîne (Name) */}
                        <td className="h-[136px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-3 shadow-2xs align-middle">
                          <div className="h-full min-h-[72px] flex items-center justify-center">
                            {isEditMode ? (
                              <input
                                type="text"
                                value={row.nom}
                                onChange={(e) => handleCellChange(row.id, 'nom', e.target.value)}
                                className="w-full text-center font-bold text-xs sm:text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded px-1.5 py-1 focus:bg-white focus:outline-hidden"
                              />
                            ) : (
                              <span className="w-full text-center font-bold text-xs sm:text-sm text-slate-800 truncate">
                                {row.nom}
                              </span>
                            )}
                          </div>
                        </td>

                      {/* Column 3: Modèle en cours (Carte du Point Commande Journalière) */}
                        <td
                          className="h-[136px] group bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 shadow-2xs align-middle"
                        >
                          <div className="h-full min-h-[84px] flex flex-col gap-1">

                            {row.modeleEnCoursCards.map((slot, pileIdx) => (
                              <React.Fragment key={pileIdx}>
                                {renderCardSlotContent(
                                  slot,
                                  row,
                                  'modeleEnCours',
                                  undefined,
                                  pileIdx
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </td>


                      {/* Column 4: Inspection (un bloc par modèle en cours) */}
                        <td className="h-[136px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 shadow-2xs align-middle">
                          <div className="h-full min-h-[84px] flex flex-col gap-1.5">
                            {blocsInspectionAffiches(row).map(
                              ({ blocIndex, bloc, libelle }) => (
                                <div
                                  key={blocIndex}
                                  className="flex-1 min-w-0 flex flex-col border border-slate-200/80 bg-slate-50/40 rounded-lg px-1.5 py-1.5"
                                >
                                  <span className="mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 truncate">
                                    {libelle}
                                  </span>
                                  <InspectionCell
                                    bloc={bloc}
                                    onAjouterValeur={(type, pct) =>
                                      ajouterValeur(row.id, blocIndex, type, pct)
                                    }
                                    onSupprimerValeur={(valeurId) =>
                                      majBlocInspection(row.id, blocIndex, (b) => ({
                                        ...b,
                                        valeurs: b.valeurs.filter((v) => v.id !== valeurId),
                                      }))
                                    }
                                    onMajDate={(valeurId, date) =>
                                      majValeur(row.id, blocIndex, valeurId, (v) => ({
                                        ...v,
                                        date,
                                      }))
                                    }
                                    onBadgeClick={(valeurId, anchor) =>
                                      setMenuEtat({
                                        rowId: row.id,
                                        blocIndex,
                                        valeurId,
                                        anchor,
                                        actuel:
                                          bloc.valeurs.find((v) => v.id === valeurId)
                                            ?.resultat ?? null,
                                      })
                                    }
                                    onCommentaire={(texte) =>
                                      majBlocInspection(row.id, blocIndex, (b) => ({
                                        ...b,
                                        commentaire: texte,
                                      }))
                                    }
                                  />
                                </div>
                              )
                            )}
                          </div>
                        </td>

                      {/* Column 5: Alertes (deux champs, un par carte de la pile) */}
                        <td className="h-[136px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-2 shadow-2xs align-middle">
                          <div className="h-full flex flex-col justify-center gap-2">
                            <ChampAlerte
                              valeur={row.remarque ?? ''}
                              teinte={row.remarqueTeinte ?? TEINTE_ALERTE_DEFAUT}
                              placeholder="Alerte, consigne..."
                              libelle={`Alerte 1 de la chaîne ${row.nom}`}
                              onChanger={(v) => handleCellChange(row.id, 'remarque', v)}
                              onTeinte={(t) => handleCellChange(row.id, 'remarqueTeinte', t)}
                            />
                            <ChampAlerte
                              valeur={row.remarque2 ?? ''}
                              teinte={row.remarque2Teinte ?? TEINTE_ALERTE_DEFAUT}
                              placeholder="Alerte, consigne..."
                              libelle={`Alerte 2 de la chaîne ${row.nom}`}
                              onChanger={(v) => handleCellChange(row.id, 'remarque2', v)}
                              onTeinte={(t) => handleCellChange(row.id, 'remarque2Teinte', t)}
                            />
                          </div>
                        </td>

                      {/* Columns 7 to 11: 5 Slots under PROCHAINS LANCEMENTS (Cartes) */}
                      {Array.from({ length: NOMBRE_LANCEMENTS }, (_, slotIdx) => {
                        const pile = row.prochainsLancementsCards[slotIdx] ?? [null, null];
                        return (
                          <td
                            key={slotIdx}
                            className="h-[136px] w-[330px] min-w-[290px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs align-middle"
                          >
                            <div className="h-full min-h-[88px] flex flex-col justify-start items-stretch">
                              <div className="flex flex-col gap-1 w-full h-full">
                                {pile.map((slotCard, pileIdx) => (
                                  <React.Fragment key={pileIdx}>
                                    {renderCardSlotContent(
                                      slotCard,
                                      row,
                                      'lancement',
                                      slotIdx,
                                      pileIdx
                                    )}
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          </td>
                        );
                      })}

                      {/* Column 12: EXPÉDITION (Nouvelle colonne après Prochains Lancements) */}
                        <td className="h-[136px] min-w-[145px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs align-middle">
                        <div className="h-full min-h-[88px] flex flex-col justify-center items-center">
                          {renderCardSlotContent(
                            row.expeditionCard,
                            row,
                            'expedition'
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Summary / Quick stats */}
        <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3 shadow-2xs">
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
              Cliquez sur une case pour lier instantanément une carte de commande.
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
