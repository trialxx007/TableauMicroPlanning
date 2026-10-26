import React, { useState, useEffect } from 'react';
import {
  Plus,
  Calendar,
  CalendarRange,
  Clock,
} from 'lucide-react';
import { getNowParis, LIBELLE_FUSEAU } from '@/src/utils/dateFrance.ts';
import { ViewSwitcher, AppPage } from './ViewSwitcher.tsx';
import { SessionBadge } from './SessionBadge.tsx';
import { Profil } from '@/src/utils/auth.ts';
import { useLectureSeule } from '@/src/context/ProfilContext.tsx';

interface HeaderProps {
  onOpenCreateModal: () => void;
  currentPage: AppPage;
  onChangePage: (page: AppPage) => void;
  cardsCount: number;
  profil: Profil;
  onDeconnexion: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateModal,
  currentPage,
  onChangePage,
  cardsCount,
  profil,
  onDeconnexion,
}) => {
  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();
  const lectureSeule = useLectureSeule();

  useEffect(() => {
    const timer = setInterval(() => {
      setParisTime(getNowParis().timeStr);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="relative z-30 border-b border-slate-200 bg-white shadow-xs">
      <div className="page-container py-4">
        <div className="flex flex-col gap-4">
          {/* Brand + actions */}
          <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-6">
            {/* Brand */}
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <CalendarRange className="h-6 w-6" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h1 className="m-0 whitespace-normal text-[22px] font-medium leading-[1.2] text-slate-900 min-[900px]:overflow-hidden min-[900px]:text-ellipsis min-[900px]:whitespace-nowrap">
                  Point Commande JournaliA"re
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {fullFrenchDate}
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2 py-0.5 font-medium tabular-nums text-slate-900">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    <span>{parisTime}</span>
                    <span className="text-[11px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    <span className="font-medium text-slate-900">{cardsCount}</span>
                    <span className="text-slate-500">{cardsCount > 1 ? 'cartes' : 'carte'}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 min-[900px]:justify-end">
              {!lectureSeule && (
                <button
                  onClick={onOpenCreateModal}
                  className="inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors duration-150 hover:bg-blue-700 active:bg-blue-800"
                >
                  <Plus className="h-4 w-4 stroke-[2.5]" />
                  <span>Nouvelle Carte</span>
                </button>
              )}
              <SessionBadge profil={profil} onDeconnexion={onDeconnexion} />
            </div>
          </div>

          {/* Tabs */}
          <div className="min-w-0">
            <ViewSwitcher currentPage={currentPage} onChangePage={onChangePage} />
          </div>
        </div>
      </div>
    </header>
  );
};
