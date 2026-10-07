import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

/** Écart sous le badge et marge de sécurité au bord d'écran. */
const ECART = 6;
const MARGE = 8;

const ETATS: { code: 'P' | 'F' | null; label: string }[] = [
  { code: null, label: 'Non défini' },
  { code: 'P', label: 'Pass' },
  { code: 'F', label: 'Fail' },
];

interface InspectionEtatMenuProps {
  /** Badge cliqué : le menu s'ancre dessous et le suit au défilement. */
  anchor: HTMLElement;
  actuel: 'P' | 'F' | null;
  onChoisir: (etat: 'P' | 'F' | null) => void;
  onClose: () => void;
}

/**
 * Menu d'état d'un contrôle : liste Pass/Fail avec leurs couleurs, ancrée sous
 * le badge. Se ferme par l'Échap, un clic à l'extérieur ou le choix d'un état.
 */
export const InspectionEtatMenu: React.FC<InspectionEtatMenuProps> = ({
  anchor,
  actuel,
  onChoisir,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const placer = useCallback(() => {
    if (!anchor.isConnected) {
      onClose();
      return;
    }
    const r = anchor.getBoundingClientRect();
    const w = menuRef.current?.offsetWidth ?? 0;
    const h = menuRef.current?.offsetHeight ?? 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = r.bottom + ECART;
    if (h > 0 && top + h + MARGE > vh) top = Math.max(MARGE, r.top - ECART - h);

    let left = r.left;
    if (w > 0 && left + w + MARGE > vw) left = Math.max(MARGE, vw - MARGE - w);

    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    placer();
  }, [placer]);

  // Suit le badge au défilement et au redimensionnement.
  useEffect(() => {
    const onMove = () => placer();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [placer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onDown = (e: MouseEvent) => {
      const cible = e.target as Node | null;
      if (!cible) return;
      if (menuRef.current?.contains(cible)) return;
      if (anchor.contains(cible)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, zIndex: 60 }}
      className={`w-[136px] p-1 rounded-lg border border-slate-200 bg-white shadow-xl ${
        pos ? 'animate-popover-in' : 'invisible'
      }`}
      role="menu"
    >
      {ETATS.map(({ code, label }) => (
        <button
          key={String(code)}
          type="button"
          role="menuitem"
          onClick={() => onChoisir(code)}
          className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
            actuel === code ? 'bg-slate-100' : 'hover:bg-slate-50'
          }`}
        >
          <span
            className={`shrink-0 w-5 h-5 rounded text-[10px] font-extrabold text-white flex items-center justify-center ${
              code === 'P'
                ? 'bg-emerald-600'
                : code === 'F'
                ? 'bg-rose-600'
                : 'bg-slate-400'
            }`}
          >
            {code === null ? '—' : code}
          </span>
          <span className="text-slate-700">{label}</span>
          {actuel === code && <Check className="w-3.5 h-3.5 ml-auto text-blue-600" />}
        </button>
      ))}
    </div>
  );
};
