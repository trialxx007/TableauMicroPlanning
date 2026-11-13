import { CardItem, OrdreFabrication } from '@/src/types/card.ts';
import { InspectionBloc } from '@/src/types/suiviGlobal.ts';
import { hasPassedCc } from './inspections.ts';

/** Un OF en cours (CC non encore validé), rattaché à sa carte. */
export interface OFEnCours {
  card: CardItem;
  of: OrdreFabrication;
  index: number;
}

/** Alerte : une carte a plusieurs OFs non terminés en même temps. */
export interface AlerteOfsEnCours {
  card: CardItem;
  ofs: OFEnCours[];
}

/** Tous les OFs d'une carte dont le CC n'est pas encore validé. */
export function collecterOfsEnCours(
  card: CardItem,
  bloc?: InspectionBloc
): OFEnCours[] {
  const enCours: OFEnCours[] = [];
  card.ofs.forEach((of, index) => {
    if (hasPassedCc(bloc, index)) return;
    enCours.push({ card, of, index });
  });
  return enCours;
}

/**
 * Cartes ayant plusieurs OFs non terminés simultanément. Un OF est terminé
 * dès que son CC (Carton Check) est validé dans le Suivi Global.
 */
export function collecterAlertesOfs(
  cards: CardItem[],
  parCarte: Record<string, InspectionBloc | undefined>
): AlerteOfsEnCours[] {
  return cards
    .map((card) => ({
      card,
      ofs: collecterOfsEnCours(card, parCarte[card.id]),
    }))
    .filter((alerte) => alerte.ofs.length > 1);
}
