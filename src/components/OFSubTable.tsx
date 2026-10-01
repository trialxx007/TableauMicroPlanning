import React, { useState } from 'react';
import { OrdreFabrication, SousOrdreFabrication, CardStatus, OFType } from '../types/card.ts';
import { EnCoursGrid } from './EnCoursCasesSection.tsx';
import { EditableItemName } from './EditableItemName.tsx';
import {
  Building2,
  Handshake,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface OFSubTableProps {
  cardId: string;
  totalDemandee: number;
  ofs: OrdreFabrication[];
  onUpdateOFs: (newOfs: OrdreFabrication[]) => void;
}

function adjustCasesLength(arr: number[] | undefined, targetLen: number): number[] {
  const result = arr ? [...arr] : [];
  while (result.length < targetLen) {
    result.push(0);
  }
  return result.slice(0, targetLen);
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

  // --- OF CRUD ---
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
    const defaultCode = `OF${nextIndex}`;
    const newOF: OrdreFabrication = {
      id: `OF-${Date.now().toString().slice(-5)}`,
      codeOF: defaultCode,
      titre: defaultCode,
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
      nbCases: 5,
      casesEnCours: [0, 0, 0, 0, 0],
      sousOfs: [],
    };

    onUpdateOFs([...ofs, newOF]);
    setIsAddingOF(false);
    setNewNomExecutant('');
    setNewQuantite(Math.max(10, soldeNonAlloue - newQuantite));
  };

  // --- SOUS-OF SIMPLE & DIRECT ---
  const handleDirectAddSousOF = (ofId: string) => {
    const targetOF = ofs.find((o) => o.id === ofId);
    if (!targetOF) return;

    const nextSubNum = (targetOF.sousOfs?.length || 0) + 1;
    const defaultCode = `${targetOF.codeOF}.${nextSubNum}`;
    const newSousOF: SousOrdreFabrication = {
      id: `SOF-${Date.now().toString().slice(-6)}`,
      codeSousOF: defaultCode,
      titre: defaultCode, // Par défaut OF1.1, OF1.2...
      quantiteDemandee: 0,
      quantiteFinie: 0,
      statut: 'EN_COURS',
      nbCases: 5,
      casesEnCours: [0, 0, 0, 0, 0],
    };

    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      return {
        ...o,
        sousOfs: [...(o.sousOfs || []), newSousOF],
      };
    });

    onUpdateOFs(nextOfs);
  };

  const handleUpdateSousOF = (
    ofId: string,
    sousOFId: string,
    updates: Partial<SousOrdreFabrication>
  ) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const nextSousOfs = (o.sousOfs || []).map((sof) => {
        if (sof.id !== sousOFId) return sof;
        const updated = { ...sof, ...updates };

        if (updates.nbCases !== undefined && updates.nbCases !== sof.nbCases) {
          updated.casesEnCours = adjustCasesLength(sof.casesEnCours, updates.nbCases);
        }

        return updated;
      });
      return { ...o, sousOfs: nextSousOfs };
    });

    onUpdateOFs(nextOfs);
  };

  const handleDeleteSousOF = (ofId: string, sousOFId: string) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      return {
        ...o,
        sousOfs: (o.sousOfs || []).filter((sof) => sof.id !== sousOFId),
      };
    });
    onUpdateOFs(nextOfs);
  };

  return (
    <div className="bg-slate-50/90 p-4 rounded-xl border border-slate-200 mt-2 space-y-3">
      {/* Barre d'en-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200/80 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-900 shadow-2xs"></span>
            Ordres de Fabrication (OF) & Sous-OF
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 border border-slate-300">
            Cases d'en-cours manuelles (3 à 5)
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
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ajouter un OF</span>
            </button>
          )}
        </div>
      </div>

      {/* Formulaire ajout OF */}
      {isAddingOF && (
        <form
          onSubmit={handleCreateOF}
          className="bg-white p-3.5 rounded-xl border border-slate-300 shadow-xs space-y-3 animate-in fade-in"
        >
          <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-slate-900" />
              Nouvel Ordre de Fabrication (OF)
            </span>
            <button
              type="button"
              onClick={() => setIsAddingOF(false)}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
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
                  placeholder="ex: Sous-traitant Duval Confection..."
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
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-lg cursor-pointer shadow-2xs"
            >
              Enregistrer l'OF
            </button>
          </div>
        </form>
      )}

      {/* Liste des OFs */}
      {ofs.length === 0 ? (
        <div className="text-center py-5 bg-white rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
          Aucun OF pour cette carte. Cliquez sur "Ajouter un OF".
        </div>
      ) : (
        <div className="space-y-3">
          {ofs.map((ofItem, index) => {
            const hasSubOfs = Boolean(ofItem.sousOfs && ofItem.sousOfs.length > 0);

            const ofNbCases = ofItem.nbCases || 5;
            const ofCases = ofItem.casesEnCours && ofItem.casesEnCours.length
              ? ofItem.casesEnCours
              : Array(ofNbCases).fill(0);

            return (
              <div
                key={ofItem.id}
                className="bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden"
              >
                {/* Ligne d'en-tête de l'OF */}
                <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Ordre RDL */}
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded text-[11px] border border-slate-300 shadow-2xs">
                        #{ofItem.ordreRDL}
                      </span>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveOrder(index, 'UP')}
                          title="Monter"
                          className="text-slate-400 hover:text-slate-800 disabled:opacity-20 cursor-pointer text-[9px] leading-tight"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={index === ofs.length - 1}
                          onClick={() => handleMoveOrder(index, 'DOWN')}
                          title="Descendre"
                          className="text-slate-400 hover:text-slate-800 disabled:opacity-20 cursor-pointer text-[9px] leading-tight"
                        >
                          ▼
                        </button>
                      </div>
                    </div>

                    {/* NOM DE L'OF PERSONNALISABLE AVEC CRAYON (PAR DÉFAUT OF1, OF2...) */}
                    <EditableItemName
                      value={ofItem.titre}
                      defaultValue={ofItem.codeOF}
                      onSave={(newName) => handleUpdateSingleOF(ofItem.id, { titre: newName })}
                      className="text-sm font-mono font-bold text-slate-900"
                    />

                    {/* BOUTON "+" À CÔTÉ DE L'OF POUR AJOUTER UN SOUS-OF */}
                    <button
                      type="button"
                      onClick={() => handleDirectAddSousOF(ofItem.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all shadow-2xs cursor-pointer ml-1"
                      title={`Ajouter un Sous-OF à ${ofItem.codeOF}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Sous-OF</span>
                    </button>

                    {/* Type et Exécutant */}
                    <div className="flex items-center gap-1.5 ml-1">
                      {ofItem.type === 'INTERNE' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          <Building2 className="w-3 h-3 text-blue-600" />
                          Interne
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          <Handshake className="w-3 h-3 text-indigo-600" />
                          Sous-traitant
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 text-xs truncate max-w-[200px]">
                        {ofItem.nomExecutant}
                      </span>
                    </div>
                  </div>

                  {/* Actions & métriques OF */}
                  <div className="flex items-center gap-3 text-xs">
                    {/* Quantité Demandée */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Qté demandée</span>
                      <strong className="text-slate-900 font-mono">
                        {ofItem.quantiteDemandee.toLocaleString('fr-FR')} pcs
                      </strong>
                    </div>

                    {/* Point Fini (saisie manuelle pure, sans boutons +/-) */}
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Qté finie</span>
                      <input
                        type="number"
                        min="0"
                        max={ofItem.quantiteDemandee}
                        value={ofItem.quantiteFinie === 0 ? '' : ofItem.quantiteFinie}
                        placeholder="0"
                        onChange={(e) =>
                          handleUpdateSingleOF(ofItem.id, {
                            quantiteFinie: Math.min(
                              ofItem.quantiteDemandee,
                              Math.max(0, Number(e.target.value) || 0)
                            ),
                          })
                        }
                        className="w-14 text-center font-bold text-slate-900 border border-slate-300 rounded py-0.5 px-1 bg-white focus:bg-amber-50 text-xs font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        title="Pièces finies (saisie manuelle)"
                      />
                    </div>

                    {/* Statut OF */}
                    <select
                      value={ofItem.statut}
                      onChange={(e) =>
                        handleUpdateSingleOF(ofItem.id, {
                          statut: e.target.value as CardStatus,
                        })
                      }
                      className={`text-[11px] font-semibold rounded px-2 py-1 border cursor-pointer ${getStatusBadge(
                        ofItem.statut
                      )}`}
                    >
                      <option value="EN_COURS">En cours</option>
                      <option value="EN_ATTENTE">En attente</option>
                      <option value="TERMINE">Terminé</option>
                      <option value="BLOQUE">Bloqué</option>
                    </select>

                    {/* Supprimer l'OF */}
                    <button
                      type="button"
                      onClick={() => handleDeleteOF(ofItem.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                      title="Supprimer cet OF"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Section Sous-OFs ou Grille de l'OF direct */}
                <div className="p-3 bg-white space-y-2">
                  {hasSubOfs ? (
                    /* CAS 1 : Présentation des sous-OFs : nom personnalisable à gauche avec petit crayon au clic, puis les cases */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 border-b border-slate-200 pb-1">
                        <span>Sous-OF de {ofItem.codeOF} ({ofItem.sousOfs!.length}) :</span>
                        <button
                          type="button"
                          onClick={() => handleDirectAddSousOF(ofItem.id)}
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-800 hover:text-black bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded border border-slate-300 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>+ Autre sous-OF</span>
                        </button>
                      </div>

                      {ofItem.sousOfs!.map((sousOF) => (
                        <div
                          key={sousOF.id}
                          className="flex flex-wrap items-center gap-3 py-1.5 px-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 transition-colors"
                        >
                          {/* 1. NOM PERSONNALISABLE À SON CÔTÉ GAUCHE (DÉFAUT: OF1.1, OF1.2... AVEC PETIT CRAYON) */}
                          <div className="min-w-[150px] max-w-[240px]">
                            <EditableItemName
                              prefix="↳"
                              value={sousOF.titre}
                              defaultValue={sousOF.codeSousOF}
                              onSave={(newName) =>
                                handleUpdateSousOF(ofItem.id, sousOF.id, { titre: newName })
                              }
                            />
                          </div>

                          {/* 2. PUIS LES CASES CONTIGUËS (SAISIE MANUELLE, SANS +/-) AVEC CHOIX DU NOMBRE DE CASES AU CLIC */}
                          <EnCoursGrid
                            nbCases={sousOF.nbCases || 5}
                            casesEnCours={sousOF.casesEnCours}
                            showSelector={true}
                            onChangeNbCases={(n) =>
                              handleUpdateSousOF(ofItem.id, sousOF.id, {
                                nbCases: n,
                                casesEnCours: adjustCasesLength(sousOF.casesEnCours, n),
                              })
                            }
                            onChangeCaseValue={(idx, val) => {
                              const nextCases = adjustCasesLength(sousOF.casesEnCours, sousOF.nbCases || 5);
                              nextCases[idx] = val;
                              handleUpdateSousOF(ofItem.id, sousOF.id, { casesEnCours: nextCases });
                            }}
                          />

                          {/* 3. BOUTON SUPPRIMER LE SOUS-OF */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSousOF(ofItem.id, sousOF.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer ml-auto"
                            title="Supprimer ce sous-OF"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* CAS 2 : MÊME PRÉSENTATION POUR L'OF S'IL N'A PAS DE SOUS-OF */
                    <div className="flex flex-wrap items-center gap-3 py-1.5 px-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      {/* Côté gauche : Nom personnalisable de l'OF (par défaut OF1, OF2...) avec petit crayon */}
                      <div className="min-w-[150px] max-w-[240px]">
                        <EditableItemName
                          value={ofItem.titre}
                          defaultValue={ofItem.codeOF}
                          onSave={(newName) => handleUpdateSingleOF(ofItem.id, { titre: newName })}
                        />
                      </div>

                      {/* Puis les cases contiguës (saisie manuelle sans +/-) avec choix du nombre de cases au clic */}
                      <EnCoursGrid
                        nbCases={ofNbCases}
                        casesEnCours={ofCases}
                        showSelector={true}
                        onChangeNbCases={(n) =>
                          handleUpdateSingleOF(ofItem.id, {
                            nbCases: n,
                            casesEnCours: adjustCasesLength(ofItem.casesEnCours, n),
                          })
                        }
                        onChangeCaseValue={(idx, val) => {
                          const nextCases = adjustCasesLength(ofItem.casesEnCours, ofNbCases);
                          nextCases[idx] = val;
                          handleUpdateSingleOF(ofItem.id, { casesEnCours: nextCases });
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
