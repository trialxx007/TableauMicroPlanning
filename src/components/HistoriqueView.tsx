import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppPage, ViewSwitcher } from './ViewSwitcher.tsx';
import { SessionBadge } from './SessionBadge.tsx';
import { Profil } from '../utils/auth.ts';
import { historiqueApi, EntreeHistorique } from '../services/api.ts';
import { getNowParis, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { Calendar, Clock, History, RefreshCw, Filter, X } from 'lucide-react';

interface HistoriqueViewProps {
  onChangePage: (page: AppPage) => void;
  profil: Profil;
  onDeconnexion: () => void;
}

/** Un champ modifié, tel que stocké dans le détail structuré du journal. */
interface ChampModifie {
  k: string;
  a: unknown;
  b: unknown;
}

/** Décode la colonne `details` (JSON structuré) en liste de champs modifiés. */
function decoderDetail(details?: string): ChampModifie[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details) as { champs?: ChampModifie[] };
    if (parsed && Array.isArray(parsed.champs)) return parsed.champs;
  } catch {
    // Colonne non structurée : rien à afficher.
  }
  return [];
}

/** Libellé lisible d'un champ modifié. */
const LIBELLE_CHAMP: Record<string, string> = {
  client: 'Client',
  batch: 'Saison',
  modele: 'Modèle',
  typeCarte: 'Type de carte',
  quantiteDemandee: 'Qté demandée',
  quantiteFinie: 'Qté finie',
  statut: 'Statut',
  okProd: 'OK Prod',
  decisionReunion: 'Décision réunion',
  notes: 'Notes',
  jalons: 'Jalons',
  ofsOrdre: 'Nombre d’OFs',
  ofsQuantite: 'Qté finie des OFs',
};

/**
 * Couleur d'un badge selon la nature du champ : les quantités en bleu, le
 * statut en ambre, les jalons en vert, les OFs en violet, la fiche en slate.
 */
