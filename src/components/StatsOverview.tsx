import React, { useState } from 'react';
import { CardItem } from '../types/card.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { getEtatJalon } from '../utils/jalons.ts';
import {
  Layers,
  CalendarCheck,
  AlertTriangle,
  Users2,
  Filter,
  ChevronDown,
} from 'lucide-react';

export type KpiFilterType = 'ALL' | 'RDL' | 'ALERTE';

interface StatsOverviewProps {
  cards: CardItem[];
  activeFilter?: KpiFilterType;
  onSelectFilter?: (filter: KpiFilterType) => void;
  isMeetingFilterActive: boolean;
  onToggleMeetingFilter: () => void;
  pendingReviewCount: number;
}

type AccentColor = 'blue' | 'purple' | 'rose' | 'amber';

interface Palette {
  activeContainer: string;
  activeIcon: string;
  idleIcon: string;
  count: string;
  label: string;
}

const PALETTES: Record<AccentColor, Palette> = {
  blue: {
    activeContainer: 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/60',
    activeIcon: 'bg-blue-600 text-white',
    idleIcon: 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white',
    count: 'text-blue-950',
    label: 'text-blue-700',
  },
  purple: {
    activeContainer: 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/60',
    activeIcon: 'bg-purple-600 text-white',
    idleIcon: 'bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white',
    count: 'text-purple-950',
    label: 'text-purple-700',
  },
  rose: {
    activeContainer: 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/60',
    activeIcon: 'bg-rose-600 text-white',
    idleIcon: 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white',
    count: 'text-rose-950',
    label: 'text-rose-700',
  },
  amber: {
    activeContainer: 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/60',
    activeIcon: 'bg-amber-500 text-white',
    idleIcon: 'bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white',
    count: 'text-amber-950',
    label: 'text-amber-700',
  },
};

interface FilterTileProps {
  icon: React.ReactNode;
  count: number;
  label: string;
  title: string;
  active: boolean;
  color: AccentColor;
  onClick: () => void;
}

const FilterTile: React.FC<FilterTileProps> = ({
  icon,
  count,
  label,
  title,
  active,
  color,
  onClick,
}) => {
  const palette = PALETTES[color];
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`group w-28 h-28 shrink-0 rounded-xl border flex flex-col items-center justify-center gap-1 p-1.5 transition-all duration-200 cursor-pointer select-none ${
        active
          ? palette.activeContainer
          : 'border-slate-200/80 bg-white hover:shadow-md hover:-translate-y-0.5 hover:border-slate-300'
      }`}
    >
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
          active ? palette.activeIcon : palette.idleIcon
        }`}
      >
        {icon}
      </span>
      <span
        className={`text-lg font-extrabold leading-none ${
          active ? palette.count : 'text-slate-900'
        }`}
      >
        {count}
      </span>
      <span
        className={`text-[9px] font-bold uppercase tracking-wider text-center leading-tight ${
          active ? palette.label : 'text-slate-600'
        }`}
      >
        {label}
      </span>
    </button>
  );
};

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  cards,
  activeFilter = 'ALL',
  onSelectFilter,
  isMeetingFilterActive,
  onToggleMeetingFilter,
  pendingReviewCount,
}) => {
  const [open, setOpen] = useState(false);
  const catalogue = useJalonCatalogue();

  const totalCards = cards.length;
  const bloqueesCount = cards.filter((c) => c.statut === 'BLOQUE').length;

  // RDL : Réunion De Lancement. Le jalon est propre à chaque carte : seuls les
  // modèles qui le portent comptent, et le filtre RDL disparaît si plus aucune
  // carte ne le porte, sinon le décompte resterait figé à zéro.
  const cartesAvecRDL = cards.filter((c) => (c.jalons ?? []).some((j) => j.code === 'RDL'));
  const jalonRDL = catalogue.find((j) => j.code === 'RDL');
  const rdlActif = Boolean(jalonRDL) && cartesAvecRDL.length > 0;
  const rdlAProgrammer = rdlActif
    ? cartesAvecRDL.filter((c) => !getEtatJalon(c, 'RDL').valide && c.statut !== 'TERMINE').length
    : 0;

  const handleCardClick = (filter: KpiFilterType) => {
    if (!onSelectFilter) return;
    if (activeFilter === filter && filter !== 'ALL') {
      onSelectFilter('ALL');
    } else {
      onSelectFilter(filter);
    }
  };

  const nbFiltresActifs = (activeFilter !== 'ALL' ? 1 : 0) + (isMeetingFilterActive ? 1 : 0);

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title={open ? 'Masquer les filtres' : 'Afficher les filtres'}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Filter className="w-4 h-4 text-blue-600" />
          Filtres
        </span>
        <span className="flex items-center gap-2">
          {nbFiltresActifs > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
              {nbFiltresActifs} actif{nbFiltresActifs > 1 ? 's' : ''}
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-wrap gap-3 animate-popover-in">
          <FilterTile
            icon={<Layers className="w-4 h-4" />}
            count={totalCards}
            label="Cartes / Modèles"
            title="Afficher tous les modèles en atelier"
            active={activeFilter === 'ALL'}
            color="blue"
            onClick={() => handleCardClick('ALL')}
          />
          {rdlActif && (
            <FilterTile
              icon={<CalendarCheck className="w-4 h-4" />}
              count={rdlAProgrammer}
              label="RDL"
              title="Afficher les cartes concernées par la RDL"
              active={activeFilter === 'RDL'}
              color="purple"
              onClick={() => handleCardClick('RDL')}
            />
          )}
          <FilterTile
            icon={<AlertTriangle className="w-4 h-4" />}
            count={bloqueesCount}
            label="Alerte et priorité"
            title="Afficher les cartes avec alertes et priorités"
            active={activeFilter === 'ALERTE'}
            color="rose"
            onClick={() => handleCardClick('ALERTE')}
          />
          <FilterTile
            icon={<Users2 className="w-4 h-4" />}
            count={pendingReviewCount}
            label="Réunion"
            title="Filtrer les cartes nécessitant une décision ou un arbitrage en réunion"
            active={isMeetingFilterActive}
            color="amber"
            onClick={onToggleMeetingFilter}
          />
        </div>
      )}
    </div>
  );
};
