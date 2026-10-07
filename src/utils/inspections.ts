import { InspectionBloc, InspectionValeur } from '../types/suiviGlobal.ts';
import { getNowParis } from './dateFrance.ts';

/** Date du jour au format ISO (AAAA-MM-JJ), calée sur le fuseau du site :
 *  c'est la valeur lue par `<input type="date">`. */
export function dateDuJourISO(): string {
  const [j, m, a] = getNowParis().dateStr.split('/');
  return `${a}-${m}-${j}`;
}

/** Date ISO restituée « JJ/MM » (colonne Inspection, export CSV). */
export function dateCourte(iso: string): string {
  const [a, m, j] = (iso ?? '').split('-');
  return a && m && j ? `${j}/${m}` : iso;
}

/** Indice d'un OF : sa position parmi les OF de la colonne (1, 2, 3…). */
export function indiceOF(valeurs: InspectionValeur[], index: number): number {
  return valeurs.slice(0, index + 1).filter((v) => v.type === 'OF').length;
}

/** Indice affiché d'une valeur : le préfixe I ou OF est toujours là, suivi
 *  de l'indice (`50%` / `100%` pour un I, 1, 2, 3… pour un OF). */
export function libelleValeur(
  valeurs: InspectionValeur[],
  index: number
): { prefixe: string; indice: string } {
  const valeur = valeurs[index];
  if (valeur?.type === 'I') {
    return { prefixe: 'I', indice: `${valeur.pct ?? 50}%` };
  }
  return { prefixe: 'OF', indice: String(indiceOF(valeurs, index)) };
}

/** `true` si un contrôle I à 50 % existe : prérequis du 100 %. */
export function aControle50(bloc: InspectionBloc): boolean {
  return bloc.valeurs.some((v) => v.type === 'I' && (v.pct ?? 50) === 50);
}

/** Bloc d'inspection vierge : aucune valeur, commentaire facultatif. */
export function blocInspectionVide(commentaire = ''): InspectionBloc {
  return { valeurs: [], commentaire };
}

/** Recompose un bloc écrit par une version antérieure (cache partiel). */
export function normaliserBloc(brut: unknown): InspectionBloc {
  const b = (brut ?? {}) as Partial<InspectionBloc> & {
    elements?: { id?: string; resultat?: 'P' | 'F' }[];
    reference?: { date?: string };
    lignes?: unknown;
  };
  // Format courant.
  if (Array.isArray(b.valeurs) || typeof b.commentaire === 'string') {
    return {
      valeurs: completerPct(Array.isArray(b.valeurs) ? b.valeurs : []),
      commentaire: typeof b.commentaire === 'string' ? b.commentaire : '',
    };
  }
  // Bloc intermédiaire « référence + éléments + lignes » : les éléments
  // deviennent des valeurs I datées de la référence, les lignes le commentaire.
  const date = b.reference?.date || dateDuJourISO();
  return {
    valeurs: completerPct(
      (b.elements ?? []).map((e, i) => ({
        id: e?.id ?? `val-${Date.now()}-${i}`,
        type: 'I' as const,
        date,
      resultat: e?.resultat === 'F' ? 'F' : e?.resultat === 'P' ? 'P' : null,
    }))
  ),
  commentaire: Array.isArray(b.lignes)
    ? (b.lignes as unknown[]).filter((l) => typeof l === 'string').join('\n')
    : '',
};
}

/** Les I sans indice (écrits avant l'indice 50/100) alternent 50 puis 100. */
function completerPct(valeurs: InspectionValeur[]): InspectionValeur[] {
  let compteur = 0;
  return valeurs.map((v) => {
    if (v.type !== 'I' || (v.pct !== undefined && v.pct !== null)) return v;
    compteur += 1;
    return { ...v, pct: compteur % 2 === 1 ? 50 : 100 };
  });
}

/** Migration des plus anciens caches : le champ texte et les libellés des
 *  contrôles deviennent le commentaire, leurs états les valeurs I. */
export function migrerVersBloc(
  inspectionLegacy: unknown,
  ajoutsLegacy: unknown
): InspectionBloc {
  const texte = typeof inspectionLegacy === 'string' ? inspectionLegacy : '';
  const ajouts: any[] = Array.isArray(ajoutsLegacy) ? (ajoutsLegacy as any[]) : [];
  const commentaire = [texte, ...ajouts.map((a) => a?.libelle ?? '')]
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return {
    valeurs: completerPct(
      ajouts.map((a) => ({
        id: a?.id ?? `val-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'I' as const,
        date: a?.date || dateDuJourISO(),
        resultat: a?.resultat === 'F' ? 'F' : a?.resultat === 'P' ? 'P' : null,
      }))
    ),
    commentaire,
  };
}

/** Représentation textuelle d'un bloc pour l'export CSV :
 *  `I50% : 06/10 Pass | OF1 : 06/10`, puis le commentaire. Pass/Fail n'est
 *  écrit que s'il a été choisi. */
export function blocEnTexte(bloc: InspectionBloc): string {
  const valeurs = bloc.valeurs.map((v, i) => {
    const { prefixe, indice } = libelleValeur(bloc.valeurs, i);
    const etat =
      v.resultat === 'P' ? ' Pass' : v.resultat === 'F' ? ' Fail' : '';
    return `${prefixe}${indice} : ${dateCourte(v.date)}${etat}`;
  });
  return [...valeurs, bloc.commentaire].filter(Boolean).join(' | ');
}
