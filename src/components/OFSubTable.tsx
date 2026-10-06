import React, { useState, useEffect, useRef } from 'react';
import { OrdreFabrication, SousOrdreFabrication, CardStatus, OFType, OF_TYPES, normalizeOFType } from '../types/card.ts';
import { EnCoursGrid } from './EnCoursCasesSection.tsx';
import { EditableItemName } from './EditableItemName.tsx';
import {
  ChevronDown,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface OFSubTableProps {
  cardId: string;
  totalDemandee: number;
  ofs: OrdreFabrication[];
  onUpdateOFs: (newOfs: OrdreFabrication[]) => void;
  isAddingOF?: boolean;
  onCloseAddOF?: () => void;
}

function normalizeCases(cases: number[] | undefined, nbCases: number, totalAssigne: number): number[] {
  const src = cases && cases.length ? cases : [];
  const intermediaires = src.slice(0, Math.max(0, src.length - 1));
  const next = intermediaires.slice(0, Math.max(0, nbCases - 1));
  while (next.length < nbCases - 1) {
    next.push(0);
  }
  next.push(totalAssigne);
  return next;
}

type CasesOwner = {
  nbCases?: number;
  casesEnCours?: number[];
  quantiteDemandee: number;
};

export function computeOfQuantiteFinie(owner: CasesOwner): number {
  const nb = owner.nbCases || 5;
  const total = Number(owner.quantiteDemandee) || 0;
  return Number(normalizeCases(owner.casesEnCours, nb, total)[0]) || 0;
}

const OF_TYPE_KEYS = Object.keys(OF_TYPES) as OFType[];

interface TraitantPickerProps {
  value: OFType;
  onChange: (t: OFType) => void;
}

const TraitantPicker: React.FC<TraitantPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        title="Cliquer pour changer de traitant"
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border text-[11px] font-bold shadow-2xs cursor-pointer ${OF_TYPES[value].classe}`}
      >
        {value}
        <ChevronDown
          className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-0.5 z-30 flex gap-0.5 bg-white border border-slate-300 rounded-lg shadow-lg p-0.5">
          {OF_TYPE_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setIsOpen(false);
              }}
              title={OF_TYPES[t].label}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                value === t
                  ? OF_TYPES[t].classe
                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const OFSubTable: React.FC<OFSubTableProps> = ({
  totalDemandee,
  ofs,
  onUpdateOFs,
  isAddingOF = false,
  onCloseAddOF,
}) => {
  const [newType, setNewType] = useState<OFType>('I');
  const [newQuantite, setNewQuantite] = useState<number>(50);

  const totalAlloue = ofs.reduce((sum, o) => sum + o.quantiteDemandee, 0);
  const totalFinie = ofs.reduce((sum, o) => sum + computeOfQuantiteFinie(o), 0);
  const soldeNonAlloue = Math.max(0, totalDemandee - totalAlloue);
  const ecartAlloue = totalDemandee - totalAlloue;

  const closeAddOF = () => {
    if (onCloseAddOF) onCloseAddOF();
  };

  useEffect(() => {
    if (isAddingOF) {
      setNewQuantite(soldeNonAlloue > 0 ? soldeNonAlloue : 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddingOF]);

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
      updated.quantiteDemandee = qteDemandee;
      updated.casesEnCours = normalizeCases(updated.casesEnCours, updated.nbCases || 5, qteDemandee);
      // Lien logique : la "Fini" = la 1ère case (à gauche) de l'OF
      const qteFinie = computeOfQuantiteFinie(updated);
      updated.quantiteFinie = qteFinie;
      updated.resteAProduire = Math.max(0, qteDemandee - qteFinie);

      if (qteFinie !== o.quantiteFinie && updates.statut === undefined) {
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
      titre: '',
      ordreRDL: nextIndex,
      type: newType,
      nomExecutant: OF_TYPES[newType].label,
      quantiteDemandee: Number(newQuantite),
      quantiteFinie: 0,
      resteAProduire: Number(newQuantite),
      statut: 'EN_ATTENTE',
      nbCases: 5,
      casesEnCours: normalizeCases(undefined, 5, Number(newQuantite)),
      sousOfs: [],
    };

    onUpdateOFs([...ofs, newOF]);
    closeAddOF();
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
      titre: '',
      quantiteDemandee: 0,
      quantiteFinie: 0,
      statut: 'EN_COURS',
      nbCases: 5,
      casesEnCours: normalizeCases(undefined, 5, 0),
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

        const targetNb = updated.nbCases || 5;
        const targetTotal = updated.quantiteDemandee !== undefined ? Number(updated.quantiteDemandee) : sof.quantiteDemandee;
        updated.casesEnCours = normalizeCases(updated.casesEnCours, targetNb, targetTotal);
        updated.quantiteFinie = computeOfQuantiteFinie(updated);

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
    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mt-1 space-y-1.5">
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
              onClick={closeAddOF}
              className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
            >
              Annuler
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Traitant
              </label>
              <TraitantPicker value={newType} onChange={setNewType} />
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
              onClick={closeAddOF}
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

      {/* Lien logique : Total commande ↔ Partage assigné aux OF ↔ Produit fini */}
      {ofs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold bg-white px-2 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
          <span className="text-slate-500">
            Commande : <b className="text-slate-900">{totalDemandee.toLocaleString('fr-FR')}</b>
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">
            Assigné (Σ OF) : <b className="text-slate-900">{totalAlloue.toLocaleString('fr-FR')}</b>
          </span>
          <span className="text-slate-300">|</span>
          {ecartAlloue > 0 ? (
            <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              Reste à allouer : <b>{ecartAlloue.toLocaleString('fr-FR')}</b>
            </span>
          ) : ecartAlloue < 0 ? (
            <span className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
              Sur-alloué : <b>{(-ecartAlloue).toLocaleString('fr-FR')}</b>
            </span>
          ) : (
            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-bold">
              Totalement alloué
            </span>
          )}
          <span className="text-slate-300">|</span>
          <span className="text-slate-500">
            Produit fini : <b className="text-slate-900">{totalFinie.toLocaleString('fr-FR')}</b> /{' '}
            {totalDemandee.toLocaleString('fr-FR')}
          </span>
        </div>
      )}

      {/* Liste des OFs */}
      {ofs.length === 0 ? (
        <div className="text-center py-2.5 bg-white rounded-xl border border-dashed border-slate-300 text-[11px] text-slate-500">
          Aucun OF pour cette carte. Cliquez sur "Ajouter un OF".
        </div>
      ) : (
        <div className="space-y-1.5">
          {ofs.map((ofItem, index) => {
            const hasSubOfs = Boolean(ofItem.sousOfs && ofItem.sousOfs.length > 0);

            const ofNbCases = ofItem.nbCases || 5;
            const ofCases = normalizeCases(ofItem.casesEnCours, ofNbCases, ofItem.quantiteDemandee);

            return (
              <div
                key={ofItem.id}
                className="bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden"
              >
                {/* Ligne d'en-tête de l'OF */}
                <div className="p-1.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Code OF + Ordre RDL */}
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded text-[11px] border border-slate-300 shadow-2xs">
                        {ofItem.codeOF}
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

                    {/* Nom de l'OF personnalisable */}
                    <EditableItemName
                      value={ofItem.titre}
                      defaultValue=""
                      placeholder="Nom de l'OF..."
                      onSave={(newName) => handleUpdateSingleOF(ofItem.id, { titre: newName })}
                      className="text-xs font-bold text-slate-900"
                    />

                    {/* Choix du traitant I / O / L, toujours visible sur la ligne */}
                    {(() => {
                      const t = normalizeOFType(ofItem.type);
                      return (
                        <TraitantPicker
                          value={t}
                          onChange={(next) =>
                            handleUpdateSingleOF(ofItem.id, {
                              type: next,
                              nomExecutant: OF_TYPES[next].label,
                            })
                          }
                        />
                      );
                    })()}

                    {/* Bouton "+" pour ajouter un Sous-OF */}
                    <button
                      type="button"
                      onClick={() => handleDirectAddSousOF(ofItem.id)}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-slate-900 hover:bg-black text-white text-[11px] font-bold transition-all shadow-2xs cursor-pointer ml-0.5"
                      title={`Ajouter un Sous-OF à ${ofItem.codeOF}`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>Sous-OF</span>
                    </button>
                  </div>

                  {/* Actions OF */}
                  <div className="flex items-center gap-2 text-[11px]">
                    {/* Partage des assignés de l'OF : Assigné / Produit fini */}
                    <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-2xs">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Assig.
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={ofItem.quantiteDemandee}
                        onChange={(e) =>
                          handleUpdateSingleOF(ofItem.id, {
                            quantiteDemandee: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        title="Quantité assignée à cet OF (lien avec la dernière case de ses cases)"
                        className="w-12 px-1 py-0.5 text-[11px] font-bold text-center text-slate-900 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        Fini
                      </span>
                      <span
                        className="w-12 px-1 py-0.5 text-[11px] font-bold text-center text-slate-500 bg-slate-100 border border-slate-200 rounded"
                        title="Produit fini (automatique) : même nombre que la 1ère case, à gauche, de l'OF"
                      >
                        {computeOfQuantiteFinie(ofItem)}
                      </span>
                    </div>

                    {/* Statut OF */}
                    <select
                      value={ofItem.statut}
                      onChange={(e) =>
                        handleUpdateSingleOF(ofItem.id, {
                          statut: e.target.value as CardStatus,
                        })
                      }
                      className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border cursor-pointer ${getStatusBadge(
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
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                      title="Supprimer cet OF"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Section Sous-OFs ou Grille de l'OF direct */}
                <div className="p-1.5 bg-white space-y-1">
                  {hasSubOfs ? (
                    /* CAS 1 : Présentation des sous-OFs : nom personnalisable à gauche avec petit crayon au clic, puis les cases */
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 border-b border-slate-200 pb-0.5">
                        <span>Sous-OF de {ofItem.codeOF} ({ofItem.sousOfs!.length}) :</span>
                        <button
                          type="button"
                          onClick={() => handleDirectAddSousOF(ofItem.id)}
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-800 hover:text-black bg-slate-100 hover:bg-slate-200 px-1.5 py-0 rounded border border-slate-300 cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>+ Autre sous-OF</span>
                        </button>
                      </div>

                      {ofItem.sousOfs!.map((sousOF) => (
                        <div
                          key={sousOF.id}
                          className="flex flex-wrap items-center gap-2 py-0.5 px-1.5 bg-slate-50 hover:bg-slate-100/80 rounded-lg border border-slate-200 transition-colors"
                        >
                          {/* 1. NOM PERSONNALISABLE À SON CÔTÉ GAUCHE (DÉFAUT: OF1.1, OF1.2... AVEC PETIT CRAYON) */}
                          <div className="min-w-[110px] max-w-[170px]">
                            <EditableItemName
                              prefix="↳"
                              value={sousOF.titre}
                              defaultValue=""
                              placeholder="Nom du sous-OF..."
                              onSave={(newName) =>
                                handleUpdateSousOF(ofItem.id, sousOF.id, { titre: newName })
                              }
                            />
                          </div>

                          {/* 2. PUIS LES CASES CONTIGUËS (SAISIE MANUELLE, SANS +/-) AVEC CHOIX DU NOMBRE DE CASES AU CLIC */}
                          <EnCoursGrid
                            nbCases={sousOF.nbCases || 5}
                            casesEnCours={normalizeCases(
                              sousOF.casesEnCours,
                              sousOF.nbCases || 5,
                              sousOF.quantiteDemandee
                            )}
                            showSelector={true}
                            onChangeNbCases={(n) =>
                              handleUpdateSousOF(ofItem.id, sousOF.id, {
                                nbCases: n,
                                casesEnCours: normalizeCases(sousOF.casesEnCours, n, sousOF.quantiteDemandee),
                              })
                            }
                            onChangeCaseValue={(idx, val) => {
                              const nextCases = normalizeCases(
                                sousOF.casesEnCours,
                                sousOF.nbCases || 5,
                                sousOF.quantiteDemandee
                              );
                              nextCases[idx] = val;
                              const updates: Partial<SousOrdreFabrication> = { casesEnCours: nextCases };
                              if (idx === nextCases.length - 1) {
                                updates.quantiteDemandee = val;
                              }
                              handleUpdateSousOF(ofItem.id, sousOF.id, updates);
                            }}
                          />

                          {/* 3. BOUTON SUPPRIMER LE SOUS-OF */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSousOF(ofItem.id, sousOF.id)}
                            className="p-0.5 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer ml-auto"
                            title="Supprimer ce sous-OF"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    /* CAS 2 : MÊME PRÉSENTATION POUR L'OF S'IL N'A PAS DE SOUS-OF */
                    <div className="flex flex-wrap items-center gap-2 py-0.5 px-1.5 bg-slate-50 rounded-lg border border-slate-200">
                      {/* Côté gauche : Nom personnalisable de l'OF (par défaut OF1, OF2...) avec petit crayon */}
                      <div className="min-w-[110px] max-w-[170px]">
                        <EditableItemName
                          value={ofItem.titre}
                          defaultValue=""
                          placeholder="Nom de l'OF..."
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
                            casesEnCours: normalizeCases(ofItem.casesEnCours, n, ofItem.quantiteDemandee),
                          })
                        }
                        onChangeCaseValue={(idx, val) => {
                          const nextCases = normalizeCases(ofItem.casesEnCours, ofNbCases, ofItem.quantiteDemandee);
                          nextCases[idx] = val;
                          const updates: Partial<OrdreFabrication> = { casesEnCours: nextCases };
                          if (idx === nextCases.length - 1) {
                            updates.quantiteDemandee = val;
                          }
                          handleUpdateSingleOF(ofItem.id, updates);
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
