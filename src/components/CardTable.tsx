import React, { useState } from 'react';
import { CardItem, CardStatus } from '../types/card.ts';
import {
  Check,
  X,
  Edit2,
  Trash2,
  Copy,
  CheckCheck,
  AlertCircle,
  HelpCircle,
  Lock,
} from 'lucide-react';

interface CardTableProps {
  cards: CardItem[];
  onUpdateCard: (id: string, updates: Partial<CardItem>) => Promise<void>;
  onEditCard: (card: CardItem) => void;
  onDeleteCard: (id: string) => Promise<void>;
  onOpenCreate: () => void;
}

export const CardTable: React.FC<CardTableProps> = ({
  cards,
  onUpdateCard,
  onEditCard,
  onDeleteCard,
  onOpenCreate,
}) => {
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [editingFinieId, setEditingFinieId] = useState<string | null>(null);
  const [inputFinieValue, setInputFinieValue] = useState<string>('');

  const handleCopyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1800);
  };

  const handleStartEditFinie = (card: CardItem) => {
    setEditingFinieId(card.id);
    setInputFinieValue(card.quantiteFinie.toString());
  };

  const handleSaveFinie = async (cardId: string) => {
    const val = parseInt(inputFinieValue, 10);
    if (!isNaN(val) && val >= 0) {
      await onUpdateCard(cardId, { quantiteFinie: val });
    }
    setEditingFinieId(null);
  };

  const handleQuickAdd = async (card: CardItem, amount: number) => {
    const newFinie = Math.min(card.quantiteDemandee, card.quantiteFinie + amount);
    await onUpdateCard(card.id, { quantiteFinie: newFinie });
  };

  const handleMarkComplete = async (card: CardItem) => {
    await onUpdateCard(card.id, {
      quantiteFinie: card.quantiteDemandee,
      statut: 'TERMINE',
    });
  };

  const getStatusBadge = (statut: CardStatus) => {
    switch (statut) {
      case 'TERMINE':
        return {
          label: 'Terminé',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
        };
      case 'EN_COURS':
        return {
          label: 'En cours',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          dot: 'bg-blue-500',
        };
      case 'BLOQUE':
        return {
          label: 'Bloqué',
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
        };
      case 'EN_ATTENTE':
      default:
        return {
          label: 'En attente',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          dot: 'bg-amber-500',
        };
    }
  };

  if (cards.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">
          Aucune carte ne correspond aux critères
        </h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
          Ajustez vos filtres de recherche ou ajoutez une nouvelle carte de commande au point journalier.
        </p>
        <button
          onClick={onOpenCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
        >
          Ajouter une carte
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1050px]">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
              <th className="py-3.5 px-4">Client</th>
              <th className="py-3.5 px-4">Modèle & Nom</th>
              <th className="py-3.5 px-4">Référence & RDL</th>
              <th className="py-3.5 px-4 text-center">
                <span className="inline-flex items-center gap-1">
                  DT / TC / SMS
                  <span
                    className="cursor-help text-slate-400 hover:text-slate-600"
                    title="DT: Dossier Technique | TC: Type Conforme | SMS: Sales Man's Sample"
                  >
                    <HelpCircle className="w-3 h-3" />
                  </span>
                </span>
              </th>
              <th className="py-3.5 px-4 text-center">
                <span className="inline-flex items-center gap-1">
                  OK Prod
                  <span
                    className="cursor-help text-slate-400 hover:text-slate-600"
                    title="Accord préalable OK Prod validé lors de la RDL"
                  >
                    <HelpCircle className="w-3 h-3" />
                  </span>
                </span>
              </th>
              <th className="py-3.5 px-4 text-right">Qté Demandée</th>
              <th className="py-3.5 px-4 text-center">Qté Finie (Point)</th>
              <th className="py-3.5 px-4 text-right">Reste à Produire</th>
              <th className="py-3.5 px-4 text-center min-w-[140px]">Avancement</th>
              <th className="py-3.5 px-4 text-center">Statut</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {cards.map((card) => {
              const statusInfo = getStatusBadge(card.statut);
              const progressPct =
                card.quantiteDemandee > 0
                  ? Math.min(
                      100,
                      Math.round((card.quantiteFinie / card.quantiteDemandee) * 100)
                    )
                  : 0;
              const isFinished = card.resteAProduire === 0;
              const ofCount = card.ofs?.length || 0;

              return (
                <tr
                  key={card.id}
                  className="hover:bg-slate-50/70 transition-colors group"
                >
                  {/* Client */}
                  <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-700">
                        {card.client.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800">{card.client}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {card.id}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Modèle & Nom */}
                  <td
                    onClick={() => onEditCard(card)}
                    className="py-3.5 px-4 max-w-[220px] cursor-pointer group/cell hover:bg-blue-50/60 transition-colors"
                    title="Cliquer pour ouvrir la carte et afficher toutes ses informations"
                  >
                    <div
                      className="font-semibold text-slate-900 group-hover/cell:text-blue-700 transition-colors truncate"
                      title={card.modele}
                    >
                      {card.modele}
                    </div>
                    <div
                      className="text-xs text-slate-500 group-hover/cell:text-blue-600 transition-colors truncate"
                      title={card.nom}
                    >
                      {card.nom}
                    </div>
                    {card.decisionReunion && (
                      <div
                        className="mt-1 text-[11px] font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/70 truncate"
                        title={`Décision réunion : ${card.decisionReunion}`}
                      >
                        📌 {card.decisionReunion}
                      </div>
                    )}
                  </td>

                  {/* Référence & RDL */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div
                      onClick={() => onEditCard(card)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100/90 hover:bg-blue-100 hover:text-blue-800 text-xs font-mono font-medium text-slate-700 transition-colors cursor-pointer"
                      title="Cliquer pour ouvrir la carte"
                    >
                      <span>{card.reference}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyRef(card.reference);
                        }}
                        title="Copier la référence"
                        className="p-0.5 hover:bg-slate-200/80 rounded transition-colors text-slate-400 hover:text-blue-700 cursor-pointer"
                      >
                        {copiedRef === card.reference ? (
                          <CheckCheck className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {/* Chaîne & Jalon RDL */}
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {card.chaineNom && (
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                            card.chaineCategorie === 'CONFECTION'
                              ? 'bg-sky-50 text-sky-800 border-sky-200'
                              : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                          title={`Chaîne de production : ${card.chaineNom}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
                          <span>Chaîne : {card.chaineNom}</span>
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => onUpdateCard(card.id, { rdl: !card.rdl })}
                        title={`RDL (Réunion De Lancement) : ${
                          card.rdl ? 'OF programmé en RDL' : 'OF à programmer en RDL'
                        } - Cliquer pour changer`}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-colors cursor-pointer inline-flex items-center gap-1 ${
                          card.rdl
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            card.rdl ? 'bg-purple-600' : 'bg-amber-500 animate-pulse'
                          }`}
                        />
                        <span>{card.rdl ? 'RDL Programmé' : 'À programmer RDL'}</span>
                      </button>
                    </div>
                  </td>

                  {/* DT / TC / SMS */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-center">
                    <div className="inline-flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200/60">
                      {/* DT */}
                      <button
                        onClick={() => onUpdateCard(card.id, { dt: !card.dt })}
                        title={`DT (Dossier Technique): ${card.dt ? 'Validé' : 'Non validé'}`}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          card.dt
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-200/60 text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {card.dt ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        <span>DT</span>
                      </button>

                      {/* TC */}
                      <button
                        onClick={() => onUpdateCard(card.id, { tc: !card.tc })}
                        title={`TC (Type Conforme): ${card.tc ? 'Validé' : 'Non validé'}`}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          card.tc
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-slate-200/60 text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {card.tc ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        <span>TC</span>
                      </button>

                      {/* SMS */}
                      <button
                        onClick={() => onUpdateCard(card.id, { sms: !card.sms })}
                        title={`SMS (Sales Man's Sample): ${card.sms ? 'Validé' : 'Non validé'}`}
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-bold transition-all cursor-pointer ${
                          card.sms
                            ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                            : 'bg-slate-200/60 text-slate-400 hover:text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {card.sms ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        <span>SMS</span>
                      </button>
                    </div>
                  </td>

                  {/* OK Prod */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-center">
                    <div className="flex flex-col items-center gap-1">
                      {card.okProd ? (
                        <>
                          <button
                            onClick={() => onUpdateCard(card.id, { okProd: false })}
                            title="OK Prod validé en RDL - Cliquer pour révoquer"
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                            <span>OK Prod Validé ✓</span>
                          </button>
                          <button
                            onClick={() => onEditCard(card)}
                            className="text-[11px] font-semibold text-purple-700 hover:text-purple-900 hover:underline cursor-pointer"
                            title="Ouvrir la carte pour voir et gérer la répartition des OFs"
                          >
                            {ofCount > 0 ? `${ofCount} OF dans la carte` : 'Gérer les OF'}
                          </button>
                        </>
                      ) : card.dt && card.tc && card.sms && card.rdl ? (
                        <button
                          onClick={() => onUpdateCard(card.id, { okProd: true })}
                          title="Les 4 jalons DT, TC, SMS et RDL sont validés ! Cliquer pour valider l'OK Prod (la carte glissera automatiquement en Modèle en cours)"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-700 transition-colors cursor-pointer shadow-2xs animate-pulse"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Valider OK Prod</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onEditCard(card)}
                          title="DT, TC, SMS et RDL doivent être tous les 4 cochés avant de pouvoir valider l'accord OK Prod"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
                        >
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>Attente DT/TC/SMS/RDL</span>
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Qté Demandée */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <span className="font-semibold text-slate-900 text-sm">
                      {card.quantiteDemandee.toLocaleString('fr-FR')}
                    </span>
                  </td>

                  {/* Qté Finie (Point journalier) */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    {editingFinieId === card.id ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max={card.quantiteDemandee}
                          value={inputFinieValue}
                          onChange={(e) => setInputFinieValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveFinie(card.id);
                            if (e.key === 'Escape') setEditingFinieId(null);
                          }}
                          autoFocus
                          className="w-16 px-1.5 py-0.5 text-xs text-center border border-blue-500 rounded font-bold text-slate-900 focus:outline-hidden"
                        />
                        <button
                          onClick={() => handleSaveFinie(card.id)}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Valider"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        </button>
                        <button
                          onClick={() => setEditingFinieId(null)}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                          title="Annuler"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleStartEditFinie(card)}
                          className="font-bold text-slate-900 hover:text-blue-600 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer text-sm"
                          title="Cliquer pour saisir la quantité finie"
                        >
                          {card.quantiteFinie.toLocaleString('fr-FR')}
                        </button>

                        {!isFinished && (
                          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleQuickAdd(card, 10)}
                              className="px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer"
                              title="+10 pièces au point journalier"
                            >
                              +10
                            </button>
                            <button
                              onClick={() => handleMarkComplete(card)}
                              className="px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                              title="Marquer toute la carte comme terminée"
                            >
                              Max
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Reste à Produire */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    {isFinished ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <Check className="w-3 h-3 stroke-[3]" />
                        Soldé (0)
                      </span>
                    ) : (
                      <span className="font-bold text-amber-700 text-sm">
                        {card.resteAProduire.toLocaleString('fr-FR')}
                      </span>
                    )}
                  </td>

                  {/* Avancement */}
                  <td className="py-3.5 px-4">
                    <div className="w-full min-w-[130px]">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">{progressPct}%</span>
                        <span className="text-[11px] text-slate-400">
                          {card.quantiteFinie}/{card.quantiteDemandee}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${
                            isFinished
                              ? 'bg-emerald-500'
                              : progressPct > 50
                              ? 'bg-blue-600'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Statut & Point Réunion */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <div className="flex flex-col items-center gap-1">
                      <select
                        value={card.statut}
                        onChange={(e) =>
                          onUpdateCard(card.id, {
                            statut: e.target.value as CardStatus,
                          })
                        }
                        className={`text-xs font-semibold rounded-lg px-2.5 py-1 border transition-colors cursor-pointer ${statusInfo.bg}`}
                        title="Modifier le statut de la carte lors de la réunion"
                      >
                        <option value="EN_COURS">En cours</option>
                        <option value="EN_ATTENTE">En attente</option>
                        <option value="TERMINE">Terminé</option>
                        <option value="BLOQUE">Bloqué (Alerte)</option>
                      </select>

                      <div className="text-[10px] flex items-center gap-1 font-mono">
                        {card.pointFaitAujourdhui ? (
                          <span
                            className="text-emerald-700 font-medium flex items-center gap-1"
                            title={`Revue en réunion aujourd'hui à ${card.heureDernierPoint || ''}`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                            {card.heureDernierPoint ? `${card.heureDernierPoint}` : 'Revu'}
                          </span>
                        ) : (
                          <span
                            className="text-amber-600 font-medium flex items-center gap-1"
                            title="Carte en attente d'arbitrage en réunion"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block animate-pulse"></span>
                            À pointer
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onEditCard(card)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                        title="Ouvrir la carte (répartition des OF, détails...)"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDeleteCard(card.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        title="Supprimer la carte"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer of the table */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span>
            Affichage de <strong>{cards.length}</strong> carte(s)
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 font-semibold text-emerald-700">
            <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
            OK Prod: Accord préalable de lancement
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            DT: Dossier Technique
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
            TC: Type Conforme
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block"></span>
            SMS: Sales Man's Sample
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>
            RDL: Réunion De Lancement
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          💡 Cliquez sur le nom ou la référence d'un modèle pour <strong>ouvrir sa carte</strong>
        </div>
      </div>
    </div>
  );
};
