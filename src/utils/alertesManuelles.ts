import { useEffect, useState } from 'react';

/** Alerte saisie à la main dans le popover, rattachée à une carte. */
export interface AlerteManuelle {
  id: string;
  texte: string;
  /** Date et heure de saisie, fuseau du site : « 06/10/2026 à 14:32 ». */
  creeLe: string;
}

/** Clé de persistance des alertes manuelles, par carte. */
export const STORAGE_KEY_ALERTES = 'alertes_manuelles_v1';

/** Événement maison émis à chaque écriture : réveille les abonnés du poste. */
const EVENEMENT_MAJ = 'alertes-manuelles-changed';

export function lireAlertesManuelles(): Record<string, AlerteManuelle[]> {
  try {
    const brut = localStorage.getItem(STORAGE_KEY_ALERTES);
    if (!brut) return {};
    const parsed = JSON.parse(brut);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, AlerteManuelle[]>)
      : {};
  } catch {
    return {};
  }
}

/** Écrit l'ensemble des alertes manuelles et notifie les composants abonnés. */
export function ecrireAlertesManuelles(toutes: Record<string, AlerteManuelle[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_ALERTES, JSON.stringify(toutes));
  } catch {
    // quota indisponible : on ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENEMENT_MAJ));
  }
}

/** Alertes manuelles d'une carte donnée. */
export function alertesCarte(
  toutes: Record<string, AlerteManuelle[]>,
  cardId?: string
): AlerteManuelle[] {
  return cardId ? toutes[cardId] ?? [] : [];
}

/**
 * Alertes manuelles partagées : le popover écrit, la table du suivi global lit,
 * pour qu'une alerte saisie à la main allume aussitôt la bande de la case.
 */
export function useAlertesManuelles(): Record<string, AlerteManuelle[]> {
  const [etat, setEtat] = useState<Record<string, AlerteManuelle[]>>(lireAlertesManuelles);

  useEffect(() => {
    const maj = () => setEtat(lireAlertesManuelles());
    window.addEventListener(EVENEMENT_MAJ, maj);
    // Onglet voisin : localStorage ne notifie pas l'onglet qui écrit.
    window.addEventListener('storage', maj);
    return () => {
      window.removeEventListener(EVENEMENT_MAJ, maj);
      window.removeEventListener('storage', maj);
    };
  }, []);

  return etat;
}
