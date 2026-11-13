import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';
import {
  CardItem,
  OF_TYPES,
  OrdreFabrication,
  normalizeOFType,
} from '@/src/types/card.ts';
import { InspectionBloc } from '@/src/types/suiviGlobal.ts';
import { dateCourte, hasPassedCc } from '@/src/utils/inspections.ts';
import { normalizeCases } from './OFSubTable.tsx';

/** Écart sous l'ancre et marge de sécurité au bord d'écran. */
const ECART = 6;
const MARGE = 8;

/** Un OF terminé, rattaché à sa carte pour l'historique par client. */
export interface OFTermine {
  card: CardItem;
  of: OrdreFabrication;
  index: number;
  dateCc?: string;
}

/**
 * Un OF est terminé dès que son contrôle CC (Carton Check) est validé.
 */
export function collecterOfsTermines(
  card: CardItem,
  bloc?: InspectionBloc
): OFTermine[] {
  const termines: OFTermine[] = [];
  card.ofs.forEach((of, index) => {
    if (!hasPassedCc(bloc, index)) return;
    const cc = bloc?.valeurs.find(
      (v) =>
        v.type === 'CC' &&
        (v.ofIndex ?? 0) === index &&
        v.resultat === 'P'
    );
    termines.push({ card, of, index, dateCc: cc?.dateResultat ?? cc?.date });
  });
  return termines;
}

interface HistoriqueOFsPopoverProps {
  /** Bouton horloge cliqué : le popover s'ancre dessous et le suit au défilement. */
  anchor: HTMLElement;
  client: string;
  termines: OFTermine[];
  onClose: () => void;
}

/** Nombre de cases borné à 4 ou 5, comme dans les tableaux des OFs. */
function nbCasesBorne(nb: number | undefined): number {
  return Math.min(5, Math.max(4, nb || 5));
}

/** Abréviations des quantités, de la gauche vers la droite. */
function libellesCases(nb: number): string[] {
  const etapes = nb >= 5 ? ['PK', 'FA', 'FT', 'QL'] : ['PK', 'FT', 'QL'];
  return [...etapes, 'OF'];
}

/**
 * Popover listant les OFs terminés d'un tableau client. Un OF est considéré
 * terminé dès que son contrôle CC (Carton Check) est validé dans le Suivi
 * Global. L'historique est en lecture seule : les OFs encore en cours restent
 * seuls éditables dans le tableau.
 */
export const HistoriqueOFsPopover: React.FC<HistoriqueOFsPopoverProps> = ({
  anchor,
  client,
  termines,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Le plus récemment terminé en premier.
  const entrees = [...termines].sort(
    (a, b) =>
      (b.dateCc ?? '').localeCompare(a.dateCc ?? '') ||
      a.card.modele.localeCompare(b.card.modele, 'fr') ||
      a.index - b.index
  );

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
      className={`w-[360px] max-w-[calc(100vw-16px)] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden ${
        pos ? 'animate-popover-in' : 'invisible'
      }`}
      role="dialog"
      aria-label="Historique des OFs terminés"
    >
      <div className="flex items-center gap-2 bg-slate-800 px-3 py-2 text-white">
        <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider">
            OFs terminés
          </div>
          <div className="truncate text-[10px] text-slate-300">{client}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
          {entrees.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          title="Fermer"
          className="shrink-0 rounded-md bg-white/10 p-1 hover:bg-white/20 transition-colors cursor-pointer"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {entrees.length === 0 ? (
          <p className="px-1 py-2 text-[11px] italic text-slate-400">
            Aucun OF terminé. Un OF passe à l'historique lorsque son CC est validé.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entrees.map(({ card, of, index, dateCc }) => {
              const type = normalizeOFType(of.type);
              const nb = nbCasesBorne(of.nbCases);
              const cases = normalizeCases(of.casesEnCours, nb, of.quantiteDemandee);
              const libelles = libellesCases(nb);
              return (
                <li
                  key={`${card.id}-${of.id}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 text-right text-[11px] font-bold text-slate-500 tabular-nums">
                      {index + 1}:
                    </span>
                    <div
                      className="inline-flex items-center"
                      title={libelles.join(' / ')}
                    >
                      {cases.map((val, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && (
                            <span className="px-0.5 text-slate-300 font-bold select-none">
                              /
                            </span>
                          )}
                          <span
                            className={`w-12 text-center text-[11px] font-bold px-1 py-0.5 ${
                              idx === nb - 1
                                ? 'rounded bg-slate-200 text-slate-900'
                                : 'text-slate-700'
                            }`}
                          >
                            {val}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                    <span
                      title={OF_TYPES[type].label}
                      className={`ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${OF_TYPES[type].classe}`}
                    >
                      {type}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                    <span className="min-w-0 truncate font-semibold text-slate-500">
                      {card.modele} · {card.batch}
                    </span>
                    <span className="shrink-0 inline-flex items-center gap-1 font-semibold text-emerald-700">
                      <Clock className="h-3 w-3 shrink-0" />
                      CC validé
                      {dateCc ? ` le ${dateCourte(dateCc)}` : ''}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
