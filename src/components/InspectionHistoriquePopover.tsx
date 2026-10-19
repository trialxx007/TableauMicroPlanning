import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { InspectionBloc } from '../types/suiviGlobal.ts';
import { dateCourte } from '../utils/inspections.ts';

/** Écart sous l'ancre et marge de sécurité au bord d'écran. */
const ECART = 6;
const MARGE = 8;

interface InspectionHistoriquePopoverProps {
  /** Bouton cliqué : le popover s'ancre dessous et le suit au défilement. */
  anchor: HTMLElement;
  bloc: InspectionBloc;
  onClose: () => void;
}

interface EntreeHistorique {
  ofIndex: number;
  /** Rang du contrôle I dans son OF (1, 2…) ; `null` pour un contrôle CC. */
  rang: number;
  pct: number;
  estCC: boolean;
  date: string;
  /** Date à laquelle Pass/Fail a été posé (sinon date du contrôle). */
  dateResultat?: string;
  resultat: 'P' | 'F' | null;
}

/**
 * Popover d'historique des contrôles d'inspection : liste chronologique des
 * contrôles (OF, I1 50 %…, CC) avec leur date et leur résultat Pass/Fail/rien.
 */
export const InspectionHistoriquePopover: React.FC<
  InspectionHistoriquePopoverProps
> = ({ anchor, bloc, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const entrees: EntreeHistorique[] = [];
  if (bloc.historique && bloc.historique.length > 0) {
    // Journal : chaque modification d'état (Pass/Fail/Non défini) est conservée.
    for (const evt of bloc.historique) {
      entrees.push({
        ofIndex: evt.ofIndex,
        rang: evt.rang,
        pct: evt.pct ?? 50,
        estCC: evt.estCC,
        date: evt.date,
        dateResultat: evt.date,
        resultat: evt.resultat,
      });
    }
  } else {
    // Repli (données antérieures au journal) : un état par contrôle.
    const ofIndices = new Set<number>();
    for (const v of bloc.valeurs)
      if (v.type === 'I' || v.type === 'CC') ofIndices.add(v.ofIndex ?? 0);
    for (const ofIndex of [...ofIndices].sort((a, b) => a - b)) {
      let rangI = 0;
      bloc.valeurs
        .filter(
          (v) =>
            (v.type === 'I' || v.type === 'CC') &&
            (v.ofIndex ?? 0) === ofIndex
        )
        .forEach((v) => {
          if (v.type === 'I') rangI += 1;
          entrees.push({
            ofIndex,
            rang: rangI,
            pct: v.pct ?? 50,
            estCC: v.type === 'CC',
            date: v.date,
            dateResultat: v.dateResultat,
            resultat: v.resultat,
          });
        });
    }
  }
  const dateEntree = (e: EntreeHistorique) => e.dateResultat ?? e.date;
  entrees.sort((a, b) => {
    const da = dateEntree(a);
    const db = dateEntree(b);
    return da < db ? 1 : da > db ? -1 : 0;
  });

  const placer = useCallback(() => {
    if (!anchor.isConnected) {
      onClose();
      return;
    }
    const r = anchor.getBoundingClientRect();
    const w = ref.current?.offsetWidth ?? 0;
    const h = ref.current?.offsetHeight ?? 0;
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
      if (ref.current?.contains(cible)) return;
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
      ref={ref}
      style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, zIndex: 60 }}
      className={`w-[320px] p-2 rounded-lg border border-slate-200 bg-white shadow-xl ${
        pos ? 'animate-popover-in' : 'invisible'
      }`}
      role="dialog"
      aria-label="Historique des inspections"
    >
      <div className="px-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Historique des inspections
      </div>
      {entrees.length === 0 ? (
        <div className="px-1 py-2 text-[11px] italic text-slate-400">
          Aucun contrôle enregistré
        </div>
      ) : (
        <ul className="flex flex-col max-h-[70vh] overflow-y-auto">
          {entrees.map((e, i) => (
            <li
              key={i}
              className="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-slate-50"
            >
              <span
                className="shrink-0 w-10 text-[10px] font-bold text-slate-500 tabular-nums"
                title={
                  e.dateResultat && e.dateResultat !== e.date
                    ? `Contrôle : ${dateCourte(e.date)} · Pass/Fail : ${dateCourte(e.dateResultat)}`
                    : undefined
                }
              >
                {dateCourte(e.dateResultat ?? e.date)}
              </span>
              <span className="shrink-0 text-[11px] font-bold text-slate-700">
                OF{e.ofIndex + 1}
                <span className="text-slate-400"> · </span>
                {e.estCC ? (
                  'CC'
                ) : (
                  <>
                    I<sub className="text-[8px]">{e.rang}</sub> {e.pct}%
                  </>
                )}
              </span>
              <span
                className={`ml-auto shrink-0 h-4 px-1.5 rounded text-[9px] font-black uppercase text-white flex items-center ${
                  e.resultat === 'P'
                    ? 'bg-emerald-600'
                    : e.resultat === 'F'
                    ? 'bg-rose-600'
                    : 'bg-slate-400 min-w-9 justify-center'
                }`}
              >
                {e.resultat === 'P' ? (
                  'Pass'
                ) : e.resultat === 'F' ? (
                  'Fail'
                ) : (
                  <span className="text-[12px] font-bold leading-none">-</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};