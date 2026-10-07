import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { InspectionBloc, InspectionValeur } from '../types/suiviGlobal.ts';
import { aControle50, dateCourte, libelleValeur } from '../utils/inspections.ts';

interface InspectionCellProps {
  bloc: InspectionBloc;
  /** Ajoute une valeur : `OF`, ou `I` avec son indice 50 ou 100 (en %). */
  onAjouterValeur: (type: 'I' | 'OF', pct?: 50 | 100) => void;
  onSupprimerValeur: (valeurId: string) => void;
  /** Modification de la date de programmation d'une valeur. */
  onMajDate: (valeurId: string, date: string) => void;
  /** Clic sur le badge Pass/Fail : ouvre le menu d'état ancré dessous. */
  onBadgeClick: (valeurId: string, anchor: HTMLElement) => void;
  onCommentaire: (texte: string) => void;
}

/**
 * Cellule Inspection : deux mini colonnes de contrôles — OF à gauche, I à
 * droite (uniquement 50 % ou 100 %) — chacune avec sa date modifiable et son
 * badge Pass/Fail, puis un commentaire qui remplit tout le reste de la case
 * et s'adapte à la hauteur prise par les contrôles.
 */
export const InspectionCell: React.FC<InspectionCellProps> = ({
  onAjouterValeur,
  onSupprimerValeur,
  onMajDate,
  onBadgeClick,
  onCommentaire,
  bloc,
}) => {
  const [dateEnEdition, setDateEnEdition] = useState<string | null>(null);

  /** Une ligne de contrôle : indice, date, Pass/Fail, suppression. */
  const ligne = (valeur: InspectionValeur, index: number) => {
    const { prefixe, indice } = libelleValeur(bloc.valeurs, index);
    const enEdition = dateEnEdition === valeur.id;

    return (
      <div key={valeur.id} className="group/val flex items-center gap-1">
        <span className="shrink-0 text-[11px] font-bold leading-none text-slate-700">
          {prefixe}
          <sub className="text-[8px] font-semibold text-slate-500">{indice}</sub>
        </span>
        <span className="text-[10px] leading-none text-slate-400">:</span>

        {enEdition ? (
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
            aria-label={`Date du contrôle ${prefixe || valeur.type}`}
            className="flex-1 min-w-0 px-1 py-px text-[10px] text-slate-700 bg-white border border-blue-400 rounded focus:outline-none"
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setDateEnEdition(valeur.id)}
              title="Date de programmation — cliquer pour modifier"
              className="shrink-0 font-mono text-[10px] leading-none text-slate-600 hover:text-blue-600 transition-colors"
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
                  : 'Cliquer pour sélectionner Pass ou Fail'
              }
              className={`shrink-0 h-5 px-1.5 rounded text-[9px] font-black uppercase tracking-wide text-white transition-colors duration-200 ${
                valeur.resultat === 'P'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : valeur.resultat === 'F'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-slate-400 hover:bg-slate-500'
              }`}
            >
              {valeur.resultat === 'P' ? 'Pass' : valeur.resultat === 'F' ? 'Fail' : '—'}
            </button>

            <button
              type="button"
              onClick={() => onSupprimerValeur(valeur.id)}
              title="Supprimer ce contrôle"
              className="ml-auto shrink-0 opacity-0 group-hover/val:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity"
            >
              <X className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    );
  };

  const boutonAjout = (
    libelle: string,
    titre: string,
    onClick: () => void,
    desactive = false
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={desactive}
      title={titre}
      className={`flex items-center gap-px h-5 px-1 rounded-md border bg-white transition-colors ${
        desactive
          ? 'border-slate-200 text-slate-300 cursor-not-allowed'
          : 'border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600'
      }`}
    >
      <Plus className="w-3 h-3" />
      <span className="text-[9px] font-bold uppercase whitespace-nowrap">{libelle}</span>
    </button>
  );

  // Les OF forment la pile de gauche, les I celle de droite.
  const of = bloc.valeurs
    .map((valeur, index) => ({ valeur, index }))
    .filter(({ valeur }) => valeur.type === 'OF');
  const inspections = bloc.valeurs
    .map((valeur, index) => ({ valeur, index }))
    .filter(({ valeur }) => valeur.type === 'I');

  const controle50 = aControle50(bloc);

  return (
    <div className="flex flex-col gap-1.5 h-full">
      {/* Deux mini colonnes : OF à gauche, I (50 % / 100 %) à droite */}
      <div className="grid grid-cols-2 gap-1.5 items-start">
        <div className="flex flex-col gap-1 min-w-0">
          {of.map(({ valeur, index }) => ligne(valeur, index))}
          {boutonAjout('OF', 'Ajouter un ordre de fabrication', () =>
            onAjouterValeur('OF')
          )}
        </div>

        <div className="flex flex-col gap-1 min-w-0 pl-1.5 border-l border-slate-100">
          {inspections.map(({ valeur, index }) => ligne(valeur, index))}
          <div className="flex items-center gap-1">
            {boutonAjout('I 50 %', 'Ajouter un contrôle à 50 %', () =>
              onAjouterValeur('I', 50)
            )}
            {boutonAjout(
              'I 100 %',
              controle50
                ? 'Ajouter un contrôle à 100 %'
                : 'Un contrôle à 50 % est nécessaire avant le 100 %',
              () => onAjouterValeur('I', 100),
              !controle50
            )}
          </div>
        </div>
      </div>

      {/* Commentaire : remplit tout le vide restant sous les contrôles */}
      <textarea
        value={bloc.commentaire}
        onChange={(e) => onCommentaire(e.target.value)}
        placeholder="Commentaire..."
        aria-label="Commentaire d'inspection"
        className="flex-1 min-h-[52px] w-full resize-none text-[11px] leading-snug text-slate-700 bg-slate-50/70 border border-transparent hover:border-slate-300 rounded-md px-1.5 py-1 focus:bg-white focus:border-blue-400 focus:outline-hidden focus:ring-1 focus:ring-blue-400"
      />
    </div>
  );
};
