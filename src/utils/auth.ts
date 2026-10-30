/**
 * Écran d'accès : choix d'un profil avant d'entrer dans l'application.
 * Trois profils sont protégés par un mot de passe, « Utilisateur » entre
 * directement. Simple écran d'accès pour l'instant : aucun droit différentiel
 * par rôle, la session sert uniquement à mémoriser le profil choisi.
 */

export type ProfilId = 'utilisateur' | 'resp-planning' | 'production' | 'direction';

export type OngletId =
  | 'point-journalier'
  | 'archive'
  | 'suivi-global'
  | 'tableaux-ofs'
  | 'historique'
  | 'developpement';

/** Miroir exact de `AppPage` (ViewSwitcher) : désynchronisation = onglet perdu. */
const ONGLETS: readonly OngletId[] = [
  'point-journalier',
  'archive',
  'suivi-global',
  'tableaux-ofs',
  'historique',
  'developpement',
];

/**
 * Onglets autorisés par profil. Toute vue exportée par `AppPage` doit être
 * listée ici pour au moins un profil, sinon elle reste inaccessible.
 * - Production : uniquement les OFs.
 * - Resp Planning : vues métier + Développement (kanban).
 * - Direction : tout, y compris l'historique et le Développement.
 * - Utilisateur : vues métier, sans archive.
 */
const ONGLETS_PAR_PROFIL: Record<ProfilId, readonly OngletId[]> = {
  utilisateur: ['point-journalier', 'suivi-global', 'tableaux-ofs'],
  'resp-planning': ['point-journalier', 'archive', 'suivi-global', 'tableaux-ofs', 'developpement'],
  production: ['tableaux-ofs'],
  direction: ['point-journalier', 'archive', 'suivi-global', 'tableaux-ofs', 'historique', 'developpement'],
};

export function ongletsAutorises(profilId: ProfilId): OngletId[] {
  return [...ONGLETS_PAR_PROFIL[profilId]];
}

/**
 * Onglets déclarés (AppPage) sans aucun profil autorisé : signale une vue
 * inaccessible. Utilisé par la vérification automatisée.
 */
export function ongletsSansAcces(): OngletId[] {
  const attribues = new Set(Object.values(ONGLETS_PAR_PROFIL).flat());
  return ONGLETS.filter((onglet) => !attribues.has(onglet));
}

export interface Profil {
  id: ProfilId;
  /** Libellé du profil (choix sur l'écran d'accès). */
  nom: string;
  /** Libellé affiché dans l'en-tête à côté du bouton de déconnexion. */
  role: string;
  description: string;
  requiertMotDePasse: boolean;
}

export const PROFILS: Profil[] = [
  {
    id: 'utilisateur',
    nom: 'Utilisateur',
    role: 'Utilisateur',
    description: 'Accès direct au suivi, sans mot de passe',
    requiertMotDePasse: false,
  },
  {
    id: 'resp-planning',
    nom: 'Resp Planning',
    role: 'Resp Planning',
    description: 'Pilotage du planning et des prochains lancements',
    requiertMotDePasse: true,
  },
  {
    id: 'production',
    nom: 'Production',
    role: 'Production',
    description: 'Point journalier et suivi de l’atelier',
    requiertMotDePasse: true,
  },
  {
    id: 'direction',
    nom: 'Direction',
    role: 'Direction',
    description: 'Vision synthétique et arbitrages',
    requiertMotDePasse: true,
  },
];

/**
 * Mot de passe unique des trois profils protégés. À changer ici si besoin :
 * tout le reste (écran, session) lit cette constante.
 */
export const MOT_DE_PASSE_PROFILS = '1234';

const CLE_SESSION = 'aic_session_profil_v1';

export interface SessionProfil {
  profil: Profil;
  /** Horodatage ISO de la connexion (affichage / débogage). */
  connecteLe: string;
}

export function profilParId(id: ProfilId): Profil {
  return PROFILS.find((p) => p.id === id) ?? PROFILS[0];
}



export function motDePasseValide(saisie: string): boolean {
  return saisie.trim() === MOT_DE_PASSE_PROFILS;
}

/** Relit la session (si le profil existe encore) : le rafraîchissement de page ne déconnecte pas. */
export function lireSession(): SessionProfil | null {
  try {
    const raw = sessionStorage.getItem(CLE_SESSION);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const id = (parsed as { profilId?: unknown })?.profilId;
    if (typeof id !== 'string') return null;
    const profil = PROFILS.find((p) => p.id === id);
    if (!profil) return null;
    const connecteLe = (parsed as { connecteLe?: unknown })?.connecteLe;
    return { profil, connecteLe: typeof connecteLe === 'string' ? connecteLe : '' };
  } catch {
    return null;
  }
}

export function enregistrerSession(profilId: ProfilId): SessionProfil {
  const session: SessionProfil = { profil: profilParId(profilId), connecteLe: new Date().toISOString() };
  try {
    sessionStorage.setItem(CLE_SESSION, JSON.stringify({ profilId, connecteLe: session.connecteLe }));
  } catch {
    // SessionStorage indisponible : la session reste valable pour ce rendu.
  }
  return session;
}

export function effacerSession(): void {
  try {
    sessionStorage.removeItem(CLE_SESSION);
  } catch {
    // Rien à nettoyer si storage inaccessible.
  }
}
