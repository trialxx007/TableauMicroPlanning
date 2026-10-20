import React, { useEffect, useRef, useState } from 'react';
import {
  Briefcase,
  CalendarRange,
  Factory,
  Lock,
  LogIn,
  Eye,
  EyeOff,
  ArrowLeft,
  User,
  ChevronRight,
} from 'lucide-react';
import { PROFILS, Profil, ProfilId, motDePasseValide } from '../utils/auth.ts';

interface LoginScreenProps {
  onConnecter: (profil: Profil) => void;
}

/** Accent dégradé propre à chaque profil (aligné sur les couleurs des vues). */
const ACCENTS: Record<ProfilId, { from: string; to: string }> = {
  utilisateur: { from: '#3b82f6', to: '#2563eb' },
  'resp-planning': { from: '#6366f1', to: '#4f46e5' },
  production: { from: '#f59e0b', to: '#d97706' },
  direction: { from: '#8b5cf6', to: '#6d28d9' },
};

const ICONES: Record<ProfilId, React.ReactNode> = {
  utilisateur: <User className="w-5 h-5" />,
  'resp-planning': <CalendarRange className="w-5 h-5" />,
  production: <Factory className="w-5 h-5" />,
  direction: <Briefcase className="w-5 h-5" />,
};

/** Horizons affichés sous le sous-titre : donne le contexte « atelier textile ». */
const POINTS_FORTS = ['Point journalier', 'Suivi global', 'Tableaux des OFs'];

/** Écran d'accès : choix du profil, puis mot de passe pour les profils protégés. */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onConnecter }) => {
  const [choix, setChoix] = useState<Profil | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(false);
  const [afficherMdp, setAfficherMdp] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (choix) {
      setMotDePasse('');
      setErreur(false);
      setAfficherMdp(false);
      // Le focus arrive après le rendu du panneau mot de passe.
      const t = setTimeout(() => champRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [choix]);

  const valider = (e: React.FormEvent) => {
    e.preventDefault();
    if (!choix) return;
    if (motDePasseValide(motDePasse)) {
      onConnecter(choix);
    } else {
      setErreur(true);
      setMotDePasse('');
      champRef.current?.focus();
    }
  };

  const choisirProfil = (profil: Profil) => {
    if (profil.requiertMotDePasse) {
      setChoix(profil);
    } else {
      onConnecter(profil);
    }
  };

  const accent = choix ? ACCENTS[choix.id] : ACCENTS.utilisateur;

  return (
    <div className="starry-surface starry-surface-glow min-h-screen flex flex-col items-center justify-center px-5 py-12">
      <div className="starry-rise w-full max-w-md">
        {/* ---------- Marque ---------- */}
        <div className="flex flex-col items-center text-center mb-9">
          <div className="relative">
            <div
              className="absolute inset-0 rounded-3xl blur-2xl opacity-60"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)' }}
            />
            <div className="relative w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-xl ring-1 ring-white/20">
              <CalendarRange className="w-8 h-8" strokeWidth={1.9} />
            </div>
          </div>
          <h1
            className="mt-5 text-[27px] font-semibold tracking-tight"
            style={{
              backgroundImage: 'linear-gradient(135deg, #bfdbfe, #3b82f6)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Suivi Global
          </h1>
          <p className="mt-2 text-[13px] text-slate-400 max-w-xs">
            {choix ? 'Authentifiez-vous pour ouvrir votre session' : 'Choisissez votre profil pour continuer'}
          </p>

          {!choix && (
            <div className="mt-3.5 flex flex-wrap items-center justify-center gap-1.5">
              {POINTS_FORTS.map((p) => (
                <span
                  key={p}
                  className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 bg-white/[0.04] border border-white/10 rounded-full px-2.5 py-1"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>

        {!choix ? (
          /* ---------- Boutons profils (pilules, comme l'accueil 2602) ---------- */
          <div className="flex flex-col gap-3">
            {PROFILS.map((profil, i) => {
              const a = ACCENTS[profil.id];
              return (
                <button
                  key={profil.id}
                  onClick={() => choisirProfil(profil)}
                  style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                  className="starry-rise group flex items-center gap-4 w-full rounded-full py-3 pl-3.5 pr-5 text-left bg-white/[0.04] hover:bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 hover:scale-[1.015] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 cursor-pointer"
                >
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${a.from}, ${a.to})`,
                      boxShadow: `0 6px 22px ${a.from}45`,
                    }}
                  >
                    {ICONES[profil.id]}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-slate-100 text-[15px] font-semibold">{profil.nom}</span>
                      {profil.requiertMotDePasse && (
                        <Lock className="w-3 h-3 text-slate-400 shrink-0" aria-label="Mot de passe requis" />
                      )}
                    </span>
                    <span className="text-slate-400 text-xs mt-0.5 truncate">{profil.description}</span>
                  </div>
                  <ChevronRight className="ml-auto w-4 h-4 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              );
            })}
          </div>
        ) : (
          /* ---------- Panneau mot de passe ---------- */
          <form
            onSubmit={valider}
            className={`rounded-3xl p-7 backdrop-blur-md bg-[#151927cc] border border-white/10 shadow-2xl ${erreur ? 'animate-erreur-login' : ''}`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center text-white ring-1 ring-white/20"
                style={{
                  background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
                  boxShadow: `0 6px 22px ${accent.from}45`,
                }}
              >
                {ICONES[choix.id]}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  {choix.nom}
                </h2>
                <p className="text-xs text-slate-400">{choix.description}</p>
              </div>
            </div>

            <label className="block mt-6 text-xs font-medium text-slate-400 mb-1.5" htmlFor="champ-mdp">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="champ-mdp"
                ref={champRef}
                type={afficherMdp ? 'text' : 'password'}
                value={motDePasse}
                onChange={(e) => {
                  setMotDePasse(e.target.value);
                  if (erreur) setErreur(false);
                }}
                autoComplete="current-password"
                placeholder="••••"
                className={`w-full pr-11 pl-4 py-2.5 text-sm rounded-xl bg-[#0F1117] text-slate-200 placeholder:text-slate-600 outline-none border transition-colors ${
                  erreur ? 'border-rose-500/70 focus:border-rose-400' : 'border-slate-700 focus:border-blue-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setAfficherMdp((v) => !v)}
                aria-label={afficherMdp ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-200 rounded-md cursor-pointer"
              >
                {afficherMdp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {erreur && <p className="mt-2 text-xs font-semibold text-rose-400">Mot de passe incorrect</p>}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setChoix(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-slate-800/60 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white rounded-xl transition-colors cursor-pointer"
                style={{
                  background: `linear-gradient(135deg, ${accent.from}, ${accent.to})`,
                  boxShadow: `0 8px 26px ${accent.from}40`,
                }}
              >
                <LogIn className="w-4 h-4" />
                Entrer
              </button>
            </div>
          </form>
        )}

        <p className="mt-9 text-center text-[11px] tracking-wide text-slate-500">
          Confection Textile & Haut de Gamme • Suivi d’Atelier de Fabrication
        </p>
      </div>
    </div>
  );
};
