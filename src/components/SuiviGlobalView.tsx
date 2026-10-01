import React, { useState, useEffect } from 'react';
import { CardItem } from '../types/card.ts';
import { ChaineRow, ChaineSlotCard } from '../types/suiviGlobal.ts';
import { CATEGORIES_CONFIG, INITIAL_CHAINE_ROWS } from '../data/mockSuiviGlobal.ts';
import { CardPickerModal } from './CardPickerModal.tsx';
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

export const SuiviGlobalView: React.FC<SuiviGlobalViewProps> = ({
  onBackToPointJournalier,
  cards,
  onOpenCardModal,
}) => {
  const [rows, setRows] = useState<ChaineRow[]>(() => {
    try {
      const saved = localStorage.getItem('suivi_global_rows_v2');
      if (saved) {
        return JSON.parse(saved);
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
          const nextLancements = [...r.prochainsLancementsCards] as [
            ChaineSlotCard | null,
            ChaineSlotCard | null,
            ChaineSlotCard | null,
            ChaineSlotCard | null,
            ChaineSlotCard | null
          ];
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
      prochainsLancementsCards: [null, null, null, null, null],
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
      'Prochain Lancement 1',
      'Prochain Lancement 2',
      'Prochain Lancement 3',
      'Prochain Lancement 4',
      'Prochain Lancement 5',
      'Expédition',
    ];

    const csvRows = [headers.join(';')];
    rows.forEach((r) => {
      const catTitle = CATEGORIES_CONFIG[r.categorieId]?.titre || r.categorieId;
      const modeleEnCoursText =
        getCardById(r.modeleEnCoursCard?.cardId)?.modele ||
        r.modeleEnCoursCard?.customLabel ||
        '';

      const lancementsTexts = r.prochainsLancementsCards.map((l) => {
        if (!l) return '';
        return getCardById(l.cardId)?.modele || l.customLabel || '';
      });

      const expeditionText =
        getCardById(r.expeditionCard?.cardId)?.modele ||
        r.expeditionCard?.customLabel ||
        '';

      const values = [
        `"${catTitle}"`,
        `"${r.nom}"`,
        `"${modeleEnCoursText}"`,
        `"${r.objectifJour}"`,
        `"${r.realisationJour}"`,
        `"${r.remarque}"`,
        ...lancementsTexts.map((txt) => `"${txt}"`),
        `"${expeditionText}"`,
      ];
      csvRows.push(values.join(';'));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Suivi_Global_Chaines_Cartes_${new Date().toISOString().slice(0, 10)}.csv`;
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

    return (
      <div className="group relative w-full h-full min-h-[52px] flex flex-col justify-center px-2 py-1.5 rounded-xl bg-slate-50/90 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 transition-all text-left">
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
            {linkedCard && (
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
            <span className="font-bold text-[11px] sm:text-xs text-slate-900 leading-snug line-clamp-1">
              {label}
            </span>
          </div>

          {subLabel && (
            <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
              {subLabel}
            </div>
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
          <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 min-w-[1450px]">
            {/* Header Row */}
            <thead>
              <tr>
                {/* Divers */}
                <th className="w-16 min-w-[64px] max-w-[72px]">
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
                <th className="w-60 min-w-[200px]">
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
                <th colSpan={5}>
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

                  return (
                    <tr key={row.id}>
                      {/* Column 1: Divers (Vertical category banner spanning all rows of this category) */}
                      {isFirstRowOfCategory && (
                        <td
                          rowSpan={catRows.length}
                          className="align-middle p-0"
                        >
                          <div
                            className={`h-full w-full min-h-[160px] rounded-xl sm:rounded-2xl border flex flex-col items-center justify-center p-2 shadow-2xs ${catConfig.bgClass} ${catConfig.borderClass}`}
                          >
                            <div
                              className={`flex flex-col items-center justify-center font-extrabold text-[11px] sm:text-xs tracking-widest uppercase select-none ${catConfig.textClass}`}
                            >
                              {catConfig.titreVerticalLignes.map((line, lIdx) => (
                                <React.Fragment key={lIdx}>
                                  {lIdx > 0 && <span className="h-3 my-0.5"></span>}
                                  {line.map((char, cIdx) => (
                                    <span key={cIdx} className="leading-tight py-[1px]">
                                      {char}
                                    </span>
                                  ))}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Column 2: Chaîne (Dot + Name) */}
                      <td className="p-0">
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-3 shadow-2xs h-full min-h-[58px] flex items-center gap-2.5">
                          <span
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: row.dotColor }}
                          />
                          {isEditMode ? (
                            <input
                              type="text"
                              value={row.nom}
                              onChange={(e) =>
                                handleCellChange(row.id, 'nom', e.target.value)
                              }
                              className="w-full font-bold text-xs sm:text-sm text-slate-800 bg-slate-50 border border-slate-300 rounded px-1.5 py-1 focus:bg-white focus:outline-hidden"
                            />
                          ) : (
                            <span className="font-bold text-xs sm:text-sm text-slate-800 truncate">
                              {row.nom}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 3: Modèle en cours (Carte du Point Commande Journalière) */}
                      <td className="p-0">
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs h-full min-h-[58px] flex items-center">
                          {renderCardSlotContent(
                            row.modeleEnCoursCard,
                            row,
                            'modeleEnCours'
                          )}
                        </div>
                      </td>

                      {/* Column 4: Objectif/Jour */}
                      <td className="p-0">
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-2 py-2 shadow-2xs h-full min-h-[58px] flex items-center justify-center">
                          {isEditMode ? (
                            <input
                              type="text"
                              value={row.objectifJour}
                              placeholder="0"
                              onChange={(e) =>
                                handleCellChange(
                                  row.id,
                                  'objectifJour',
                                  e.target.value
                                )
                              }
                              className="w-16 text-center text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-1 py-1.5 focus:bg-white focus:outline-hidden"
                            />
                          ) : (
                            <span className="text-xs sm:text-sm font-bold text-slate-800 font-mono">
                              {row.objectifJour || '—'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 5: Réalisation/Jour */}
                      <td className="p-0">
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-2 py-2 shadow-2xs h-full min-h-[58px] flex items-center justify-center">
                          {isEditMode ? (
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
                              className="w-16 text-center text-xs font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded px-1 py-1.5 focus:bg-white focus:outline-hidden"
                            />
                          ) : (
                            <span
                              className={`text-xs sm:text-sm font-bold font-mono ${
                                Number(row.realisationJour) >=
                                  Number(row.objectifJour) &&
                                Number(row.realisationJour) > 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-800'
                              }`}
                            >
                              {row.realisationJour || '—'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 6: Remarque */}
                      <td className="p-0">
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-2 shadow-2xs h-full min-h-[58px] flex items-center">
                          {isEditMode ? (
                            <input
                              type="text"
                              value={row.remarque}
                              placeholder="Remarque, consigne..."
                              onChange={(e) =>
                                handleCellChange(row.id, 'remarque', e.target.value)
                              }
                              className="w-full text-xs text-slate-700 bg-slate-50 border border-slate-300 rounded px-2 py-1.5 focus:bg-white focus:outline-hidden"
                            />
                          ) : (
                            <span
                              className={`text-xs ${
                                row.remarque
                                  ? 'text-slate-700 font-medium'
                                  : 'text-slate-300 italic'
                              }`}
                            >
                              {row.remarque || '—'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Columns 7 to 11: 5 Slots under PROCHAINS LANCEMENTS (Cartes) */}
                      {[0, 1, 2, 3, 4].map((slotIdx) => {
                        const slotCard = row.prochainsLancementsCards[slotIdx];
                        return (
                          <td key={slotIdx} className="p-0 min-w-[125px]">
                            <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs h-full min-h-[58px] flex flex-col justify-center items-center">
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
                        <div className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 shadow-2xs h-full min-h-[58px] flex flex-col justify-center items-center">
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
