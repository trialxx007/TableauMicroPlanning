import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { AppPage, libelleOnglet } from './ViewSwitcher.tsx';

const CLE_STOCKAGE = 'aic_entete_visible_v1';

/** Visibilité partagée du bandeau d'en-tête, conservée entre les onglets et les rechargements. */
export function useEnteteVisible(): [boolean, () => void] {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(CLE_STOCKAGE) !== '0';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CLE_STOCKAGE) setVisible(event.newValue !== '0');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const basculer = () =>
    setVisible((precedent) => {
      const suivant = !precedent;
      try {
        localStorage.setItem(CLE_STOCKAGE, suivant ? '1' : '0');
      } catch {
        // Stockage indisponible : la préférence reste valable pour la session.
      }
      return suivant;
    });

  return [visible, basculer];
}

interface BoutonVisibiliteEnteteProps {
  visible: boolean;
  onBasculer: () => void;
  className?: string;
}

/** Bouton œil / œil barré pour masquer ou réafficher le bandeau. */
export const BoutonVisibiliteEntete: React.FC<BoutonVisibiliteEnteteProps> = ({
  visible,
  onBasculer,
  className = '',
}) => (
  <button
    type="button"
    onClick={onBasculer}
    aria-pressed={!visible}
    aria-label={visible ? "Masquer l'en-tête" : "Afficher l'en-tête"}
    title={visible ? "Masquer l'en-tête" : "Afficher l'en-tête"}
    className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 ${className}`}
  >
    {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
);

interface EnteteReduiteProps {
  page: AppPage;
  onBasculer: () => void;
  containerClassName?: string;
}

/** Barre minimale affichée à la place du bandeau : uniquement le titre de l'onglet. */
export const EnteteReduite: React.FC<EnteteReduiteProps> = ({
  page,
  onBasculer,
  containerClassName = 'page-container',
}) => (
  <div className="relative z-20 border-b border-slate-200 bg-white shadow-xs">
    <div className={`${containerClassName} flex items-center justify-between gap-3 py-2`}>
      <h1 className="m-0 min-w-0 truncate text-sm font-bold uppercase tracking-[0.05em] text-slate-700">
        {libelleOnglet(page)}
      </h1>
      <BoutonVisibiliteEntete visible={false} onBasculer={onBasculer} />
    </div>
  </div>
);
