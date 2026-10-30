import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, History, Plus, Truck, X } from 'lucide-react';
import { InspectionBloc, InspectionValeur } from '@/src/types/suiviGlobal.ts';
import {
  dateCourte,
  getAvailableInspectionAdds,
  getCurrentInspectionStep,
  type InspectionAdd,
} from '@/src/utils/inspections.ts';
import { InspectionHistoriquePopover } from './InspectionHistoriquePopover.tsx';
import { useLectureSeule } from '@/src/context/ProfilContext.tsx';

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
  adds: InspectionAdd[];
  onAjouter: (type: 'I' | 'CC', pct?: 50 | 100) => void;
}> = ({ numOf, adds, onAjouter }) => {
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
    'flex items-center gap-1 w-full px-2 py-1 text-[10px] font-bold uppercase whitespace-nowrap text-left text-slate-600 transition-colors hover:bg-slate-100';

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
          {adds.map((add) => (
            <button
              key={`${add.type}-${add.pct ?? ''}`}
              type="button"
              onClick={() => {
                onAjouter(add.type, add.pct);
                setOuvert(false);
              }}
              className={item}
            >
              <Plus className="w-2.5 h-2.5" />
              {add.type === 'CC' ? 'CC' : `I ${add.pct} %`}
            </button>
          ))}
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
  const lectureSeule = useLectureSeule();
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

  /** Date column of a control (common to I and CC rows). */
  const rendreDate = (valeur: InspectionValeur) =>
    dateEnEdition === valeur.id ? (
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
        className="h-5 w-[92px] min-w-0 px-1 text-[10px] leading-none text-slate-700 bg-white border border-blue-400 rounded focus:outline-none"
      />
    ) : (
      <button
        type="button"
        onClick={lectureSeule ? undefined : () => setDateEnEdition(valeur.id)}
        title={lectureSeule ? "Date d'inspection" : "Date d'inspection — cliquer pour modifier"}
        className={`font-mono text-[10px] leading-none text-slate-600 transition-colors shrink-0 ${lectureSeule ? 'cursor-default' : 'hover:text-blue-600'}`}
      >
        {dateCourte(valeur.date)}
      </button>
    );

  /** Status badge and delete action of a control, kept in the 52px column. */
  const rendreStatut = (valeur: InspectionValeur) => (
    <>
      <button
        type="button"
        onClick={
          lectureSeule ? undefined : (e) => onBadgeClick(valeur.id, e.currentTarget)
        }
        title={
          lectureSeule
            ? 'État du contrôle'
            : valeur.resultat === 'P'
            ? 'Pass — cliquer pour changer'
            : valeur.resultat === 'F'
            ? 'Fail — cliquer pour changer'
            : 'Cliquer pour choisir Pass ou Fail'
        }
        className={
          (valeur.resultat === 'P' || valeur.resultat === 'F'
            ? badgeClasse(valeur)
            : 'h-5 shrink-0 min-w-9 px-1.5 rounded text-[12px] font-bold leading-none text-white bg-slate-400 inline-flex items-center justify-center') +
          (lectureSeule ? '' : ' transition-colors duration-200 hover:bg-slate-500')
        }
        disabled={lectureSeule}
      >
        {valeur.resultat === 'P'
          ? 'Pass'
          : valeur.resultat === 'F'
          ? 'Fail'
          : '-'}
      </button>
      {!lectureSeule && (
        <button
          type="button"
          onClick={() => onSupprimerValeur(valeur.id)}
          title="Supprimer ce contrôle"
          className="opacity-0 group-hover/val:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </>
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
          const currentStep = getCurrentInspectionStep(bloc, ofIndex);
          const currentRank =
            currentStep?.type === 'I'
              ? inspections.findIndex(
                  ({ valeur }) => valeur.id === currentStep.id
                ) + 1
              : 0;
          const adds = getAvailableInspectionAdds(bloc, ofIndex);
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
                  {!lectureSeule && adds.length > 0 && (
                    <AjouterMenu
                      numOf={numOf}
                      adds={adds}
                      onAjouter={(type, pct) =>
                        onAjouterValeur(type, pct, ofIndex)
                      }
                    />
                  )}
                  {/* Envoi en expédition (icône camion) : une seule fois, sur le 1er OF. */}
                  {gi === 0 && onEnvoyerExpedition && !lectureSeule && (
                    <button
                      type="button"
                      onClick={onEnvoyerExpedition}
                      title={
                        expeditionActive
                          ? "Désactiver l'expédition de ce modèle (données conservées)"
                          : 'Envoyer ce modèle en expédition'
                      }
                      aria-label={
                        expeditionActive
                          ? "Désactiver l'expédition de ce modèle (données conservées)"
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
              ) : currentStep ? (
                <div
                  key={currentStep.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_52px] items-center gap-2.5 min-h-9 group/val"
                >
                  <span className="text-[11px] font-bold leading-none text-slate-700 truncate">
                    {currentStep.type === 'CC' ? (
                      'CC'
                    ) : (
                      <>
                        I
                        <sub className="text-[8px] font-semibold text-slate-500">
                          {currentRank}
                        </sub>
                        <span className="text-slate-500">
                          {' '}
                          {currentStep.pct ?? 50}%
                        </span>
                      </>
                    )}
                  </span>
                  <span className="flex items-center justify-end">
                    {rendreDate(currentStep)}
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    {rendreStatut(currentStep)}
                  </span>
                </div>
              ) : (
                <div className="flex min-h-9 items-center gap-1.5 px-0.5 text-[10px] font-semibold text-emerald-700">
                  <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden="true" />
                  <span>Toutes les étapes sont terminées</span>
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
