import React from 'react';
import { CardItem } from '../types/card.ts';
import {
  Layers,
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Filter,
} from 'lucide-react';

export type KpiFilterType = 'ALL' | 'RDL' | 'ALERTE';

interface StatsOverviewProps {
  cards: CardItem[];
  activeFilter?: KpiFilterType;
  onSelectFilter?: (filter: KpiFilterType) => void;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  cards,
  activeFilter = 'ALL',
  onSelectFilter,
}) => {
  const totalCards = cards.length;
  const enCoursCount = cards.filter((c) => c.statut === 'EN_COURS').length;
  const termineesCount = cards.filter((c) => c.statut === 'TERMINE').length;
  const bloqueesCount = cards.filter((c) => c.statut === 'BLOQUE').length;
  const enAttenteCount = cards.filter((c) => c.statut === 'EN_ATTENTE').length;

  // RDL : Réunion De Lancement
  const rdlProgrammes = cards.filter((c) => c.rdl).length;
  const rdlAProgrammer = cards.filter((c) => !c.rdl && c.statut !== 'TERMINE').length;

  const handleCardClick = (filter: KpiFilterType) => {
    if (onSelectFilter) {
      // Toggle or set
      if (activeFilter === filter && filter !== 'ALL') {
        onSelectFilter('ALL');
      } else {
        onSelectFilter(filter);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {/* 1. Cartes / Modèles en Atelier */}
      <div
        onClick={() => handleCardClick('ALL')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCardClick('ALL')}
        title="Cliquer pour afficher tous les modèles en atelier"
        className={`bg-white rounded-xl p-4.5 border transition-all duration-200 cursor-pointer select-none group shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-blue-400 hover:ring-2 hover:ring-blue-400/25 ${
          activeFilter === 'ALL'
            ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20 shadow-sm'
            : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 group-hover:text-blue-700 transition-colors">
            Cartes / Modèles en Atelier
          </span>
          <span
            className={`p-2 rounded-lg transition-colors ${
              activeFilter === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-slate-900 group-hover:text-blue-900 transition-colors">
              {totalCards}
            </span>
            <span className="text-xs text-slate-500">modèles suivis</span>
          </div>

          {activeFilter === 'ALL' && (
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Filter className="w-3 h-3" /> Actif
            </span>
          )}
        </div>

        <div className="text-xs text-slate-500 mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="flex items-center gap-1 text-blue-700 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            {enCoursCount} en cours
          </span>
          <span>•</span>
          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {termineesCount} terminés
          </span>
        </div>
      </div>

      {/* 2. RDL (Réunion De Lancement) */}
      <div
        onClick={() => handleCardClick('RDL')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCardClick('RDL')}
        title="Cliquer pour afficher les cartes concernées par la RDL"
        className={`bg-white rounded-xl p-4.5 border transition-all duration-200 cursor-pointer select-none group shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-purple-400 hover:ring-2 hover:ring-purple-400/25 ${
          activeFilter === 'RDL'
            ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-50/20 shadow-sm'
            : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 group-hover:text-purple-700 transition-colors">
            RDL (Réunion De Lancement)
          </span>
          <span
            className={`p-2 rounded-lg transition-colors ${
              activeFilter === 'RDL'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-purple-950 group-hover:text-purple-900 transition-colors">
              {rdlProgrammes}
            </span>
            <span className="text-xs text-slate-500">RDL validées</span>
          </div>

          {activeFilter === 'RDL' ? (
            <span className="text-[11px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filtré
            </span>
          ) : (
            rdlAProgrammer > 0 && (
              <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {rdlAProgrammer} à planifier
              </span>
            )
          )}
        </div>

        <div className="text-xs text-slate-500 mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-purple-900 font-medium">
            Programmation & découpage des OF
          </span>
          <span className="text-[11px] font-semibold text-purple-700 group-hover:underline">
            Afficher les cartes →
          </span>
        </div>
      </div>

      {/* 3. Alerte et priorité (anciennement Points d'Arbitrage Réunion) */}
      <div
        onClick={() => handleCardClick('ALERTE')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleCardClick('ALERTE')}
        title="Cliquer pour afficher les cartes avec alertes et priorités"
        className={`bg-white rounded-xl p-4.5 border transition-all duration-200 cursor-pointer select-none group shadow-xs hover:shadow-lg hover:-translate-y-1 hover:border-rose-400 hover:ring-2 hover:ring-rose-400/25 ${
          activeFilter === 'ALERTE'
            ? 'border-rose-500 ring-2 ring-rose-500/20 bg-rose-50/20 shadow-sm'
            : 'border-slate-200/80'
        }`}
      >
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 group-hover:text-rose-700 transition-colors">
            Alerte et priorité
          </span>
          <span
            className={`p-2 rounded-lg transition-colors ${
              activeFilter === 'ALERTE'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-extrabold transition-colors ${
                bloqueesCount > 0 ? 'text-rose-600' : 'text-slate-900'
              }`}
            >
              {bloqueesCount}
            </span>
            <span className="text-xs text-slate-500">
              {bloqueesCount > 1 ? 'alertes actives' : 'alerte active'}
            </span>
          </div>

          {activeFilter === 'ALERTE' ? (
            <span className="text-[11px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Filter className="w-3 h-3" /> Filtré
            </span>
          ) : (
            enAttenteCount > 0 && (
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                {enAttenteCount} en attente
              </span>
            )
          )}
        </div>

        <div className="text-xs text-slate-500 mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-rose-800 font-medium">
            {bloqueesCount > 0 ? 'Arbitrage immédiat en réunion' : 'Aucun blocage critique'}
          </span>
          <span className="text-[11px] font-semibold text-rose-700 group-hover:underline">
            Voir les alertes →
          </span>
        </div>
      </div>
    </div>
  );
};
