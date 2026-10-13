import React, { useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CardItem } from '../types/card.ts';
import {
  ChaineRow,
  ChaineSlotCard,
  CategorieConfig,
  InspectionBloc,
  InspectionValeur,
} from '../types/suiviGlobal.ts';
import {
  alerteEnColonne,
  alerteActiveEnColonne,
  alerteActive,
  alertesCarte,
  ALERTES_COULEUR_DEFAUT,
  ALERTES_COULEURS,
  ecrireAlertesManuelles,
  useAlertesManuelles,
  VISIBILITE_ALERTE_DEFAUT,
  type AlerteCouleur,
  type AlerteManuelle,
  type VisibiliteAlerte,
} from '../utils/alertesManuelles.ts';
import {
  detailJalon,
  marqueJalon,
  themeJalon,
  type JalonInfo,
} from '../utils/jalons.ts';
import { blocInspectionVide } from '../utils/inspections.ts';
import { getNowParis } from '../utils/dateFrance.ts';
import { InspectionCell } from './InspectionCell.tsx';
import { AlertTriangle, ArrowLeftRight, Columns, Plus, Truck, X } from 'lucide-react';

/** Ligne du tableau du Suivi Global, mémorisée : en éditant une ligne (inspection,
 *  cartes…), seules les lignes réellement modifiées se re-rendent, pas les autres. */
export const LigneTableSuivi = React.memo(function LigneTableSuivi(props: LigneTableSuiviProps) {
  const {
    row,
    isFirstRowOfCategory,
    rowSpan,
    catConfig,
    catBanner,
    bannerRef,
    cardsParId,
    jalonInfosParCarte,
    cartesAlerteRetard,
    alertesManuelles,
    onCarteClick,
    onOuvrirActionSlot,
    onOuvrirPicker,
    onAssignerSlot,
    onMajBloc,
    onAjouterValeur,
    onMajValeur,
    setAlerteOuverte,
    setOfOuvert,
    setMenuEtat,
  } = props;

  const slotProps: Omit<SlotCaseProps, 'slotCard' | 'slotType' | 'lancementIndex' | 'slotIndex'> = {
    row,
    cardsParId,
    jalonInfosParCarte,
    cartesAlerteRetard,
    alertesManuelles,
    onCarteClick,
    onOuvrirActionSlot,
    onOuvrirPicker,
    onAssignerSlot,
    setAlerteOuverte,
  };

  return (
    <tr>
      {/* Column 1: Type (Vertical category banner spanning all rows of this category) */}
      {isFirstRowOfCategory && (
        <td
          ref={bannerRef}
          data-banner-cat={catConfig.id}
          rowSpan={rowSpan}
          className={`relative align-middle border-2 rounded-xl sm:rounded-2xl overflow-hidden ${catConfig.bgClass} ${catConfig.borderClass}`}
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
      <td className="h-[170px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-3 align-middle">
        <div className="h-full min-h-[72px] flex items-center justify-center">
          <span className="w-full text-center font-bold text-xs sm:text-sm text-slate-800 truncate">
            {row.nom}
          </span>
        </div>
      </td>

      {/* Column 3: Modèle en cours (Carte du Point Commande Journalière) */}
      <td className="h-[170px] group bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 align-middle">
        <div className="h-full min-h-[84px] flex flex-col gap-1">
          {row.modeleEnCoursCards.map((slot, pileIdx) => (
            <SlotCase
              key={pileIdx}
              {...slotProps}
              slotCard={slot}
              slotType="modeleEnCours"
              slotIndex={pileIdx}
            />
          ))}
        </div>
      </td>

      {/* Column 4: Inspection (un bloc par modèle en cours) */}
      <td className="h-[170px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1.5 align-middle">
        <div className="h-full min-h-[84px] flex flex-col gap-1">
          {blocsInspectionAffiches(row, cardsParId).map(
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
                  onAjouterValeur={(type, pct) => onAjouterValeur(row.id, blocIndex, type, pct)}
                  onSupprimerValeur={(valeurId) =>
                    onMajBloc(row.id, blocIndex, (b) => ({
                      ...b,
                      valeurs: b.valeurs.filter((v) => v.id !== valeurId),
                    }))
                  }
                  onMajDate={(valeurId, date) =>
                    onMajValeur(row.id, blocIndex, valeurId, (v) => ({
                      ...v,
                      date,
                    }))
                  }
                  onOfClick={(numero, anchor) => {
                    const slot = row.modeleEnCoursCards[blocIndex];
                    const card = slot?.cardId ? cardsParId.get(slot.cardId) : undefined;
                    if (card) {
                      setOfOuvert({ card, numero, slotTitle: libelle, anchor });
                    }
                  }}
                  onBadgeClick={(valeurId, anchor) =>
                    setMenuEtat({
                      rowId: row.id,
                      blocIndex,
                      valeurId,
                      anchor,
                      actuel:
                        bloc.valeurs.find((v) => v.id === valeurId)?.resultat ?? null,
                    })
                  }
                />
              </div>
            )
          )}
        </div>
      </td>

      {/* Column 5: Alertes par carte */}
      <td className="h-[170px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl px-3 py-2 align-middle">
        <div className="h-full flex flex-col justify-start gap-1.5 overflow-y-auto">
          {/* Alertes : blocs separees comme la colonne Inspection */}
          <div className="h-full min-h-[84px] flex flex-col gap-1">
            {row.modeleEnCoursCards.map((slotCard, pileIdx) =>
              slotCard ? (
                <div key={`mec-${pileIdx}`} className="min-w-0 flex-1 flex flex-col">
                  <AlertesCarte
                    slotCard={slotCard}
                    rowId={row.id}
                    slotType="modeleEnCours"
                    slotIndex={pileIdx}
                    titre={`Carte ${pileIdx + 1}`}
                    label={texteSlot(slotCard, cardsParId)}
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
            className="h-[170px] w-[330px] min-w-[290px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 align-middle"
          >
            <div className="h-full min-h-[88px] flex flex-col justify-start items-stretch">
              <div className="flex flex-col gap-1 w-full h-full">
                {pile.map((slotCard, pileIdx) => (
                  <SlotCase
                    key={pileIdx}
                    {...slotProps}
                    slotCard={slotCard}
                    slotType="lancement"
                    lancementIndex={slotIdx}
                    slotIndex={pileIdx}
                  />
                ))}
              </div>
            </div>
          </td>
        );
      })}

      {/* Column 12: EXPÉDITION (Nouvelle colonne après Prochains Lancements) */}
      <td className="h-[170px] min-w-[145px] bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-1 align-middle">
        <div className="h-full min-h-[88px] flex flex-col justify-center items-center">
          <SlotCase
            {...slotProps}
            slotCard={row.expeditionCard}
            slotType="expedition"
          />
        </div>
      </td>
    </tr>
  );
});

