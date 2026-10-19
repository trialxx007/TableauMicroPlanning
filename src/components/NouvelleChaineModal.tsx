import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Network, Check } from 'lucide-react';
import { CATEGORIES_CONFIG } from '../data/mockSuiviGlobal.ts';

type CategorieChaine = 'BRODERIE_MAIN' | 'CONFECTION';

const CATEGORIES: CategorieChaine[] = ['BRODERIE_MAIN', 'CONFECTION'];

interface NouvelleChaineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (categorieId: CategorieChaine, nom: string) => void;
  /** Noms déjà pris, pour refuser un doublon dans la même catégorie. */
  nomsExistants?: string[];
}

export const NouvelleChaineModal: React.FC<NouvelleChaineModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  nomsExistants = [],
}) => {
  const [categorieId, setCategorieId] = useState<CategorieChaine>('BRODERIE_MAIN');
  const [nom, setNom] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Réinitialise à chaque ouverture : la fenêtre repart d'un état vierge.
  useEffect(() => {
    if (!isOpen) return;
    setCategorieId('BRODERIE_MAIN');
    setNom('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const nomNormalise = nom.trim().toUpperCase();
  const doublon = useMemo(
    () => Boolean(nomNormalise) && nomsExistants.some((n) => n.trim().toUpperCase() === nomNormalise),
    [nomNormalise, nomsExistants]
  );
  const peutCreer = Boolean(nomNormalise) && !doublon;

  const valider = () => {
    if (!peutCreer) return;
    onCreate(categorieId, nomNormalise);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900">Nouvelle Chaîne</h3>
              <p className="text-xs text-slate-500 font-medium">Choisissez le type puis nommez la chaîne</p>
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

        <div className="p-5 space-y-4 bg-white">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Type</label>
            <div className="grid grid-cols-2 gap-2.5">
              {CATEGORIES.map((catKey) => {
                const cfg = CATEGORIES_CONFIG[catKey];
                const actif = categorieId === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    onClick={() => setCategorieId(catKey)}
                    className={`relative text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${cfg.bgClass} ${
                      actif
                        ? 'border-slate-900/70 shadow-md ring-2 ring-slate-900/10'
                        : 'border-transparent hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cfg.defaultDotColor }}
                      />
                      <span className={`text-xs font-bold ${cfg.textClass}`}>{cfg.titre}</span>
                    </div>
                    {actif && (
                      <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-slate-900 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label htmlFor="nouvelle-chaine-nom" className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nom de la chaîne
            </label>
            <input
              id="nouvelle-chaine-nom"
              ref={inputRef}
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') valider();
              }}
              placeholder="Ex. GLAÏEUL, TANA…"
              className="w-full px-3 py-2 text-sm font-semibold text-slate-800 uppercase rounded-lg border border-slate-300 focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 transition-colors"
            />
            {doublon && (
              <p className="mt-1.5 text-[11px] font-semibold text-rose-600">
                Ce nom de chaîne existe déjà.
              </p>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={valider}
            disabled={!peutCreer}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-lg shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Network className="w-3.5 h-3.5" />
            Créer la chaîne
          </button>
        </div>
      </div>
    </div>
  );
};
