import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  RotateCcw,
  Calendar,
  Clock,
  Users2,
} from 'lucide-react';
import { getNowParis, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { ViewSwitcher, AppPage } from './ViewSwitcher.tsx';

interface HeaderProps {
  onOpenCreateModal: () => void;
  onResetData: () => void;
  currentPage: AppPage;
  onChangePage: (page: AppPage) => void;
  cardsCount: number;
  isMeetingFilterActive: boolean;
  onToggleMeetingFilter: () => void;
  pendingReviewCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateModal,
  onResetData,
  currentPage,
  onChangePage,
  cardsCount,
  isMeetingFilterActive,
  onToggleMeetingFilter,
  pendingReviewCount,
}) => {
  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();

  useEffect(() => {
    const timer = setInterval(() => {
      setParisTime(getNowParis().timeStr);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <ClipboardList className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Point Commande Journalière
                </h1>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                  Réunion Journalière
                </span>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                  Textile & Haut de Gamme
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-slate-500 mt-0.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {fullFrenchDate}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 font-semibold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  {parisTime}
                  <span className="text-[10px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  <strong>{cardsCount}</strong> {cardsCount > 1 ? 'cartes' : 'carte'}
                </span>
              </div>
            </div>
          </div>

          {/* Center View Switcher */}
          <div className="flex md:justify-center">
            <ViewSwitcher currentPage={currentPage} onChangePage={onChangePage} />
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center flex-wrap gap-2.5 md:justify-end">
            {/* Quick Toggle for Daily Standup Focus */}
            <button
              onClick={onToggleMeetingFilter}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                isMeetingFilterActive
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-300'
              }`}
              title="Filtrer les cartes nécessitant une décision ou un arbitrage en réunion"
            >
              <Users2 className="w-3.5 h-3.5" />
              <span>Priorité Réunion</span>
              {pendingReviewCount > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    isMeetingFilterActive ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {pendingReviewCount}
                </span>
              )}
            </button>

            <button
              onClick={onResetData}
              title="Réinitialiser les cartes de démonstration"
              className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Réinitialiser</span>
            </button>

            <button
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Nouvelle Carte</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
