import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  Calendar,
  Clock,
} from 'lucide-react';
import { getNowParis, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { ViewSwitcher, AppPage } from './ViewSwitcher.tsx';

interface HeaderProps {
  onOpenCreateModal: () => void;
  currentPage: AppPage;
  onChangePage: (page: AppPage) => void;
  cardsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateModal,
  currentPage,
  onChangePage,
  cardsCount,
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
    <header className="bg-white border-b border-slate-200 relative z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                  Point Commande Journalière
                </h1>
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
