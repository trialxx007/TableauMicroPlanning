import {
  COULEURS_KANBAN_IDS,
  estColonneBroderie,
  estColonneBrodeuse,
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

/**
 * Vues du tableau Développement. Les deux vues partagent les mêmes cartes :
 * « direction » est un affichage par onglets d'urgence, pas un tableau séparé.
 */
export type KanbanEnvironnement = 'developpement' | 'direction';

/** Clé de persistance unique du tableau Développement. */
const CLE_KANBAN = 'aic_kanban_dev_v1';

/** Id unique suffisant pour du usage local (jamais collisionné entre sessions). */
export function nouvelId(): string {
  return `KB-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function couleurValide(couleur: unknown, defaut: KanbanCouleurId): KanbanCouleurId {
  return (COULEURS_KANBAN_IDS as string[]).includes(couleur as string)
    ? (couleur as KanbanCouleurId)
    : defaut;
}

/** Tableau de démarrage : les étapes du flux Développement, de DEBRIEF à EXPEDITION. */
export function kanbanInitial(): KanbanData {
  const colonnes: KanbanColonne[] = [
    { id: 'KBC-DEBRIEF', titre: 'DEBRIEF', ordre: 0, couleur: 'blanc' },
    { id: 'KBC-PATRONNAGE', titre: 'PATRONNAGE', ordre: 1, couleur: 'bleu' },
    { id: 'KBC-PAV', titre: 'PAV', ordre: 2, couleur: 'jaune' },
    {
      id: 'KBC-PUNCHING-PDF',
      titre: 'PUNCHING/PDF',
      ordre: 3,
      couleur: 'vert',
      sections: [
        { id: 'KBC-PUNCHING-PDF-PUNCHING', titre: 'PUNCHING', ordre: 0 },
        { id: 'KBC-PUNCHING-PDF-PDF', titre: 'PDF', ordre: 1 },
      ],
    },
    { id: 'KBC-PLACEMENT', titre: 'PLACEMENT', ordre: 4, couleur: 'blanc' },
    {
      id: 'KBC-PLAN-COUPE-TRACE',
      titre: 'PLAN DE COUPE/TRACE',
      ordre: 5,
      couleur: 'blanc',
      sections: [
        { id: 'KBC-PLAN-COUPE-TRACE-PLAN', titre: 'PLAN DE COUPE', ordre: 0 },
        { id: 'KBC-PLAN-COUPE-TRACE-TRACE', titre: 'TRACE', ordre: 1 },
      ],
    },
    { id: 'KBC-COUPE', titre: 'COUPE', ordre: 6, couleur: 'blanc' },
    {
      id: 'KBC-BRODERIE-MACHINE',
      titre: 'BRODERIE MACHINE',
      ordre: 7,
      couleur: 'blanc',
      sections: [
        { id: 'KBC-BRODERIE-MACHINE-BRODEUSES', titre: 'Brodeuses', ordre: 0, personnes: [] },
      ],
    },
    {
      id: 'KBC-BRODERIE-MAIN',
      titre: 'BRODERIE MAIN',
      ordre: 8,
      couleur: 'blanc',
      sections: [
        { id: 'KBC-BRODERIE-MAIN-SECTION', titre: 'BRODERIE MAIN', ordre: 0 },
        { id: 'KBC-BRODERIE-MAIN-PARTIE-2', titre: 'Partie 2', ordre: 1 },
      ],
    },
    { id: 'KBC-LABO-CONFECTION', titre: 'LABO CONFECTION', ordre: 9, couleur: 'blanc' },
    { id: 'KBC-FINITION', titre: 'FINITION', ordre: 10, couleur: 'blanc' },
    { id: 'KBC-KIT-CUIR', titre: 'KIT CUIR', ordre: 11, couleur: 'blanc' },
    { id: 'KBC-ARCHIVE', titre: 'ARCHIVE', ordre: 12, couleur: 'blanc' },
    { id: 'KBC-EXPEDITION', titre: 'EXPEDITION', ordre: 13, couleur: 'blanc' },
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
      colonneId: 'KBC-DEBRIEF',
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
      colonneId: 'KBC-PATRONNAGE',
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
      colonneId: 'KBC-LABO-CONFECTION',
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
      colonneId: 'KBC-FINITION',
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
      colonneId: 'KBC-PATRONNAGE',
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

/** Normalise un titre pour comparer les colonnes/sections métier. */
function titreNormalise(titre: string): string {
  return titre.trim().toUpperCase().replace(/\s+/g, ' ');
}

interface DecoupeBroderie {
  mainId: string;
  sectionsMain: Set<string>;
}

/**
 * Sépare une colonne « BRODERIE MACHINE/BRODERIE MAIN » en deux colonnes
 * distinctes : BRODERIE MACHINE puis BRODERIE MAIN. Le tableau BRODERIE MAIN
 * reste rattaché à sa colonne dédiée (créée au besoin).
 */
function separerColonnesBroderie(colonnes: KanbanColonne[]): {
  colonnes: KanbanColonne[];
  decoupes: Map<string, DecoupeBroderie>;
} {
  const decoupes = new Map<string, DecoupeBroderie>();
  const ids = new Set(colonnes.map((c) => c.id));
  const resultat: KanbanColonne[] = [];

  for (const colonne of colonnes) {
    const titre = titreNormalise(colonne.titre);
    const estCombinee = titre.includes('BRODERIE MACHINE') && titre.includes('BRODERIE MAIN');
    if (!estCombinee) {
      resultat.push(colonne);
      continue;
    }

    const sections = colonne.sections ?? [];
    const sectionsMain = sections.filter((s) => estSectionBroderieMain(s));
    const sectionsMachine = sections.filter((s) => !estSectionBroderieMain(s));

    let mainId = `${colonne.id}-MAIN`;
    let suffixe = 1;
    while (ids.has(mainId)) {
      mainId = `${colonne.id}-MAIN-${suffixe++}`;
    }
    ids.add(mainId);

    const sectionsMainFinal: KanbanSection[] =
      sectionsMain.length > 0
        ? sectionsMain.map((section, index) => ({ ...section, ordre: index }))
        : [{ id: nouvelId(), titre: 'BRODERIE MAIN', ordre: 0 }];

    const machine: KanbanColonne = {
      ...colonne,
      titre: 'BRODERIE MACHINE',
      sections: sectionsMachine.length > 0 ? sectionsMachine : undefined,
    };
    const main: KanbanColonne = {
      ...colonne,
      id: mainId,
      titre: 'BRODERIE MAIN',
      sections: sectionsMainFinal,
    };

    decoupes.set(colonne.id, {
      mainId,
      sectionsMain: new Set(sectionsMainFinal.map((s) => s.id)),
    });
    resultat.push(machine, main);
  }

  // Une colonne dédiée BRODERIE MAIN sans section reçoit d'office sa section
  // afin que son tableau reste affiché.
  const colonnesFinales = resultat.map((colonne) => {
    const titre = titreNormalise(colonne.titre);
    const dedieeMain = titre.includes('BRODERIE MAIN') && !titre.includes('BRODERIE MACHINE');
    if (dedieeMain && !colonne.sections?.length) {
      return {
        ...colonne,
        sections: [{ id: nouvelId(), titre: 'BRODERIE MAIN', ordre: 0 }],
      };
    }
    return colonne;
  });

  return {
    colonnes: colonnesFinales.map((colonne, index) => ({ ...colonne, ordre: index })),
    decoupes,
  };
}

/**
 * Lecture defensante du localStorage : toute structure incohérente (donnée
 * corrompue, palette obsolète…) retombe sur le tableau de démarrage.
 */
export function chargerKanban(): KanbanData {
  const initiales = () => kanbanInitial();
  try {
    const brut = localStorage.getItem(CLE_KANBAN);
    if (!brut) return initiales();
    const parse: unknown = JSON.parse(brut);
    if (!parse || typeof parse !== 'object') return initiales();
    const { colonnes, cartes } = parse as Partial<KanbanData>;
    if (!Array.isArray(colonnes) || !Array.isArray(cartes)) return initiales();

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
          // Personnes conservées pour toute section (BRODERIE MAIN, Brodeuses
          // ou section renommée) : le tableau reste rattaché à sa colonne.
          const estMain = estSectionBroderieMain(s);
          let personnes: KanbanPersonne[] | undefined;
          if (Array.isArray(s.personnes)) {
            const pv: KanbanPersonne[] = [];
            for (const p of s.personnes) {
              if (!p || typeof p.id !== 'string' || typeof p.titre !== 'string') continue;
              const pbloc: KanbanBloc | undefined =
                p.bloc === 'client' || p.bloc === 'initiatives' ? p.bloc : undefined;
              // Une section BRODERIE MAIN exige un bloc ; les autres non.
              if (!pbloc && estMain) continue;
              pv.push({
                id: p.id,
                titre: p.titre,
                ...(pbloc ? { bloc: pbloc } : {}),
                ordre: typeof p.ordre === 'number' ? p.ordre : pv.length,
              });
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
    const { colonnes: colonnesSeparees, decoupes } = separerColonnesBroderie(colonnesValides);
    const parId = new Map(colonnesSeparees.map((c) => [c.id, c]));
    const colonneApresDecoupe = (colonneId: string, sectionId?: string): string => {
      const decoupe = decoupes.get(colonneId);
      return decoupe && sectionId && decoupe.sectionsMain.has(sectionId)
        ? decoupe.mainId
        : colonneId;
    };
    const cartesValides: KanbanCarte[] = [];
    for (const k of cartes) {
      if (!k || typeof k.id !== 'string' || typeof k.titre !== 'string') continue;
      if (typeof k.colonneId !== 'string') continue;
      const colonneIdCarte = colonneApresDecoupe(
        k.colonneId,
        typeof k.sectionId === 'string' ? k.sectionId : undefined
      );
      const colonne = parId.get(colonneIdCarte);
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
          // Section avec des personnes : valider l'affectation (et le bloc).
          if (section.personnes?.length) {
            const pconnue = section.personnes?.find((p) => p.id === k.personneId);
            if (pconnue) {
              personneId = pconnue.id;
              bloc = pconnue.bloc;
            }
          }
        } else if (!estColonneBroderie(colonne) && !estColonneBrodeuse(colonne)) {
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
          const sectionHist = typeof h.sectionId === 'string' && h.sectionId ? h.sectionId : undefined;
          historiqueDeplacements.push({
            date: h.date,
            colonneId: colonneApresDecoupe(h.colonneId, sectionHist),
            ...(sectionHist ? { sectionId: sectionHist } : {}),
            ...(typeof h.personneId === 'string' && h.personneId ? { personneId: h.personneId } : {}),
          });
        }
      }
      const entreeCourante: KanbanDeplacement = {
        date: dateEntreeZone,
        colonneId: colonneIdCarte,
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
        commercial: typeof k.commercial === 'string' ? k.commercial : undefined,
        dateExpedition:
          typeof k.dateExpedition === 'string' && k.dateExpedition
            ? k.dateExpedition
            : undefined,
        remarques: typeof k.remarques === 'string' ? k.remarques : undefined,
        couleur: k.couleur ? couleurValide(k.couleur, 'jaune') : undefined,
        colonneId: colonneIdCarte,
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
    if (colonnesSeparees.length === 0) return initiales();
    return { colonnes: colonnesSeparees, cartes: cartesValides };
  } catch {
    return initiales();
  }
}

export function sauverKanban(data: KanbanData): void {
  try {
    localStorage.setItem(CLE_KANBAN, JSON.stringify(data));
  } catch {
    // Quota plein ou navigateur en navigation privée : le tableau reste utilisable
    // en mémoire pour la session en cours.
  }
}
