import React from 'react';
import { ClipboardList, TableProperties, Table2, History } from 'lucide-react';
import { ongletsAutorises } from '../utils/auth.ts';
import { useProfil } from '../context/ProfilContext.tsx';

export type AppPage = 'point-journalier' | 'suivi-global' | 'tableaux-ofs' | 'historique';

interface ViewSwitcherProps {
  currentPage: AppPage;
  onChangePage: (page: AppPage) => void;
}

interface TabConfig {
  page: AppPage;
  label: string;
  icon: React.ReactNode;
  title: string;
  /** Couleurs du bouton, inspirées des boutons switch du Point Commande. */
  activeIcon: string;
  idleIcon: string;
  activeLabel: string;
}

const TABS: TabConfig[] = [
  {
    page: 'point-journalier',
    label: 'Point Commande',
    icon: <ClipboardList className="w-4 h-4" />,
    title: 'Point Commande Journalière : cartes de la réunion, nomenclatures et statuts',
    activeIcon: 'bg-blue-600 text-white shadow-md shadow-blue-600/30',
    idleIcon: 'bg-blue-50 text-blue-500 group-hover:bg-blue-600 group-hover:text-white',
    activeLabel: 'text-blue-700',
  },
  {
    page: 'suivi-global',
    label: 'Suivi Global',
    icon: <TableProperties className="w-4 h-4" />,
    title: 'Suivi Global des chaînes et prochains lancements',
    activeIcon: 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30',
    idleIcon: 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white',
    activeLabel: 'text-indigo-700',
  },
  {
    page: 'tableaux-ofs',
    label: 'Tableaux des OFs',
    icon: <Table2 className="w-4 h-4" />,
    title: 'Tableaux des OFs regroupés par client et par modèle de carte',
    activeIcon: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30',
    idleIcon: 'bg-emerald-50 text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white',
    activeLabel: 'text-emerald-700',
  },
  {
    page: 'historique',
    label: 'Historique',
    icon: <History className="w-4 h-4" />,
    title: 'Historique des modifications (Planning, Production) — réservé à la Direction',
    activeIcon: 'bg-slate-700 text-white shadow-md shadow-slate-700/30',
    idleIcon: 'bg-slate-100 text-slate-500 group-hover:bg-slate-700 group-hover:text-white',
    activeLabel: 'text-slate-700',
  },
];

/** Sélecteur d'interface des deux vues, affiché au centre de l'en-tête. */
export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ currentPage, onChangePage }) => {
  const { profil } = useProfil();
  const autorises = ongletsAutorises(profil.id);
  const onglets = TABS.filter((tab) => autorises.includes(tab.page));

  // Un seul onglet autorisé (profil Production) : le sélecteur n'a plus lieu d'être.
  if (onglets.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label="Choix de l'interface"
      className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl"
    >
      {onglets.map((tab) => {
        const isActive = currentPage === tab.page;
        return (
          <button
            key={tab.page}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangePage(tab.page)}
            title={tab.title}
            className={`group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-300 ease-out cursor-pointer ${
              isActive
                ? 'bg-white shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span
              className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all duration-300 ease-out ${
                isActive ? tab.activeIcon : tab.idleIcon
              }`}
            >
              {tab.icon}
            </span>
            <span className={`transition-colors duration-300 ${isActive ? tab.activeLabel : ''}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};