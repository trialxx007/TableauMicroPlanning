import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface EnCoursGridProps {
  nbCases?: number; // 3, 4, ou 5
  casesEnCours?: number[];
  onChangeNbCases?: (newNb: number) => void;
  onChangeCaseValue: (index: number, val: number) => void;
  showSelector?: boolean;
}

export const EnCoursGrid: React.FC<EnCoursGridProps> = ({
  nbCases = 5,
  casesEnCours = [0, 0, 0, 0, 0],
  onChangeNbCases,
  onChangeCaseValue,
  showSelector = true,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const currentNb = Math.min(5, Math.max(3, nbCases || 5));
  const values = Array.from({ length: currentNb }, (_, i) => casesEnCours[i] ?? 0);
  const totalEnCours = values.reduce((sum, v) => sum + (Number(v) || 0), 0);

  // Close picker when clicking outside
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
    <div className="inline-flex items-center gap-2 flex-wrap">
      {/* Grille de cases contiguës noires (identique au fichier PNG) */}
      <div className="inline-flex border-2 border-slate-900 divide-x-2 divide-slate-900 bg-white shadow-2xs">
        {values.map((val, idx) => (
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
            className="w-10 h-11 sm:w-11 sm:h-12 text-center font-bold text-sm text-slate-900 bg-white focus:bg-amber-50 focus:outline-hidden transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            title={`Case ${idx + 1} (saisie manuelle)`}
          />
        ))}
      </div>

      {/* Clic sur le nombre de cases pour choisir combien on en veut (3 à 5) */}
      {showSelector && onChangeNbCases && (
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 text-slate-800 text-[11px] font-bold rounded border border-slate-400 shadow-2xs cursor-pointer transition-colors"
            title="Cliquer pour choisir le nombre de cases"
          >
            <span>{currentNb} cases</span>
            <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isPickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {isPickerOpen && (
            <div className="absolute left-0 mt-1 z-30 bg-white border border-slate-300 rounded-lg shadow-lg p-1 min-w-[110px] animate-in fade-in zoom-in-95">
              <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                Cases à afficher
              </div>
              {[3, 4, 5].map((n) => (
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

      {/* Total discret */}
      <div className="text-[11px] font-mono text-slate-500 font-semibold whitespace-nowrap ml-1">
        Total : <span className="text-slate-900 font-bold">{totalEnCours}</span>
      </div>
    </div>
  );
};
