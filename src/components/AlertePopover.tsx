import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, X, Plus, Trash2 } from 'lucide-react';
import { CardItem } from '../types/card.ts';
import {
  getJalonsCard,
  themeJalon,
  marqueJalon,
  titreCategorie,
  ORDRE_CATEGORIES,
  type JalonInfo,
} from '../utils/jalons.ts';
import { getNowParis, getSemaineISO } from '../utils/dateFrance.ts';
import {
  useAlertesManuelles,
  ecrireAlertesManuelles,
  alertesCarte,
  type AlerteManuelle,
} from '../utils/alertesManuelles.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';

interface AlertePopoverProps {
  card: CardItem;
  /** Titre de la case qui a déclenché l'ouverture : « Modèle en cours #1 (Glaïeul) ». */
  slotTitle?: string;
  /** Élément déclencheur : le popover s'ancre dessus et le suit au défilement. */
  anchor: HTMLElement;
  onClose: () => void;
}

/** Écart entre la bande d'alerte et le popover, et marge de sécurité au bord d'écran. */
const GAP = 8;
const MARGE = 8;

/**
 * Popover d'alerte ancré sur la bande clignotante : détail des jalons en retard,
 * alertes écrites à la main, rien d'autre. Il s'ouvre à droite de la bande, en
 * superposition temporaire des colonnes voisines, se repositionne au défilement,
 * se retourne à gauche s'il déborde et se ferme par l'Échap, un clic à
 * l'extérieur ou la croix.
 */
