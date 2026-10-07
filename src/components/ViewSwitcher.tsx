import React from 'react';
import { ClipboardList, TableProperties } from 'lucide-react';

export type AppPage = 'point-journalier' | 'suivi-global';

interface ViewSwitcherProps {
  currentPage: AppPage;
  onChangePage: (page: AppPage) => void;
}

interface TabConfig {
  page: AppPage;
  label: string;
  icon: React.ReactNode;
  title: string;
  activeClass: string;
}

const TABS: TabConfig[] = [
  {
    page: 'point-journalier',
    label: 'Point Commande',
    icon: <ClipboardList className="w-4 h-4" />,
    title: 'Point Commande Journalière : cartes de la réunion, nomenclatures et statuts',
    activeClass: 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200',
  },
  {
    page: 'suivi-global',
    label: 'Suivi Global',
    icon: <TableProperties className="w-4 h-4" />,
    title: 'Suivi Global des chaînes et prochains lancements',
    activeClass: 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200',
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
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
              isActive
                ? tab.activeClass
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};