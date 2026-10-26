import React from 'react';
import { LogOut } from 'lucide-react';
import { Profil } from '@/src/utils/auth.ts';

interface SessionBadgeProps {
  profil: Profil;
  onDeconnexion: () => void;
}

/** Current profile pill with avatar, role label and logout action, used in every header. */
export const SessionBadge: React.FC<SessionBadgeProps> = ({ profil, onDeconnexion }) => {
  const initial = profil.role.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="inline-flex shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 py-[5px] pl-[7px] pr-[5px] text-sm font-medium text-slate-700 shadow-xs">
      <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[13px] font-semibold text-white">
        {initial}
        <span
          className="absolute bottom-0 right-0 h-[9px] w-[9px] rounded-full border-2 border-slate-50 bg-emerald-500"
          aria-hidden="true"
        />
      </span>

      <span className="whitespace-nowrap">{profil.role}</span>

      <button
        type="button"
        onClick={onDeconnexion}
        aria-label="Se déconnecter"
        className="group inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white pl-2.5 pr-3 text-[13px] font-medium text-slate-600 transition-colors duration-150 hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:border-red-200 focus-visible:bg-red-50 focus-visible:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
      >
        <LogOut
          className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-focus-visible:translate-x-0.5"
          aria-hidden="true"
        />
        <span>Déconnexion</span>
      </button>
    </div>
  );
};
