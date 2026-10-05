import React, { useState, useEffect, useRef } from 'react';
import { CardItem } from '../types/card.ts';
import { ChaineRow, ChaineSlotCard, CategorieConfig } from '../types/suiviGlobal.ts';
import { CATEGORIES_CONFIG, INITIAL_CHAINE_ROWS } from '../data/mockSuiviGlobal.ts';
import { CardPickerModal } from './CardPickerModal.tsx';
import { getJalonsEnRetard } from '../utils/jalons.ts';
import { getNowParis } from '../utils/dateFrance.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import {
  ArrowLeft,
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
  ArrowLeftRight,
  AlertTriangle,
} from 'lucide-react';

interface SuiviGlobalViewProps {
  onBackToPointJournalier: () => void;
  cards: CardItem[];
  onOpenCardModal?: (card: CardItem) => void;
}

interface ActiveSlotPicker {
  rowId: string;
  slotType: 'modeleEnCours' | 'lancement' | 'expedition';
  lancementIndex?: number;
  slotTitle: string;
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
  const [rows, setRows] = useState<ChaineRow[]>(() => {
      try {
        const saved = localStorage.getItem('suivi_global_rows_v2');
        if (saved) {
          const parsed = JSON.parse(saved) as ChaineRow[];
          // Un cache corrompu ou d'un autre format rendrait les accès
          // `prochainsLancementsCards[i]` infructueux : on retombe sur le défaut.
          const valide =
            Array.isArray(parsed) &&
            parsed.every((r) => Array.isArray(r.prochainsLancementsCards));
          if (valide) return parsed;
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
  const [alertRowIds, setAlertRowIds] = useState<Set<string>>(() => new Set(['bm-petunia']));

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

  // Find CardItem from Point Commande Journalière by cardId
  const getCardById = (cardId?: string): CardItem | undefined => {
    if (!cardId) return undefined;
    return cards.find((c) => c.id === cardId);
  };

  const handleCellChange = (
    rowId: string,
    field: 'nom' | 'objectifJour' | 'realisationJour' | 'remarque',
    value: string | number
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const handleAssignSlotCard = (
    rowId: string,
    slotType: 'modeleEnCours' | 'lancement' | 'expedition',
    slotCard: ChaineSlotCard | null,
    lancementIndex?: number
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== rowId) return r;
        if (slotType === 'modeleEnCours') {
          return { ...r, modeleEnCoursCard: slotCard || undefined };
        }
        if (slotType === 'expedition') {
          return { ...r, expeditionCard: slotCard || null };
        }
        if (slotType === 'lancement' && typeof lancementIndex === 'number') {
          const nextLancements = Array.from(
            { length: NOMBRE_LANCEMENTS },
            (_, i) => r.prochainsLancementsCards?.[i] ?? null
          ) as ChaineRow['prochainsLancementsCards'];
          nextLancements[lancementIndex] = slotCard;
          return { ...r, prochainsLancementsCards: nextLancements };
        }
        return r;
      })
    );
  };

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

    const newRow: ChaineRow = {
      id: `${categorieId.toLowerCase()}-${Date.now()}`,
      categorieId,
      nom: nomPrompt.trim(),
      dotColor: CATEGORIES_CONFIG[categorieId]?.defaultDotColor || '#94a3b8',
      modeleEnCoursCard: undefined,
      objectifJour: '',
      realisationJour: '',
      remarque: '',
      prochainsLancementsCards: Array.from(
        { length: NOMBRE_LANCEMENTS },
        () => null
      ) as ChaineRow['prochainsLancementsCards'],
      expeditionCard: null,
    };

    setRows((prev) => [...prev, newRow]);
  };