/** Colonne Préparée visée par une action de case. */
export type TypeSlotGlobal = 'modeleEnCours' | 'lancement' | 'expedition';

/** Identifiant unique (pour le DnD) d'une case du tableau : il contient
 *  l'identifiant de la ligne, unique dans tout le DndContext. */
function idCase(
  rowId: string,
  slotType: TypeSlotGlobal,
  lancementIndex?: number,
  slotIndex?: number
) {
  return `case:${rowId}:${slotType}:${lancementIndex ?? 0}:${slotIndex ?? 0}`;
}

export interface SlotCaseProps {
  row: ChaineRow;
  slotCard: ChaineSlotCard | null | undefined;
  slotType: TypeSlotGlobal;
  lancementIndex?: number;
  slotIndex?: number;
  cardsParId: ReadonlyMap<string, CardItem>;
  jalonInfosParCarte: ReadonlyMap<string, JalonInfo[]>;
  cartesAlerteRetard: ReadonlySet<string>;
  alertesManuelles: Record<string, AlerteManuelle[]>;
  onCarteClick: (card: CardItem) => void;
  onOuvrirActionSlot: (
    rowId: string,
    titreSlot: string,
    slotType: TypeSlotGlobal,
    lancementIndex?: number,
    slotIndex?: number
  ) => void;
  onOuvrirPicker: (
    rowId: string,
    titreSlot: string,
    slotType: TypeSlotGlobal,
    lancementIndex?: number,
    slotIndex?: number
  ) => void;
  onAssignerSlot: (
    rowId: string,
    slotType: TypeSlotGlobal,
    slotCard: ChaineSlotCard | null,
    lancementIndex?: number,
    slotIndex?: number
  ) => void;
  setAlerteOuverte: React.Dispatch<React.SetStateAction<AlerteOuverteGlobal | null>>;
}

/**
 * Une case du tableau : carte liée, ses jalons, sa bande d'alerte. C'est à la
 * fois une cible de dépôt (toute la case, bande d'alerte incluse) et, quand
 * elle est remplie, la source d'un glisser-déposer géré par @dnd-kit : l'aperçu
 * « carte qui suit le curseur » et l'animation de pose sont portés par le
 * DragOverlay du parent, pas par cette case.
 */
