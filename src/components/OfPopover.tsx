import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Factory, User } from 'lucide-react';
import { CardItem, OF_TYPES, normalizeOFType } from '../types/card.ts';

interface OfPopoverProps {
  card: CardItem;
  numero: number;
  slotTitle?: string;
  anchor: HTMLElement;
  onClose: () => void;
}

const GAP = 8;
const MARGE = 8;

export const OfPopover: React.FC<OfPopoverProps> = ({
  card,
  numero,
  slotTitle,
  anchor,
  onClose,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null);

  const of = card.ofs?.[numero - 1];
  const ofs = card.ofs || [];

  const placer = useCallback(() => {
    const r = anchor.getBoundingClientRect();
    const el = panelRef.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = r.right + GAP;
    let origin = 'left top';
    if (left + w + MARGE > vw) {
      left = r.left - GAP - w;
      origin = 'right top';
      if (left < MARGE) {
        left = Math.max(MARGE, vw - MARGE - w);
      }
    }

    let top = r.top;
    if (h > 0 && top + h + MARGE > vh) {
      top = Math.max(MARGE, vh - MARGE - h);
      origin = origin === 'right top' ? 'right bottom' : 'left bottom';
    }
    if (top < MARGE) top = MARGE;

    setPos((p) => (p && p.top === top && p.left === left && p.origin === origin ? p : { top, left, origin }));
  }, [anchor]);

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
      if (panelRef.current?.contains(cible)) return;
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
      ref={panelRef}
      role='dialog'
      aria-modal='false'
      aria-label={'Detail OF' + numero}
      style={pos ? { top: pos.top, left: pos.left, transformOrigin: pos.origin } : undefined}
      className={`fixed left-0 top-0 z-50 w-[min(340px,calc(100vw-16px))] max-h-[75vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col ${pos ? '' : 'invisible'}`}
>
      <div className='shrink-0 px-3.5 py-3 bg-slate-800 text-white flex items-center justify-between gap-3'>
        <div className='flex items-center gap-2 min-w-0'>
          <span className='w-6 h-6 shrink-0 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center'>
            <Factory className='w-3.5 h-3.5' />
          </span>
          <div className='min-w-0'>
            <div className='text-xs font-extrabold tracking-wider'>
              <span className='uppercase'>CLIENT :</span>{' '}
              <span className='normal-case text-slate-100'>{card.client}</span>
            </div>
          </div>
        </div>
        <button
          type='button'
          onClick={onClose}
          title='Fermer'
          className='shrink-0 w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer'
        >
          <X className='w-3.5 h-3.5' />
        </button>
      </div>

      <div className='flex-1 overflow-y-auto px-3.5 py-3 space-y-3'>
        {ofs.length === 0 ? (
          <p className='text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3'>
            Aucun OF pour cette carte.
          </p>
        ) : (
          <>
            <div className='space-y-1.5'>
              <div className='text-sm font-bold text-slate-700'>{card.modele}</div>
              <div className='bg-slate-50 border border-slate-200 rounded-lg overflow-hidden'>
                {ofs.map((ofItem, idx) => {
                  const ofType = normalizeOFType(ofItem.type);
                  const typeInfo = OF_TYPES[ofType];
                  const source = Array.isArray(ofItem.casesEnCours) ? ofItem.casesEnCours : [];
                  const nbCases = Math.min(5, Math.max(4, ofItem.nbCases || source.length || 5));
                  const casesValues = Array.from({ length: nbCases }, (_, i) => source[i] ?? 0);

                  return (
                    <div
                      key={ofItem.id || idx}
                      className='text-[11px] px-2.5 py-1.5 leading-relaxed flex items-center gap-1 flex-wrap'
                    >
                      <span className='font-semibold text-slate-800'>{idx + 1}</span>
                      <span className='text-slate-600'>:</span>
                      {casesValues.map((v, c) => {
                        const dernier = c === casesValues.length - 1;
                        return (
                          <React.Fragment key={c}>
                            <span className={dernier ? 'font-bold text-slate-900' : 'text-slate-700'}>
                              {dernier ? ofItem.quantiteDemandee : v}
                            </span>
                            {!dernier && <span className='text-slate-300'>/</span>}
                          </React.Fragment>
                        );
                      })}
                      <span
                        title={typeInfo.label}
                        className={`font-bold px-1.5 py-0.5 rounded-md border ${typeInfo.classe}`}
                      >
                        {ofType}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const Info = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className='bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 min-w-0'>
    <div className='flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400'>
      {icon}
      <span className='truncate'>{label}</span>
    </div>
    <div className='text-xs font-bold text-slate-700 truncate mt-0.5'>{value}</div>
  </div>
);