  const handleExportCSV = () => {
    const headers = [
      'Divers',
      'Chaîne',
      'Modèle en cours (Carte)',
      'Objectif/Jour',
      'Réalisation/Jour',
      'Remarque',
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
      const modeleEnCoursText =
        getCardById(r.modeleEnCoursCard?.cardId)?.modele ||
        r.modeleEnCoursCard?.customLabel ||
        '';

      const lancementsTexts = Array.from(
        { length: NOMBRE_LANCEMENTS },
        (_, i) => {
          const l = r.prochainsLancementsCards?.[i];
          if (!l) return '';
          return getCardById(l.cardId)?.modele || l.customLabel || '';
        }
      );

      const expeditionText =
        getCardById(r.expeditionCard?.cardId)?.modele ||
        r.expeditionCard?.customLabel ||
        '';

      const values = [
        catTitle,
        r.nom,
        modeleEnCoursText,
        r.objectifJour,
        r.realisationJour,
        r.remarque,
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
    const modeleCard = getCardById(r.modeleEnCoursCard?.cardId);
    return (
      r.nom.toLowerCase().includes(q) ||
      (modeleCard && modeleCard.modele.toLowerCase().includes(q)) ||
      (r.modeleEnCoursCard?.customLabel &&
        r.modeleEnCoursCard.customLabel.toLowerCase().includes(q)) ||
      r.remarque.toLowerCase().includes(q)
    );
  });

  // Jalons en retard sur les cartes liées à une ligne. Le catalogue global fait foi :
  // ajouter un jalon ajoute automatiquement une pastille d'alerte ici.
  const getJalonsEnRetardLigne = (row: ChaineRow) => {
    const slots = [
      row.modeleEnCoursCard,
      ...(row.prochainsLancementsCards || []),
      row.expeditionCard,
    ];
    // Une même carte peut occuper plusieurs colonnes de la ligne : on la ne compte qu'une fois.
    const cartes = new Map<string, CardItem>();
    for (const slot of slots) {
      if (!slot?.cardId) continue;
      const card = getCardById(slot.cardId);
      if (card) cartes.set(card.id, card);
    }
    return [...cartes.values()].flatMap((card) => getJalonsEnRetard(card, catalogue));
  };

  // Helper to render card chip inside table cell
  const renderCardSlotContent = (
    slotCard: ChaineSlotCard | null | undefined,
    row: ChaineRow,
    slotType: 'modeleEnCours' | 'lancement' | 'expedition',
    lancementIndex?: number
  ) => {
    const linkedCard = slotCard?.cardId ? getCardById(slotCard.cardId) : undefined;
    const label = linkedCard ? linkedCard.modele : slotCard?.customLabel;
    const subLabel = linkedCard ? `${linkedCard.reference} • ${linkedCard.client}` : null;

    if (!label) {
      return (
        <button
          onClick={() =>
            setActivePicker({
              rowId: row.id,
              slotType,
              lancementIndex,
              slotTitle:
                slotType === 'modeleEnCours'
                  ? `Modèle en cours (${row.nom})`
                  : slotType === 'expedition'
                  ? `Expédition (${row.nom})`
                  : `Prochain Lancement #${(lancementIndex || 0) + 1} (${row.nom})`,
            })
          }
          className="w-full h-full min-h-[50px] flex items-center justify-center text-[11px] font-medium text-slate-300 hover:text-blue-600 hover:bg-blue-50/50 rounded-xl transition-all border border-dashed border-slate-200 hover:border-blue-300 cursor-pointer p-1"
          title="Cliquez pour assigner une carte du Point Commande Journalière"
        >
          <span className="flex items-center gap-1">
            <Plus className="w-3 h-3" />
            <span>
              {slotType === 'expedition'
                ? '+ Expédition'
                : slotType === 'modeleEnCours'
                ? '+ Carte'
                : `#${(lancementIndex || 0) + 1}`}
            </span>
          </span>
        </button>
      );
    }

    const handleSlotClick = () => {
      if (linkedCard && onOpenCardModal) {
        onOpenCardModal(linkedCard);
      } else {
        setActivePicker({
          rowId: row.id,
          slotType,
          lancementIndex,
          slotTitle:
            slotType === 'modeleEnCours'
              ? `Modèle en cours (${row.nom})`
              : slotType === 'expedition'
              ? `Expédition (${row.nom})`
              : `Prochain Lancement #${(lancementIndex || 0) + 1} (${row.nom})`,
        });
      }
    };

    const isMergedModele = slotType === 'modeleEnCours';
    const progress = computeCardProgress(linkedCard);

    return (
      <div
        className={`group relative w-full min-h-[52px] flex flex-col justify-center px-2 py-1.5 rounded-xl bg-slate-50/90 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 transition-all text-left ${
          isMergedModele ? 'flex-1' : 'h-full'
        }`}
      >
        <div
          onClick={handleSlotClick}
          className="cursor-pointer"
          title={
            linkedCard
              ? `Afficher la fiche identitaire : ${linkedCard.modele} (${linkedCard.reference})`
              : 'Cliquer pour modifier ou assigner une carte'
          }
        >
          <div className="flex items-center gap-1.5">
            {linkedCard && !isMergedModele && (
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  linkedCard.statut === 'TERMINE'
                    ? 'bg-emerald-500'
                    : linkedCard.statut === 'EN_COURS'
                    ? 'bg-blue-500'
                    : linkedCard.statut === 'BLOQUE'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }`}
              />
            )}
            <span
              className={`font-bold text-[11px] sm:text-xs leading-snug line-clamp-1 ${
                isMergedModele ? 'text-blue-700 pr-12' : 'text-slate-900'
              }`}
            >
              {label}
            </span>
          </div>

          {isMergedModele ? (
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                  Réf.
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-600 truncate">
                  {linkedCard?.reference || '—'}
                </span>
              </div>
              {progress !== null ? (
                <div className="flex items-center gap-1 shrink-0">
                  <div className="w-14 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold font-mono text-slate-600">
                    {progress}%
                  </span>
                </div>
              ) : (
                <span className="text-[10px] font-semibold text-slate-300 shrink-0">
                  —%
                </span>
              )}
            </div>
          ) : (
            subLabel && (
              <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                {subLabel}
              </div>
            )
          )}

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
                slotTitle:
                  slotType === 'modeleEnCours'
                    ? `Modèle en cours (${row.nom})`
                    : slotType === 'expedition'
                    ? `Expédition (${row.nom})`
                    : `Prochain Lancement #${(lancementIndex || 0) + 1} (${row.nom})`,
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
              handleAssignSlotCard(row.id, slotType, null, lancementIndex);
            }}
            title="Retirer la carte de cette case"
            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  };

  // Currently selected slot for CardPickerModal
  const currentSlotForPicker = activePicker
    ? activePicker.slotType === 'modeleEnCours'
      ? rows.find((r) => r.id === activePicker.rowId)?.modeleEnCoursCard
      : activePicker.slotType === 'expedition'
      ? rows.find((r) => r.id === activePicker.rowId)?.expeditionCard
      : rows.find((r) => r.id === activePicker.rowId)?.prochainsLancementsCards[
          activePicker.lancementIndex || 0
        ]
    : null;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-16">
      {/* Top Banner / Actions Bar */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
        <div className="max-w-[1850px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Back button & Page title */}
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToPointJournalier}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Retourner au Point Commande Journalière"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Point Commande Journalière</span>
            </button>

            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

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

          {/* Controls & Quick Actions */}
          <div className="flex flex-wrap items-center gap-2">
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

            {/* Quick edit mode toggle for Objectif / Réalisation / Remarque */}
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
              title="Modifier directement les objectifs, réalisations et remarques"
            >
              {isEditMode ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Enregistrer Objectifs/Réalisations</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Édition Objectifs & Remarques</span>
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
              <strong>Attribution des cartes :</strong> Cliquez sur n'importe quelle case de <em>Modèle en cours</em>, <em>Prochains Lancements (1 à 5)</em> ou <em>Expédition</em> pour choisir la carte de commande correspondante. Les colonnes <em>Objectif/Jour</em>, <em>Réalisation/Jour</em> et <em>Remarque</em> sont spécifiques à chaque chaîne.
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
          <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 min-w-[1580px]">
            {/* Header Row */}
            <thead>
              <tr>
                {/* Divers */}
                <th className="w-14 min-w-[56px] max-w-[56px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Divers
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

                {/* Objectif/Jour */}
                <th className="w-28 min-w-[95px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Objectif/Jour
                  </div>
                </th>

                {/* Réalisation/Jour */}
                <th className="w-28 min-w-[95px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-2 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Réalisation/Jour
                  </div>
                </th>

                {/* Remarque */}
                <th className="w-60 min-w-[190px]">
                  <div className="bg-white border border-slate-200/90 rounded-xl py-2.5 px-3 text-center text-xs font-bold text-slate-700 shadow-2xs">
                    Remarque
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
                      const jalonsEnRetard = getJalonsEnRetardLigne(row);
                      const isRowAlert = alertRowIds.has(row.id) || jalonsEnRetard.length > 0;
                      // Bandeau volontairement minimal : « ALERTE : TC: S22, SMS: S31 ».
                      // Pas de numérotation ni de phrase, la cause se lit d'un coup d'œil ;
                      // le détail complet reste disponible au survol via le title.
                      const causesAlerte = [
                        ...jalonsEnRetard.map((j) => `${j.code}: S${j.semaine}`),
                        ...(alertRowIds.has(row.id) ? ['ATELIER'] : []),
                      ];
                      const detailAlerte = [
                        ...jalonsEnRetard.map((j) => `${j.code} : semaine S${j.semaine} dépassée`),
                        ...(alertRowIds.has(row.id) ? ['Alerte atelier'] : []),
                      ].join(', ');
                  const bannerSize = bannerSizes[catKey];
                  const catBanner = buildBanner(catConfig, bannerSize?.w ?? 0, bannerSize?.h ?? 0);

                  return (
                    <tr key={row.id}>
                      {/* Column 1: Divers (Vertical category banner spanning all rows of this category) */}
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
                        <td className="p-0">
                          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-3 shadow-2xs h-full min-h-[96px] flex items-center justify-center">
                          {isEditMode ? (
                            <input
                              type="text"
                              value={row.nom}
                              onChange={(e) =>
                                handleCellChange(row.id, 'nom', e.target.value)
                              }
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
                      <td className="p-0">
                        <div
                          className={`group relative bg-white border rounded-xl sm:rounded-2xl p-1.5 shadow-2xs h-full min-h-[96px] flex flex-col ${
                            isRowAlert
                              ? 'border-rose-400 ring-1 ring-rose-200'
                              : 'border-slate-200/90'
                          }`}
                        >
                          {isRowAlert && (
                            <div
                              className="flex items-center gap-1.5 px-2.5 py-1 mb-1.5 rounded-lg bg-rose-600 text-white shadow-2xs motion-safe:animate-pulse"
                              title={`ALERTE : ${detailAlerte}`}
                            >
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span className="text-[10px] font-extrabold uppercase tracking-wider truncate">
                                ALERTE : {causesAlerte.join(', ')}
                              </span>
                              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white shrink-0 motion-safe:animate-ping" />
                            </div>
                          )}

                          {renderCardSlotContent(
                            row.modeleEnCoursCard,
                            row,
                            'modeleEnCours'
                          )}
                        </div>
                      </td>

                      {/* Column 4: Objectif/Jour */}
                        <td className="p-0">
                          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-2 py-2 shadow-2xs h-full min-h-[96px] flex items-center justify-center">
                            <input
                              type="text"
                              value={row.objectifJour}
                              placeholder="0"
                              onChange={(e) =>
                                handleCellChange(row.id, 'objectifJour', e.target.value)
                              }
                              className="w-full text-center text-sm font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 focus:bg-white focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                        </td>

                      {/* Column 5: Réalisation/Jour */}
                        <td className="p-0">
                          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-2 py-2 shadow-2xs h-full min-h-[96px] flex items-center justify-center">
                            <input
                              type="text"
                              value={row.realisationJour}
                              placeholder="0"
                              onChange={(e) =>
                                handleCellChange(
                                  row.id,
                                  'realisationJour',
                                  e.target.value
                                )
                              }
                              className={`w-full text-center text-sm font-bold font-mono bg-slate-50 border rounded-lg px-2 py-2 focus:bg-white focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400 ${
                                Number(row.realisationJour) >= Number(row.objectifJour) &&
                                Number(row.realisationJour) > 0
                                  ? 'text-emerald-700 border-emerald-300'
                                  : 'text-slate-900 border-slate-300'
                              }`}
                            />
                          </div>
                        </td>

                      {/* Column 6: Remarque */}
                        <td className="p-0">
                          <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-2 shadow-2xs h-full min-h-[96px] flex items-center">
                            <input
                              type="text"
                              value={row.remarque}
                              placeholder="Remarque, consigne..."
                              onChange={(e) =>
                                handleCellChange(row.id, 'remarque', e.target.value)
                              }
                              className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded-lg px-2 py-2 focus:bg-white focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                            />
                          </div>
                        </td>

                      {/* Columns 7 to 11: 5 Slots under PROCHAINS LANCEMENTS (Cartes) */}
                      {Array.from({ length: NOMBRE_LANCEMENTS }, (_, slotIdx) => {
                        const slotCard = row.prochainsLancementsCards[slotIdx];
                        return (
                          <td key={slotIdx} className="p-0 min-w-[125px]">
                            <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs h-full min-h-[96px] flex flex-col justify-center items-center">
                          {renderCardSlotContent(
                                slotCard,
                                row,
                                'lancement',
                                slotIdx
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Column 12: EXPÉDITION (Nouvelle colonne après Prochains Lancements) */}
                      <td className="p-0 min-w-[145px]">
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs h-full min-h-[96px] flex flex-col justify-center items-center">
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
              activePicker.lancementIndex
            );
          }}
        />
      )}
    </div>
  );
};
