import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  RotateCcw,
  Calendar,
  Clock,
  Users2,
  TableProperties,
} from 'lucide-react';
import { getNowParis } from '../utils/dateFrance.ts';

interface HeaderProps {
  onOpenCreateModal: () => void;
  onResetData: () => void;
  onOpenSuiviGlobal: () => void;
  cardsCount: number;
  isMeetingFilterActive: boolean;
  onToggleMeetingFilter: () => void;
  pendingReviewCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateModal,
  onResetData,
  onOpenSuiviGlobal,
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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
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
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  <strong>{cardsCount}</strong> {cardsCount > 1 ? 'cartes' : 'carte'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Bouton Suivi Global */}
            <button
              onClick={onOpenSuiviGlobal}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-800 hover:text-indigo-900 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 border border-indigo-200/90 rounded-lg shadow-2xs hover:shadow-xs transition-all cursor-pointer"
              title="Accéder au tableau de Suivi Global des chaînes & prochains lancements"
            >
              <TableProperties className="w-4 h-4 text-indigo-600" />
              <span>Suivi Global</span>
              <span className="text-[10px] bg-indigo-200/70 text-indigo-900 font-semibold px-1.5 py-0.2 rounded-md">
                Chaînes
              </span>
            </button>

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
