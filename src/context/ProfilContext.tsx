import { createContext, useContext, type ReactNode } from 'react';
import type { Profil } from '../utils/auth.ts';

/**
 * Profil connecté, partagé par-context plutôt que propagé composant par
 * composant. Le drapeau `lectureSeule` (profil « Utilisateur ») permet aux
 * vues de masquer/désactiver toute action d'écriture sans percer les props.
 */
export interface ContexteProfil {
  profil: Profil;
  /** Vrai pour le profil « Utilisateur » : consultation uniquement. */
  lectureSeule: boolean;
}

const ProfilContext = createContext<ContexteProfil>({
  profil: { id: 'utilisateur', nom: 'Utilisateur', role: 'Utilisateur', description: '', requiertMotDePasse: false },
  lectureSeule: false,
});

export function ProfilProvider({
  valeur,
  children,
}: {
  valeur: ContexteProfil;
  children: ReactNode;
}) {
  return <ProfilContext.Provider value={valeur}>{children}</ProfilContext.Provider>;
}

export function useProfil(): ContexteProfil {
  return useContext(ProfilContext);
}

/** Raccourci : les composants qui n'ont besoin que du drapeau. */
export function useLectureSeule(): boolean {
  return useContext(ProfilContext).lectureSeule;
}