const COULEUR_CHAMP: Record<string, string> = {
  quantiteDemandee: 'bg-blue-50 text-blue-700 border-blue-200',
  quantiteFinie: 'bg-sky-50 text-sky-700 border-sky-200',
  statut: 'bg-amber-50 text-amber-700 border-amber-200',
  okProd: 'bg-teal-50 text-teal-700 border-teal-200',
  jalons: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ofsOrdre: 'bg-violet-50 text-violet-700 border-violet-200',
  ofsQuantite: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  client: 'bg-slate-100 text-slate-700 border-slate-200',
  batch: 'bg-slate-100 text-slate-700 border-slate-200',
  modele: 'bg-slate-100 text-slate-700 border-slate-200',
  typeCarte: 'bg-slate-100 text-slate-700 border-slate-200',
  decisionReunion: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  notes: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

function couleurChamp(cle: string): string {
  return COULEUR_CHAMP[cle] ?? 'bg-slate-100 text-slate-700 border-slate-200';
}

function libelleChamp(cle: string): string {
  return LIBELLE_CHAMP[cle] ?? cle;
}

/** Valeur affichable d'un champ : vide → « — », booléen → Oui/Non, statut brut. */
function afficherValeur(cle: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (cle === 'statut') {
    const statuts: Record<string, string> = {
      EN_ATTENTE: 'En attente',
      EN_COURS: 'En cours',
      TERMINE: 'Terminé',
      BLOQUE: 'Bloqué',
    };
    return statuts[String(v)] ?? String(v);
  }
  return String(v);
}

/**
 * Rendu du détail d'une modification : un badge coloré par champ touché, avec
 * la valeur « avant → après ». Les entrées sans champ structuré n'affichent
 * qu'un tiret.
 */
const TableDetail: React.FC<{ details?: string }> = ({ details }) => {
  const champs = decoderDetail(details);

  if (champs.length === 0) {
    return <span className="text-xs text-slate-400">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {champs.map((c) => (
        <span
          key={c.k}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${couleurChamp(c.k)}`}
        >
          <span className="font-bold">{libelleChamp(c.k)}</span>
          <span className="font-normal opacity-70">{afficherValeur(c.k, c.a)}</span>
          <span className="opacity-50">→</span>
          <span className="font-bold">{afficherValeur(c.k, c.b)}</span>
        </span>
      ))}
    </div>
  );
};

const PROFILS_JOURNAL: { id: string; label: string; classe: string }[] = [
  { id: 'resp-planning', label: 'Resp Planning', classe: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { id: 'production', label: 'Production', classe: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

/** Libellé lisible d'un profil auteur (au-delà des deux rôles suivis). */
function libelleProfil(id: string): string {
  const connu = PROFILS_JOURNAL.find((p) => p.id === id);
  if (connu) return connu.label;
  switch (id) {
    case 'direction':
      return 'Direction';
    case 'utilisateur':
      return 'Utilisateur';
    default:
      return id;
  }
}

/** Pastille colorée selon le profil auteur. */
function classeProfil(id: string): string {
  return (
    PROFILS_JOURNAL.find((p) => p.id === id)?.classe ??
    'bg-slate-100 text-slate-600 border-slate-200'
  );
}

/** Verbe lisible d'une action technique (carte.creee → Création d'une carte). */
function libelleAction(action: string): string {
  const table: Record<string, string> = {
    'carte.creee': 'Création d’une carte',
    'carte.modifiee': 'Modification d’une carte',
    'carte.supprimee': 'Suppression d’une carte',
    'jalon.ajoute': 'Ajout d’un jalon',
    'jalon.retire': 'Retrait d’un jalon',
    'jalon.renomme': 'Renommage d’un jalon',
    'jalon.grandeur': 'Changement de grandeur d’un jalon',
    'jalon.supprime': 'Suppression d’un jalon',
    'suivi.modifie': 'Modification du Suivi Global',
    'base.reinitialisee': 'Réinitialisation des données',
  };
  return table[action] ?? action;
}

/** Date « AAAA-MM-JJ » locale (fuseau du site) d'un horodatage ISO. */
function jourLocal(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Etc/GMT-3',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Date + heure lisibles dans le fuseau du site. */
function dateHeureLisible(iso: string): { date: string; heure: string } {
  const d = new Date(iso);
  return {
    date: new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Etc/GMT-3',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d),
    heure: new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Etc/GMT-3',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d),
  };
}

export const HistoriqueView: React.FC<HistoriqueViewProps> = ({
  onChangePage,
  profil,
  onDeconnexion,
}) => {
  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();
  const [entrees, setEntrees] = useState<EntreeHistorique[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Filtres : profil auteur, bornes de date (locales, AAAA-MM-JJ).
  const [filtreProfil, setFiltreProfil] = useState<string>('resp-planning');
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  // Filtre de jour appliqué côté client : clic sur une date de la liste.
  const [jourSelectionne, setJourSelectionne] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setParisTime(getNowParis().timeStr), 15000);
    return () => clearInterval(timer);
  }, []);

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setChargement(true);
    setErreur(null);
    try {
      const data = await historiqueApi.getAll({
        ...(filtreProfil ? { profil: filtreProfil } : {}),
        ...(dateMin ? { dateMin } : {}),
        ...(dateMax ? { dateMax } : {}),
        limit: 1000,
      });
      setEntrees(data);
    } catch (e) {
      setErreur((e as Error).message || 'Erreur de chargement');
    } finally {
      if (!silencieux) setChargement(false);
    }
  }, [filtreProfil, dateMin, dateMax]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Rafraîchissement quasi instantané : l'onglet se resynchronise tout seul en
  // arrière-plan (silencieux : pas de spinner), sans rechargement manuel.
  useEffect(() => {
    const timer = setInterval(() => {
      void charger(true);
    }, 4000);
    return () => clearInterval(timer);
  }, [charger]);

  // Les entrées sont déjà triées par le serveur (plus récentes d'abord) ; on
  // applique en plus le filtre de jour choisi dans la liste.
  const visibles = useMemo(() => {
    if (!jourSelectionne) return entrees;
    return entrees.filter((e) => jourLocal(e.at) === jourSelectionne);
  }, [entrees, jourSelectionne]);

  // Compteurs par profil sur l'ensemble des entrées chargées (indépendants du jour).
  const compteurs = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entrees) map.set(e.profil, (map.get(e.profil) ?? 0) + 1);
    return map;
  }, [entrees]);

  const filtreActif = Boolean(filtreProfil || dateMin || dateMax || jourSelectionne);
  const reinitialiser = () => {
    setFiltreProfil('');
    setDateMin('');
    setDateMax('');
    setJourSelectionne(null);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-16">
      {/* Bandeau haut : titre, date/heure, sélecteur de vue */}
      <div className="bg-white border-b border-slate-200 relative z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-700 flex items-center justify-center text-white">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Historique des modifications
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-slate-500 mt-0.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {fullFrenchDate}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 font-semibold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                  <Clock className="w-3.5 h-3.5 text-slate-600" />
                  {parisTime}
                  <span className="text-[10px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex md:justify-center">
            <ViewSwitcher currentPage="historique" onChangePage={onChangePage} />
          </div>

          <div className="flex items-center justify-end">
            <SessionBadge profil={profil} onDeconnexion={onDeconnexion} />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Barre de filtres */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 mb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Profil
              </label>
              <select
                value={filtreProfil}
                onChange={(e) => setFiltreProfil(e.target.value)}
                className="text-xs font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:outline-hidden focus:border-slate-500 cursor-pointer"
              >
                <option value="">Tous les profils</option>
                {PROFILS_JOURNAL.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value="direction">Direction</option>
                <option value="utilisateur">Utilisateur</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500">Du</label>
              <input
                type="date"
                value={dateMin}
                max={dateMax || undefined}
                onChange={(e) => setDateMin(e.target.value)}
                className="text-xs font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:outline-hidden focus:border-slate-500"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500">Au</label>
              <input
                type="date"
                value={dateMax}
                min={dateMin || undefined}
                onChange={(e) => setDateMax(e.target.value)}
                className="text-xs font-semibold rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white focus:outline-hidden focus:border-slate-500"
              />
            </div>

            <button
              onClick={() => void charger()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${chargement ? 'animate-spin' : ''}`} />
              Actualiser
            </button>

            {filtreActif && (
              <button
                onClick={reinitialiser}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Réinitialiser
              </button>
            )}

            {jourSelectionne && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                Jour : {jourSelectionne}
                <button onClick={() => setJourSelectionne(null)} className="cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            <span className="ml-auto text-[11px] font-semibold text-slate-500">
              {visibles.length} entrée{visibles.length > 1 ? 's' : ''}
              {compteurs.get('resp-planning') ? ` · ${compteurs.get('resp-planning')} Planning` : ''}
              {compteurs.get('production') ? ` · ${compteurs.get('production')} Production` : ''}
            </span>
          </div>
        </div>

        {/* Liste antéchronologique */}
        {erreur ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-6 text-center text-sm font-semibold text-rose-700">
            {erreur}
          </div>
        ) : visibles.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <History className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Aucune modification</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {chargement
                ? 'Chargement…'
                : 'Aucune modification ne correspond aux filtres choisis.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide w-40">Date</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide w-40">Profil</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide w-56">Action</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide">Cible</th>
                  <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide">Détail</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((e) => {
                  const { date, heure } = dateHeureLisible(e.at);
                  const jour = jourLocal(e.at);
                  return (
                    <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 align-top whitespace-nowrap">
                        <button
                          onClick={() => setJourSelectionne(jour)}
                          title="Filtrer sur ce jour"
                          className="text-left cursor-pointer group/d"
                        >
                          <div className="text-xs font-bold text-slate-800 group-hover/d:text-slate-600">{date}</div>
                          <div className="text-[11px] font-mono text-slate-400">{heure}</div>
                        </button>
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${classeProfil(e.profil)}`}
                        >
                          {libelleProfil(e.profil)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 align-top text-xs font-semibold text-slate-700">
                        {libelleAction(e.action)}
                      </td>
                      <td className="px-4 py-2.5 align-top text-xs font-medium text-slate-600">
                        {e.cible}
                      </td>
                      <td className="px-4 py-2.5 align-top">
                        <TableDetail details={e.details} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
