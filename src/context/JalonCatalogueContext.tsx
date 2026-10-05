import { createContext, useContext, type ReactNode } from 'react';
import type { JalonCatalogue } from '../types/card.ts';
import { CATALOGUE_INITIAL } from '../data/mockJalons.ts';

/**
 * Catalogue global des types de jalons. Il est chargé une fois par App et partagé
 * par-context plutôt que propagé : CardTable, CardModal, SuiviGlobalView, StatsOverview
 * et FilterBar en ont tous besoin, et le percer davantage aurait ajouté du bruit partout.
 * La valeur par défaut évite tout crash pendant le chargement.
 */
const JalonCatalogueContext = createContext<JalonCatalogue[]>(CATALOGUE_INITIAL);

export function JalonCatalogueProvider({
  catalogue,
  children,
}: {
  catalogue: JalonCatalogue[];
  children: ReactNode;
}) {
  return (
    <JalonCatalogueContext.Provider value={catalogue}>
      {children}
    </JalonCatalogueContext.Provider>
  );
}

export function useJalonCatalogue(): JalonCatalogue[] {
  return useContext(JalonCatalogueContext);
}
