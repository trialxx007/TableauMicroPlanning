import React from 'react';
import { LogOut } from 'lucide-react';
import { Profil } from '@/src/utils/auth.ts';

interface SessionBadgeProps {
  profil: Profil;
  onDeconnexion: () => void;
}

/** Pastille du profil connecté + bouton de déconnexion, posée dans chaque en-tête. */
export const SessionBadge: React.FC<SessionBadgeProps> = ({ profil, onDeconnexion }) => {
  return (
    <div className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full bg-slate-50 border border-slate-200">
      <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
      <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
        {profil.role}
      </span>
      <button
        type="button"
        onClick={onDeconnexion}
        title="Se déconnecter"
        aria-label="Se déconnecter"
        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
      >
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
