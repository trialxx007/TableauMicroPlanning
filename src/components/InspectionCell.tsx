import React, { useState } from 'react';
import { History, Plus, Truck, X } from 'lucide-react';
import { InspectionBloc, InspectionValeur } from '../types/suiviGlobal.ts';
import { dateCourte } from '../utils/inspections.ts';
import { InspectionHistoriquePopover } from './InspectionHistoriquePopover.tsx';

interface InspectionCellProps {
  bloc: InspectionBloc;
  /** Nombre d'OF de la carte du bloc : les inspections sont regroupées par OF
   *  (OF1, OF2…) pour qu'elles soient facilement distinguables. */
  nbOfs: number;
  /** Ajoute un contrôle d'inspection à 50 % ou 100 % pour l'OF numéro
   *  `ofIndex` (0 = OF1), ou un contrôle Carton Check (`'CC'`, sans OF). */
  onAjouterValeur: (type: 'I' | 'OF' | 'CC', pct?: 50 | 100, ofIndex?: number) => void;
  onSupprimerValeur: (valeurId: string) => void;
  /** Modification de la date de programmation d'une valeur. */
  onMajDate: (valeurId: string, date: string) => void;
  /** Clic sur le badge Rien/Pass/Fail : ouvre le menu d'état ancré dessous. */
  onBadgeClick: (valeurId: string, anchor: HTMLElement) => void;
  /** Clic sur un libellé OF (OF1, OF2...) : ouvre le popover de détail. */
  onOfClick?: (indice: number, anchor: HTMLElement) => void;
  /** Envoie le modèle de ce bloc dans la colonne Expédition (puis ouvre le suivi OF). */
  onEnvoyerExpedition?: () => void;
  /** Le modèle de ce bloc est déjà suivi en expédition. */
  expeditionActive?: boolean;
}

/**
 * Cellule Inspection : grille à 3 colonnes alignées (OF | Inspection | Date).
 * Chaque OF de la carte (OF1, OF2…) a sa propre section, visuellement séparée,
 * avec ses contrôles (I1 50 %, I2 100 %…) et sa date + statut
 * Rien/Pass/Fail. Les boutons « I 50 % » / « I 100 % » ajoutent manuellement
 * un contrôle à l'OF concerné.
 */
