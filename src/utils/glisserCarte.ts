/**
 * Glisser-déposer d'une carte par Pointer Events (souris, tactile, stylet).
 *
 * Une seule carte est « tenue » à la fois : on clone la carte source dans un
 * overlay fixe qui suit le curseur via `transform` (composé GPU), et la case
 * visée est trouvée avec `elementFromPoint` sur les zones `[data-depot]`.
 *
 * Performance : aucun re-render React pendant le geste. Les positions sont
 * envoyées à `requestAnimationFrame` et écrites directement dans le DOM, et
 * l'overlay a `pointer-events: none` pour ne pas gêner la détection de cible.
 */

export interface CoordonneesCase {
  rowId: string;
  slotType: string;
  lancementIndex?: number;
  slotIndex?: number;
}

export interface OptionsGlisser {
  cardId: string;
  source: HTMLElement;
  clientX: number;
  clientY: number;
  /** Conteneur défilant horizontal : auto-scroll quand le curseur approche un bord. */
  scrollContainer?: HTMLElement | null;
  onDeposer: (cardId: string, coords: CoordonneesCase) => void;
}

/** Déplacement (px) à dépasser avant de « décoller » la carte. En dessous,
 *  le geste reste un simple clic (ouverture de la fiche). */
const SEUIL_DEPLACEMENT = 4;
/** Marge (px) le long des bords qui déclenche l'auto-scroll du tableau. */
const MARGE_AUTOSCROLL = 64;
const VITESSE_AUTOSCROLL = 14;

interface EtatGlisser {
  cardId: string;
  source: HTMLElement;
  overlay: HTMLElement | null;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  frame: number | null;
  bouge: boolean;
  cible: HTMLElement | null;
  scrollContainer: HTMLElement | null;
  onDeposer: (cardId: string, coords: CoordonneesCase) => void;
}

let etat: EtatGlisser | null = null;

function lireCoordonnees(zone: HTMLElement): CoordonneesCase | null {
  const { rowId, slotType, lancementIndex, slotIndex } = zone.dataset;
  if (!rowId || !slotType) return null;
  return {
    rowId,
    slotType,
    ...(lancementIndex ? { lancementIndex: Number(lancementIndex) } : {}),
    ...(slotIndex ? { slotIndex: Number(slotIndex) } : {}),
  };
}

function creerOverlay(source: HTMLElement, offsetX: number, offsetY: number): HTMLElement {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove('animate-carte-posee');
  clone.classList.add('carte-tenue');
  clone.style.position = 'fixed';
  clone.style.top = '0';
  clone.style.left = '0';
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.margin = '0';
  clone.style.boxSizing = 'border-box';
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '9999';
  clone.style.willChange = 'transform';
  // La rotation pivote autour du point saisi : la carte reste « dans la main ».
  clone.style.transformOrigin = `${offsetX}px ${offsetY}px`;
  document.body.appendChild(clone);
  return clone;
}

function dessiner() {
  if (!etat || !etat.overlay) return;
  etat.overlay.style.transform = `translate3d(${etat.x - etat.offsetX}px, ${
    etat.y - etat.offsetY
  }px, 0) rotate(-3deg) scale(1.03)`;
}

function cibler() {
  if (!etat) return;
  const el = document.elementFromPoint(etat.x, etat.y) as HTMLElement | null;
  const brute = el?.closest<HTMLElement>('[data-depot]') ?? null;
  // On ne se surligne pas soi-même : une case contenant la carte source est ignorée.
  const zone = brute && !brute.contains(etat.source) ? brute : null;
  if (zone !== etat.cible) {
    etat.cible?.classList.remove('case-survol-depot');
    etat.cible = zone;
    zone?.classList.add('case-survol-depot');
  }
}

function autoScroll() {
  if (!etat?.scrollContainer) return;
  const cont = etat.scrollContainer;
  const rect = cont.getBoundingClientRect();
  if (etat.x < rect.left + MARGE_AUTOSCROLL) cont.scrollLeft -= VITESSE_AUTOSCROLL;
  else if (etat.x > rect.right - MARGE_AUTOSCROLL) cont.scrollLeft += VITESSE_AUTOSCROLL;
}

function planifier() {
  if (!etat || etat.frame !== null) return;
  etat.frame = window.requestAnimationFrame(() => {
    if (!etat) return;
    etat.frame = null;
    dessiner();
    cibler();
    autoScroll();
  });
}

function detacher() {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (!etat) return;
  etat.x = e.clientX;
  etat.y = e.clientY;
  if (!etat.bouge) {
    const dx = e.clientX - etat.startX;
    const dy = e.clientY - etat.startY;
    if (Math.hypot(dx, dy) < SEUIL_DEPLACEMENT) return;
    etat.bouge = true;
    etat.overlay = creerOverlay(etat.source, etat.offsetX, etat.offsetY);
    document.body.classList.add('glisser-carte-active');
  }
  planifier();
}

function onPointerUp(e: PointerEvent) {
  if (!etat) return;
  const courant = etat;
  etat = null;
  detacher();
  if (courant.frame !== null) window.cancelAnimationFrame(courant.frame);
  document.body.classList.remove('glisser-carte-active');
  courant.cible?.classList.remove('case-survol-depot');
  courant.overlay?.remove();

  if (!courant.bouge) return;

  // Un glisser ne doit jamais être interprété comme un clic (ouverture de fiche).
  const stopClic = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
  };
  window.addEventListener('click', stopClic, true);
  window.setTimeout(() => window.removeEventListener('click', stopClic, true), 300);

  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
  const brute = el?.closest<HTMLElement>('[data-depot]') ?? null;
  const zone = brute && !brute.contains(courant.source) ? brute : null;
  if (!zone) return;
  const coords = lireCoordonnees(zone);
  if (coords) courant.onDeposer(courant.cardId, coords);
}

/** Démarre un glisser. À appeler dans le `onPointerDown` de la carte (le
 *  `source` doit être lu depuis `e.currentTarget` de façon synchrone). */
export function demarrerGlisser(options: OptionsGlisser) {
  if (etat) return;
  const rect = options.source.getBoundingClientRect();
  etat = {
    cardId: options.cardId,
    source: options.source,
    overlay: null,
    offsetX: options.clientX - rect.left,
    offsetY: options.clientY - rect.top,
    startX: options.clientX,
    startY: options.clientY,
    x: options.clientX,
    y: options.clientY,
    frame: null,
    bouge: false,
    cible: null,
    scrollContainer: options.scrollContainer ?? null,
    onDeposer: options.onDeposer,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
}
