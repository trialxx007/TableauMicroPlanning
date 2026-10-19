import { useEffect, useState } from 'react';

export const STORAGE_KEY_BLINKING = 'alerte_blinking_v1';

const EVENEMENT_MAJ_BLINKING = 'alerte-blinking-changed';

export function lireBlinking(): Record<string, boolean> {
  try {
    const brut = localStorage.getItem(STORAGE_KEY_BLINKING);
    if (!brut) return {};
    const parsed = JSON.parse(brut);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

export function ecrireBlinking(toutes: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY_BLINKING, JSON.stringify(toutes));
  } catch {
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENEMENT_MAJ_BLINKING));
  }
}

export function isBlinkingActif(toutes: Record<string, boolean>, cardId?: string): boolean {
  return cardId ? toutes[cardId] === true : false;
}

export function useBlinking(): Record<string, boolean> {
  const [etat, setEtat] = useState<Record<string, boolean>>(lireBlinking);

  useEffect(() => {
    const maj = () => setEtat(lireBlinking());
    window.addEventListener(EVENEMENT_MAJ_BLINKING, maj);
    window.addEventListener('storage', maj);
    return () => {
      window.removeEventListener(EVENEMENT_MAJ_BLINKING, maj);
      window.removeEventListener('storage', maj);
    };
  }, []);

  return etat;
}