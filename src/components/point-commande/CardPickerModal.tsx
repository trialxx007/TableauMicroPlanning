import React, { useState } from 'react';
import { CardItem } from '@/src/types/card.ts';
import { ChaineSlotCard } from '@/src/types/suiviGlobal.ts';
import { Search, X, Check, Package, Trash2, Plus } from 'lucide-react';

interface CardPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CardItem[];
  currentSlot: ChaineSlotCard | null | undefined;
  slotTitle: string; // e.g., "Modèle en cours pour Glaïeul" or "Lancement #2 pour Pétunia" or "Expédition pour Tan"
  onSelectCard: (slotCard: ChaineSlotCard | null) => void;
  /** Ouvre le formulaire de création ; la carte créée ira occuper cette case. */
  onCreateNewCard?: () => void;
}

export const CardPickerModal: React.FC<CardPickerModalProps> = ({
  isOpen,
  onClose,
  cards,
  currentSlot,
  slotTitle,
  onSelectCard,
  onCreateNewCard,
}) => {
  const [search, setSearch] = useState('');

  if (!isOpen) return null;

  const filteredCards = cards.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.modele.toLowerCase().includes(q) ||
      c.batch.toLowerCase().includes(q) ||
      c.client.toLowerCase().includes(q)
    );
  });

  const handleChooseExistingCard = (card: CardItem) => {
    onSelectCard({
      cardId: card.id,
      customLabel: card.modele,
    });
    onClose();
  };

  const handleClearSlot = () => {
    onSelectCard(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span>Placer une carte : {slotTitle}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Sélectionnez une carte existante du Point Commande Journalière
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par modèle, référence, client..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Cards List from Point Commande Journalière */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-100">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Cartes du Point Commande ({filteredCards.length})</span>
            <span className="text-[11px] font-normal text-slate-400">
              Cliquez pour assigner
            </span>
          </div>

          {filteredCards.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Aucune carte ne correspond à votre recherche.
            </div>
          ) : (
            filteredCards.map((card) => {
              const isSelected = currentSlot?.cardId === card.id;

              return (
                <div
                  key={card.id}
                  onClick={() => handleChooseExistingCard(card)}
                  className={`pt-2.5 first:pt-0 p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300 shadow-xs'
                      : 'hover:bg-slate-50 border-transparent hover:border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                      {card.client.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                        <span>{card.modele}</span>
                        <span className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {card.batch}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>{card.client}</span>
                        <span>•</span>
                        <span>
                          Demandé : <strong>{card.quantiteDemandee}</strong> pcs
                        </span>
                        <span>•</span>
                        <span className="text-slate-600">
                          Reste : <strong>{card.resteAProduire}</strong> pcs
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        card.statut === 'TERMINE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : card.statut === 'EN_COURS'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : card.statut === 'BLOQUE'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {card.statut === 'TERMINE'
                        ? 'Terminé'
                        : card.statut === 'EN_COURS'
                        ? 'En cours'
                        : card.statut === 'BLOQUE'
                        ? 'Bloqué'
                        : 'En attente'}
                    </span>
                    {isSelected && (
                      <span className="p-1 rounded-full bg-blue-600 text-white">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          {onCreateNewCard ? (
            <button
              onClick={onCreateNewCard}
              className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter une nouvelle carte</span>
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {currentSlot && (
              <button
                onClick={handleClearSlot}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Vider la case</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-xs font-semibold px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
