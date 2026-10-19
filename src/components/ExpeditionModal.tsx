import React from 'react';
import { Truck, X, Package } from 'lucide-react';
import { CardItem } from '../types/card.ts';
import {
  ChaineSlotCard,
  ExpeditionOF,
  STATUTS_EXPEDITION,
  StatutExpedition,
} from '../types/suiviGlobal.ts';

interface ExpeditionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Carte (modèle) déposée dans la case Expédition. */
  card: CardItem;
  /** Ligne et carte ciblées par la mise à jour. */
  slotCard: ChaineSlotCard;
  onChange: (expeditionOfs: ExpeditionOF[]) => void;
}

const couleurStatut = (statut: StatutExpedition | undefined) =>
  statut === 'LIVRE'
    ? 'bg-emerald-600 text-white border-emerald-600'
    : statut === 'EN_TRANSIT'
    ? 'bg-amber-500 text-white border-amber-500'
    : 'bg-slate-100 text-slate-600 border-slate-300';

/**
 * Expédition OF par OF : on liste les OF du modèle déposé dans la case
 * Expédition et on marque chacun comme expédié au fur et à mesure, avec sa
 * propre date et son statut.
 */
export const ExpeditionModal: React.FC<ExpeditionModalProps> = ({
  isOpen,
  onClose,
  card,
  slotCard,
  onChange,
}) => {
  if (!isOpen) return null;

  const expeditionOfs = slotCard.expeditionOfs ?? [];
  const ofs = card.ofs ?? [];
  const pourIndex = (i: number) => expeditionOfs.find((e) => e.ofIndex === i);

  const maj = (i: number, patch: Partial<ExpeditionOF>) => {
    const existant = pourIndex(i);
    const base: ExpeditionOF = existant ?? { ofIndex: i, statutExpedition: 'A_EXPEDIER' };
    const suivant = { ...base, ...patch };
    const autres = expeditionOfs.filter((e) => e.ofIndex !== i);
    onChange([...autres, suivant].sort((a, b) => a.ofIndex - b.ofIndex));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="truncate">Expédition — {card.modele}</span>
              </h3>
              <p className="text-xs text-slate-500 font-medium truncate">
                {card.batch} • {card.client}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <p className="text-xs text-slate-600 font-medium mb-3 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            Marquez chaque OF au fur et à mesure de son envoi.
          </p>

          {ofs.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-xs italic">
              Aucun OF sur cette carte.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {ofs.map((of, i) => {
                const ligne = pourIndex(i);
                const statut = ligne?.statutExpedition ?? 'A_EXPEDIER';
                return (
                  <li
                    key={of.id}
                    className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/60"
                  >
                    <span className="shrink-0 w-12 text-[11px] font-bold text-slate-700">
                      OF{i + 1}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {of.codeOF}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {of.quantiteFinie}/{of.quantiteDemandee} pcs
                    </span>

                    <div className="ml-auto flex items-center gap-2">
                      <select
                        value={statut}
                        onChange={(e) =>
                          maj(i, { statutExpedition: e.target.value as StatutExpedition })
                        }
                        className={`text-[11px] font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-hidden ${couleurStatut(
                          statut
                        )}`}
                      >
                        {STATUTS_EXPEDITION.map((s) => (
                          <option key={s.code} value={s.code} className="text-slate-800 bg-white">
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        value={ligne?.dateExpedition ?? ''}
                        onChange={(e) => maj(i, { dateExpedition: e.target.value })}
                        className="text-[11px] font-bold px-2 py-1 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer"
          >
            Terminer
          </button>
        </div>
      </div>
    </div>
  );
};
