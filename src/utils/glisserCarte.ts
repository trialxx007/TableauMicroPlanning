/**
 * Glisser-échanger maison des cartes du Suivi Global (Pointer Events, sans
 * dépendance externe).
 *
 * Chaque case de carte porte un `data-case-id` encodant ses coordonnées ; le
 * conteneur (le tableau) est observé en délégation : un `pointerdown` sur un
 * élément `[data-card-drag]` arme un glisser, un `pointermove` démarre le geste
 * au-delà d'un seuil (pour ne pas casser le clic simple), et un `pointerup`
 * échange les deux cases survolées.
 *
 * Pendant le glisser, un défilement automatique (fenêtre et conteneurs
 * scrollables) permet d'atteindre les colonnes hors écran, et une copie
 * flottante suit le curseur.
 *
 * Les identifiants n'encodent pas le groupe : la position de la case (colonne)
 * définit le statut, donc `parseSlotId` fournit directement les coordonnées.
 */

import { useEffect, useRef } from 'react';

export type TypeSlotCase = 'modeleEnCours' | 'lancement' | 'expedition';

export interface CoordCase {
  rowId: string;
  slotType: TypeSlotCase;
  lancementIndex?: number;
  slotIndex?: number;
}

/** Séparateur improbable dans un identifiant de ligne. */
const SEP = '\u241F';

/** Distance (px) à parcourir avant de considérer qu'un geste est un glisser. */
const SEUIL_GLISSER = 6;
/** Marge (px) depuis un bord déclenchant le défilement automatique. */
const MARGE_SCROLL = 70;
/** Vitesse (px/image) du défilement automatique. */
const VITESSE_SCROLL = 22;

/** Classe posée sur la case survolée pendant un glisser. */
const CLASSE_CIBLE = 'case-cible-depot';
/** Classe posée sur la carte d'origine pendant un glisser. */
const CLASSE_EN_GLISSER = 'carte-en-glissement';
/** Classe du clone flottant qui suit le curseur. */
const CLASSE_GHOST = 'carte-ghost';

/** Identifiant de case (sert de `data-case-id`). */
export function idSlotCarte(
  rowId: string,
  slotType: TypeSlotCase,
  lancementIndex?: number,
  slotIndex?: number
): string {
  const t = slotType === 'modeleEnCours' ? 'm' : slotType === 'lancement' ? 'l' : 'e';
  const parts = ['s', t, rowId];
  if (slotType === 'lancement') parts.push(String(lancementIndex ?? 0));
  parts.push(String(slotIndex ?? 0));
  return parts.join(SEP);
}

/** Relit les coordonnées encodées dans un identifiant de case. */
export function parseSlotId(id: string): CoordCase | null {
  const parts = id.split(SEP);
  if (parts[0] !== 's' || !parts[2]) return null;
  const t = parts[1];
  if (t === 'm') return { rowId: parts[2], slotType: 'modeleEnCours', slotIndex: Number(parts[3] ?? 0) };
  if (t === 'e') return { rowId: parts[2], slotType: 'expedition', slotIndex: Number(parts[3] ?? 0) };
  if (t === 'l') {
    return {
      rowId: parts[2],
      slotType: 'lancement',
      lancementIndex: Number(parts[3] ?? 0),
      slotIndex: Number(parts[4] ?? 0),
    };
  }
  return null;
}

/**
 * Active le glisser-échanger sur `container` (le tableau) et rappelle `onSwap`
 * avec les coordonnées source/cible à chaque échange effectif.
 */
