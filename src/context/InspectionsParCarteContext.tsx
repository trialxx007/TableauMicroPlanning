import { createContext, useContext } from 'react';
import type { InspectionBloc } from '../types/suiviGlobal.ts';

/** Données d'inspection de la colonne Inspection, indexées par identifiant de carte. */
export type InspectionsParCarte = Record<string, InspectionBloc>;

interface InspectionsParCarteContextValue {
  /** Bloc d'inspection courant de chaque carte (issu du Suivi Global). */
  parCarte: InspectionsParCarte;
  /** Publie la correspondance carte → bloc d'inspection. */
  setParCarte: (map: InspectionsParCarte) => void;
}

/**
 * La colonne Inspection vit dans le Suivi Global, mais la fiche carte (CardModal)
 * a besoin d'y référer pour afficher l'avancement des contrôles (Pass/Fail) de
 * chaque OF. On partage donc la correspondance par-context.
 */
const InspectionsParCarteContext = createContext<InspectionsParCarteContextValue>({
  parCarte: {},
  setParCarte: () => {},
});

export function InspectionsParCarteProvider({
  value,
  children,
}: {
  value: InspectionsParCarteContextValue;
  children: React.ReactNode;
}) {
  return (
    <InspectionsParCarteContext.Provider value={value}>
      {children}
    </InspectionsParCarteContext.Provider>
  );
}

export function useInspectionsParCarte(): InspectionsParCarteContextValue {
  return useContext(InspectionsParCarteContext);
}
