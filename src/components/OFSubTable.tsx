import React, { useState, useEffect, useRef } from 'react';
import { OrdreFabrication, SousOrdreFabrication, CardStatus, OFType, OF_TYPES, normalizeOFType } from '../types/card.ts';
import { EnCoursGrid } from './EnCoursCasesSection.tsx';
import { EditableItemName } from './EditableItemName.tsx';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface OFSubTableProps {
  cardId: string;
  totalDemandee: number;
  ofs: OrdreFabrication[];
  onUpdateOFs: (newOfs: OrdreFabrication[]) => void;
  onChangeTotalDemandee?: (n: number) => void;
  isAddingOF?: boolean;
  onCloseAddOF?: () => void;
}

export function normalizeCases(cases: number[] | undefined, nbCases: number, totalAssigne: number): number[] {
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

/** Le total d'un OF divisé en sous-OF est la somme de ses sous-OF. */
function recalcOFDepuisSousOfs(of: OrdreFabrication): OrdreFabrication {
  const sous = of.sousOfs || [];
  if (sous.length === 0) return of;
  const quantiteDemandee = sous.reduce((s, x) => s + (Number(x.quantiteDemandee) || 0), 0);
  const quantiteFinie = sous.reduce((s, x) => s + computeOfQuantiteFinie(x), 0);
  return {
    ...of,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire: Math.max(0, quantiteDemandee - quantiteFinie),
  };
}

export const OFSubTable: React.FC<OFSubTableProps> = ({
  totalDemandee,
  ofs,
  onUpdateOFs,
  onChangeTotalDemandee,
  isAddingOF = false,
  onCloseAddOF,
}) => {
  const [newQuantite, setNewQuantite] = useState<number>(50);
  const [newNbCases, setNewNbCases] = useState<number>(5);
  const [newCases, setNewCases] = useState<number[]>(() => normalizeCases(undefined, 5, 50));
  const [isCollapsed, setIsCollapsed] = useState(false);

  const totalAlloue = ofs.reduce((sum, o) => sum + o.quantiteDemandee, 0);
  const totalFinie = ofs.reduce((sum, o) => sum + computeOfQuantiteFinie(o), 0);
  const soldeNonAlloue = Math.max(0, totalDemandee - totalAlloue);
  const ecartAlloue = totalAlloue - totalDemandee;

  const closeAddOF = () => {
    if (onCloseAddOF) onCloseAddOF();
  };

  const handleChangeNbCases = (ofId: string, nb: number) => {
    onUpdateOFs(ofs.map((o) => (o.id === ofId ? { ...o, nbCases: nb } : o)));
  };

  useEffect(() => {
    if (isAddingOF) {
      const qte = soldeNonAlloue > 0 ? soldeNonAlloue : 50;
      setNewQuantite(qte);
      setNewNbCases(5);
      setNewCases(normalizeCases(undefined, 5, qte));
    }
  }, [isAddingOF, soldeNonAlloue]);

  useEffect(() => {
    if (isAddingOF && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isAddingOF, isCollapsed]);

  const handleCreateOF = (e: React.FormEvent) => {
    e.preventDefault();
    const numeros = ofs
      .map((o) => parseInt((o.codeOF || '').replace(/\D/g, ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextIndex = (numeros.length ? Math.max(...numeros) : 0) + 1;
    const defaultCode = `OF${nextIndex}`;
    const newOF: OrdreFabrication = {
      id: `OF-${Date.now().toString().slice(-5)}`,
      codeOF: defaultCode,
      titre: '',
      ordreRDL: ofs.length + 1,
      type: 'I',
      nomExecutant: OF_TYPES['I'].label,
      quantiteDemandee: Number(newQuantite),
      quantiteFinie: 0,
      resteAProduire: Number(newQuantite),
      statut: 'EN_ATTENTE',
      nbCases: newNbCases,
      casesEnCours: normalizeCases(newCases, newNbCases, Number(newQuantite)),
      sousOfs: [],
    };
    onUpdateOFs([...ofs, newOF]);
    closeAddOF();
  };

  const handleDeleteOF = (ofId: string) => {
    const nextOfs = ofs.filter((o) => o.id !== ofId);
    onUpdateOFs(nextOfs.map((o, idx) => ({ ...o, ordreRDL: idx + 1 })));
  };

  const handleUpdateSingleOF = (ofId: string, updates: Partial<OrdreFabrication>) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const updated = { ...o, ...updates };
      const qteDemandee =
        updates.quantiteDemandee !== undefined
          ? Number(updates.quantiteDemandee)
          : o.quantiteDemandee;
      updated.quantiteDemandee = qteDemandee;
      updated.casesEnCours = normalizeCases(updated.casesEnCours, updated.nbCases || 5, qteDemandee);
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

  /** Réordonne les OF : le plus haut devient le plus prioritaire (le code OF reste inchangé). */
  const handleMoveOF = (index: number, direction: 'UP' | 'DOWN') => {
    const cible = direction === 'UP' ? index - 1 : index + 1;
    if (cible < 0 || cible >= ofs.length) return;
    const copie = [...ofs];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    onUpdateOFs(copie.map((o, idx) => ({ ...o, ordreRDL: idx + 1 })));
  };

  /** Divise l'OF en créant un sous-OF. Le premier hérite du total de l'OF. */
  const handleDirectAddSousOF = (ofId: string) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const existants = o.sousOfs || [];
      const nextNum = existants.length + 1;
      const premier = existants.length === 0;
      const qte = premier ? Number(o.quantiteDemandee) || 0 : 0;
      const nbCases = premier ? o.nbCases || 5 : 5;
      const newSousOF: SousOrdreFabrication = {
        id: `SOF-${Date.now().toString().slice(-6)}`,
        codeSousOF: `${o.codeOF}.${nextNum}`,
        titre: '',
        type: o.type,
        nomExecutant: o.nomExecutant,
        quantiteDemandee: qte,
        quantiteFinie: 0,
        statut: 'EN_ATTENTE',
        nbCases,
        casesEnCours: normalizeCases(premier ? o.casesEnCours : undefined, nbCases, qte),
      };
      return recalcOFDepuisSousOfs({ ...o, sousOfs: [...existants, newSousOF] });
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
        const nbCases = updated.nbCases || 5;
        const total =
          updates.quantiteDemandee !== undefined
            ? Number(updates.quantiteDemandee)
            : sof.quantiteDemandee;
        updated.quantiteDemandee = total;
        updated.casesEnCours = normalizeCases(updated.casesEnCours, nbCases, total);
        updated.quantiteFinie = computeOfQuantiteFinie(updated);
        return updated;
      });
      return recalcOFDepuisSousOfs({ ...o, sousOfs: nextSousOfs });
    });
    onUpdateOFs(nextOfs);
  };

  const handleDeleteSousOF = (ofId: string, sousOFId: string) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const nextSousOfs = (o.sousOfs || []).filter((sof) => sof.id !== sousOFId);
      if (nextSousOfs.length === 0) {
        return { ...o, sousOfs: [] };
      }
      return recalcOFDepuisSousOfs({ ...o, sousOfs: nextSousOfs });
    });
    onUpdateOFs(nextOfs);
  };

  return (
    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mt-1 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 shadow-2xs">
        <label className="font-semibold text-slate-700 whitespace-nowrap">
          Quantité totale à répartir
        </label>
        <input
          type="number"
          min={1}
          value={totalDemandee}
          onChange={(e) => onChangeTotalDemandee?.(Math.max(0, Number(e.target.value)))}
          disabled={!onChangeTotalDemandee}
          title="Quantité totale qui sera divisée entre les OF"
          className="w-20 text-xs font-semibold px-2 py-0.5 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className="text-slate-300">•</span>
        <span>
          Total alloué : <b className="text-slate-900">{totalAlloue.toLocaleString('fr-FR')}</b> /{' '}
          {totalDemandee.toLocaleString('fr-FR')}
        </span>
        <span>•</span>
        {ecartAlloue > 0 ? (
          <span className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 font-bold">
            Sur-alloué : {ecartAlloue.toLocaleString('fr-FR')}
          </span>
        ) : ecartAlloue < 0 ? (
          <span className="text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-semibold">
            Reste à allouer : {Math.abs(ecartAlloue).toLocaleString('fr-FR')}
          </span>
        ) : (
          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-bold">
            Tout alloué
          </span>
        )}
        <span>•</span>
        <span>
          Produit fini : <b className="text-slate-900">{totalFinie.toLocaleString('fr-FR')}</b> /{' '}
          {totalDemandee.toLocaleString('fr-FR')}
        </span>
        {ofs.length > 0 && (
          <button
            type="button"
            onClick={() => setIsCollapsed((c) => !c)}
            className="ml-auto p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            aria-label={isCollapsed ? 'Expand OF cards' : 'Collapse OF cards'}
            title={isCollapsed ? 'Expand OF cards' : 'Collapse OF cards'}
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {isAddingOF && (
        <div
          onSubmit={handleCreateOF}
          className="bg-white p-3.5 rounded-xl border border-slate-300 shadow-xs space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">Ajouter un OF</h4>
            <button
              type="button"
              onClick={closeAddOF}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Quantité confiée
              </label>
              <input
                type="number"
                min={1}
                value={newQuantite}
                onChange={(e) => {
                  const qte = Math.max(0, Number(e.target.value));
                  setNewQuantite(qte);
                  setNewCases((prev) => normalizeCases(prev, newNbCases, qte));
                }}
                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <EnCoursGrid
              nbCases={newNbCases}
              casesEnCours={newCases}
              onChangeCaseValue={(idx, val) => {
                const next = normalizeCases(newCases, newNbCases, Number(newQuantite));
                next[idx] = val;
                setNewCases(next);
                setNewQuantite(next[next.length - 1]);
              }}
              onChangeNbCases={(n) => {
                setNewNbCases(n);
                setNewCases((prev) => normalizeCases(prev, n, Number(newQuantite)));
              }}
              showSelector={true}
              total={newQuantite}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeAddOF}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer shadow-2xs"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCreateOF}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-lg cursor-pointer shadow-2xs"
            >
              Enregistrer l'OF
            </button>
          </div>
        </div>
      )}

      {ofs.length === 0 ? (
        <div className="text-center py-2.5 bg-white rounded-xl border border-dashed border-slate-300 text-[11px] text-slate-500">
          Aucun OF pour cette carte. Cliquez sur "Ajouter un OF".
        </div>
      ) : !isCollapsed ? (
        <div className="space-y-1.5">
          {ofs.map((ofItem, index) => {
            const displayIndex = index + 1;
            const labelOF = ofItem.codeOF || `OF${displayIndex}`;
            const sousOfs = ofItem.sousOfs || [];
            const hasSubOfs = sousOfs.length > 0;
            const ofNbCases = ofItem.nbCases || 5;
            const ofCases = normalizeCases(ofItem.casesEnCours, ofNbCases, ofItem.quantiteDemandee);

            return (
              <div
                key={ofItem.id}
                className="bg-white rounded-xl border border-slate-300 shadow-2xs overflow-hidden"
              >
                <div className="p-1.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded text-[11px] border border-slate-300 shadow-2xs">
                        {labelOF}
                      </span>
                      <div className="flex flex-col -space-y-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveOF(index, 'UP')}
                          title={`Monter ${labelOF} (plus prioritaire)`}
                          aria-label={`Monter ${labelOF}`}
                          className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={index === ofs.length - 1}
                          onClick={() => handleMoveOF(index, 'DOWN')}
                          title={`Descendre ${labelOF}`}
                          aria-label={`Descendre ${labelOF}`}
                          className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {hasSubOfs && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {sousOfs.length} sous-OF
                      </span>
                    )}
                  </div>

                  {/* Actions de l'OF */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDirectAddSousOF(ofItem.id)}
                      title={`Ajouter un sous-OF à ${labelOF}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Sous OF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteOF(ofItem.id)}
                      title={`Supprimer ${labelOF}`}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-2 space-y-2">
                  {hasSubOfs ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 border-b border-slate-200 pb-0.5">
                        <span>Sous-OF de {labelOF} ({sousOfs.length})</span>
                        <span className="text-slate-400 font-semibold">
                          Total confié : {ofItem.quantiteDemandee.toLocaleString('fr-FR')}
                        </span>
                      </div>

                      {sousOfs.map((sof) => {
                        const sofNbCases = sof.nbCases || 5;
                        const sofCases = normalizeCases(
                          sof.casesEnCours,
                          sofNbCases,
                          sof.quantiteDemandee
                        );
                        return (
                          <div
                            key={sof.id}
                            className="bg-slate-50/70 rounded-lg border border-slate-200 p-1.5 space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded text-[10px] border border-slate-300 shadow-2xs">
                                {sof.codeSousOF}
                              </span>
                              <EditableItemName
                                value={sof.titre}
                                defaultValue=""
                                placeholder="Nom du sous-OF..."
                                onSave={(nom) =>
                                  handleUpdateSousOF(ofItem.id, sof.id, { titre: nom })
                                }
                                className="text-xs font-bold text-slate-900"
                              />
                              <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-2xs">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Assig.
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  value={sof.quantiteDemandee}
                                  onChange={(e) =>
                                    handleUpdateSousOF(ofItem.id, sof.id, {
                                      quantiteDemandee: Math.max(
                                        0,
                                        parseInt(e.target.value, 10) || 0
                                      ),
                                    })
                                  }
                                  className="w-12 px-1 py-0.5 text-[11px] font-bold text-center text-slate-900 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Fini
                                </span>
                                <span className="w-12 px-1 py-0.5 text-[11px] font-bold text-center text-slate-500 bg-slate-100 border border-slate-200 rounded">
                                  {computeOfQuantiteFinie(sof)}
                                </span>
                              </div>
                              <select
                                value={sof.statut}
                                onChange={(e) =>
                                  handleUpdateSousOF(ofItem.id, sof.id, {
                                    statut: e.target.value as CardStatus,
                                  })
                                }
                                className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border cursor-pointer ${getStatusBadge(
                                  sof.statut
                                )}`}
                              >
                                <option value="EN_COURS">En cours</option>
                                <option value="EN_ATTENTE">En attente</option>
                                <option value="TERMINE">Terminé</option>
                                <option value="BLOQUE">Bloqué</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => handleDeleteSousOF(ofItem.id, sof.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Supprimer ce sous-OF"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            <EnCoursGrid
                              nbCases={sofNbCases}
                              casesEnCours={sofCases}
                              onChangeCaseValue={(idx, val) =>
                                handleUpdateSousOF(ofItem.id, sof.id, {
                                  casesEnCours: normalizeCases(
                                    sofCases.map((c, i) => (i === idx ? val : c)),
                                    sofNbCases,
                                    sof.quantiteDemandee
                                  ),
                                })
                              }
                              onChangeNbCases={(n) =>
                                handleUpdateSousOF(ofItem.id, sof.id, { nbCases: n })
                              }
                              showSelector={true}
                              total={sof.quantiteDemandee}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <label className="text-[11px] text-slate-600 font-medium">
                            Quantité confiée
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={ofItem.quantiteDemandee}
                            onChange={(e) =>
                              handleUpdateSingleOF(ofItem.id, {
                                quantiteDemandee: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-14 text-xs font-semibold px-2 py-0.5 rounded-lg border border-slate-300 bg-white"
                          />
                          <select
                            value={normalizeOFType(ofItem.type)}
                            onChange={(e) => {
                              const t = e.target.value as OFType;
                              handleUpdateSingleOF(ofItem.id, {
                                type: t,
                                nomExecutant: OF_TYPES[t].label,
                              });
                            }}
                            title={`Traitant : ${OF_TYPES[normalizeOFType(ofItem.type)].label}`}
                            className={`text-[11px] font-bold rounded-lg px-1.5 py-0.5 border cursor-pointer ${OF_TYPES[normalizeOFType(ofItem.type)].classe}`}
                          >
                            {(['L', 'O', 'I'] as OFType[]).map((t) => (
                              <option key={t} value={t} title={OF_TYPES[t].label}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <EnCoursGrid
                        nbCases={ofNbCases}
                        casesEnCours={ofCases}
                        onChangeCaseValue={(idx, val) =>
                          handleUpdateSingleOF(ofItem.id, {
                            casesEnCours: normalizeCases(
                              ofCases.map((c, i) => (i === idx ? val : c)),
                              ofNbCases,
                              ofItem.quantiteDemandee
                            ),
                          })
                        }
                        onChangeNbCases={(n) => handleChangeNbCases(ofItem.id, n)}
                        showSelector={true}
                        total={ofItem.quantiteDemandee}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
