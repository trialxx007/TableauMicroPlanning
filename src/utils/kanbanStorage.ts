import {
  COULEURS_KANBAN_IDS,
  estColonneBroderie,
  estSectionBroderieMain,
  KanbanBloc,
  KanbanCarte,
  KanbanColonne,
  KanbanCouleurId,
  KanbanData,
  KanbanDeplacement,
  KanbanPersonne,
  KanbanSection,
} from '../types/kanban.ts';
import { dateISOFromDateTime, estDateISO, getDateISOSite } from './dateFrance.ts';

/** Clé du localStorage (convention `aic_*` comme la vue courante). */
const CLE = 'aic_kanban_dev_v1';

/** Id unique suffisant pour du usage local (jamais collisionné entre sessions). */
export function nouvelId(): string {
  return `KB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function couleurValide(couleur: unknown, defaut: KanbanCouleurId): KanbanCouleurId {
  return (COULEURS_KANBAN_IDS as string[]).includes(couleur as string)
    ? (couleur as KanbanCouleurId)
    : defaut;
}

/** Tableau de démarrage : 4 colonnes canoniques et quelques post-its d'exemple. */
export function kanbanInitial(): KanbanData {
  const colonnes: KanbanColonne[] = [
    { id: 'KBC-BACKLOG', titre: 'Backlog', ordre: 0, couleur: 'blanc' },
    { id: 'KBC-AFAIRE', titre: 'À faire', ordre: 1, couleur: 'bleu' },
    { id: 'KBC-ENCOURS', titre: 'En cours', ordre: 2, couleur: 'jaune' },
    { id: 'KBC-TERMINE', titre: 'Terminé', ordre: 3, couleur: 'vert' },
  ];
  const maintenant = new Date().toISOString();
  const dateEntreeZone = getDateISOSite();
  const cartes: KanbanCarte[] = [
    {
      id: nouvelId(),
      titre: 'Demande client : coloris crème pour la réf. T-204',
      etat: 'En attente',
      traiteur: 'Équipe design',
      client: 'Client T-204',
      remarques: 'Quantité 120 pcs, réponse attendue vendredi.',
      couleur: 'blanc',
      colonneId: 'KBC-BACKLOG',
      ordre: 0,
      creeLe: maintenant,
      dateEntreeZone,
    },
    {
      id: nouvelId(),
      titre: 'Robrak essai : prototype manche sur tissu technique',
      etat: 'En cours',
      traiteur: 'Équipe prototype',
      client: 'Robrak',
      couleur: 'jaune',
      colonneId: 'KBC-AFAIRE',
      ordre: 0,
      creeLe: maintenant,
      dateEntreeZone,
    },
    {
      id: nouvelId(),
      titre: 'Robrak essai : montage du col montant XXL',
      etat: 'En cours',
      traiteur: 'Atelier montage',
      client: 'Robrak',
      couleur: 'jaune',
      colonneId: 'KBC-ENCOURS',
      ordre: 0,
      creeLe: maintenant,
      dateEntreeZone,
    },
    {
      id: nouvelId(),
      titre: 'Robrak essai validé : coupe et tombé réf. B-118',
      etat: 'Terminé',
      traiteur: 'Contrôle qualité',
      client: 'Robrak',
      couleur: 'vert',
      colonneId: 'KBC-TERMINE',
      ordre: 0,
      creeLe: maintenant,
      dateEntreeZone,
    },
    {
      id: nouvelId(),
      titre: 'Keep : patronage du col boutonné conservé',
      etat: 'Validé',
      traiteur: 'Équipe patronnage',
      client: 'Interne',
      couleur: 'bleu',
      colonneId: 'KBC-AFAIRE',
      ordre: 1,
      creeLe: maintenant,
      dateEntreeZone,
    },
  ];
  return {
    colonnes,
    cartes: cartes.map((carte) => ({
      ...carte,
      historiqueDeplacements: [
        {
          date: dateEntreeZone,
          colonneId: carte.colonneId,
          ...(carte.sectionId ? { sectionId: carte.sectionId } : {}),
        },
      ],
    })),
  };
}

/**
 * Lecture defensante du localStorage : toute structure incohérente (donnée
 * corrompue, palette obsolète…) retombe sur le tableau de démarrage.
 */
export function chargerKanban(): KanbanData {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return kanbanInitial();
    const parse: unknown = JSON.parse(brut);
    if (!parse || typeof parse !== 'object') return kanbanInitial();
    const { colonnes, cartes } = parse as Partial<KanbanData>;
    if (!Array.isArray(colonnes) || !Array.isArray(cartes)) return kanbanInitial();

    const colonnesValides: KanbanColonne[] = [];
    for (const c of colonnes) {
      if (!c || typeof c.id !== 'string' || typeof c.titre !== 'string') continue;
      // Sections scindées : seules des entrées complètes sont conservées.
      let sections: KanbanSection[] | undefined;
      if (Array.isArray(c.sections) && c.sections.length > 0) {
        const valides: KanbanSection[] = [];
        for (const s of c.sections) {
          if (!s || typeof s.id !== 'string' || typeof s.titre !== 'string') continue;
          // Personne d'une colonne BRODERIE MAIN (section) : seul un bloc connu est gardé.
          const bloc: KanbanBloc | undefined =
            s.bloc === 'client' || s.bloc === 'initiatives' ? s.bloc : undefined;
          // Section BRODERIE MAIN : valider ses personnes.
          let personnes: KanbanPersonne[] | undefined;
          if (estSectionBroderieMain(s) && Array.isArray(s.personnes)) {
            const pv: KanbanPersonne[] = [];
            for (const p of s.personnes) {
              if (!p || typeof p.id !== 'string' || typeof p.titre !== 'string') continue;
              const pbloc: KanbanBloc | undefined =
                p.bloc === 'client' || p.bloc === 'initiatives' ? p.bloc : undefined;
              if (pbloc) {
                pv.push({
                  id: p.id,
                  titre: p.titre,
                  bloc: pbloc,
                  ordre: typeof p.ordre === 'number' ? p.ordre : pv.length,
                });
              }
            }
            personnes = pv.length > 0 ? pv : undefined;
          }
          valides.push({
            id: s.id,
            titre: s.titre,
            ordre: typeof s.ordre === 'number' ? s.ordre : valides.length,
            ...(bloc ? { bloc } : {}),
            ...(personnes ? { personnes } : {}),
          });
        }
        sections = valides.length > 0 ? valides : undefined;
      }
      colonnesValides.push({
        id: c.id,
        titre: c.titre,
        ordre: typeof c.ordre === 'number' ? c.ordre : colonnesValides.length,
        couleur: couleurValide(c.couleur, 'blanc'),
        ...(sections ? { sections } : {}),
      });
    }
    const parId = new Map(colonnesValides.map((c) => [c.id, c]));
    const cartesValides: KanbanCarte[] = [];
    for (const k of cartes) {
      if (!k || typeof k.id !== 'string' || typeof k.titre !== 'string') continue;
      if (typeof k.colonneId !== 'string') continue;
      const colonne = parId.get(k.colonneId);
      if (!colonne) continue;
      // Section de la colonne scindée.
      let sectionId: string | undefined;
      // Personne de la section BRODERIE MAIN.
      let personneId: string | undefined;
      let bloc: KanbanBloc | undefined;
      if (colonne.sections?.length) {
        const section = colonne.sections.find((s) => s.id === k.sectionId);
        if (section) {
          sectionId = section.id;
          // Si c'est la section BRODERIE MAIN, valider personneId/bloc.
          if (estSectionBroderieMain(section)) {
            const pconnue = section.personnes?.find((p) => p.id === k.personneId);
            if (pconnue) {
              personneId = pconnue.id;
              bloc = pconnue.bloc;
            }
          }
        } else if (!estColonneBroderie(colonne)) {
          // Colonne scindée classique : report sur la 1ʳᵉ section.
          sectionId = colonne.sections[0].id;
        }
      }
      const creeLe = typeof k.creeLe === 'string' ? k.creeLe : new Date().toISOString();
      const dateEntreeZone = estDateISO(k.dateEntreeZone)
        ? k.dateEntreeZone
        : dateISOFromDateTime(creeLe) ?? getDateISOSite();
      // Historique : on valide les entrées existantes, puis on ajoute la zone
      // courante si elle n'y figure pas déjà (migration des anciennes cartes).
      const historiqueDeplacements: KanbanDeplacement[] = [];
      if (Array.isArray(k.historiqueDeplacements)) {
        for (const h of k.historiqueDeplacements) {
          if (!h || !estDateISO(h.date) || typeof h.colonneId !== 'string' || !h.colonneId) continue;
          historiqueDeplacements.push({
            date: h.date,
            colonneId: h.colonneId,
            ...(typeof h.sectionId === 'string' && h.sectionId ? { sectionId: h.sectionId } : {}),
            ...(typeof h.personneId === 'string' && h.personneId ? { personneId: h.personneId } : {}),
          });
        }
      }
      const entreeCourante: KanbanDeplacement = {
        date: dateEntreeZone,
        colonneId: k.colonneId,
        ...(sectionId ? { sectionId } : {}),
        ...(personneId ? { personneId } : {}),
      };
      const derniereEntree = historiqueDeplacements[historiqueDeplacements.length - 1];
      if (
        !derniereEntree ||
        derniereEntree.colonneId !== entreeCourante.colonneId ||
        derniereEntree.sectionId !== entreeCourante.sectionId ||
        derniereEntree.personneId !== entreeCourante.personneId
      ) {
        historiqueDeplacements.push(entreeCourante);
      }
      const attentes = Array.isArray((k as any).attentes)
        ? (k as any).attentes
            .filter((a: any) => a && estDateISO(a.dateEntree))
            .map((a: any, i: number) => ({
              id: typeof a.id === 'string' ? a.id : `ATT-${i}-${Date.now().toString(36)}`,
              ...(typeof a.libelle === 'string' && a.libelle.trim() ? { libelle: a.libelle.trim() } : {}),
              dateEntree: a.dateEntree.slice(0, 10),
              ...(estDateISO(a.dateSortie) ? { dateSortie: a.dateSortie.slice(0, 10) } : {}),
            }))
        : undefined;
      cartesValides.push({
        id: k.id,
        titre: k.titre,
        etat: typeof k.etat === 'string' ? k.etat : undefined,
        traiteur: typeof k.traiteur === 'string' ? k.traiteur : undefined,
        client: typeof k.client === 'string' ? k.client : undefined,
        remarques: typeof k.remarques === 'string' ? k.remarques : undefined,
        couleur: k.couleur ? couleurValide(k.couleur, 'jaune') : undefined,
        colonneId: k.colonneId,
        ...(sectionId ? { sectionId } : {}),
        ...(personneId ? { personneId, bloc } : {}),
        date: typeof k.date === 'string' && k.date ? k.date : undefined,
        dateEntreeZone,
        historiqueDeplacements,
        ...(attentes && attentes.length ? { attentes } : {}),
        ordre: typeof k.ordre === 'number' ? k.ordre : cartesValides.length,
        creeLe,
      });
    }
    if (colonnesValides.length === 0) return kanbanInitial();
    return { colonnes: colonnesValides, cartes: cartesValides };
  } catch {
    return kanbanInitial();
  }
}

export function sauverKanban(data: KanbanData): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(data));
  } catch {
    // Quota plein ou navigateur en navigation privée : le tableau reste utilisable
    // en mémoire pour la session en cours.
  }
}
