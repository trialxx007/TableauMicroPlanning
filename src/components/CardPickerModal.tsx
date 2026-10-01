import React, { useState } from 'react';
import { CardItem } from '../types/card.ts';
import { ChaineSlotCard } from '../types/suiviGlobal.ts';
import { Search, X, Check, Package, Sparkles, Plus, Trash2 } from 'lucide-react';

interface CardPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  cards: CardItem[];
  currentSlot: ChaineSlotCard | null | undefined;
  slotTitle: string; // e.g., "Modèle en cours pour Glaïeul" or "Lancement #2 pour Pétunia" or "Expédition pour Tan"
  isExpeditionSlot?: boolean;
  onSelectCard: (slotCard: ChaineSlotCard | null) => void;
}

export const CardPickerModal: React.FC<CardPickerModalProps> = ({
  isOpen,
  onClose,
  cards,
  currentSlot,
  slotTitle,
  isExpeditionSlot = false,
  onSelectCard,
}) => {
  const [search, setSearch] = useState('');
  const [customText, setCustomText] = useState(currentSlot?.customLabel || '');
  const [expeditionDate, setExpeditionDate] = useState(
    currentSlot?.dateExpedition ||
      new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
  );
  const [expeditionStatut, setExpeditionStatut] = useState<'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE'>(
    currentSlot?.statutExpedition || 'A_EXPEDIER'
  );

  if (!isOpen) return null;

  const filteredCards = cards.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.modele.toLowerCase().includes(q) ||
      c.reference.toLowerCase().includes(q) ||
      c.client.toLowerCase().includes(q) ||
      c.nom.toLowerCase().includes(q)
    );
  });

  const handleChooseExistingCard = (card: CardItem) => {
    onSelectCard({
      cardId: card.id,
      customLabel: card.modele,
      ...(isExpeditionSlot
        ? { dateExpedition: expeditionDate, statutExpedition: expeditionStatut }
        : {}),
    });
    onClose();
  };

  const handleApplyCustom = () => {
    if (!customText.trim()) {
      onSelectCard(null);
    } else {
      onSelectCard({
        customLabel: customText.trim(),
        ...(isExpeditionSlot
          ? { dateExpedition: expeditionDate, statutExpedition: expeditionStatut }
          : {}),
      });
    }
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
              Sélectionnez une carte existante du Point Commande Journalière ou saisissez un libellé
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Expedition settings if applicable */}
        <div className="p-4 border-b border-slate-100 bg-white space-y-3">
          {/* Expedition Specific Fields */}
          {isExpeditionSlot && (
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-blue-900">Date d'expédition :</span>
                <input
                  type="text"
                  value={expeditionDate}
                  onChange={(e) => setExpeditionDate(e.target.value)}
                  placeholder="JJ/MM/AAAA"
                  className="w-28 px-2 py-1 bg-white border border-blue-300 rounded font-mono text-center text-xs font-semibold focus:outline-hidden"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-blue-900">Statut :</span>
                <select
                  value={expeditionStatut}
                  onChange={(e) =>
                    setExpeditionStatut(
                      e.target.value as 'A_EXPEDIER' | 'EN_TRANSIT' | 'LIVRE'
                    )
                  }
                  className="px-2 py-1 bg-white border border-blue-300 rounded text-xs font-semibold focus:outline-hidden"
                >
                  <option value="A_EXPEDIER">À expédier</option>
                  <option value="EN_TRANSIT">En transit</option>
                  <option value="LIVRE">Livré au client</option>
                </select>
              </div>
            </div>
          )}

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
                          {card.reference}
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

        {/* Custom text option & Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
            <input
              type="text"
              placeholder="Ou saisie libre d'un autre modèle..."
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyCustom();
              }}
              className="text-xs px-3 py-1.5 bg-white border border-slate-300 rounded-lg flex-1 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleApplyCustom}
              className="text-xs font-semibold px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Appliquer
            </button>
          </div>

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
