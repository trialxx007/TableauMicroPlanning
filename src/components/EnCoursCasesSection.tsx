import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface EnCoursGridProps {
  nbCases?: number;
  casesEnCours?: number[];
  onChangeNbCases?: (newNb: number) => void;
  onChangeCaseValue: (index: number, val: number) => void;
  showSelector?: boolean;
  total?: number;
  labels?: string[];
}

export const EnCoursGrid: React.FC<EnCoursGridProps> = ({
  nbCases = 5,
  casesEnCours = [0, 0, 0, 0, 0],
  onChangeNbCases,
  onChangeCaseValue,
  showSelector = true,
  total,
  labels,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const currentNb = Math.min(5, Math.max(3, nbCases || 5));
  const values = Array.from({ length: currentNb }, (_, i) => casesEnCours[i] ?? 0);
  const totalAssigne = Number(values[values.length - 1]) || 0;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsPickerOpen(false);
      }
    };
    if (isPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPickerOpen]);

  return (
    <div className="inline-flex items-center gap-1.5 flex-wrap">
      <div className="inline-flex border border-slate-900 divide-x divide-slate-900 bg-white shadow-2xs">
        {values.map((val, idx) => {
          const isTotalCase = idx === values.length - 1;
          return (
            <input
              key={idx}
              type="number"
              min="0"
              value={val === 0 ? '' : val}
              placeholder=""
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                onChangeCaseValue(idx, isNaN(num) ? 0 : Math.max(0, num));
              }}
              className={`w-7 h-7 sm:w-8 sm:h-8 text-center font-bold text-[11px] text-slate-900 focus:bg-amber-50 focus:outline-hidden transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                isTotalCase ? 'bg-slate-200/70 font-extrabold' : 'bg-white'
              }`}
              title={
                isTotalCase
                  ? 'Dernière case : total des pièces assignées à cet OF'
                  : `Case ${idx + 1} : quantité ayant atteint cette étape (cumulée)`
              }
            />
          );
        })}
      </div>

      {showSelector && onChangeNbCases && (
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white hover:bg-slate-100 text-slate-800 text-[10px] font-bold rounded border border-slate-400 shadow-2xs cursor-pointer transition-colors"
            title="Cliquer pour choisir le nombre de cases"
          >
            <span>{currentNb} cases</span>
            <ChevronDown className={`w-2.5 h-2.5 text-slate-500 transition-transform ${isPickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {isPickerOpen && (
            <div className="absolute left-0 mt-1 z-30 bg-white border border-slate-300 rounded-lg shadow-lg p-1 min-w-[110px] animate-in fade-in zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                Cases à afficher
              </div>
              {[3, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    onChangeNbCases(n);
                    setIsPickerOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1 rounded text-xs font-semibold flex items-center justify-between cursor-pointer ${
                    currentNb === n
                      ? 'bg-slate-900 text-white font-bold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>{n} cases</span>
                  {currentNb === n && <span className="text-[11px]">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="text-[10px] font-mono text-slate-500 font-semibold whitespace-nowrap ml-0.5"
        title="La dernière case (à droite) contient le total des pièces assignées à l'OF"
      >
        Total : <span className="text-slate-900 font-bold">{total ?? totalAssigne}</span>
      </div>
    </div>
  );
};