function SlotCase({
  row,
  slotCard,
  slotType,
  lancementIndex,
  slotIndex,
  cardsParId,
  jalonInfosParCarte,
  cartesAlerteRetard,
  alertesManuelles,
  onCarteClick,
  onOuvrirActionSlot,
  onOuvrirPicker,
  onAssignerSlot,
  setAlerteOuverte,
}: SlotCaseProps) {
  const rangSuffixe = slotIndex === 1 ? ' — 2ᵉ carte' : '';
  const titreSlot =
    slotType === 'modeleEnCours'
      ? `Modèle en cours${rangSuffixe} (${row.nom})`
      : slotType === 'expedition'
      ? `Expédition (${row.nom})`
      : `Prochain Lancement #${(lancementIndex || 0) + 1}${rangSuffixe} (${row.nom})`;
  const linkedCard = slotCard?.cardId ? cardsParId.get(slotCard.cardId) : undefined;
  const label = linkedCard ? linkedCard.modele : slotCard?.customLabel;
  const subLabel = linkedCard ? `${linkedCard.reference} • ${linkedCard.client}` : null;
  const jalonsCarte = linkedCard ? (jalonInfosParCarte.get(linkedCard.id) ?? []) : [];
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

  const dropId = idCase(row.id, slotType, lancementIndex, slotIndex);
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    data: { rowId: row.id, slotType, lancementIndex, slotIndex },
  });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `carte:${dropId}`,
    data: { cardId: linkedCard?.id ?? '' },
    disabled: !linkedCard,
  });

  const handleSlotClick = () => {
    if (linkedCard) {
      onCarteClick(linkedCard);
    } else {
      onOuvrirActionSlot(row.id, titreSlot, slotType, lancementIndex, slotIndex);
    }
  };

  if (!label) {
    return (
      <button
        ref={setDropRef}
        onClick={() => onOuvrirActionSlot(row.id, titreSlot, slotType, lancementIndex, slotIndex)}
        className={`w-full min-h-[50px] flex items-center justify-center text-[11px] font-medium rounded-xl transition-all border border-dashed p-1 ${
          isOver
            ? 'text-blue-600 bg-blue-50/70 border-blue-400 ring-2 ring-blue-400/50'
            : 'text-slate-300 hover:text-blue-600 hover:bg-blue-50/50 border-slate-200 hover:border-blue-300 cursor-pointer'
        } ${autreSlotRempli ? 'flex-none' : 'flex-1'}`}
        title="Cliquez pour assigner une carte, ou déposez une carte ici"
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

  const isMergedModele = slotType === 'modeleEnCours' || slotType === 'lancement';
  const progress = computeCardProgress(linkedCard);
  const enAlerte = linkedCard
    ? cartesAlerteRetard.has(linkedCard.id) ||
      (alertesManuelles[linkedCard.id] ?? []).some((a) => alerteActive(a))
    : false;

  return (
    <div className="flex flex-col gap-1 flex-1 min-h-0 w-full">
      {/* Conteneur unifié : la ring relie la bande Alerte + la carte. Il sert
          aussi de cible de dépôt, toute la case (bande incluse) accepte une
          carte déposée. */}
      <div
        ref={setDropRef}
        className={`relative w-full flex flex-col flex-1 min-h-0 ${
          enAlerte
            ? 'ring-2 ring-rose-300/60 shadow-[0_0_0_1px_rgba(251,113,133,0.5)] rounded-xl'
            : isOver
            ? 'ring-2 ring-blue-400/70 shadow-[0_0_0_1px_rgba(59,130,246,0.35)] rounded-xl'
            : 'rounded-xl'
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
            className="shrink-0 w-full flex items-center justify-center gap-1 px-2 py-1 rounded-t-xl bg-red-600 text-white motion-safe:animate-pulse text-[10px] font-extrabold uppercase tracking-wider cursor-pointer hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80 transition-colors relative z-20"
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
            ref={setDragRef}
            {...attributes}
            {...listeners}
            onClick={handleSlotClick}
            className={`flex-1 min-h-0 w-full flex flex-col justify-start items-start select-none touch-none ${
              isDragging ? 'cursor-grabbing opacity-40' : 'cursor-grab active:cursor-grabbing'
            }`}
            title={
              linkedCard
                ? `Afficher la fiche identitaire : ${linkedCard.modele} (${linkedCard.reference}). Glissez pour déplacer dans une autre case.`
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
          <div className="absolute right-1 top-1 hidden group-hover:flex items-center gap-1 bg-white p-0.5 rounded-md shadow-xs border border-slate-200 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOuvrirPicker(row.id, titreSlot, slotType, lancementIndex, slotIndex);
              }}
              title="Changer / Réassigner une autre carte"
              className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
            >
              <ArrowLeftRight className="w-3 h-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAssignerSlot(row.id, slotType, null, lancementIndex, slotIndex);
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
}

/** Menu Pass/Fail ouvert sur un contrôle d'inspection. */
export interface MenuEtatInspection {
  rowId: string;
  blocIndex: number;
  valeurId: string;
  anchor: HTMLElement;
  actuel: 'P' | 'F' | null;
}

/** Popover d'alerte ouvert : la carte concernée, son titre de case, l'ancre DOM. */
export interface AlerteOuverteGlobal {
  card: CardItem;
  slotTitle?: string;
  anchor: HTMLElement;
}

/** Popover OF ouvert sur un contrôle d'inspection. */
export interface OfOuvertGlobal {
  card: CardItem;
  numero: number;
  slotTitle: string;
  anchor: HTMLElement;
}

/** Structure du bandeau vertical d'une catégorie (rendu par buildBanner). */
export interface ApercuBanniere {
  glyphs: { char: string; x: number; y: number; size: number }[];
  vbW: number;
  vbH: number;
}

/** Nombre de colonnes « Prochains Lancements ». Source unique pour l'affichage
 *  et l'affectation, pour qu'ajouter une colonne ne demande pas deux edits. */
export const NOMBRE_LANCEMENTS = 5;

export interface LigneTableSuiviProps {
  row: ChaineRow;
  isFirstRowOfCategory: boolean;
  rowSpan: number;
  catConfig: CategorieConfig;
  catBanner: ApercuBanniere;
  bannerRef: (el: HTMLTableCellElement | null) => void;
  cardsParId: ReadonlyMap<string, CardItem>;
  jalonInfosParCarte: ReadonlyMap<string, JalonInfo[]>;
  cartesAlerteRetard: ReadonlySet<string>;
  alertesManuelles: Record<string, AlerteManuelle[]>;
  onCarteClick: (card: CardItem) => void;
  onOuvrirActionSlot: (
    rowId: string,
    titreSlot: string,
    slotType: TypeSlotGlobal,
    lancementIndex?: number,
    slotIndex?: number
  ) => void;
  onOuvrirPicker: (
    rowId: string,
    titreSlot: string,
    slotType: TypeSlotGlobal,
    lancementIndex?: number,
    slotIndex?: number
  ) => void;
  onAssignerSlot: (
    rowId: string,
    slotType: TypeSlotGlobal,
    slotCard: ChaineSlotCard | null,
    lancementIndex?: number,
    slotIndex?: number
  ) => void;
  onMajBloc: (
    rowId: string,
    blocIndex: number,
    maj: (bloc: InspectionBloc) => InspectionBloc
  ) => void;
  onAjouterValeur: (
    rowId: string,
    blocIndex: number,
    type: 'I' | 'OF',
    pct?: 50 | 100
  ) => void;
  onMajValeur: (
    rowId: string,
    blocIndex: number,
    valeurId: string,
    maj: (valeur: InspectionValeur) => InspectionValeur
  ) => void;
  setAlerteOuverte: React.Dispatch<React.SetStateAction<AlerteOuverteGlobal | null>>;
  setOfOuvert: React.Dispatch<React.SetStateAction<OfOuvertGlobal | null>>;
  setMenuEtat: React.Dispatch<React.SetStateAction<MenuEtatInspection | null>>;
}

/** Progression de production d'une carte (pourcentage arrondi), null si aucune. */
function computeCardProgress(card?: CardItem): number | null {
  return card && card.quantiteDemandee > 0
    ? Math.min(100, Math.round((card.quantiteFinie / card.quantiteDemandee) * 100))
    : null;
}

/** Texte d'une case : modèle lié, sinon libellé saisi, sinon vide. */
function texteSlot(
  slot: ChaineSlotCard | null | undefined,
  cardsParId: ReadonlyMap<string, CardItem>
): string {
  return slot && slot.cardId
    ? cardsParId.get(slot.cardId)?.modele || slot.customLabel || ''
    : '';
}

/** Libellé court d'un modèle en cours, pour l'en-tête du bloc d'inspection. */
function libelleModele(
  row: ChaineRow,
  blocIndex: number,
  cardsParId: ReadonlyMap<string, CardItem>
): string {
  const slot = row.modeleEnCoursCards[blocIndex];
  return texteSlot(slot, cardsParId) || `Modèle ${blocIndex + 1}`;
}

/** Blocs d'inspection à afficher : un par modèle en cours occupé.
 *  Sans modèle en cours, aucun bloc n'est affiché (pas d'OF sans modèle). */
function blocsInspectionAffiches(
  row: ChaineRow,
  cardsParId: ReadonlyMap<string, CardItem>
): { blocIndex: number; bloc: InspectionBloc; libelle: string }[] {
  const indices = row.modeleEnCoursCards
    .map((slot, i) => (slot ? i : -1))
    .filter((i) => i >= 0);
  return indices.map((blocIndex) => ({
    blocIndex,
    bloc: row.inspections[blocIndex] ?? blocInspectionVide(),
    libelle: libelleModele(row, blocIndex, cardsParId),
  }));
}

/**
 * Une pastille de jalon, lisible sur le tableau global. La marque courte (✓, S40,
 * 12/06, TBC, —) tient dans une colonne fixe à droite, comme dans le Point
 * Commande Journalière : le code s'étale dans la colonne de gauche sans jamais
 * déborder de la cellule. La teinte vient de la grandeur (vert nomenclature,
 * bleu statut) ; seule la nuance change avec l'avancement, et le rouge reste
 * réservé au retard, avec son triangle d'alerte.
 */
export const PastilleJalon = React.memo(function PastilleJalon({
  jalon,
}: {
  jalon: JalonInfo;
}) {
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
});

/** Alerte manuelle saisie dans la colonne « Alertes » du Suivi Global. */
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
  slotType: TypeSlotGlobal;
  lancementIndex?: number;
  slotIndex?: number;
  titre: string;
  label?: string;
}) {
  const alertesManuelles = useAlertesManuelles();
  // La colonne n'affiche que les alertes « colonne » encore en cours ; celles
  // de type « popover uniquement » ou archivées (réglées) n'y apparaissent pas.
  const alertes = alertesCarte(alertesManuelles, slotCard?.cardId).filter((a) => alerteActiveEnColonne(a));

  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  const [couleur, setCouleur] = useState<AlerteCouleur>(ALERTES_COULEUR_DEFAUT);
  const [visibilite, setVisibilite] = useState<VisibiliteAlerte>(VISIBILITE_ALERTE_DEFAUT);

  const ajouter = () => {
    const t = texte.trim();
    if (!t || !slotCard?.cardId) return;
    const now = getNowParis();
    const entree: AlerteManuelle = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      texte: t,
      couleur,
      visibilite,
      creeLe: `${now.dateStr} à ${now.timeStr}`,
    };
    ecrireAlertesManuelles({
      ...alertesManuelles,
      [slotCard.cardId]: [...alertesCarte(alertesManuelles, slotCard.cardId), entree],
    });
    setTexte('');
    setOuvert(false);
  };

  const supprimer = (id: string) => {
    if (!slotCard?.cardId) return;
    ecrireAlertesManuelles({
      ...alertesManuelles,
      [slotCard.cardId]: alertesCarte(alertesManuelles, slotCard.cardId).filter((a) => a.id !== id),
    });
  };

  // Bascule « colonne » / « popover uniquement » depuis la colonne elle-même.
  const basculerVisibilite = (a: AlerteManuelle) => {
    if (!slotCard?.cardId) return;
    const nouvelle: VisibiliteAlerte = alerteEnColonne(a) ? 'popover' : 'colonne';
    ecrireAlertesManuelles({
      ...alertesManuelles,
      [slotCard.cardId]: alertesCarte(alertesManuelles, slotCard.cardId).map((x) =>
        x.id === a.id ? { ...x, visibilite: nouvelle } : x
      ),
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
              <label
                className="shrink-0 opacity-0 group-hover/a:opacity-100 cursor-pointer flex items-center"
                title="Décocher pour ne plus afficher dans la colonne (reste dans le popover)"
              >
                <input
                  type="checkbox"
                  checked
                  onChange={() => basculerVisibilite(a)}
                  className="accent-blue-600 w-3 h-3 cursor-pointer"
                />
              </label>
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
          <div className="flex items-center gap-1 mt-1">
            <label
              className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-500 cursor-pointer select-none hover:text-blue-700 transition-colors"
              title="Cocher pour afficher l'alerte dans la colonne Alertes"
            >
              <input
                type="checkbox"
                checked={visibilite === 'colonne'}
                onChange={() => setVisibilite(visibilite === 'colonne' ? 'popover' : 'colonne')}
                className="accent-blue-600 w-3 h-3 cursor-pointer"
              />
              <Columns className="w-2.5 h-2.5 text-blue-600" />
              Colonne
            </label>
          </div>
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