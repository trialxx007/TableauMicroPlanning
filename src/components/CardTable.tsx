import React, { useState } from 'react';
import { CardItem, CardStatus, JalonCode } from '../types/card.ts';
import { getJalonsCard, getEtatJalon, type JalonEtat } from '../utils/jalons.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { getSemaineISO } from '../utils/dateFrance.ts';
import {
  Check,
  X,
  Edit2,
  Trash2,
  Copy,
  CheckCheck,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';

/**
 * Traduit un choix de listbox en mise à jour de carte. Les trois états sont
 * distincts : « En attente » et « Validé » effacent la semaine, « Semaine » en exige
 * une (pré-remplie avec la semaine courante si le jalon n'en a pas encore).
 * Le tableau `jalons` remplace l'ensemble des états de la carte, donc on repart
 * de l'existant et on ne change que le code visé.
 */
function patchJalonEtat(card: CardItem, code: JalonCode, etat: JalonEtat): Partial<CardItem> {
  const courant = getEtatJalon(card, code);
  const valide = etat === 'VALIDE';
  const semaine = valide
    ? null
    : etat === 'SEMAINE'
    ? (courant.semaine ?? getSemaineISO())
    : null;

  return {
    jalons: [
      ...card.jalons.filter((j) => j.code !== code),
      { code, valide, ...(semaine != null ? { semaine } : {}) },
    ],
  };
}

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
  const catalogue = useJalonCatalogue();
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const [editingFinieId, setEditingFinieId] = useState<string | null>(null);
  const [inputFinieValue, setInputFinieValue] = useState<string>('');

  const handleCopyRef = (ref: string) => {
    navigator.clipboard.writeText(ref);
    setCopiedRef(ref);
    setTimeout(() => setCopiedRef(null), 1800);
  };

  // L'en-tête suit le catalogue : RDL garde sa colonne dédiée, les autres jalons
  // partagent une colonne dont le libellé est reconstruite à chaque changement.
  const enteteRDL = catalogue.find((j) => j.code === 'RDL');
  const jalonRDLPresent = Boolean(enteteRDL);
  const codeRDL = enteteRDL?.code ?? 'RDL';
  const enteteJalons = catalogue.filter((j) => j.code !== 'RDL');

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
              <th className="py-3.5 px-4">
                Référence
                {jalonRDLPresent && <span className="ml-1 font-normal normal-case">& {codeRDL}</span>}
              </th>
              <th className="py-3.5 px-4 text-center">
                <span className="inline-flex items-center gap-1">
                  {enteteJalons.length > 0
                    ? enteteJalons.map((j) => j.code).join(' / ')
                    : 'Jalons'}
                  <span
                    className="cursor-help text-slate-400 hover:text-slate-600"
                    title={
                      enteteJalons.length > 0
                        ? enteteJalons.map((j) => `${j.code}: ${j.libelle}`).join('\n')
                        : 'Aucun jalon de suivi dans le catalogue'
                    }
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
              const jalons = getJalonsCard(card, catalogue);
              // RDL a sa propre pastille dans la colonne « Référence », on l'exclut
              // donc de la colonne Jalons pour ne pas la montrer deux fois.
              const jRDL = jalons.find((j) => j.code === 'RDL');
              const autresJalons = jalons.filter((j) => j.code !== 'RDL');
              const detailRDL = jRDL
                ? `${jRDL.code} : ${
                    jRDL.etat === 'VALIDE'
                      ? 'Validé'
                      : jRDL.semaine != null
                      ? `En attente, attendu S${jRDL.semaine}${jRDL.enRetard ? ' — en retard' : ''}`
                      : 'En attente'
                  }`
                : '';
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

                    {/* Jalon de réunion (RDL) — compact au repos, liste box au survol.
                        Le bloc disparaît si le catalogue ne contient plus de jalon RDL. */}
                    {jRDL && (
                      <div className="mt-1">
                        <span className="group/j relative inline-grid" title={detailRDL}>
                          <span
                            className={`col-start-1 row-start-1 relative z-0 inline-flex items-center justify-center gap-1 min-w-[64px] px-1.5 py-0.5 rounded border text-[10px] font-semibold ${
                              jRDL.enRetard
                                ? 'bg-rose-600 text-white border-rose-700 motion-safe:animate-pulse'
                                : jRDL.etat === 'VALIDE'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            {jRDL.enRetard && <AlertTriangle className="w-3 h-3" />}
                            <span>
                              {jRDL.code}:{' '}
                              {jRDL.etat === 'VALIDE'
                                ? '✓'
                                : jRDL.etat === 'SEMAINE'
                                ? `S${jRDL.semaine}`
                                : '—'}
                            </span>
                          </span>
                          <select
                            value={jRDL.etat}
                            onChange={(e) =>
                              onUpdateCard(
                                card.id,
                                patchJalonEtat(card, jRDL.code, e.target.value as JalonEtat)
                              )
                            }
                            aria-label={`État du jalon ${jRDL.code}`}
                            title={detailRDL}
                            className={`col-start-1 row-start-1 relative z-10 w-full cursor-pointer rounded border px-1 text-[10px] font-semibold opacity-0 pointer-events-none group-hover/j:opacity-100 group-hover/j:pointer-events-auto focus:opacity-100 focus:pointer-events-auto ${
                              jRDL.enRetard
                                ? 'bg-rose-600 text-white border-rose-700'
                                : jRDL.etat === 'VALIDE'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : 'bg-amber-50 text-amber-800 border-amber-300'
                            }`}
                          >
                            <option value="EN_ATTENTE">En attente</option>
                            <option value="SEMAINE">Semaine</option>
                            <option value="VALIDE">Validé</option>
                          </select>
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Jalons de suivi — chaque code du catalogue a sa pastille */}
                  <td className="py-3.5 px-4 whitespace-nowrap text-center">
                    <div className="inline-flex flex-wrap gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200/60">
                      {autresJalons.map((j) => {
                        const colors = j.enRetard
                          ? 'bg-rose-600 text-white border-rose-700'
                          : j.etat === 'VALIDE'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-slate-200/60 text-slate-500 border border-transparent';
                        const marque =
                          j.etat === 'VALIDE' ? '✓' : j.etat === 'SEMAINE' ? `S${j.semaine}` : '—';
                        const detail = `${j.code} : ${
                          j.etat === 'VALIDE'
                            ? 'Validé'
                            : j.etat === 'SEMAINE'
                            ? `Semaine S${j.semaine}${j.enRetard ? ' — en retard' : ''}`
                            : 'En attente'
                        }`;

                        return (
                          <span
                            key={j.code}
                            className="group/j relative inline-grid shrink-0"
                            title={detail}
                          >
                            <span
                              className={`col-start-1 row-start-1 relative z-0 inline-flex items-center justify-center gap-0.5 min-w-[64px] px-1.5 py-0.5 rounded text-[11px] font-bold border ${colors} ${
                                j.enRetard ? 'motion-safe:animate-pulse' : ''
                              }`}
                            >
                              {j.enRetard && <AlertTriangle className="w-3 h-3" />}
                              <span>
                                {j.code}: {marque}
                              </span>
                            </span>
                            <select
                              value={j.etat}
                              onChange={(e) =>
                                onUpdateCard(
                                  card.id,
                                  patchJalonEtat(card, j.code, e.target.value as JalonEtat)
                                )
                              }
                              aria-label={`État du jalon ${j.code}`}
                              title={detail}
                              className={`col-start-1 row-start-1 relative z-10 w-full cursor-pointer rounded border px-1 text-[11px] font-bold opacity-0 pointer-events-none group-hover/j:opacity-100 group-hover/j:pointer-events-auto focus:opacity-100 focus:pointer-events-auto ${colors}`}
                            >
                              <option value="EN_ATTENTE">En attente</option>
                              <option value="SEMAINE">Semaine</option>
                              <option value="VALIDE">Validé</option>
                            </select>
                          </span>
                        );
                      })}
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
                      ) : (
                        <button
                          onClick={() =>
                            onUpdateCard(
                              card.id,
                              codeRDL
                                ? { okProd: true, ...patchJalonEtat(card, codeRDL, 'VALIDE') }
                                : { okProd: true }
                            )
                          }
                          title="Valider l'OK Prod durant la RDL pour débloquer la répartition des OFs dans la carte"
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer shadow-2xs"
                        >
                          <CheckCheck className="w-3.5 h-3.5 text-amber-600" />
                          <span>Valider OK Prod</span>
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
          {catalogue.map((j) => (
            <span key={j.code} className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  j.code === codeRDL ? 'bg-purple-500' : 'bg-emerald-500'
                }`}
              ></span>
              {j.code}: {j.libelle}
            </span>
          ))}
        </div>
        <div className="text-[11px] text-slate-500">
          💡 Cliquez sur le nom ou la référence d'un modèle pour <strong>ouvrir sa carte</strong>
        </div>
      </div>
    </div>
  );
};
