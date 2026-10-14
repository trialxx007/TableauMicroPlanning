import React from 'react';
import { ClipboardList, TableProperties, Table2 } from 'lucide-react';

export type AppPage = 'point-journalier' | 'suivi-global' | 'tableaux-ofs';

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
    activeIcon: 'bg-blue-600 text-white',
    idleIcon: 'bg-blue-50 text-blue-500 group-hover:bg-blue-600 group-hover:text-white',
    activeLabel: 'text-blue-700',
  },
  {
    page: 'suivi-global',
    label: 'Suivi Global',
    icon: <TableProperties className="w-4 h-4" />,
    title: 'Suivi Global des chaînes et prochains lancements',
    activeIcon: 'bg-indigo-600 text-white',
    idleIcon: 'bg-indigo-50 text-indigo-500 group-hover:bg-indigo-600 group-hover:text-white',
    activeLabel: 'text-indigo-700',
  },
  {
    page: 'tableaux-ofs',
    label: 'Tableaux des OFs',
    icon: <Table2 className="w-4 h-4" />,
    title: 'Tableaux des OFs regroupés par client et par modèle de carte',
    activeIcon: 'bg-emerald-600 text-white',
    idleIcon: 'bg-emerald-50 text-emerald-500 group-hover:bg-emerald-600 group-hover:text-white',
    activeLabel: 'text-emerald-700',
  },
];

/** Sélecteur d'interface des deux vues, affiché au centre de l'en-tête. */
export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ currentPage, onChangePage }) => {
  return (
    <div
      role="tablist"
      aria-label="Choix de l'interface"
      className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl"
    >
      {TABS.map((tab) => {
        const isActive = currentPage === tab.page;
        return (
          <button
            key={tab.page}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChangePage(tab.page)}
            title={tab.title}
            className={`group inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              isActive
                ? 'bg-white shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span
              className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-colors ${
                isActive ? tab.activeIcon : tab.idleIcon
              }`}
            >
              {tab.icon}
            </span>
            <span className={isActive ? tab.activeLabel : ''}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};