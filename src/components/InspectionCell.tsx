import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, History, Plus, Truck, X } from 'lucide-react';
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

/** Menu déroulant « + Ajouter » regroupant les contrôles disponibles pour un OF. */
const AjouterMenu: React.FC<{
  numOf: number;
  i100Disponible: boolean;
  i100Passe: boolean;
  onAjouterI50: () => void;
  onAjouterI100: () => void;
  onAjouterCC: () => void;
}> = ({
  numOf,
  i100Disponible,
  i100Passe,
  onAjouterI50,
  onAjouterI100,
  onAjouterCC,
}) => {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, [ouvert]);

  const item =
    'flex items-center gap-1 w-full px-2 py-1 text-[10px] font-bold uppercase whitespace-nowrap text-left transition-colors';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        title={`Ajouter un contrôle à l'OF ${numOf}`}
        className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-md border border-slate-300 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors cursor-pointer"
      >
        <Plus className="w-3 h-3" />
        <span className="text-[9px] font-bold uppercase">Ajouter</span>
        <ChevronDown
          className={`w-2.5 h-2.5 transition-transform ${ouvert ? 'rotate-180' : ''}`}
        />
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full mt-0.5 z-30 min-w-[7rem] bg-white border border-slate-300 rounded-lg shadow-lg py-0.5">
          <button
            type="button"
            onClick={() => {
              onAjouterI50();
              setOuvert(false);
            }}
            className={`${item} text-slate-600 hover:bg-slate-100`}
          >
            <Plus className="w-2.5 h-2.5" />
            I 50 %
          </button>
          <button
            type="button"
            disabled={!i100Disponible}
            onClick={() => {
              onAjouterI100();
              setOuvert(false);
            }}
            title={
              i100Disponible
                ? `Ajouter pour l'OF ${numOf} un contrôle à 100 %`
                : 'Pas encore possible : ajoutez un contrôle à 50 % et passez-le en « Pass »'
            }
            className={`${item} ${
              i100Disponible
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <Plus className="w-2.5 h-2.5" />
            I 100 %
          </button>
          <button
            type="button"
            disabled={!i100Passe}
            onClick={() => {
              onAjouterCC();
              setOuvert(false);
            }}
            title={
              i100Passe
                ? `Ajouter pour l'OF ${numOf} un contrôle Carton Check`
                : 'Pas encore possible : ajoutez et passez un contrôle à 100 %'
            }
            className={`${item} ${
              i100Passe
                ? 'text-slate-600 hover:bg-slate-100'
                : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <Plus className="w-2.5 h-2.5" />
            CC
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Cellule Inspection : un bloc par OF (OF1, OF2…) avec un en-tête « OFx » et un
 * menu « + Ajouter ▾ ». Chaque ligne d'inspection affiche le contrôle
 * (I1 50 %, I2 100 %, CC…), sa date et son état Pass/Fail. Le bouton d'envoi en
 * expédition (icône camion) est placé à côté du menu du premier OF.
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

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col gap-1.5">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
        {groupes.map((ofIndex, gi) => {
          const inspections = valeursEtIndex.filter(
            ({ valeur }) =>
              valeur.type === 'I' && (valeur.ofIndex ?? 0) === ofIndex
          );
          const cartons = valeursEtIndex.filter(
            ({ valeur }) =>
              valeur.type === 'CC' && (valeur.ofIndex ?? 0) === ofIndex
          );
          const numOf = ofIndex + 1;
          // Le contrôle final à 100 % n'est possible qu'après un contrôle à 50 %
          // passé : il reste grisé tant qu'aucun I50% n'est en « Pass ».
          const inspections50 = inspections.filter(
            ({ valeur }) => (valeur.pct ?? 50) === 50
          );
          const i50Passe = inspections50.some(
            ({ valeur }) => valeur.resultat === 'P'
          );
          const i100Disponible = i50Passe;
          // Le Carton Check n'est possible qu'une fois un contrôle à 100 % passé :
          // il reste grisé tant qu'aucun I 100 % n'est en « Pass ».
          const i100Passe = inspections.some(
            ({ valeur }) =>
              (valeur.pct ?? 50) === 100 && valeur.resultat === 'P'
          );
          const vide = inspections.length === 0 && cartons.length === 0;

          return (
            <section key={ofIndex} className="flex flex-col min-w-0">
              {/* En-tête de l'OF : libellé + actions (expédition, ajout). */}
              <div className="flex items-center justify-between gap-1 px-0.5">
                <button
                  type="button"
                  onClick={(e) => onOfClick?.(numOf, e.currentTarget)}
                  title={`Voir le détail de l'OF ${numOf}`}
                  className="text-left text-[11px] font-bold leading-none text-slate-700 hover:text-blue-600 hover:underline underline-offset-2 transition-colors cursor-pointer"
                >
                  OF<span className="text-slate-500">{numOf}</span>
                </button>

                <div className="flex items-center gap-1">
                  {gi === 0 && (
                    <button
                      type="button"
                      onClick={(e) => setAncreHistorique(e.currentTarget)}
                      title="Historique des inspections (Pass / Fail)"
                      className="inline-flex items-center justify-center h-5 w-5 rounded-md text-slate-400 hover:text-blue-600 focus:text-blue-600 transition-colors cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <AjouterMenu
                    numOf={numOf}
                    i100Disponible={i100Disponible}
                    i100Passe={i100Passe}
                    onAjouterI50={() => onAjouterValeur('I', 50, ofIndex)}
                    onAjouterI100={() => onAjouterValeur('I', 100, ofIndex)}
                    onAjouterCC={() => onAjouterValeur('CC', undefined, ofIndex)}
                  />
                  {/* Envoi en expédition (icône camion) : une seule fois, sur le 1er OF. */}
                  {gi === 0 && onEnvoyerExpedition && (
                    <button
                      type="button"
                      onClick={onEnvoyerExpedition}
                      title={
                        expeditionActive
                          ? "Désactiver l'expédition de ce modèle"
                          : 'Envoyer ce modèle en expédition'
                      }
                      aria-label={
                        expeditionActive
                          ? "Désactiver l'expédition de ce modèle"
                          : 'Envoyer ce modèle en expédition'
                      }
                      className={`inline-flex items-center justify-center h-5 w-5 rounded-md border transition-colors cursor-pointer ${
                        expeditionActive
                          ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400'
                      }`}
                    >
                      <Truck className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 my-0.5" />

              {vide ? (
                <span className="text-[10px] text-slate-400 italic select-none py-0.5 text-center">
                  Aucune inspection
                </span>
              ) : (
                <div className="flex flex-col">
                  {inspections.map(({ valeur }, rang) => (
                    <div
                      key={valeur.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center min-h-5 group/val"
                    >
                      <span className="text-[11px] font-bold leading-none text-slate-700 truncate">
                        I<sub className="text-[8px] font-semibold text-slate-500">{rang + 1}</sub>
                        <span className="text-slate-500"> {valeur.pct ?? 50}%</span>
                      </span>
                      {rendreActions(valeur)}
                    </div>
                  ))}
                  {cartons.map(({ valeur }) => (
                    <div
                      key={valeur.id}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,7rem)] gap-1.5 items-center min-h-5 group/val"
                    >
                      <span className="text-[11px] font-bold leading-none text-slate-700 truncate">
                        CC
                      </span>
                      {rendreActions(valeur)}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

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