export const InspectionCell: React.FC<InspectionCellProps> = ({
  bloc,
  nbOfs,
  onAjouterValeur,
  onSupprimerValeur,
  onMajDate,
  onBadgeClick,
  onOfClick,
  onEnvoyerExpedition,
  expeditionActive = false,
}) => {
  const [dateEnEdition, setDateEnEdition] = useState<string | null>(null);
  const [ancreHistorique, setAncreHistorique] = useState<HTMLElement | null>(null);

  const valeursEtIndex = bloc.valeurs.map((valeur, index) => ({
    valeur,
    index,
  }));

  // Groupes à afficher : chaque OF de la carte + les OF auxquels des contrôles
  // existants sont déjà rattachés.
  const ofIndices = new Set<number>();
  for (const { valeur } of valeursEtIndex)
    if (valeur.type === 'I') ofIndices.add(valeur.ofIndex ?? 0);
  for (let i = 0; i < nbOfs; i++) ofIndices.add(i);
  const groupes = [...ofIndices].sort((a, b) => a - b);

  const badgeClasse = (valeur: InspectionValeur) =>
    `h-5 shrink-0 px-1.5 rounded text-[9px] font-black uppercase tracking-wide text-white transition-colors duration-200 ${
      valeur.resultat === 'P'
        ? 'bg-emerald-600 hover:bg-emerald-700'
        : valeur.resultat === 'F'
        ? 'bg-rose-600 hover:bg-rose-700'
        : 'bg-slate-400 hover:bg-slate-500'
    }`;

  /** Colonne Date + statut Pass/Fail d'un contrôle (commun aux lignes I et CC). */
  const rendreActions = (valeur: InspectionValeur) => (
    <span className="flex items-center justify-end gap-1 min-w-0">
      {dateEnEdition === valeur.id ? (
        <input
          type="date"
          autoFocus
          value={valeur.date}
          onChange={(e) => {
            if (e.target.value) onMajDate(valeur.id, e.target.value);
          }}
          onBlur={() => setDateEnEdition(null)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') setDateEnEdition(null);
          }}
          aria-label="Date du contrôle d'inspection"
          className="h-5 w-full min-w-0 px-1 text-[10px] leading-none text-slate-700 bg-white border border-blue-400 rounded focus:outline-none"
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setDateEnEdition(valeur.id)}
            title="Date d'inspection — cliquer pour modifier"
            className="font-mono text-[10px] leading-none text-slate-600 hover:text-blue-600 transition-colors shrink-0"
          >
            {dateCourte(valeur.date)}
          </button>
          <button
            type="button"
            onClick={(e) => onBadgeClick(valeur.id, e.currentTarget)}
            title={
              valeur.resultat === 'P'
                ? 'Pass — cliquer pour changer'
                : valeur.resultat === 'F'
                ? 'Fail — cliquer pour changer'
                : 'Cliquer pour choisir Pass ou Fail'
            }
            className={
              valeur.resultat === 'P' || valeur.resultat === 'F'
                ? badgeClasse(valeur)
                : 'h-5 shrink-0 min-w-9 px-1.5 rounded text-[12px] font-bold leading-none text-white bg-slate-400 hover:bg-slate-500 inline-flex items-center justify-center transition-colors duration-200'
            }
          >
            {valeur.resultat === 'P'
              ? 'Pass'
              : valeur.resultat === 'F'
              ? 'Fail'
              : '-'}
          </button>
          <button
            type="button"
            onClick={() => onSupprimerValeur(valeur.id)}
            title="Supprimer ce contrôle"
            className="opacity-0 group-hover/val:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      )}
    </span>
  );

  const entete =
    'text-[8px] font-bold uppercase tracking-wider text-slate-400 leading-none';

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-1.5">
      {/* En-têtes des 3 mini-colonnes (alignés sur la grille des lignes) */}
      <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,7rem)] gap-1.5 px-0.5">
        <span className={entete}>OF</span>
        <span className={`${entete} text-center`}>Inspection</span>
        <span className="flex items-center justify-center gap-1">
          <span className={entete}>Date</span>
          <button
            type="button"
            onClick={(e) => setAncreHistorique(e.currentTarget)}
            title="Historique des inspections (Pass / Fail)"
            className="text-slate-400 hover:text-blue-600 focus:text-blue-600 transition-colors cursor-pointer"
          >
            <History className="w-3 h-3" />
          </button>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {groupes.map((ofIndex, gi) => {
          const inspections = valeursEtIndex.filter(
            ({ valeur }) =>
              valeur.type === 'I' && (valeur.ofIndex ?? 0) === ofIndex
          );
          const numOf = ofIndex + 1;
          // Le contrôle final à 100 % n'est possible qu'après un contrôle à 50 %
          // passé : il reste grisé tant qu'aucun I50% n'est en « Pass ».
          const inspections50 = inspections.filter(
            ({ valeur }) => (valeur.pct ?? 50) === 50
          );
          const i100Disponible =
            inspections50.some(({ valeur }) => valeur.resultat === 'P');
          // Le Carton Check n'est possible qu'une fois un contrôle à 100 % passé :
          // il reste grisé tant qu'aucun I 100 % n'est en « Pass ».
          const i100Passe = inspections.some(
            ({ valeur }) =>
              (valeur.pct ?? 50) === 100 && valeur.resultat === 'P'
          );

          return (
            <section
              key={ofIndex}
              className={gi > 0 ? 'border-t border-slate-100 pt-1' : ''}
            >
              {inspections.length === 0 ? (
                <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center h-5">
                  <button
                    type="button"
                    onClick={(e) => onOfClick?.(numOf, e.currentTarget)}
                    title={`Voir le détail de l'OF ${numOf}`}
                    className="text-left text-[11px] font-bold leading-none text-slate-700 hover:text-blue-600 hover:underline underline-offset-2 transition-colors cursor-pointer"
                  >
                    OF<span className="text-slate-500">{numOf}</span>
                  </button>
                  <span className="text-[10px] text-slate-400 italic select-none text-center">
                    Aucune inspection
                  </span>
                  <span />
                </div>
              ) : (
                inspections.map(({ valeur }, rang) => (
                  <div
                    key={valeur.id}
                    className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center min-h-5 group/val"
                  >
                    <span className="min-w-0">
                      {rang === 0 && (
                        <button
                          type="button"
                          onClick={(e) => onOfClick?.(numOf, e.currentTarget)}
                          title={`Voir le détail de l'OF ${numOf}`}
                          className="text-left text-[11px] font-bold leading-none text-slate-700 hover:text-blue-600 hover:underline underline-offset-2 transition-colors cursor-pointer"
                        >
                          OF<span className="text-slate-500">{numOf}</span>
                        </button>
                      )}
                    </span>

                    <span className="text-[11px] font-bold leading-none text-slate-700 truncate text-center">
                      I<sub className="text-[8px] font-semibold text-slate-500">{rang + 1}</sub>
                      <span className="text-slate-500"> {valeur.pct ?? 50}%</span>
                    </span>

                    {rendreActions(valeur)}
                  </div>
                ))
              )}

              {/* Ajout manuel d'un contrôle pour cet OF : 50 % ou 100 % */}
              <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center h-5">
                <span />
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => onAjouterValeur('I', 50, ofIndex)}
                    title={`Ajouter pour l'OF ${numOf} un contrôle à 50 %`}
                    className="flex items-center gap-0.5 h-4 px-1.5 rounded-md border border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 bg-white transition-colors"
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span className="text-[9px] font-bold uppercase whitespace-nowrap">
                      I 50 %
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onAjouterValeur('I', 100, ofIndex)}
                    disabled={!i100Disponible}
                    title={
                      i100Disponible
                        ? `Ajouter pour l'OF ${numOf} un contrôle à 100 %`
                        : 'Pas encore possible : ajoutez un contrôle à 50 % et passez-le en « Pass »'
                    }
                    className={`flex items-center gap-0.5 h-4 px-1.5 rounded-md border transition-colors ${
                      i100Disponible
                        ? 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 bg-white cursor-pointer'
                        : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span className="text-[9px] font-bold uppercase whitespace-nowrap">
                      I 100 %
                    </span>
                  </button>
                </div>
                <span />
              </div>

              {/* Carton Check de cet OF : suivi existant + bouton d'ajout. */}
              {valeursEtIndex
                .filter(
                  ({ valeur }) =>
                    valeur.type === 'CC' && (valeur.ofIndex ?? 0) === ofIndex
                )
                .map(({ valeur }) => (
                  <div
                    key={valeur.id}
                    className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center min-h-5 group/val"
                  >
                    <span />
                    <span className="text-[11px] font-bold leading-none text-slate-700 truncate text-center">
                      CC
                    </span>
                    {rendreActions(valeur)}
                  </div>
                ))}
              <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center h-5">
                <span />
                <div className="flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => onAjouterValeur('CC', undefined, ofIndex)}
                    disabled={!i100Passe}
                    title={
                      i100Passe
                        ? `Ajouter pour l'OF ${numOf} un contrôle Carton Check`
                        : 'Pas encore possible : ajoutez et passez un contrôle à 100 %'
                    }
                    className={`flex items-center gap-0.5 h-4 px-1.5 rounded-md border transition-colors ${
                      i100Passe
                        ? 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 bg-white cursor-pointer'
                        : 'border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <Plus className="w-2.5 h-2.5" />
                    <span className="text-[9px] font-bold uppercase whitespace-nowrap">
                      CC
                    </span>
                  </button>
                </div>
                <span />
              </div>
            </section>
          );
        })}
      </div>

      {/* Envoi en expédition : transfère le modèle de ce bloc vers la colonne
          Expédition et ouvre le suivi OF par OF. */}
      {onEnvoyerExpedition && (
        <button
          type="button"
          onClick={onEnvoyerExpedition}
          title={expeditionActive ? 'Suivre les OF en expédition' : 'Envoyer ce modèle en expédition'}
          className={`w-full inline-flex items-center justify-center gap-1.5 rounded-md border text-[11px] font-bold uppercase tracking-wide px-2 py-1.5 transition-colors cursor-pointer ${
            expeditionActive
              ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
              : 'border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400'
          }`}
        >
          <Truck className="w-4 h-4" />
          {expeditionActive ? 'En expédition' : 'Envoyer en expédition'}
        </button>
      )}

      {ancreHistorique && (
        <InspectionHistoriquePopover
          anchor={ancreHistorique}
          bloc={bloc}
          onClose={() => setAncreHistorique(null)}
        />
      )}
    </div>
  );
};