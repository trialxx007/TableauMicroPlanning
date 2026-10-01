import React, { useState } from 'react';
import { OrdreFabrication, CardStatus, OFType } from '../types/card.ts';
import {
  Building2,
  Handshake,
  Plus,
  Trash2,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from 'lucide-react';

interface OFSubTableProps {
  cardId: string;
  totalDemandee: number;
  ofs: OrdreFabrication[];
  onUpdateOFs: (newOfs: OrdreFabrication[]) => void;
}

export const OFSubTable: React.FC<OFSubTableProps> = ({
  totalDemandee,
  ofs,
  onUpdateOFs,
}) => {
  const [isAddingOF, setIsAddingOF] = useState(false);
  const [newType, setNewType] = useState<OFType>('SOUS_TRAITANCE');
  const [newNomExecutant, setNewNomExecutant] = useState('');
  const [newQuantite, setNewQuantite] = useState<number>(50);

  const totalAlloue = ofs.reduce((sum, o) => sum + o.quantiteDemandee, 0);
  const soldeNonAlloue = Math.max(0, totalDemandee - totalAlloue);

  const getStatusBadge = (statut: CardStatus) => {
    switch (statut) {
      case 'TERMINE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'EN_COURS':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'BLOQUE':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'EN_ATTENTE':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-300';
    }
  };

  const handleUpdateSingleOF = (
    ofId: string,
    updates: Partial<OrdreFabrication>
  ) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const updated = { ...o, ...updates };
      const qteDemandee =
        updates.quantiteDemandee !== undefined
          ? Number(updates.quantiteDemandee)
          : o.quantiteDemandee;
      const qteFinie =
        updates.quantiteFinie !== undefined
          ? Number(updates.quantiteFinie)
          : o.quantiteFinie;
      updated.quantiteDemandee = qteDemandee;
      updated.quantiteFinie = qteFinie;
      updated.resteAProduire = Math.max(0, qteDemandee - qteFinie);

      // Auto update status if completed
      if (updates.quantiteFinie !== undefined && updates.statut === undefined) {
        if (qteFinie >= qteDemandee && qteDemandee > 0) {
          updated.statut = 'TERMINE';
        } else if (qteFinie > 0 && o.statut === 'EN_ATTENTE') {
          updated.statut = 'EN_COURS';
        }
      }
      return updated;
    });

    onUpdateOFs(nextOfs);
  };

  const handleDeleteOF = (ofId: string) => {
    const nextOfs = ofs.filter((o) => o.id !== ofId);
    // Re-index codeOF and ordreRDL
    const reindexed = nextOfs.map((o, idx) => ({
      ...o,
      codeOF: `OF${idx + 1}`,
      ordreRDL: idx + 1,
    }));
    onUpdateOFs(reindexed);
  };

  const handleMoveOrder = (index: number, direction: 'UP' | 'DOWN') => {
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ofs.length) return;

    const copy = [...ofs];
    const temp = copy[index];
    copy[index] = copy[targetIndex];
    copy[targetIndex] = temp;

    // Re-assign ordreRDL and codeOF based on RDL order
    const updated = copy.map((o, idx) => ({
      ...o,
      codeOF: `OF${idx + 1}`,
      ordreRDL: idx + 1,
    }));

    onUpdateOFs(updated);
  };

  const handleCreateOF = (e: React.FormEvent) => {
    e.preventDefault();
    const nextIndex = ofs.length + 1;
    const newOF: OrdreFabrication = {
      id: `OF-${Date.now().toString().slice(-5)}`,
      codeOF: `OF${nextIndex}`,
      ordreRDL: nextIndex,
      type: newType,
      nomExecutant:
        newType === 'INTERNE'
          ? 'Atelier Interne (Entreprise)'
          : newNomExecutant.trim() || `Sous-traitant #${nextIndex}`,
      quantiteDemandee: Number(newQuantite),
      quantiteFinie: 0,
      resteAProduire: Number(newQuantite),
      statut: 'EN_ATTENTE',
    };

    onUpdateOFs([...ofs, newOF]);
    setIsAddingOF(false);
    setNewNomExecutant('');
    setNewQuantite(Math.max(10, soldeNonAlloue - newQuantite));
  };

  return (
    <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200 mt-2 space-y-3">
      {/* Header bar of OF subdivision */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-600"></span>
            Ordres de Fabrication (OF) après OK Prod
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
            Ordre déterminé en RDL
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="text-slate-600">
            Total commande : <strong>{totalDemandee}</strong> pièces | Alloué aux OF :{' '}
            <strong className={totalAlloue === totalDemandee ? 'text-emerald-700' : 'text-blue-700'}>
              {totalAlloue}
            </strong>
            {soldeNonAlloue > 0 && (
              <span className="ml-1 text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                ({soldeNonAlloue} reste à allouer)
              </span>
            )}
          </div>

          {!isAddingOF && (
            <button
              onClick={() => {
                setIsAddingOF(true);
                setNewQuantite(soldeNonAlloue > 0 ? soldeNonAlloue : 50);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-white hover:bg-blue-50 border border-blue-200 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter un OF (Interne / Sous-traitant)</span>
            </button>
          )}
        </div>
      </div>

      {/* Form to add an OF */}
      {isAddingOF && (
        <form
          onSubmit={handleCreateOF}
          className="bg-white p-3 rounded-lg border border-blue-200 shadow-xs space-y-3 animate-in fade-in"
        >
          <div className="text-xs font-bold text-blue-900 flex items-center justify-between">
            <span>Nouvel Ordre de Fabrication (Découpage RDL)</span>
            <button
              type="button"
              onClick={() => setIsAddingOF(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              Annuler
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Type d'exécution
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as OFType)}
                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 cursor-pointer"
              >
                <option value="INTERNE">Atelier Interne (Entreprise)</option>
                <option value="SOUS_TRAITANCE">Sous-traitant (Extérieur)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                {newType === 'INTERNE' ? 'Exécutant' : 'Nom du sous-traitant'}
              </label>
              {newType === 'INTERNE' ? (
                <input
                  type="text"
                  disabled
                  value="Atelier Interne (Entreprise)"
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-100 text-slate-600"
                />
              ) : (
                <input
                  type="text"
                  required
                  placeholder="ex: Sous-traitant Duval Confection, Atelier Broderie Marigny..."
                  value={newNomExecutant}
                  onChange={(e) => setNewNomExecutant(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                />
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Quantité confiée
              </label>
              <input
                type="number"
                min="1"
                required
                value={newQuantite}
                onChange={(e) => setNewQuantite(Number(e.target.value))}
                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingOF(false)}
              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer shadow-2xs"
            >
              Enregistrer l'OF
            </button>
          </div>
        </form>
      )}

      {/* Table of OFs */}
      {ofs.length === 0 ? (
        <div className="text-center py-4 bg-white rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">
          Aucun OF n'a encore été créé pour cette carte. Cliquez sur "Ajouter un OF" pour ventiler
          la production entre l'atelier interne et les sous-traitants.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 font-semibold text-slate-600">
                <th className="py-2.5 px-3">Ordre RDL</th>
                <th className="py-2.5 px-3">Code OF</th>
                <th className="py-2.5 px-3">Type & Exécutant</th>
                <th className="py-2.5 px-3 text-right">Qté Demandée</th>
                <th className="py-2.5 px-3 text-center min-w-[160px]">Point Journalier (Qté Finie)</th>
                <th className="py-2.5 px-3 text-right">Reste</th>
                <th className="py-2.5 px-3 text-center">Statut OF</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ofs.map((ofItem, index) => {
                const progress =
                  ofItem.quantiteDemandee > 0
                    ? Math.min(
                        100,
                        Math.round(
                          (ofItem.quantiteFinie / ofItem.quantiteDemandee) * 100
                        )
                      )
                    : 0;

                return (
                  <tr key={ofItem.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Ordre RDL */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[11px] border border-purple-200">
                          #{ofItem.ordreRDL}
                        </span>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveOrder(index, 'UP')}
                            title="Monter dans l'ordre de passage RDL"
                            className="text-slate-400 hover:text-purple-700 disabled:opacity-20 cursor-pointer text-[10px]"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={index === ofs.length - 1}
                            onClick={() => handleMoveOrder(index, 'DOWN')}
                            title="Descendre dans l'ordre de passage RDL"
                            className="text-slate-400 hover:text-purple-700 disabled:opacity-20 cursor-pointer text-[10px]"
                          >
                            ▼
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* Code OF */}
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {ofItem.codeOF}
                    </td>

                    {/* Type & Exécutant */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        {ofItem.type === 'INTERNE' ? (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200"
                            title="Traité par l'atelier de l'entreprise"
                          >
                            <Building2 className="w-3 h-3 text-blue-600" />
                            Interne
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200"
                            title="Traité en dehors de l'entreprise par un sous-traitant"
                          >
                            <Handshake className="w-3 h-3 text-indigo-600" />
                            Sous-traitant
                          </span>
                        )}
                        <span className="font-semibold text-slate-800 truncate max-w-[200px]" title={ofItem.nomExecutant}>
                          {ofItem.nomExecutant}
                        </span>
                      </div>
                    </td>

                    {/* Qté Demandée */}
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                      {ofItem.quantiteDemandee.toLocaleString('fr-FR')}
                    </td>

                    {/* Point Fini */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateSingleOF(ofItem.id, {
                              quantiteFinie: Math.max(0, ofItem.quantiteFinie - 5),
                            })
                          }
                          className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                          title="-5 pièces"
                        >
                          -
                        </button>

                        <input
                          type="number"
                          min="0"
                          max={ofItem.quantiteDemandee}
                          value={ofItem.quantiteFinie}
                          onChange={(e) =>
                            handleUpdateSingleOF(ofItem.id, {
                              quantiteFinie: Math.min(
                                ofItem.quantiteDemandee,
                                Math.max(0, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-14 text-center font-bold text-slate-900 border border-slate-200 rounded py-0.5 px-1 bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />

                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateSingleOF(ofItem.id, {
                              quantiteFinie: Math.min(
                                ofItem.quantiteDemandee,
                                ofItem.quantiteFinie + 5
                              ),
                            })
                          }
                          className="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
                          title="+5 pièces"
                        >
                          +
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateSingleOF(ofItem.id, {
                              quantiteFinie: ofItem.quantiteDemandee,
                            })
                          }
                          title="Marquer l'OF comme 100% terminé"
                          className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded border border-emerald-200 cursor-pointer"
                        >
                          Max
                        </button>
                      </div>

                      {/* Micro progress bar */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </td>

                    {/* Reste à produire */}
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                      {ofItem.resteAProduire === 0 ? (
                        <span className="text-emerald-600 font-bold">Terminé ✓</span>
                      ) : (
                        `${ofItem.resteAProduire.toLocaleString('fr-FR')}`
                      )}
                    </td>

                    {/* Statut OF */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <select
                        value={ofItem.statut}
                        onChange={(e) =>
                          handleUpdateSingleOF(ofItem.id, {
                            statut: e.target.value as CardStatus,
                          })
                        }
                        className={`text-[11px] font-semibold rounded px-2 py-0.5 border cursor-pointer ${getStatusBadge(
                          ofItem.statut
                        )}`}
                      >
                        <option value="EN_COURS">En cours</option>
                        <option value="EN_ATTENTE">En attente</option>
                        <option value="TERMINE">Terminé</option>
                        <option value="BLOQUE">Bloqué</option>
                      </select>
                    </td>

                    {/* Action supprimer */}
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteOF(ofItem.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                        title="Supprimer cet OF"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
