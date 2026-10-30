import React from 'react';
import { ClipboardList, TableProperties, Table2, History, SquareKanban, Archive } from 'lucide-react';
import { ongletsAutorises } from '@/src/utils/auth.ts';
import { useProfil } from '@/src/context/ProfilContext.tsx';

export type AppPage = 'point-journalier' | 'archive' | 'suivi-global' | 'tableaux-ofs' | 'historique' | 'developpement';

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
    icon: <ClipboardList className="h-[15px] w-[15px]" />,
    title: 'Point Commande Journalière : cartes de la réunion, nomenclatures et statuts',
    activeIcon: 'bg-blue-600 text-white',
    idleIcon: 'bg-blue-50 text-blue-600',
    activeLabel: 'text-blue-700',
  },
  {
    page: 'suivi-global',
    label: 'Suivi Global',
    icon: <TableProperties className="h-[15px] w-[15px]" />,
    title: 'Suivi Global des chaînes et prochains lancements',
    activeIcon: 'bg-indigo-600 text-white',
    idleIcon: 'bg-indigo-50 text-indigo-600',
    activeLabel: 'text-indigo-700',
  },
  {
    page: 'tableaux-ofs',
    label: 'Tableaux des OFs',
    icon: <Table2 className="h-[15px] w-[15px]" />,
    title: 'Tableaux des OFs regroupés par client et par modèle de carte',
    activeIcon: 'bg-emerald-600 text-white',
    idleIcon: 'bg-emerald-50 text-emerald-600',
    activeLabel: 'text-emerald-700',
  },
  {
    page: 'historique',
    label: 'Historique',
    icon: <History className="h-[15px] w-[15px]" />,
    title: 'Historique des modifications (Planning, Production) — réservé à la Direction',
    activeIcon: 'bg-slate-700 text-white',
    idleIcon: 'bg-slate-100 text-slate-500',
    activeLabel: 'text-slate-700',
  },
  {
    page: 'developpement',
    label: 'Développement',
    icon: <SquareKanban className="h-[15px] w-[15px]" />,
    title: 'Tableau kanban du développement : tâches, colonnes et glisser-déposer',
    activeIcon: 'bg-violet-600 text-white',
    idleIcon: 'bg-violet-50 text-violet-600',
    activeLabel: 'text-violet-700',
  },
  {
    page: 'archive',
    label: 'Archive',
    icon: <Archive className="h-[15px] w-[15px]" />,
    title: 'Modèles terminés',
    activeIcon: 'bg-amber-600 text-white',
    idleIcon: 'bg-amber-50 text-amber-600',
    activeLabel: 'text-amber-700',
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
      className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1"
    >
      {onglets.map((tab) => {
        const isActive = currentPage === tab.page;
        return (
          <button
            key={tab.page}
            role="tab"
            aria-selected={isActive}
            aria-label={tab.label}
            onClick={() => onChangePage(tab.page)}
            title={tab.title}
            className={`inline-flex flex-none cursor-pointer items-center gap-2 whitespace-nowrap rounded-[9px] border py-1.5 pl-1.5 pr-3 text-sm transition-colors duration-150 ${
              isActive
                ? `border-slate-200 bg-white font-medium shadow-xs ${tab.activeLabel}`
                : 'border-transparent text-slate-500 hover:bg-slate-200/60'
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] transition-colors duration-150 ${
                isActive ? tab.activeIcon : tab.idleIcon
              }`}
            >
              {tab.icon}
            </span>
            <span className="block leading-none">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};