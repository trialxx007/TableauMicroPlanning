import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Factory, User, Package } from 'lucide-react';
import { CardItem, OF_TYPES, normalizeOFType } from '../types/card.ts';

interface OfPopoverProps {
  card: CardItem;
  /** Numero de l'OF affiche (1, 2, 3...). */
  numero: number;
  slotTitle?: string;
  anchor: HTMLElement;
  onClose: () => void;
}

const GAP = 8;
const MARGE = 8;

/** Popover ancre sur le libelle OFx de la colonne Inspection : detalle de
 *  l'OF pris dans la carte du modele en cours (quantites, sous-OFs, type). */
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

  const typeKey = of ? normalizeOFType(of.type) : 'I';
  const typeInfo = OF_TYPES[typeKey];

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Detail OF${numero}`}
      style={pos ? { top: pos.top, left: pos.left, transformOrigin: pos.origin } : undefined}
      className={`fixed left-0 top-0 z-50 w-[min(340px,calc(100vw-16px))] max-h-[75vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col ${
        pos ? 'animate-popover-in' : 'invisible'
      }`}
    >
      <div className="shrink-0 px-3.5 py-3 bg-slate-800 text-white flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 w-6 h-6 shrink-0 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center">
            <Factory className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wider">OF {numero}</div>
            <div className="text-[11px] text-slate-300 truncate">
              {slotTitle ? `${slotTitle} - ` : ''}
              {card.modele}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          className="shrink-0 w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3">
        {!of ? (
          <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3">
            Cet OF n'existe pas encore dans la carte du modele en cours.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${typeInfo.classe}`}>
                {typeInfo.label}
              </span>
              <span className="text-xs font-bold text-slate-700 truncate">
                {of.codeOF}
                {of.titre ? ` - ${of.titre}` : ''}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Info icon={<User className="w-3.5 h-3.5" />} label="Executant" value={of.nomExecutant || '-'} />
              <Info icon={<Package className="w-3.5 h-3.5" />} label="Quantite demandee" value={String(of.quantiteDemandee ?? 0)} />
              <Info icon={<Package className="w-3.5 h-3.5" />} label="Quantite finie" value={String(of.quantiteFinie ?? 0)} />
              <Info icon={<Package className="w-3.5 h-3.5" />} label="Reste a produire" value={String(of.resteAProduire ?? 0)} />
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Sous-OFs ({of.sousOfs?.length ?? 0})
              </div>
              {!of.sousOfs?.length ? (
                <p className="text-[11px] text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-2">
                  Aucun sous-OF.
                </p>
              ) : (
                <ul className="space-y-1">
                  {of.sousOfs.map((so) => (
                    <li
                      key={so.id}
                      className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate font-semibold text-slate-700">
                        {so.codeSousOF}
                        {so.titre ? ` - ${so.titre}` : ''}
                      </span>
                      <span className="shrink-0 text-slate-500">
                        {so.quantiteFinie}/{so.quantiteDemandee}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {of.notes && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Notes</div>
                <p className="text-[11px] text-slate-600 whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-2">
                  {of.notes}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Info = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 min-w-0">
    <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">
      {icon}
      <span className="truncate">{label}</span>
    </div>
    <div className="text-xs font-bold text-slate-700 truncate mt-0.5">{value}</div>
  </div>
);
