import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CardFormData, CardItem } from '../types/card.ts';
import {
  ChaineRow,
  ChaineSlotCard,
  CategorieConfig,
  InspectionBloc,
  InspectionValeur,
  AlerteChamp,
  TeinteAlerte,
  TEINTES_ALERTE,
  TEINTE_ALERTE_DEFAUT,
  normaliserTeinteAlerte,
} from '../types/suiviGlobal.ts';
import { CATEGORIES_CONFIG, INITIAL_CHAINE_ROWS } from '../data/mockSuiviGlobal.ts';
import { CardPickerModal } from './CardPickerModal.tsx';
import { SlotActionModal } from './SlotActionModal.tsx';
import { InspectionCell } from './InspectionCell.tsx';
import { InspectionEtatMenu } from './InspectionEtatMenu.tsx';
import { OfPopover } from './OfPopover.tsx';
import { AlertePopover } from './AlertePopover.tsx';
import {
  alertesCarte,
  useAlertesManuelles,
  ecrireAlertesManuelles,
  ALERTES_COULEUR_DEFAUT,
  ALERTES_COULEURS,
  type AlerteCouleur,
  type AlerteManuelle,
} from '../utils/alertesManuelles.ts';
import { getJalonsEnRetard, getJalonsCard, detailJalon, marqueJalon, themeJalon, type JalonInfo } from '../utils/jalons.ts';
import { getNowParis, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import {
  blocInspectionVide,
  dateDuJourISO,
  normaliserBloc,
} from '../utils/inspections.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { ViewSwitcher } from './ViewSwitcher.tsx';
import {
  Plus,
  Sparkles,
  Truck,
  ExternalLink,
  X,
  AlertTriangle,
  ArrowLeftRight,
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

/** Alias historiques : la ligne du suivi global et la pile de deux cartes. */
type SuiviRow = ChaineRow;
type PileDeCartes = ChaineRow['modeleEnCoursCards'];

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
 * Une pastille de jalon, lisible sur le tableau global. La marque courte (✓, S40,
 * 12/06, TBC, —) tient dans une colonne fixe à droite, comme dans le Point
 * Commande Journalière : le code s'étale dans la colonne de gauche sans jamais
 * déborder de la cellule. La teinte vient de la grandeur (vert nomenclature,
 * bleu statut) ; seule la nuance change avec l'avancement, et le rouge reste
 * réservé au retard, avec son triangle d'alerte.
 */
function PastilleJalon({ jalon }: { jalon: JalonInfo }) {
  const colors = themeJalon(jalon).pastille;
  const detail = detailJalon(jalon);

  return (
    <span className="group/j relative inline-grid shrink-0 w-fit min-w-[3.75rem]" title={detail}>
      {jalon.enRetard && (
        <AlertTriangle className="absolute -top-1 -right-1 z-20 w-3 h-3 text-rose-500 bg-white rounded-full" aria-hidden />
      )}
      <span
        className={`col-start-1 row-start-1 relative z-0 inline-grid grid-cols-[minmax(1.7rem,auto)_1.9rem] items-stretch overflow-hidden rounded text-[10px] font-bold border ${colors} ${
          jalon.enRetard ? 'motion-safe:animate-pulse' : ''
        }`}
      >
        <span className="flex items-center justify-center py-0 tracking-wide whitespace-nowrap">
          {jalon.code}
        </span>
        <span className="flex items-center justify-center py-0 border-l border-black/10">
          {marqueJalon(jalon)}
        </span>
      </span>
    </span>
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
  onOpenCreateCard,
}) => {
  const catalogue = useJalonCatalogue();
  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();

  useEffect(() => {
    const timer = setInterval(() => setParisTime(getNowParis().timeStr), 15000);
    return () => clearInterval(timer);
  }, []);

  // Clé de sauvegarde du tableau : la version monte quand les données de
  // démonstration persistées doivent être abandonnées (v2 → v3 au passage en
  // données réelles). Les états saisis après cette version sont conservés.
  const CLE_SAUVEGARDE = 'suivi_global_rows_v3';
  const [rows, setRows] = useState<SuiviRow[]>(() => {
      try {
        // L'ancien cache de démonstration (v2) est définitivement obsolète.
        localStorage.removeItem('suivi_global_rows_v2');
        const saved = localStorage.getItem(CLE_SAUVEGARDE);
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
      localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify(rows));
    } catch {
      // ignore
    }
  }, [rows]);

  // État pour SlotActionModal (choix nouvelle carte / carte existante)
  const [selectedSlotAction, setSelectedSlotAction] = useState<ActiveSlotAction | null>(null);

  // Find CardItem from Point Commande Journalière by cardId
  const getCardById = (cardId?: string): CardItem | undefined => {
    if (!cardId) return undefined;
    return cards.find((c) => c.id === cardId);
  };

  // Ajoute un champ d'alerte vide à la fin
  const handleAddAlerte = (rowId: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId
          ? { ...r, alertes: [...(r.alertes ?? []), { texte: '', teinte: TEINTE_ALERTE_DEFAUT }] }
          : r
      )
    );
  };

  // Supprime un champ d'alerte (si plus d'un)
  const handleRemoveAlerte = (rowId: string, index: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId && (r.alertes?.length ?? 0) > 1
          ? { ...r, alertes: (r.alertes ?? []).filter((_, i) => i !== index) }
          : r
      )
    );
  };

  const handleAssignSlotCard = (
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
      let next = prev.map((r) => {
        if (!cardId) return r;
        // Retirer la carte de tous les emplacements où elle apparaît déjà.
        const modelePile = (r.modeleEnCoursCards as [ChaineSlotCard | null, ChaineSlotCard | null]).map((s) =>
          s?.cardId === cardId ? null : s
        );
        const lancementsPiles = (r.prochainsLancementsCards as ChaineRow['prochainsLancementsCards']).map((pile) =>
          (pile ?? [null, null]).map((s) => (s?.cardId === cardId ? null : s)) as [ChaineSlotCard | null, ChaineSlotCard | null]
        ) as ChaineRow['prochainsLancementsCards'];
        return {
          ...r,
          modeleEnCoursCards: modelePile as [ChaineSlotCard | null, ChaineSlotCard | null],
          prochainsLancementsCards: lancementsPiles,
          expeditionCard: r.expeditionCard?.cardId === cardId ? null : r.expeditionCard,
        };
      });

      // Placer la carte dans la case demandée.
      next = next.map((r) => {
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
      });

      return next;
    });
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
  const [ofOuvert, setOfOuvert] = useState<{
    card: CardItem;
    numero: number;
    slotTitle: string;
    anchor: HTMLElement;
  } | null>(null);

  /** Texte d'une case : modèle lié, sinon libellé saisi, sinon vide. */
  const texteSlot = (slot?: ChaineSlotCard | null) =>
    slot ? getCardById(slot.cardId)?.modele || slot.customLabel || '' : '';

  /** Libellé court d'un modèle en cours, pour l'en-tête du bloc d'inspection. */
  const libelleModele = (row: SuiviRow, blocIndex: number) => {
    const slot = row.modeleEnCoursCards[blocIndex];
    return texteSlot(slot) || `Modèle ${blocIndex + 1}`;
  };

  /** Blocs d'inspection à afficher : un par modèle en cours occupé.
   *  Sans modèle en cours, aucun bloc n'est affiché (pas d'OF sans modèle). */
  const blocsInspectionAffiches = (row: SuiviRow) => {
    const indices = row.modeleEnCoursCards
      .map((slot, i) => (slot ? i : -1))
      .filter((i) => i >= 0);
    return indices.map((blocIndex) => ({
      blocIndex,
      bloc: row.inspections[blocIndex] ?? blocInspectionVide(),
      libelle: libelleModele(row, blocIndex),
    }));
  };

  const categoriesList = ['BRODERIE_MAIN', 'CONFECTION'];

  const filteredRows = rows;

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
                ? 'Expédition'
                : slotIndex === 1
                ? 'Carte 2'
                : slotType === 'lancement'
                ? `# ${(lancementIndex || 0) + 1}`
                : 'Carte'}
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
            className={`group relative w-full min-h-[52px] flex flex-col justify-start px-2 py-1.5 overflow-hidden bg-slate-50/90 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 transition-all text-left flex-1 ${
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
                        <td className="h-[170px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-3 shadow-2xs align-middle">
                          <div className="h-full min-h-[72px] flex items-center justify-center">
                            <span className="w-full text-center font-bold text-xs sm:text-sm text-slate-800 truncate">
                              {row.nom}
                            </span>
                          </div>
                        </td>

                      {/* Column 3: Modèle en cours (Carte du Point Commande Journalière) */}
                        <td
                          className="h-[170px] group bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 shadow-2xs align-middle"
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
                        <td className="h-[170px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 shadow-2xs align-middle">
                          <div className="h-full min-h-[84px] flex flex-col gap-1">
                            {blocsInspectionAffiches(row).map(
                              ({ blocIndex, bloc, libelle }) => (
                                <div
                                  key={blocIndex}
                                  className="flex-1 min-w-0 flex flex-col border border-slate-200/70 bg-slate-50/30 rounded-lg px-1 py-1"
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
                                    onOfClick={(numero, anchor) => {
                                      const slot = row.modeleEnCoursCards[blocIndex];
                                      const card = slot?.cardId ? getCardById(slot.cardId) : undefined;
                                      if (card) {
                                        setOfOuvert({
                                          card,
                                          numero,
                                          slotTitle: libelleModele(row, blocIndex),
                                          anchor,
                                        });
                                      }
                                    }}
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

                      {/* Column 5: Alertes par carte */}
                        <td className="h-[170px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-2 shadow-2xs align-middle">
                          <div className="h-full flex flex-col justify-start gap-1.5 overflow-y-auto">
                            {/* Alertes : blocs separees comme la colonne Inspection */}
                            <div className="h-full min-h-[84px] flex flex-col gap-1">
                              {row.modeleEnCoursCards.map((slotCard, pileIdx) =>
                                slotCard ? (
                                  <div
                                    key={`mec-${pileIdx}`}
                                    className="min-w-0 flex-1 flex flex-col"
                                  >
                                    <AlertesCarte
                                      slotCard={slotCard}
                                      rowId={row.id}
                                      slotType="modeleEnCours"
                                      slotIndex={pileIdx}
                                      titre={`Carte ${pileIdx + 1}`}
                                      label={texteSlot(slotCard)}
                                    />
                                  </div>
                                ) : null
                              )}
                            </div>
                          </div>
                        </td>

                      {/* Columns 7 to 11: 5 Slots under PROCHAINS LANCEMENTS (Cartes) */}
                      {Array.from({ length: NOMBRE_LANCEMENTS }, (_, slotIdx) => {
                        const pile = row.prochainsLancementsCards[slotIdx] ?? [null, null];
                        return (
                          <td
                            key={slotIdx}
                            className="h-[170px] w-[330px] min-w-[290px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs align-middle"
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
                        <td className="h-[170px] min-w-[145px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs align-middle">
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

export default SuiviGlobalView;

function AlertesCarte({
  slotCard,
  rowId,
  slotType,
  lancementIndex,
  slotIndex,
  titre,
  label,
}: {
  slotCard: ChaineSlotCard;
  rowId: string;
  slotType: 'modeleEnCours' | 'lancement' | 'expedition';
  lancementIndex?: number;
  slotIndex?: number;
  titre: string;
  label?: string;
}) {
  const alertesManuelles = useAlertesManuelles();
  const alertes = alertesCarte(alertesManuelles, slotCard?.cardId);

  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const [couleur, setCouleur] = useState<AlerteCouleur>(ALERTES_COULEUR_DEFAUT);

  const ajouter = () => {
    const t = texte.trim();
    if (!t || !slotCard?.cardId) return;
    const now = getNowParis();
    const entree: AlerteManuelle = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      texte: t,
      couleur,
      creeLe: `${now.dateStr} à ${now.timeStr}`,
    };
    ecrireAlertesManuelles({
      ...alertesManuelles,
      [slotCard.cardId]: [...alertes, entree],
    });
    setTexte('');
    setOuvert(false);
  };

  const supprimer = (id: string) => {
    if (!slotCard?.cardId) return;
    ecrireAlertesManuelles({
      ...alertesManuelles,
      [slotCard.cardId]: alertes.filter((a) => a.id !== id),
    });
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="flex justify-end mb-1">
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          title="Ajouter une alerte"
          className="shrink-0 w-4 h-4 rounded-full border border-slate-300 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-300 text-[11px] leading-none cursor-pointer flex items-center justify-center"
        >
          +
        </button>
      </div>

      <div className="flex flex-col gap-1 flex-1">
        {alertes.map((a) => {
          const c = a.couleur || ALERTES_COULEUR_DEFAUT;
          const cls =
            c === 'orange' ? 'text-orange-600 bg-orange-50 border-orange-200'
            : c === 'jaune' ? 'text-yellow-600 bg-yellow-50 border-yellow-300'
            : c === 'vert' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
            : 'text-rose-600 bg-rose-50 border-rose-200';
          return (
            <div
              key={a.id}
              className={'group/a flex items-start gap-1.5 text-[12px] font-bold leading-tight rounded-md border px-1.5 py-1 ' + cls}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="break-words flex-1">{a.texte}</span>
              <button
                type="button"
                onClick={() => supprimer(a.id)}
                title="Supprimer"
                className="shrink-0 opacity-0 group-hover/a:opacity-100 cursor-pointer text-current/60 hover:text-current"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        {alertes.length === 0 && !ouvert && (
          <div className="text-[10px] text-slate-400 italic">Aucune alerte</div>
        )}
      </div>

      {ouvert && (
        <div className="mt-1 border-t border-slate-200 pt-1.5">
          <textarea
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                ajouter();
              }
            }}
            rows={2}
            placeholder="Nouvelle alerte..."
            autoFocus
            className="w-full resize-none text-[10px] leading-snug text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-1 focus:border-rose-300 focus:outline-hidden"
          />
          <div className="flex items-center justify-between gap-1 mt-1">
            <div className="flex items-center gap-1">
              {ALERTES_COULEURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCouleur(c)}
                  title={c}
                  className={
                    'w-3.5 h-3.5 rounded-full border cursor-pointer ' +
                    (c === 'rouge' ? 'bg-rose-500 ' : c === 'orange' ? 'bg-orange-500 ' : c === 'jaune' ? 'bg-yellow-400 ' : 'bg-emerald-500 ') +
                    (couleur === c ? 'border-slate-700' : 'border-white')
                  }
                />
              ))}
            </div>
            <button
              type="button"
              onClick={ajouter}
              disabled={!texte.trim()}
              className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 cursor-pointer"
            >
              Ajouter
            </button>
          </div>
        </div>
      )}
    </div>
  );

}