export function useGlisserCartes(
  container: HTMLElement | null,
  onSwap: (from: CoordCase, to: CoordCase) => void
): void {
  const onSwapRef = useRef(onSwap);
  onSwapRef.current = onSwap;

  useEffect(() => {
    if (!container) return;

    let sourceId: string | null = null;
    let sourceEl: HTMLElement | null = null;
    let ghost: HTMLElement | null = null;
    let cible: HTMLElement | null = null;
    let scrollables: HTMLElement[] = [];
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let dragging = false;
    let clicIgnore = false;
    let rafId = 0;
    let timerClic: ReturnType<typeof setTimeout> | null = null;

    const retirerCible = () => {
      if (cible) cible.classList.remove(CLASSE_CIBLE);
      cible = null;
    };

    const retirerGhost = () => {
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
      if (sourceEl) sourceEl.classList.remove(CLASSE_EN_GLISSER);
    };

    const reinitialiser = () => {
      retirerCible();
      retirerGhost();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      sourceId = null;
      sourceEl = null;
      dragging = false;
    };

    /** Case sous un point de l'écran, à l'intérieur du conteneur. */
    const caseSous = (x: number, y: number): HTMLElement | null => {
      const el = document.elementFromPoint(x, y);
      const c = el?.closest?.('[data-case-id]') as HTMLElement | null;
      return c && container.contains(c) ? c : null;
    };

    const majCible = (c: HTMLElement | null) => {
      if (c === cible) return;
      retirerCible();
      if (c && c.getAttribute('data-case-id') !== sourceId) {
        c.classList.add(CLASSE_CIBLE);
        cible = c;
      }
    };

    /** Conteneurs scrollables entre le tableau et la racine du document. */
    const collecterScrollables = (): HTMLElement[] => {
      const liste: HTMLElement[] = [];
      let el = container.parentElement;
      while (el) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) liste.push(el);
        el = el.parentElement;
      }
      return liste;
    };

    /** Défilement automatique tant que le geste est en cours. */
    const boucleAutoScroll = () => {
      if (!dragging) return;
      if (lastX < MARGE_SCROLL) window.scrollBy(-VITESSE_SCROLL, 0);
      else if (lastX > window.innerWidth - MARGE_SCROLL) window.scrollBy(VITESSE_SCROLL, 0);
      if (lastY < MARGE_SCROLL) window.scrollBy(0, -VITESSE_SCROLL);
      else if (lastY > window.innerHeight - MARGE_SCROLL) window.scrollBy(0, VITESSE_SCROLL);

      for (const el of scrollables) {
        const r = el.getBoundingClientRect();
        // Le curseur peut légèrement sortir du conteneur : on tolère une marge.
        const bandeY = lastY > r.top && lastY < r.bottom;
        const bandeX = lastX > r.left && lastX < r.right;
        if (bandeY) {
          if (lastX < r.left + MARGE_SCROLL) el.scrollLeft -= VITESSE_SCROLL;
          else if (lastX > r.right - MARGE_SCROLL) el.scrollLeft += VITESSE_SCROLL;
        }
        if (bandeX) {
          if (lastY < r.top + MARGE_SCROLL) el.scrollTop -= VITESSE_SCROLL;
          else if (lastY > r.bottom - MARGE_SCROLL) el.scrollTop += VITESSE_SCROLL;
        }
      }

      majCible(caseSous(lastX, lastY));
      rafId = requestAnimationFrame(boucleAutoScroll);
    };

    const demarrerGlisser = (e: PointerEvent) => {
      if (!sourceEl) return;
      dragging = true;
      scrollables = collecterScrollables();
      sourceEl.classList.add(CLASSE_EN_GLISSER);
      const rect = sourceEl.getBoundingClientRect();
      ghost = sourceEl.cloneNode(true) as HTMLElement;
      ghost.classList.add(CLASSE_GHOST);
      ghost.classList.remove(CLASSE_EN_GLISSER);
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      ghost.style.left = `${e.clientX - rect.width / 2}px`;
      ghost.style.top = `${e.clientY - rect.height / 2}px`;
      document.body.appendChild(ghost);
      rafId = requestAnimationFrame(boucleAutoScroll);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as Element | null;
      const carte = target?.closest?.('[data-card-drag]') as HTMLElement | null;
      if (!carte) return;
      // Les boutons (actions rapides, bande d'alerte) gardent leur clic.
      if (target?.closest?.('button')) return;
      const caseEl = carte.closest('[data-case-id]') as HTMLElement | null;
      if (!caseEl) return;
      sourceId = caseEl.getAttribute('data-case-id');
      sourceEl = carte;
      startX = e.clientX;
      startY = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      dragging = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (!sourceEl) return;
      if (!dragging) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < SEUIL_GLISSER) return;
        demarrerGlisser(e);
      }
      if (ghost) {
        const rect = ghost.getBoundingClientRect();
        ghost.style.left = `${e.clientX - rect.width / 2}px`;
        ghost.style.top = `${e.clientY - rect.height / 2}px`;
      }
      majCible(caseSous(e.clientX, e.clientY));
    };

    const onPointerUp = () => {
      const etaitEnGlisser = dragging;
      const cibleId = cible?.getAttribute('data-case-id') ?? null;
      if (etaitEnGlisser && cibleId && sourceId && cibleId !== sourceId) {
        const from = parseSlotId(sourceId);
        const to = parseSlotId(cibleId);
        if (from && to) onSwapRef.current(from, to);
      }
      reinitialiser();
      if (etaitEnGlisser) {
        // Le relâchement génère un clic : on l'avale pour ne pas ouvrir la fiche.
        clicIgnore = true;
        if (timerClic) clearTimeout(timerClic);
        timerClic = setTimeout(() => {
          clicIgnore = false;
        }, 60);
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (!clicIgnore) return;
      e.stopPropagation();
      e.preventDefault();
      clicIgnore = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') reinitialiser();
    };

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', reinitialiser);
    window.addEventListener('keydown', onKeyDown);
    container.addEventListener('click', onClickCapture, true);

    return () => {
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', reinitialiser);
      window.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('click', onClickCapture, true);
      if (timerClic) clearTimeout(timerClic);
      reinitialiser();
    };
  }, [container]);
}
