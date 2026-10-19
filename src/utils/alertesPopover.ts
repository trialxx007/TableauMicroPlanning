import { useEffect, useState } from 'react';
import type { AlerteManuelle, AlerteCouleur } from './alertesManuelles.ts';

export const STORAGE_KEY_ALERTES_POPOVER = 'alertes_popover_v1';

const EVENEMENT_MAJ_POPOVER = 'alertes-popover-changed';

export function lireAlertesPopover(): Record<string, AlerteManuelle[]> {
  try {
    const brut = localStorage.getItem(STORAGE_KEY_ALERTES_POPOVER);
    if (!brut) return {};
    const parsed = JSON.parse(brut);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, AlerteManuelle[]>)
      : {};
  } catch {
    return {};
  }
}

export function ecrireAlertesPopover(toutes: Record<string, AlerteManuelle[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY_ALERTES_POPOVER, JSON.stringify(toutes));
  } catch {
    // quota indisponible : on ignore
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENEMENT_MAJ_POPOVER));
  }
}

export function alertesPopoverCarte(
  toutes: Record<string, AlerteManuelle[]>,
  cardId?: string
): AlerteManuelle[] {
  return cardId ? toutes[cardId] ?? [] : [];
}

export function useAlertesPopover(): Record<string, AlerteManuelle[]> {
  const [etat, setEtat] = useState<Record<string, AlerteManuelle[]>>(lireAlertesPopover);

  useEffect(() => {
    const maj = () => setEtat(lireAlertesPopover());
    window.addEventListener(EVENEMENT_MAJ_POPOVER, maj);
    window.addEventListener('storage', maj);
    return () => {
      window.removeEventListener(EVENEMENT_MAJ_POPOVER, maj);
      window.removeEventListener('storage', maj);
    };
  }, []);

  return etat;
}