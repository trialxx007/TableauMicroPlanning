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
  const [newQuantite, setNewQuantite] = useState<number>(50);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const totalAlloue = ofs.reduce((sum, o) => sum + o.quantiteDemandee, 0);
  const totalFinie = ofs.reduce((sum, o) => sum + computeOfQuantiteFinie(o), 0);
  const soldeNonAlloue = Math.max(0, totalDemandee - totalAlloue);

  const closeAddOF = () => {
    if (onCloseAddOF) onCloseAddOF();
  };

  const handleChangeNbCases = (ofId: string, newNbCases: number) => {
    onUpdateOFs(ofs.map((o) => (o.id === ofId ? { ...o, nbCases: newNbCases } : o)));
  };

  useEffect(() => {
    if (isAddingOF) {
      setNewQuantite(soldeNonAlloue > 0 ? soldeNonAlloue : 50);
    }
  }, [isAddingOF, soldeNonAlloue]);

  useEffect(() => {
    if (isAddingOF && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isAddingOF, isCollapsed]);

  const handleCreateOF = (e: React.FormEvent) => {
    e.preventDefault();
    const nextIndex = ofs.length + 1;
    const defaultCode = `OF${nextIndex}`;
    const newOF: OrdreFabrication = {
      id: `OF-${Date.now().toString().slice(-5)}`,
      codeOF: defaultCode,
      titre: '',
      ordreRDL: nextIndex,
      type: 'I',
      nomExecutant: OF_TYPES['I'].label,
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

  return (
    <div className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mt-1 space-y-1.5">
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
                onChange={(e) => setNewQuantite(Math.max(0, Number(e.target.value)))}
                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <EnCoursGrid
              nbCases={5}
              casesEnCours={normalizeCases(undefined, 5, Number(newQuantite))}
              onChange={(idx, val) => {
                const newCases = normalizeCases(undefined, 5, Number(newQuantite));
                newCases[idx] = val;
                setNewQuantite(newCases[newCases.length - 1]);
              }}
              onChangeNbCases={() => {}}
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

      {ofs.length > 0 && (
        <div className="flex items-center gap-2 px-2.5 py-1 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 shadow-2xs">
          <span>
            Total alloué : <b className="text-slate-900">{totalAlloue.toLocaleString('fr-FR')}</b> /{' '}
            {totalDemandee.toLocaleString('fr-FR')}
          </span>
          <span>•</span>
          <span>
            Sur-alloué :{' '}
            <b className={soldeNonAlloue > 0 ? 'text-amber-600' : 'text-slate-900'}>
              {soldeNonAlloue.toLocaleString('fr-FR')}
            </b>
          </span>
          <span>•</span>
          <span>
            Produit fini : <b className="text-slate-900">{totalFinie.toLocaleString('fr-FR')}</b> /{' '}
            {totalDemandee.toLocaleString('fr-FR')}
          </span>
          <button
            type="button"
            onClick={() => setIsCollapsed((c) => !c)}
            className="ml-auto p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            aria-label={isCollapsed ? 'Expand OF cards' : 'Collapse OF cards'}
            title={isCollapsed ? 'Expand OF cards' : 'Collapse OF cards'}
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
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
            const hasSubOfs = Boolean(ofItem.sousOfs && ofItem.sousOfs.length > 0);
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
                        OF{displayIndex}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="p-2 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <label className="text-[11px] text-slate-600 font-medium">Quantité confiée</label>
                      <input
                        type="number"
                        min={0}
                        value={ofItem.quantiteDemandee}
                        onChange={(e) =>
                          onUpdateOFs(
                            ofs.map((o) =>
                              o.id === ofItem.id
                                ? { ...o, quantiteDemandee: Number(e.target.value) }
                                : o
                            )
                          )
                        }
                        className="w-20 text-xs font-semibold px-2 py-0.5 rounded-lg border border-slate-300 bg-white"
                      />
                    </div>
                  </div>

                  <EnCoursGrid
                    nbCases={ofNbCases}
                    casesEnCours={ofCases}
                    onChange={(idx, val) =>
                      onUpdateOFs(
                        ofs.map((o) =>
                          o.id === ofItem.id
                            ? {
                                ...o,
                                casesEnCours: normalizeCases(
                                  ofCases.map((c, i) => (i === idx ? val : c)),
                                  ofNbCases,
                                  ofItem.quantiteDemandee
                                ),
                              }
                            : o
                        )
                      )
                    }
                    onChangeNbCases={(n) => handleChangeNbCases(ofItem.id, n)}
                    showSelector={true}
                    total={ofItem.quantiteDemandee}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