export const AlertePopover: React.FC<AlertePopoverProps> = ({
  card,
  slotTitle,
  anchor,
  onClose,
}) => {
  const catalogue = useJalonCatalogue();
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    origin: string;
  } | null>(null);
  // Source partagée avec la table : une alerte écrite ici allume la bande de la case.
  const manuelles = useAlertesManuelles();
  const [saisie, setSaisie] = useState('');

  // Position : à droite de la bande, aligné sur son sommet — le panneau se
  // superpose temporairement aux colonnes voisines (Inspection) plutôt que de
  // s'ouvrir sous la case. Retourné à gauche s'il déborde, borné à l'écran.
  const placer = useCallback(() => {
    if (!anchor.isConnected) {
      onClose();
      return;
    }
    const r = anchor.getBoundingClientRect();
    const panel = panelRef.current;
    const h = panel?.offsetHeight ?? 0;
    const w = panel?.offsetWidth ?? 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = r.right + GAP;
    let origin = 'left top';
    if (w > 0 && left + w + MARGE > vw) {
      const aGauche = r.left - GAP - w;
      if (aGauche >= MARGE) {
        left = aGauche;
        origin = 'right top';
      } else {
        left = Math.max(MARGE, vw - MARGE - w);
      }
    }

    let top = r.top;
    if (h > 0 && top + h + MARGE > vh) {
      top = Math.max(MARGE, vh - MARGE - h);
      origin = origin === 'right top' ? 'right bottom' : 'left bottom';
    }
    if (top < MARGE) top = MARGE;

    setPos((p) =>
      p && p.top === top && p.left === left && p.origin === origin
        ? p
        : { top, left, origin }
    );
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    placer();
  }, [placer]);

  // Suit la bande au défilement (vertical comme horizontal) et au redimensionnement.
  useEffect(() => {
    const onMove = () => placer();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [placer]);

  // Fermeture : Échap et clic en dehors du popover ou de la bande.
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

  const semaineCourante = getSemaineISO();
  const jalons = getJalonsCard(card, catalogue, semaineCourante);
  const enRetard = jalons.filter((j) => j.enRetard);
  // Regroupement par grandeur, dans l'ordre d'affichage partagé par tout
  // l'application : les nomenclatures d'abord, les statuts ensuite.
  const groupesAlertes: { categorie: JalonInfo['categorie']; jalons: JalonInfo[] }[] =
    ORDRE_CATEGORIES.map((categorie) => ({
      categorie,
      jalons: enRetard.filter((j) => j.categorie === categorie),
    })).filter((g) => g.jalons.length > 0);
  const alertesManuelles = alertesCarte(manuelles, card.id);
  const totalAlertes = enRetard.length + alertesManuelles.length;

  const ajouterAlerte = () => {
    const texte = saisie.trim();
    if (!texte) return;
    const now = getNowParis();
    const entree: AlerteManuelle = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      texte,
      creeLe: `${now.dateStr} à ${now.timeStr}`,
    };
    ecrireAlertesManuelles({
      ...manuelles,
      [card.id]: [...alertesManuelles, entree],
    });
    setSaisie('');
  };

  const supprimerAlerte = (id: string) => {
    ecrireAlertesManuelles({
      ...manuelles,
      [card.id]: alertesManuelles.filter((a) => a.id !== id),
    });
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label={`Alertes de ${card.modele}`}
      style={
        pos
          ? { top: pos.top, left: pos.left, transformOrigin: pos.origin }
          : undefined
      }
      className={`fixed left-0 top-0 z-50 w-[min(360px,calc(100vw-16px))] max-h-[75vh] bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col ${
        pos ? 'animate-popover-in' : 'invisible'
      }`}
    >
      {/* En-tête */}
      <div className="shrink-0 px-3.5 py-3 bg-rose-600 text-white flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="mt-0.5 w-6 h-6 shrink-0 rounded-lg bg-white/15 border border-white/25 flex items-center justify-center motion-safe:animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-extrabold uppercase tracking-wider">
              Alerte{totalAlertes > 0 ? ` · ${totalAlertes}` : ''}
            </div>
            <div className="text-[11px] text-rose-100 truncate">
              {slotTitle ? `${slotTitle} — ` : ''}
              {card.modele}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
          title="Fermer (Échap)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Corps défilant : les détails des alertes, rien d'autre */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Jalons en retard */}
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Jalons en retard ({enRetard.length})
          </h4>
          {enRetard.length === 0 ? (
            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
              Aucun jalon en retard sur cette carte.
            </p>
          ) : (
            <div className="space-y-3">
              {groupesAlertes.map((groupe) => (
                <div key={groupe.categorie}>
                  <ul className="space-y-2">
                    {groupe.jalons.map((j) => {
                      const retard = semaineCourante - (j.semaine ?? semaineCourante);
                      return (
                        <li
                          key={j.code}
                          className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex items-start gap-2.5"
                        >
                          <span
                            className={`shrink-0 inline-grid grid-cols-[1.55rem_1.75rem] items-stretch overflow-hidden rounded border text-[10px] font-bold ${themeJalon(
                              j
                            ).pastille}`}
                          >
                            <span className="flex items-center justify-center py-0.5 tracking-wide">
                              {j.code}
                            </span>
                            <span className="flex items-center justify-center py-0.5 border-l border-black/10">
                              {marqueJalon(j)}
                            </span>
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-slate-800">
                              {j.titre}
                            </div>
                            <div className="text-[11px] text-rose-700 font-medium">
                              Attendu S{j.semaine} •{' '}
                              {retard > 0
                                ? `${retard} semaine${retard > 1 ? 's' : ''} de retard`
                                : 'semaine dépassée'}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Alertes écrites à la main */}
        <section>
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
            Alertes ajoutées ({alertesManuelles.length})
          </h4>

          {alertesManuelles.length === 0 ? (
            <p className="text-xs text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-2.5">
              Aucune alerte ajoutée pour l'instant.
            </p>
          ) : (
            <ul className="space-y-2">
              {alertesManuelles.map((a) => (
                <li
                  key={a.id}
                  className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-600" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 whitespace-pre-wrap break-words">
                      {a.texte}
                    </div>
                    <div className="text-[10px] text-rose-700/70 mt-0.5">
                      Ajoutée le {a.creeLe}
                    </div>
                  </div>
                  <button
                    onClick={() => supprimerAlerte(a.id)}
                    title="Supprimer cette alerte"
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Saisie : ancrée en bas du popover, toujours visible quelle que soit
          la longueur de la liste défilante. */}
      <div className="shrink-0 border-t border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              ajouterAlerte();
            }
          }}
          rows={2}
          placeholder="Ajouter une alerte…"
          className="w-full resize-none text-left align-top text-xs leading-snug text-slate-700 bg-white border border-transparent hover:border-slate-300 rounded-lg px-2.5 py-1.5 focus:border-rose-300 focus:outline-hidden focus:ring-1 focus:ring-rose-300"
        />
        <div className="flex items-center justify-between gap-2 mt-1.5">
          <button
            onClick={onClose}
            className="px-2 py-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            Fermer
          </button>
          <button
            onClick={ajouterAlerte}
            disabled={!saisie.trim()}
            title="Ajouter l'alerte (Ctrl + Entrée)"
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-transparent"
          >
            <Plus className="w-3 h-3" />
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
};
