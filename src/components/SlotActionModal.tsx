import React from 'react';
import { X, PlusCircle, ArrowLeftRight, Package, Sparkles } from 'lucide-react';

interface SlotActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotTitle: string;
  slotType: 'modeleEnCours' | 'lancement' | 'expedition';
  onChooseNewCard: () => void;
  onChooseExistingCard: () => void;
}

export const SlotActionModal: React.FC<SlotActionModalProps> = ({
  isOpen,
  onClose,
  slotTitle,
  slotType,
  onChooseNewCard,
  onChooseExistingCard,
}) => {
  if (!isOpen) return null;

  const isModeleEnCours = slotType === 'modeleEnCours';
  const isLancement = slotType === 'lancement';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">
                Remplir cette case
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {slotTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 bg-white">
          <p className="text-xs text-slate-600 font-medium">
            Que souhaitez-vous faire pour remplir cet emplacement ?
          </p>

          <button
            type="button"
            onClick={() => {
              onChooseNewCard();
            }}
            className="w-full text-left p-4 rounded-xl border-2 border-blue-200 hover:border-blue-600 bg-gradient-to-br from-blue-50/60 to-indigo-50/40 hover:from-blue-100/70 hover:to-indigo-100/50 transition-all cursor-pointer group shadow-2xs hover:shadow-md flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 group-hover:bg-blue-700 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors mt-0.5">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-slate-900 group-hover:text-blue-700">
                  Nouvelle Carte
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  Direct
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Cr&#233;er une nouvelle carte de commande et <strong>l'assigner directement</strong> dans cette case.
              </p>
              {isModeleEnCours && (
                <div className="text-[10px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-emerald-600" />
                  <span>Pr&#233;-configur&#233;e avec OK Prod valid&#233; pour lancement</span>
                </div>
              )}
              {isLancement && (
                <div className="text-[10px] text-amber-700 font-semibold mt-1 flex items-center gap-1">
                  <span>&#9203;&#65039; En attente validation OK Prod</span>
                </div>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onChooseExistingCard();
            }}
            className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-purple-500 bg-slate-50/70 hover:bg-purple-50/50 transition-all cursor-pointer group shadow-2xs hover:shadow-md flex items-start gap-3.5"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-600 group-hover:bg-purple-700 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors mt-0.5">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-slate-900 group-hover:text-purple-700">
                  R&#233;assigner une carte
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700">
                  Parcourir
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Choisir et r&#233;assigner une carte d&#233;j&#224; existante du Point Commande Journali&#232;re.
              </p>
            </div>
          </button>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
};