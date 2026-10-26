import React, { useEffect, useMemo, useState } from 'react';
import {
  COULEURS_KANBAN_IDS,
  estSectionBroderieMain,
  KANBAN_COULEURS,
  KanbanBloc,
  KanbanCarte,
  KanbanCouleurId,
  KanbanData,
  KanbanColonne,
  KanbanDeplacement,
  KanbanAttente,
  KanbanPersonne,
  KanbanSection,
} from '../types/kanban.ts';
import { chargerKanban, nouvelId, sauverKanban } from '../utils/kanbanStorage.ts';
import { AppPage, ViewSwitcher } from '@/src/components/layout/ViewSwitcher.tsx';
import { SessionBadge } from '@/src/components/layout/SessionBadge.tsx';
import { EditableItemName } from '@/src/components/ui/EditableItemName.tsx';
import { dateISOFromDateTime, estDateISO, getDateISOSite, getNowParis, joursEntreDatesISO, LIBELLE_FUSEAU } from '../utils/dateFrance.ts';
import { Profil } from '@/src/utils/auth.ts';
import { AlertTriangle, Calendar, Check, Clock, GitMerge, GripVertical, Plus, Scissors, SquareKanban, Trash2, X } from 'lucide-react';

interface DeveloppementViewProps {
  onChangePage: (page: AppPage) => void;
  profil: Profil;
  onDeconnexion: () => void;
}

/** Élément en cours de glissement (carte ou colonne). */
type DragInfo = { type: 'carte'; id: string } | { type: 'colonne'; id: string };

/** Brouillon d'édition d'une carte (mode Trello : édition sur place). */
interface BrouillonEdition {
  id: string;
  titre: string;
  etat: string;
  traiteur: string;
  client: string;
  remarques: string;
  couleur: KanbanCouleurId;
  /** Date d'échéance (optionnelle) */
  dateEcheance?: string;
  attentes: KanbanAttente[];
}

function trierParOrdre<T extends { ordre: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.ordre - b.ordre);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Affiche une date ISO (`YYYY-MM-DD` ou horodatage) au format français. */
function formatDateFr(valeur: string | null | undefined): string {
  if (!valeur) return '—';
  const [annee, mois, jour] = valeur.slice(0, 10).split('-');
  return annee && mois && jour ? `${jour}/${mois}/${annee}` : valeur;
}

/** Construit une entrée d'historique de déplacement. */
function entreeDeplacement(
  date: string,
  colonneId: string,
  sectionId?: string,
  personneId?: string
): KanbanDeplacement {
  return {
    date,
    colonneId,
    ...(sectionId ? { sectionId } : {}),
    ...(personneId ? { personneId } : {}),
  };
}

/**
 * Vue « Développement » : un kanban type Trello (colonnes et tâches de
 * développement propres à cet onglet), glisser-déposer natif, tout persisté
 * dans le localStorage. Indépendante des cartes de production.
 */
export const DeveloppementView: React.FC<DeveloppementViewProps> = ({ onChangePage, profil, onDeconnexion }) => {
  const [data, setData] = useState<KanbanData>(() => chargerKanban());
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const [colonneCible, setColonneCible] = useState<string | null>(null);
  /** Où déposer la carte : `colonneId` (+ `sectionId` si la colonne est scindée, `personneId` pour BRODERIE MAIN). */
  const [insertion, setInsertion] = useState<{
    colonneId: string;
    sectionId?: string;
    personneId?: string;
    index: number;
  } | null>(null);
  /** Position d'insertion d'une colonne dans la rangée (liste complète). */
  const [insertionColonne, setInsertionColonne] = useState<number | null>(null);
  /** Colonne survolée pendant un glissement de colonne (surlignage ciblé). */
  const [rangeeCible, setRangeeCible] = useState<string | null>(null);
  const [edition, setEdition] = useState<BrouillonEdition | null>(null);
  const [composerOuverte, setComposerOuverte] = useState<string | null>(null);
  const [composerNom, setComposerNom] = useState('');
  const [composerEtat, setComposerEtat] = useState('');
  const [composerTraiteur, setComposerTraiteur] = useState('');
  const [composerClient, setComposerClient] = useState('');
  const [composerRemarques, setComposerRemarques] = useState('');
  const [composerCouleur, setComposerCouleur] = useState<KanbanCouleurId | null>(null);
  const [composerDateEcheance, setComposerDateEcheance] = useState<string>('');
  const [nouvelleColonne, setNouvelleColonne] = useState(false);
  const [nouveauTitre, setNouveauTitre] = useState('');

  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();

  useEffect(() => {
    const timer = setInterval(() => setParisTime(getNowParis().timeStr), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    sauverKanban(data);
  }, [data]);

  const colonnes = useMemo(() => trierParOrdre(data.colonnes), [data.colonnes]);
  const cartesDe = (colonneId: string): KanbanCarte[] =>
    trierParOrdre(data.cartes.filter((c) => c.colonneId === colonneId));

  /**
   * Calcule l'alarme d'une carte. Les anciennes cartes n'ont pas
   * `dateEntreeZone` : on retombe alors sur leur date de création.
   */
  const getAlarmeInfo = (carte: KanbanCarte): { active: boolean; type: 'zone' | 'global' | null; diffZone: number; seuilZone: number; diffTotal: number; estBroderieMain: boolean; dateEntree: string | null; estDerniereColonne: boolean } => {
    const colonne = data.colonnes.find((c) => c.id === carte.colonneId);
    const section = carte.sectionId ? colonne?.sections?.find((s) => s.id === carte.sectionId) : undefined;
    const estBroderieMain = Boolean(section && estSectionBroderieMain(section));
    const seuilZone = estBroderieMain ? 4 : 2;
    const dateEntree = estDateISO(carte.dateEntreeZone) ? carte.dateEntreeZone : dateISOFromDateTime(carte.creeLe);
    const creation = dateISOFromDateTime(carte.creeLe);
    const diffZone = dateEntree ? joursEntreDatesISO(dateEntree) : 0;
    const diffTotal = creation ? joursEntreDatesISO(creation) : diffZone;
    const derniereColonne = data.colonnes.reduce((max, c) => (c.ordre > max.ordre ? c : max), data.colonnes[0]);
    const estDerniereColonne = Boolean(derniereColonne && carte.colonneId === derniereColonne.id);
    const inactive = { active: false, type: null as null, diffZone, seuilZone, diffTotal, estBroderieMain, dateEntree, estDerniereColonne };

    if (!dateEntree) return inactive;

    // Alarme 1 : délai dans la zone actuelle (2j ou 4j selon section BRODERIE MAIN).
    if (diffZone >= seuilZone) {
      return { active: true, type: 'zone', diffZone, seuilZone, diffTotal, estBroderieMain, dateEntree, estDerniereColonne };
    }
    // Alarme 2 : délai global depuis création (12j max pour atteindre la dernière colonne).
    if (!estDerniereColonne && diffTotal >= 12) {
      return { active: true, type: 'global', diffZone, seuilZone, diffTotal, estBroderieMain, dateEntree, estDerniereColonne };
    }
    return inactive;
  };
  const cartesDeSection = (colonne: KanbanColonne, sectionId?: string): KanbanCarte[] => {
    const premiere = colonne.sections?.[0]?.id;
    return trierParOrdre(
      data.cartes.filter(
        (c) => c.colonneId === colonne.id && (c.sectionId ?? premiere) === sectionId
      )
    );
  };

  /** Clé d'ouverture du composer : une par zone (colonne simple ou section). */
  const cleZone = (colonneId: string, sectionId?: string) =>
    sectionId ? `${colonneId}::${sectionId}` : colonneId;

  const arreterDrag = () => {
    setDrag(null);
    setColonneCible(null);
    setInsertion(null);
    setInsertionColonne(null);
    setRangeeCible(null);
  };

  /* ------------------------------- Colonnes ------------------------------ */

  const ajouterColonne = (titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: [
        ...prev.colonnes,
        { id: nouvelId(), titre: trimmed, ordre: prev.colonnes.length, couleur: 'blanc' },
      ],
    }));
  };

  const renommerColonne = (id: string, titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) => (c.id === id ? { ...c, titre: trimmed } : c)),
    }));
  };

  /**
   * Scinde une colonne simple en 2 sections empilées. Si le titre contient
   * « / » (ex. « Punching/PDF »), il est découpé en deux titres de section.
   * Les cartes déjà présentes passent en section du haut.
   */
  const scinderColonne = (id: string) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === id);
      if (!colonne || colonne.sections?.length) return prev;
      const parties = colonne.titre.split('/').map((p) => p.trim()).filter(Boolean);
      const sections: KanbanSection[] = [
        { id: nouvelId(), titre: parties[0] || 'Partie 1', ordre: 0 },
        { id: nouvelId(), titre: parties[1] || 'Partie 2', ordre: 1 },
      ];
      return {
        colonnes: prev.colonnes.map((c) => (c.id === id ? { ...c, sections } : c)),
        cartes: prev.cartes.map((k) =>
          k.colonneId === id ? { ...k, sectionId: sections[0].id } : k
        ),
      };
    });
  };

  /** Réassemble les sections d'une colonne en une seule liste. */
  const fusionnerColonne = (id: string) => {
    setData((prev) => ({
      colonnes: prev.colonnes.map((c) => (c.id === id ? { ...c, sections: undefined } : c)),
      cartes: prev.cartes.map((k) => (k.colonneId === id ? { ...k, sectionId: undefined } : k)),
    }));
  };

  const renommerSection = (colonneId: string, sectionId: string, titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId && c.sections
          ? {
              ...c,
              sections: c.sections.map((s) =>
                s.id === sectionId ? { ...s, titre: trimmed } : s
              ),
            }
          : c
      ),
    }));
  };

  /* ------------------------- Personnes (section BRODERIE MAIN) ------------- */

  /** Ajoute une personne dans la section BRODERIE MAIN. */
  const ajouterPersonne = (colonneId: string, sectionId: string, bloc: KanbanBloc) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!colonne) return prev;
      const section = colonne.sections?.find((s) => s.id === sectionId);
      if (!section) return prev;
      const personnes = section.personnes ?? [];
      const ordre = personnes.reduce((max, p) => Math.max(max, p.ordre), -1) + 1;
      return {
        ...prev,
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? {
                ...c,
                sections: c.sections?.map((s) =>
                  s.id === sectionId
                    ? { ...s, personnes: [...personnes, { id: nouvelId(), titre: '', bloc, ordre }] }
                    : s
                ),
              }
            : c
        ),
      };
    });
  };

  /**
   * Supprime une personne de la section BRODERIE MAIN (avec ses tâches).
   */
  const supprimerPersonne = (colonneId: string, sectionId: string, personneId: string) => {
    const section = data.colonnes
      .find((c) => c.id === colonneId)
      ?.sections?.find((s) => s.id === sectionId);
    const personne = section?.personnes?.find((p) => p.id === personneId);
    if (!personne) return;
    const nb = data.cartes.filter(
      (c) => c.colonneId === colonneId && c.sectionId === sectionId && c.personneId === personneId
    ).length;
    const nom = personne.titre.trim() || 'sans nom';
    const message =
      nb > 0
        ? `Supprimer la personne « ${nom} » et ses ${nb} tâche(s) ?`
        : `Supprimer la personne « ${nom} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? {
              ...c,
              sections: c.sections?.map((s) =>
                s.id === sectionId ? { ...s, personnes: s.personnes?.filter((p) => p.id !== personneId) } : s
              ),
            }
          : c
      ),
      cartes: prev.cartes.filter(
        (k) => !(k.colonneId === colonneId && k.sectionId === sectionId && k.personneId === personneId)
      ),
    }));
  };

  /**
   * Supprime une section classique (avec ses cartes) — pas de section BRODERIE MAIN.
   */
  const supprimerSection = (colonneId: string, sectionId: string) => {
    const section = data.colonnes
      .find((c) => c.id === colonneId)
      ?.sections?.find((s) => s.id === sectionId);
    if (!section || estSectionBroderieMain(section)) return;
    const nb = data.cartes.filter((c) => c.colonneId === colonneId && c.sectionId === sectionId).length;
    const nom = section.titre.trim() || 'sans nom';
    const message =
      nb > 0
        ? `Supprimer la section « ${nom} » et ses ${nb} carte(s) ?`
        : `Supprimer la section « ${nom} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? { ...c, sections: c.sections?.filter((s) => s.id !== sectionId) }
          : c
      ),
      cartes: prev.cartes.filter((k) => !(k.colonneId === colonneId && k.sectionId === sectionId)),
    }));
  };

  /** Renomme une personne de la section BRODERIE MAIN. */
  const renommerPersonne = (colonneId: string, sectionId: string, personneId: string, titre: string) => {
    const trimmed = titre.trim();
    if (!trimmed) return;
    setData((prev) => ({
      ...prev,
      colonnes: prev.colonnes.map((c) =>
        c.id === colonneId
          ? {
              ...c,
              sections: c.sections?.map((s) =>
                s.id === sectionId
                  ? { ...s, personnes: s.personnes?.map((p) => (p.id === personneId ? { ...p, titre: trimmed } : p)) }
                  : s
              ),
            }
          : c
      ),
    }));
  };

  /** Ajoute une section classique dans la colonne. */
  const ajouterSection = (colonneId: string) => {
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!colonne) return prev;
      const sections = colonne.sections ?? [];
      const ordre = sections.reduce((max, s) => Math.max(max, s.ordre), -1) + 1;
      return {
        ...prev,
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? { ...c, sections: [...sections, { id: nouvelId(), titre: '', ordre }] }
            : c
        ),
      };
    });
  };

  const supprimerColonne = (id: string) => {
    const colonne = data.colonnes.find((c) => c.id === id);
    if (!colonne) return;
    const nb = data.cartes.filter((c) => c.colonneId === id).length;
    const message =
      nb > 0
        ? `Supprimer la colonne « ${colonne.titre} » et ses ${nb} carte(s) ?`
        : `Supprimer la colonne « ${colonne.titre} » ?`;
    if (!window.confirm(message)) return;
    setData((prev) => ({
      colonnes: prev.colonnes.filter((c) => c.id !== id),
      cartes: prev.cartes.filter((c) => c.colonneId !== id),
    }));
  };

  const deplacerColonne = (colonneId: string, index: number) => {
    setData((prev) => {
      const liste = trierParOrdre(prev.colonnes);
      const origine = liste.findIndex((c) => c.id === colonneId);
      if (origine === -1) return prev;
      const sans = liste.filter((c) => c.id !== colonneId);
      // L'index est calculé sur la liste complète (colonne glissée incluse) :
      // en partant vers la droite, on retranche la place que prend la colonne.
      const cible = clamp(origine < index ? index - 1 : index, 0, sans.length);
      const ordonnees = [...sans.slice(0, cible), liste[origine], ...sans.slice(cible)].map(
        (c, i) => ({ ...c, ordre: i })
      );
      return { ...prev, colonnes: ordonnees };
    });
  };

  /* -------------------------------- Cartes ------------------------------- */

  const ajouterCarte = (
    colonneId: string,
    sectionId: string | undefined,
    titre: string,
    etat: string,
    traiteur: string,
    client: string,
    remarques: string,
    couleur: KanbanCouleurId,
    date?: string
  ) => {
    const trimmed = titre.trim();
    if (!trimmed || !couleur) return;
    setData((prev) => {
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      const premiere = colonne?.sections?.[0]?.id;
      // Colonne scindée : la carte rejoint sa section (défaut : la première).
      const zone = colonne?.sections?.length ? (sectionId ?? premiere) : undefined;
      const memeZone = (c: KanbanCarte) => (c.sectionId ?? premiere) === zone;
      return {
        ...prev,
        cartes: [
          ...prev.cartes,
          {
            id: nouvelId(),
            titre: trimmed,
            etat: etat.trim() || undefined,
            traiteur: traiteur.trim() || undefined,
            client: client.trim() || undefined,
            remarques: remarques.trim() || undefined,
            couleur,
            colonneId,
            sectionId: zone,
            date: date || undefined,
            dateEntreeZone: getDateISOSite(),
            ordre: prev.cartes.filter((c) => c.colonneId === colonneId && memeZone(c)).length,
            creeLe: new Date().toISOString(),
            historiqueDeplacements: [entreeDeplacement(getDateISOSite(), colonneId, zone)],
            attentes: [],
          },
        ],
      };
    });
  };

  const majCarte = (id: string, updates: Partial<KanbanCarte>) => {
    setData((prev) => ({
      ...prev,
      cartes: prev.cartes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  };

  const supprimerCarte = (id: string) => {
    const carte = data.cartes.find((c) => c.id === id);
    if (!carte) return;
    if (!window.confirm(`Supprimer la tâche « ${carte.titre} » ?`)) return;
    setData((prev) => ({ ...prev, cartes: prev.cartes.filter((c) => c.id !== id) }));
  };

  const deplacerCarte = (
    carteId: string,
    colonneId: string,
    sectionId: string | undefined,
    index: number
  ) => {
    const today = getDateISOSite();
    setData((prev) => {
      const carte = prev.cartes.find((c) => c.id === carteId);
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!carte || !colonne) return prev;
      const premiere = colonne.sections?.[0]?.id;
      // Colonne scindée : on replace dans sa section (défaut : la première).
      const zone = colonne.sections?.length ? (sectionId ?? premiere) : undefined;
      const memeZone = (c: KanbanCarte) => (c.sectionId ?? premiere) === zone;
      const cibles = trierParOrdre(
        prev.cartes.filter((c) => c.colonneId === colonneId && c.id !== carteId && memeZone(c))
      );
      const position = clamp(index, 0, cibles.length);
      const changeZone = carte.colonneId !== colonneId || carte.sectionId !== zone;
      const ordonnees = [
        ...cibles.slice(0, position),
        {
          ...carte,
          colonneId,
          sectionId: zone,
          personneId: undefined,
          bloc: undefined,
          dateEntreeZone: changeZone ? today : carte.dateEntreeZone,
          date: changeZone ? undefined : carte.date,
          historiqueDeplacements: changeZone
            ? [...(carte.historiqueDeplacements ?? []), entreeDeplacement(today, colonneId, zone)]
            : carte.historiqueDeplacements,
        },
        ...cibles.slice(position),
      ].map((c, i) => ({ ...c, ordre: i }));
      // Les cartes hors zone (autres sections, autres colonnes) ne bougent pas.
      const hors = prev.cartes.filter(
        (c) => c.id !== carteId && (c.colonneId !== colonneId || !memeZone(c))
      );
      return { ...prev, cartes: [...hors, ...ordonnees] };
    });
  };

  /** Déplace une carte vers une personne de la section BRODERIE MAIN. */
  const deplacerCartePersonne = (
    carteId: string,
    colonneId: string,
    sectionId: string,
    personneId: string,
    index: number
  ) => {
    const today = getDateISOSite();
    setData((prev) => {
      const carte = prev.cartes.find((c) => c.id === carteId);
      const colonne = prev.colonnes.find((c) => c.id === colonneId);
      if (!carte || !colonne) return prev;
      const section = colonne.sections?.find((s) => s.id === sectionId);
      if (!section || !estSectionBroderieMain(section)) return prev;
      const personne = section.personnes?.find((p) => p.id === personneId);
      if (!personne) return prev;
      const cibles = trierParOrdre(
        prev.cartes.filter(
          (c) =>
            c.colonneId === colonneId &&
            c.sectionId === sectionId &&
            c.personneId === personneId &&
            c.id !== carteId
        )
      );
      const position = clamp(index, 0, cibles.length);
      const ordonnees = [
        ...cibles.slice(0, position),
        {
          ...carte,
          colonneId,
          sectionId,
          personneId,
          bloc: personne.bloc,
          dateEntreeZone: today,
          date: undefined,
          historiqueDeplacements: [...(carte.historiqueDeplacements ?? []), entreeDeplacement(today, colonneId, sectionId, personneId)],
        },
        ...cibles.slice(position),
      ].map((c, i) => ({ ...c, ordre: i }));
      const hors = prev.cartes.filter(
        (c) => c.id !== carteId && !(c.colonneId === colonneId && c.sectionId === sectionId && c.personneId === personneId)
      );
      return { ...prev, cartes: [...hors, ...ordonnees] };
    });
  };

  /* --------------------------- Glisser-déposer --------------------------- */

  const dragCarte = (e: React.DragEvent, carteId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', carteId);
    setDrag({ type: 'carte', id: carteId });
  };

  const dragColonne = (e: React.DragEvent, colonneId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', colonneId);
    setDrag({ type: 'colonne', id: colonneId });
  };

  const survolCarte = (
    e: React.DragEvent,
    carte: KanbanCarte,
    position: number,
    sectionId?: string
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const avant = e.clientY < rect.top + rect.height / 2;
    setColonneCible(carte.colonneId);
    // Si la carte est dans une section BRODERIE MAIN, inclure personneId.
    const colonne = data.colonnes.find((c) => c.id === carte.colonneId);
    const section = colonne?.sections?.find((s) => s.id === carte.sectionId);
    const isBroderieMain = section && estSectionBroderieMain(section);
    setInsertion({
      colonneId: carte.colonneId,
      sectionId,
      personneId: isBroderieMain ? carte.personneId : undefined,
      index: avant ? position : position + 1,
    });
  };

  /** Survol du vide d'une zone (ou de son en-tête) : insertion en fin de zone. */
  const survolZone = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string | undefined,
    position: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setColonneCible(colonneId);
    setInsertion({ colonneId, sectionId, index: position });
  };

  /** Survol de l'en-tête d'une colonne : insertion par défaut (fin de zone). */
  const survolEnteteColonne = (e: React.DragEvent, colonne: KanbanColonne) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setColonneCible(colonne.id);
    // Si la colonne a une section BRODERIE MAIN, l'en-tête n'est pas une zone de dépôt valide.
    const sectionBroderie = colonne.sections?.find((s) => estSectionBroderieMain(s));
    if (sectionBroderie) {
      // Pas de zone de dépôt valide sur l'en-tête : ne pas setInsertion.
      return;
    }
    const premiere = colonne.sections?.[0]?.id;
    const nb = premiere ? cartesDeSection(colonne, premiere).length : cartesDe(colonne.id).length;
    setInsertion({ colonneId: colonne.id, sectionId: premiere, index: nb });
  };

  const survolRangee = (e: React.DragEvent, colonneId: string, index: number) => {
    if (drag?.type !== 'colonne') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const apres = e.clientX > rect.left + rect.width / 2;
    setRangeeCible(colonneId);
    setInsertionColonne(index + (apres ? 1 : 0));
  };

  /**
   * Chute dans une zone (liste ou en-tête de section). Retourne silencieusement
   * si c'est une colonne qui est glissée, pour laisser remonter à la rangée.
   */
  const deposerDansZone = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string | undefined,
    finZone: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    // L'insertion vient du dernier survol ; sinon : fin de zone.
    const memeZone =
      insertion &&
      insertion.colonneId === colonneId &&
      (insertion.sectionId ?? null) === (sectionId ?? null);
    deplacerCarte(drag.id, colonneId, sectionId, memeZone ? insertion.index : finZone);
    arreterDrag();
  };

  /** Chute sur l'en-tête d'une colonne (carte) ou sur la rangée (colonne glissée). */
  const deposerSurColonne = (e: React.DragEvent, colonne: KanbanColonne) => {
    e.preventDefault();
    if (drag?.type === 'carte') {
      // Si la colonne a une section BRODERIE MAIN, l'en-tête n'accepte pas les dépôts.
      const sectionBroderie = colonne.sections?.find((s) => estSectionBroderieMain(s));
      if (sectionBroderie) {
        arreterDrag();
        return;
      }
      const premiere = colonne.sections?.[0]?.id;
      if (insertion && insertion.colonneId === colonne.id) {
        deplacerCarte(drag.id, colonne.id, insertion.sectionId ?? premiere, insertion.index);
      } else {
        const nb = premiere ? cartesDeSection(colonne, premiere).length : cartesDe(colonne.id).length;
        deplacerCarte(drag.id, colonne.id, premiere, nb);
      }
    } else if (drag?.type === 'colonne' && insertionColonne !== null) {
      deplacerColonne(drag.id, insertionColonne);
    }
    arreterDrag();
  };

  /** Survol d'une cellule personne (section BRODERIE MAIN). */
  const survolZonePersonne = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string,
    personneId: string,
    position: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setColonneCible(colonneId);
    setInsertion({ colonneId, sectionId, personneId, index: position });
  };

  /** Chute dans une cellule personne (section BRODERIE MAIN). */
  const deposerZonePersonne = (
    e: React.DragEvent,
    colonneId: string,
    sectionId: string,
    personneId: string,
    finZone: number
  ) => {
    if (drag?.type !== 'carte') return;
    e.preventDefault();
    e.stopPropagation();
    const memeZone =
      insertion &&
      insertion.colonneId === colonneId &&
      insertion.sectionId === sectionId &&
      insertion.personneId === personneId;
    deplacerCartePersonne(drag.id, colonneId, sectionId, personneId, memeZone ? insertion.index : finZone);
    arreterDrag();
  };

  /* -------------------------------- Rendu -------------------------------- */

  const ouvrirEdition = (carte: KanbanCarte) => {
    setEdition({
      id: carte.id,
      titre: carte.titre,
      etat: carte.etat ?? '',
      traiteur: carte.traiteur ?? '',
      client: carte.client ?? '',
      remarques: carte.remarques ?? '',
      // La couleur affichée sert de défaut : le post-it a toujours une couleur.
      couleur: carte.couleur ?? 'jaune',
      dateEcheance: carte.date,
      attentes: (carte.attentes ?? []).map((a) => ({ ...a })),
    });
  };

  const enregistrerEdition = () => {
    if (!edition) return;
    const titre = edition.titre.trim();
    majCarte(edition.id, {
      titre: titre || 'Tâche sans titre',
      etat: edition.etat.trim() || undefined,
      traiteur: edition.traiteur.trim() || undefined,
      client: edition.client.trim() || undefined,
      remarques: edition.remarques.trim() || undefined,
      couleur: edition.couleur,
      date: edition.dateEcheance || undefined,
      attentes: edition.attentes
        .filter((a) => a.dateEntree)
        .map((a) => ({
          id: a.id,
          libelle: a.libelle?.trim() || undefined,
          dateEntree: a.dateEntree,
          ...(a.dateSortie ? { dateSortie: a.dateSortie } : {}),
        })),
    });
    setEdition(null);
  };

  const validerComposer = (colonneId: string, sectionId?: string) => {
    if (!composerNom.trim() || !composerCouleur) return;
    ajouterCarte(colonneId, sectionId, composerNom, composerEtat, composerTraiteur, composerClient, composerRemarques, composerCouleur, composerDateEcheance);
    setComposerNom('');
    setComposerEtat('');
    setComposerTraiteur('');
    setComposerClient('');
    setComposerRemarques('');
    setComposerCouleur(null);
    setComposerDateEcheance('');
  };

  const fermerComposer = () => {
    setComposerOuverte(null);
    setComposerNom('');
    setComposerEtat('');
    setComposerTraiteur('');
    setComposerClient('');
    setComposerRemarques('');
    setComposerCouleur(null);
    setComposerDateEcheance('');
  };

  /** Post-its d'une zone : formes carrées, 2 par ligne, édition sur place. */
  const rendreCartes = (zone: { sectionId?: string }, cartesZone: KanbanCarte[]) =>
    cartesZone.map((carte, position) => {
      const enEdition = edition?.id === carte.id;
      const enDrag = drag?.type === 'carte' && drag.id === carte.id;
      if (enEdition && edition) {
        return (
          <div
            key={carte.id}
            className="col-span-2 bg-white rounded-lg border-2 border-violet-400 shadow-sm p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Date de déplacement</span>
              <span className="text-xs font-semibold text-slate-700 font-mono">
                {formatDateFr(getAlarmeInfo(carte).dateEntree ?? carte.dateEntreeZone ?? carte.creeLe)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(carte.historiqueDeplacements ?? []).slice(-6).map((h, i) => {
                const col = data.colonnes.find((c) => c.id === h.colonneId);
                const sec = h.sectionId ? col?.sections?.find((s) => s.id === h.sectionId) : undefined;
                const label = sec ? `${col?.titre ?? h.colonneId} / ${sec.titre}` : (col?.titre ?? h.colonneId);
                return (
                  <span key={i} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">
                    {formatDateFr(h.date)} · {label}
                  </span>
                );
              })}
            </div>
            <textarea
              autoFocus
              rows={2}
              value={edition.titre}
              onChange={(e) => setEdition({ ...edition, titre: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEdition(null);
              }}
              className="w-full text-xs font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-hidden focus:border-violet-400"
              placeholder="Titre de la tâche"
            />
            <input
              value={edition.etat}
              onChange={(e) => setEdition({ ...edition, etat: e.target.value })}
              placeholder="État (ex: En cours, En attente, Terminé)"
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
            />
            <input
              value={edition.traiteur}
              onChange={(e) => setEdition({ ...edition, traiteur: e.target.value })}
              placeholder="Traiteur (nom du responsable)"
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
            />
            <input
              value={edition.client}
              onChange={(e) => setEdition({ ...edition, client: e.target.value })}
              placeholder="Nom du client"
              className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
            />
            <textarea
              rows={3}
              value={edition.remarques}
              onChange={(e) => setEdition({ ...edition, remarques: e.target.value })}
              placeholder="Remarques libres…"
              className="w-full text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-hidden focus:border-violet-400"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
                Date d'échéance
                <input
                  type="date"
                  value={edition.dateEcheance ?? ''}
                  onChange={(e) => setEdition({ ...edition, dateEcheance: e.target.value || undefined })}
                  className="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-hidden focus:border-violet-400 w-auto"
                />
              </label>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {COULEURS_KANBAN_IDS.map((couleurId) => (
                <button
                  key={couleurId}
                  type="button"
                  title={KANBAN_COULEURS[couleurId].label}
                  onClick={() => setEdition({ ...edition, couleur: couleurId })}
                  className={`w-5 h-5 rounded-sm border ${KANBAN_COULEURS[couleurId].fond} ${
                    KANBAN_COULEURS[couleurId].bordure
                  } ${
                    edition.couleur === couleurId
                      ? 'ring-2 ring-offset-1 ring-slate-700'
                      : 'hover:scale-110'
                  } transition-transform cursor-pointer`}
                />
              ))}
            </div>
            <div className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Attente</span>
                <button
                  type="button"
                  onClick={() =>
                    setEdition({
                      ...edition,
                      attentes: [
                        ...edition.attentes,
                        { id: `ATT-${Date.now().toString(36).toUpperCase()}`, dateEntree: getDateISOSite() },
                      ],
                    })
                  }
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600 hover:text-violet-700"
                >
                  <Plus className="w-3 h-3" />
                  Ajouter
                </button>
              </div>
              {edition.attentes.length === 0 && (
                <p className="text-[10px] text-slate-400">Aucune période d’attente</p>
              )}
              {edition.attentes.map((attente, index) => (
                <div key={attente.id} className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white px-1.5 py-1">
                  <input
                    value={attente.libelle ?? ''}
                    onChange={(e) => {
                      const attentes = [...edition.attentes];
                      attentes[index] = { ...attente, libelle: e.target.value };
                      setEdition({ ...edition, attentes });
                    }}
                    placeholder="Motif"
                    className="w-24 text-[10px] text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-1.5 py-0.5 focus:outline-hidden focus:border-violet-400"
                  />
                  <label className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase">
                    Entrée
                    <input
                      type="date"
                      value={attente.dateEntree ?? ''}
                      onChange={(e) => {
                        const attentes = [...edition.attentes];
                        attentes[index] = { ...attente, dateEntree: e.target.value };
                        setEdition({ ...edition, attentes });
                      }}
                      className="text-[10px] text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-1 py-0.5 focus:outline-hidden focus:border-violet-400"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[9px] font-bold text-slate-500 uppercase">
                    Sortie
                    <input
                      type="date"
                      value={attente.dateSortie ?? ''}
                      onChange={(e) => {
                        const attentes = [...edition.attentes];
                        attentes[index] = { ...attente, dateSortie: e.target.value || undefined };
                        setEdition({ ...edition, attentes });
                      }}
                      className="text-[10px] text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-1 py-0.5 focus:outline-hidden focus:border-violet-400"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const attentes = edition.attentes.filter((_, i) => i !== index);
                      setEdition({ ...edition, attentes });
                    }}
                    className="ml-auto text-rose-500 hover:text-rose-700"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={() => {
                  supprimerCarte(carte.id);
                  setEdition(null);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-700 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Supprimer
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEdition(null)}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-md px-2 py-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={enregistrerEdition}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md px-2 py-1 cursor-pointer"
                >
                  <Check className="w-3 h-3" />
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        );
      }
      const alarmeInfo = getAlarmeInfo(carte);
      const alarme = alarmeInfo.active;
      const { diffZone, diffTotal } = alarmeInfo;
      const dateDeplacementFr = formatDateFr(alarmeInfo.dateEntree ?? carte.dateEntreeZone ?? carte.creeLe);
      const postIt = KANBAN_COULEURS[carte.couleur ?? 'jaune'];
      return (
        <div
          key={carte.id}
          draggable
onDragStart={(e) => dragCarte(e, carte.id)}
            onDragEnd={arreterDrag}
            onDragOver={(e) => survolCarte(e, carte, position, zone.sectionId)}
            onClick={() => ouvrirEdition(carte)}
            title={`${postIt.label} — date de déplacement : ${dateDeplacementFr} (créée le ${new Date(
              carte.creeLe
            ).toLocaleDateString('fr-FR')}) — dans la zone depuis ${diffZone}j (seuil ${alarmeInfo.seuilZone}j)${alarmeInfo.estDerniereColonne ? ' — dernière colonne' : ''}${alarme ? ` ⚠ ALARME ${alarmeInfo.type === 'zone' ? 'ZONE' : 'GLOBALE'}` : ' — pas en alarme'} — cliquer pour modifier`}
            className={`group ${postIt.fond} rounded-[3px] p-2.5 aspect-square self-start overflow-y-auto cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all relative ${
              alarme ? 'border-2 border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.65)]' : `border ${postIt.bordure} shadow-sm`
            } ${enDrag ? 'opacity-40' : ''}`}
          >
          {alarme && alarmeInfo.type === 'zone' && (
            <div className="mb-1.5 flex items-center justify-center gap-1 rounded-sm bg-red-600 px-1.5 py-1 text-[8px] font-extrabold uppercase tracking-wide text-white">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span>
                {`Délai zone : ${diffZone}j / ${alarmeInfo.seuilZone}j`}
              </span>
            </div>
          )}
          {alarme && alarmeInfo.type === 'global' && (
            <div className="mt-1 flex items-center justify-center gap-1 rounded-sm bg-red-600 px-1 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-white">
              <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
              <span>
                {`Délai global : ${diffTotal}j / 12j`}
              </span>
            </div>
          )}
          {carte.date && (
            <div className="flex justify-end mb-1">
              <span className={`flex items-center gap-0.5 text-[10px] font-medium whitespace-nowrap ${
                alarme ? 'text-red-600 animate-pulse' : 'text-slate-600'
              }`}>
                <AlertTriangle className="w-3 h-3" />
                {new Date(carte.date).toLocaleDateString('fr-FR')}
              </span>
            </div>
          )}
          <p className="text-xs font-semibold text-slate-800 leading-snug">{carte.titre}</p>
          {carte.etat && (
            <p className="text-[10px] text-slate-600 mt-0.5">
              <span className="font-medium">État :</span> {carte.etat}
            </p>
          )}
          {carte.traiteur && (
            <p className="text-[10px] text-slate-600 mt-0.5">
              <span className="font-medium">Traiteur :</span> {carte.traiteur}
            </p>
          )}
          {carte.client && (
            <p className="text-[10px] text-slate-600 mt-0.5">
              <span className="font-medium">Client :</span> {carte.client}
            </p>
          )}
          {carte.remarques && (
            <p className="text-[10px] text-slate-500 mt-0.5 italic">
              {carte.remarques}
            </p>
          )}
        </div>
      );
    });

  /** Fiche identitaire d'un nouveau post-it, ou bouton d'ouverture de la fiche. */
  const rendreComposer = (colonne: KanbanColonne, zone: { sectionId?: string }) =>
    composerOuverte === cleZone(colonne.id, zone.sectionId) ? (
      <div className="col-span-2 bg-white rounded-lg border-2 border-violet-300 shadow-sm p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600">
            Fiche identitaire
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
              <span>Date de création</span>
              <span className="text-xs font-semibold text-slate-700 font-mono bg-slate-50 border border-slate-200 rounded-md px-2 py-1">
                {new Date().toLocaleDateString('fr-FR')}
              </span>
            </div>
            <button
              type="button"
              onClick={fermerComposer}
              title="Fermer la fiche"
              className="p-0.5 rounded text-slate-300 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Nom
          </label>
          <input
            autoFocus
            value={composerNom}
            onChange={(e) => setComposerNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Nom de la tâche"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            État
          </label>
          <input
            value={composerEtat}
            onChange={(e) => setComposerEtat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="État (ex: En cours, En attente, Terminé)"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Traiteur
          </label>
          <input
            value={composerTraiteur}
            onChange={(e) => setComposerTraiteur(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Traiteur (nom du responsable)"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Client
          </label>
          <input
            value={composerClient}
            onChange={(e) => setComposerClient(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Nom du client"
            className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
            Remarques
          </label>
          <textarea
            rows={3}
            value={composerRemarques}
            onChange={(e) => setComposerRemarques(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                validerComposer(colonne.id, zone.sectionId);
              } else if (e.key === 'Escape') {
                fermerComposer();
              }
            }}
            placeholder="Remarques libres…"
            className="w-full text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-hidden focus:border-violet-400"
          />
        </div>

        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase">
            Date d'échéance
            <input
              type="date"
              value={composerDateEcheance}
              onChange={(e) => setComposerDateEcheance(e.target.value)}
              className="text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-hidden focus:border-violet-400 w-auto"
            />
          </label>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
            Couleur du post-it
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {COULEURS_KANBAN_IDS.map((couleurId) => {
              const meta = KANBAN_COULEURS[couleurId];
              const actif = composerCouleur === couleurId;
              return (
                <button
                  key={couleurId}
                  type="button"
                  onClick={() => setComposerCouleur(couleurId)}
                  className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-1.5 py-1.5 rounded-md border ${meta.fond} ${meta.bordure} transition cursor-pointer ${
                    actif
                      ? 'ring-2 ring-offset-1 ring-slate-700 shadow-sm'
                      : 'opacity-70 hover:opacity-100 hover:shadow-sm'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.point}`} />
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            disabled={!composerNom.trim() || !composerCouleur}
            onClick={() => validerComposer(colonne.id, zone.sectionId)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md px-2 py-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3" />
            Ajouter
          </button>
          <button
            type="button"
            onClick={fermerComposer}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
          >
            Annuler
          </button>
        </div>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => {
          setComposerOuverte(cleZone(colonne.id, zone.sectionId));
          setComposerNom('');
          setComposerEtat('');
          setComposerTraiteur('');
          setComposerClient('');
          setComposerRemarques('');
          setComposerCouleur(null);
          setComposerDateEcheance('');
        }}
        className="col-span-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-violet-700 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg px-2 py-1.5 transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Nouvelle Carte
      </button>
    );

  /**
   * Liste de cartes d'une zone : grille de 2 post-its par ligne, état vide et
   * fiche identitaire. `avecComposer` masque la création dans les cellules
   * « personne » de BRODERIE MAIN (assignation par glisser-déposer).
   */
  const construireListe = (
    colonne: KanbanColonne,
    zone: { section?: KanbanSection; sectionId?: string },
    avecComposer = true
  ) => {
    const cartesZone = cartesDeSection(colonne, zone.sectionId);
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    // Surlignage : zone de section ciblée, ou colonne simple ciblée.
    const surligne = zone.section
      ? enCible &&
        insertion?.colonneId === colonne.id &&
        (insertion?.sectionId ?? null) === (zone.sectionId ?? null)
      : enCible;
    return (
      <div
        key={zone.sectionId ?? 'unique'}
        onDragOver={(e) => survolZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        onDrop={(e) => deposerDansZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        className={`grid grid-cols-2 gap-2 content-start transition-colors ${
          zone.section ? 'min-h-[5rem] px-1' : 'min-h-[7rem] rounded-b-2xl'
        } ${surligne ? 'bg-violet-50/70' : ''}`}
      >
        {cartesZone.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-slate-300/80 px-3 py-4 text-center text-[11px] text-slate-400">
            {surligne
              ? 'Déposez la carte ici'
              : avecComposer
                ? 'Aucune tâche'
                : 'Glissez une carte ici'}
          </div>
        )}

        {rendreCartes(zone, cartesZone)}

        {avecComposer && rendreComposer(colonne, zone)}
      </div>
    );
  };

  /**
   * Liste de cartes d'une personne dans le tableau BRODERIE MAIN.
   * Grille 2 post-its/ligne, sans fiche identitaire (assignation par glisser-déposer).
   */
  const construireListePersonne = (
    colonne: KanbanColonne,
    section: KanbanSection,
    personne: KanbanPersonne
  ) => {
    const cartesZone = trierParOrdre(
      data.cartes.filter(
        (c) => c.colonneId === colonne.id && c.sectionId === section.id && c.personneId === personne.id
      )
    );
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    const surligne =
      enCible &&
      insertion?.colonneId === colonne.id &&
      insertion?.sectionId === section.id &&
      insertion?.personneId === personne.id;
    return (
      <div
        key={personne.id}
        onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personne.id, cartesZone.length)}
        onDrop={(e) => deposerZonePersonne(e, colonne.id, section.id, personne.id, cartesZone.length)}
        className={`grid grid-cols-2 gap-2 content-start min-h-[5rem] px-1 transition-colors ${
          surligne ? 'bg-violet-50/70' : ''
        }`}
      >
        {cartesZone.length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-slate-300/80 px-3 py-4 text-center text-[11px] text-slate-400">
            {surligne ? 'Déposez la carte ici' : 'Glissez une carte ici'}
          </div>
        )}
        {rendreCartes({ sectionId: personne.id }, cartesZone)}
      </div>
    );
  };

  /** Zone complète : liste simple, ou liste encadrée avec son en-tête. */
  const renduZone = (
    colonne: KanbanColonne,
    zone: { section?: KanbanSection; sectionId?: string }
  ) => {
    const liste = construireListe(colonne, zone);
    const section = zone.section;
    if (!section) return liste;
    const cartesZone = cartesDeSection(colonne, zone.sectionId);
    const enCible = colonneCible === colonne.id && drag?.type === 'carte';
    const surligne =
      enCible &&
      insertion?.colonneId === colonne.id &&
      (insertion?.sectionId ?? null) === (zone.sectionId ?? null);
    return (
      <div
        key={section.id}
        onDragOver={(e) => survolZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        onDrop={(e) => deposerDansZone(e, colonne.id, zone.sectionId, cartesZone.length)}
        className={`rounded-xl border p-1.5 transition-all ${
          surligne
            ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/60'
            : 'border-slate-200/80 bg-white/50'
        }`}
      >
        <div
          onDragOver={(e) => survolZone(e, colonne.id, zone.sectionId, 0)}
          onDrop={(e) => deposerDansZone(e, colonne.id, zone.sectionId, 0)}
          className="flex items-center gap-1 px-1 pb-1"
        >
          <EditableItemName
            value={section.titre}
            onSave={(titre) => renommerSection(colonne.id, section.id, titre)}
            placeholder="Section"
            className="min-w-0"
          />
          <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
            {cartesZone.length}
          </span>
          <button
            type="button"
            onClick={() => supprimerSection(colonne.id, section.id)}
            title="Supprimer la section"
            className="ml-2 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        {liste}
      </div>
    );
  };

  /**
   * Colonne « BRODERIE MAIN » (sous « Broderie Machine ») : tableau à 4
   * colonnes, une ligne par personne, deux listes indépendantes (client /
   * initiatives). Les post-its créés ici atterrissent dans la zone
* d'attente « Non assignées », puis se glissent sur une personne.
    */
  /** Zone simple (colonne non scindée) : une seule liste. */
  const zonesSimple = (colonne: KanbanColonne) =>
    renduZone(colonne, { sectionId: undefined });

  /**
   * Tableau 4 colonnes de la section BRODERIE MAIN (personnes × post-its).
   * Deux listes indépendantes (client / initiatives), une ligne par personne.
   */
  const renduBroderieMain = (colonne: KanbanColonne, section: KanbanSection) => {
    const personnes = section.personnes ?? [];
    const client = trierParOrdre(personnes.filter((p) => p.bloc === 'client'));
    const initiatives = trierParOrdre(personnes.filter((p) => p.bloc === 'initiatives'));
    const nbLignes = Math.max(client.length, initiatives.length);
    const grille = 'grid grid-cols-[11rem_minmax(0,1fr)_11rem_minmax(0,1fr)]';

    const cartesDeSection = trierParOrdre(
      data.cartes.filter((c) => c.colonneId === colonne.id && c.sectionId === section.id)
    );

    const cartesDePersonne = (personneId: string): KanbanCarte[] =>
      trierParOrdre(
        data.cartes.filter(
          (c) => c.colonneId === colonne.id && c.sectionId === section.id && c.personneId === personneId
        )
      );

    const cellulePersonne = (personne: KanbanPersonne, bordureDroite: boolean) => {
      const nb = cartesDePersonne(personne.id).length;
      return (
        <div
          key={personne.id}
          className={`group px-2 py-1 space-y-0.5 ${bordureDroite ? 'border-r border-slate-200' : ''}`}
          onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personne.id, nb)}
          onDrop={(e) => deposerZonePersonne(e, colonne.id, section.id, personne.id, nb)}
        >
          <EditableItemName
            value={personne.titre}
            onSave={(titre) => renommerPersonne(colonne.id, section.id, personne.id, titre)}
            placeholder="Nom"
            className="w-full min-w-0"
          />
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums">
              {nb}
            </span>
            <button
              type="button"
              onClick={() => supprimerPersonne(colonne.id, section.id, personne.id)}
              title="Supprimer la personne"
              className="ml-auto p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      );
    };

    const celluleCartes = (personne: KanbanPersonne, bordureDroite: boolean) => (
      <div className={`px-1 py-1 ${bordureDroite ? 'border-r border-slate-200' : ''}`}>
        {construireListePersonne(colonne, section, personne)}
      </div>
    );

    const celluleVide = (bordureDroite: boolean) => (
      <div className={`bg-slate-50/50 ${bordureDroite ? 'border-r border-slate-200' : ''}`} />
    );

    const boutonPersonne = (bloc: KanbanBloc) => (
      <button
        type="button"
        onClick={() => ajouterPersonne(colonne.id, section.id, bloc)}
        className="w-full inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-violet-700 cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter une personne
      </button>
    );

    /** Remet à zéro la section BRODERIE MAIN (cartes + personnes). */
    const resetBroderieMain = (colonneId: string, sectionId: string) => {
      if (!window.confirm('Vider la section BRODERIE MAIN (supprime toutes les cartes et personnes) ?')) return;
      setData((prev) => ({
        colonnes: prev.colonnes.map((c) =>
          c.id === colonneId
            ? { ...c, sections: c.sections?.map((s) => (s.id === sectionId ? { ...s, personnes: [] } : s)) }
            : c
        ),
        cartes: prev.cartes.filter((k) => !(k.colonneId === colonneId && k.sectionId === sectionId)),
      }));
    };

    return (
      <div className="px-2 pb-2 space-y-2">
        {/* En-tête de section (comme les autres sections) */}
        <div
          onDragOver={(e) => survolZonePersonne(e, colonne.id, section.id, personnes[0]?.id ?? '', 0)}
          onDrop={(e) => deposerZonePersonne(e, colonne.id, section.id, personnes[0]?.id ?? '', 0)}
          className="flex items-center gap-1 px-1 pb-1"
        >
          <EditableItemName
            value={section.titre}
            onSave={(titre) => renommerSection(colonne.id, section.id, titre)}
            placeholder="Section"
            className="min-w-0"
          />
          <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
            {cartesDeSection.length}
          </span>
          <button
            type="button"
            onClick={() => resetBroderieMain(colonne.id, section.id)}
            title="Vider la section BRODERIE MAIN"
            className="ml-2 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="rounded-xl border border-slate-200/80 bg-white/60 overflow-hidden">
          <div className={`${grille} bg-slate-50 border-b border-slate-200`}>
            {['Chaîne', 'Développement client', 'Chaîne', 'Développement initiatives'].map(
              (titre, i) => (
                <div
                  key={`${titre}-${i}`}
                  className={`px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    i % 2 === 0 ? 'text-violet-700' : 'text-slate-500'
                  } ${i < 3 ? 'border-r border-slate-200' : ''}`}
                >
                  {titre}
                </div>
              )
            )}
          </div>
          {nbLignes === 0 && (
            <div className="px-3 py-3 text-center text-[11px] text-slate-400">
              Aucune personne : ajoutez une chaîne de chaque côté ci-dessous.
            </div>
          )}
          {Array.from({ length: nbLignes }, (_, i) => (
            <div key={`ligne-${i}`} className={`${grille} border-b border-slate-200/70 last:border-b-0`}>
              {client[i] ? cellulePersonne(client[i], true) : celluleVide(true)}
              {client[i] ? celluleCartes(client[i], true) : celluleVide(true)}
              {initiatives[i] ? cellulePersonne(initiatives[i], true) : celluleVide(true)}
              {initiatives[i] ? celluleCartes(initiatives[i], false) : celluleVide(false)}
            </div>
          ))}
          <div className={`${grille} bg-slate-50 border-t border-slate-200`}>
            <div className="col-span-2 border-r border-slate-200 px-2 py-1.5">
              {boutonPersonne('client')}
            </div>
            <div className="col-span-2 px-2 py-1.5">{boutonPersonne('initiatives')}</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col">
      {/* Bandeau haut : titre, date/heure, sélecteur de vue (même trame que les autres vues) */}
      <div className="bg-white border-b border-slate-200 relative z-20 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-600 flex items-center justify-center text-white">
              <SquareKanban className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                Développement
              </h1>
              <div className="flex flex-wrap items-center gap-2.5 text-xs sm:text-sm text-slate-500 mt-0.5">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {fullFrenchDate}
                </span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1 font-semibold text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200/60">
                  <Clock className="w-3.5 h-3.5 text-violet-600" />
                  {parisTime}
                  <span className="text-[10px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex md:justify-center">
            <ViewSwitcher currentPage="developpement" onChangePage={onChangePage} />
          </div>

          <div className="hidden md:flex justify-end items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-500">
              {data.cartes.length} tâche{data.cartes.length > 1 ? 's' : ''} • {colonnes.length}{' '}
              colonne{colonnes.length > 1 ? 's' : ''}
            </span>
            <SessionBadge profil={profil} onDeconnexion={onDeconnexion} />
          </div>

          <div className="flex md:hidden justify-end items-center">
            <SessionBadge profil={profil} onDeconnexion={onDeconnexion} />
          </div>
        </div>
      </div>

      {/* Tableau kanban : rangée horizontale de colonnes */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <div className="inline-flex items-start gap-4 px-4 sm:px-6 py-6 min-w-full">
          {colonnes.map((colonne, indexColonne) => {
            const cartes = cartesDe(colonne.id);
            const enCible = colonneCible === colonne.id && drag?.type === 'carte';
            const colonneEnCible = rangeeCible === colonne.id && drag?.type === 'colonne';
            const sections = colonne.sections?.length ? colonne.sections : undefined;
            // Colonne large si elle contient une section BRODERIE MAIN.
            const aBroderieMain = sections?.some((s) => estSectionBroderieMain(s));
            return (
              <section
                key={colonne.id}
                onDragOver={(e) => {
                  survolRangee(e, colonne.id, indexColonne);
                  survolEnteteColonne(e, colonne);
                }}
                onDrop={(e) => deposerSurColonne(e, colonne)}
                className={`${
                  aBroderieMain ? 'w-[50rem]' : 'w-72'
                } shrink-0 bg-slate-100/80 rounded-2xl border transition-all ${
                  enCible || colonneEnCible
                    ? 'border-violet-400 ring-2 ring-violet-200 bg-violet-50/60'
                    : 'border-slate-200'
                }`}
              >
                {/* En-tête de colonne */}
                <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
                  <span
                    draggable
                    onDragStart={(e) => dragColonne(e, colonne.id)}
                    onDragEnd={arreterDrag}
                    title="Glisser pour déplacer la colonne"
                    className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0"
                  >
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${KANBAN_COULEURS[colonne.couleur].point}`}
                  />
                  <EditableItemName
                    value={colonne.titre}
                    onSave={(titre) => renommerColonne(colonne.id, titre)}
                    placeholder="Titre de la colonne"
                    className="min-w-0"
                  />
                  <span className="ml-auto text-[10px] font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
                    {cartes.length}
                  </span>
                  {sections ? (
                    <button
                      type="button"
                      onClick={() => fusionnerColonne(colonne.id)}
                      title="Réassembler les sections en une seule liste"
                      className="p-1 rounded text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0"
                    >
                      <GitMerge className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => scinderColonne(colonne.id)}
                      title="Scinder la colonne en 2 sections empilées"
                      className="p-1 rounded text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => ajouterSection(colonne.id)}
                    title="Ajouter une section"
                    className="p-1 rounded text-slate-300 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => supprimerColonne(colonne.id)}
                    title="Supprimer la colonne"
                    className="p-1 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Sections : liste simple ou 2 sections empilées ; section BRODERIE MAIN = tableau 4 colonnes */}
                <div className="px-2 pb-2 space-y-2">
                  {sections
                    ? sections.map((section) =>
                        estSectionBroderieMain(section)
                          ? renduBroderieMain(colonne, section)
                          : renduZone(colonne, { section, sectionId: section.id })
                      )
                    : zonesSimple(colonne)}
                </div>
              </section>
            );
          })}

          {/* Ajout de colonne (style Trello, en bout de rangée) */}
          <div className="w-72 shrink-0">
            {nouvelleColonne ? (
              <div className="bg-slate-100/80 border border-violet-300 rounded-2xl p-3 space-y-2">
                <input
                  autoFocus
                  value={nouveauTitre}
                  onChange={(e) => setNouveauTitre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      ajouterColonne(nouveauTitre);
                      setNouveauTitre('');
                      setNouvelleColonne(false);
                    } else if (e.key === 'Escape') {
                      setNouvelleColonne(false);
                      setNouveauTitre('');
                    }
                  }}
                  placeholder="Titre de la colonne"
                  className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-md px-2.5 py-2 focus:outline-hidden focus:border-violet-400"
                />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      ajouterColonne(nouveauTitre);
                      setNouveauTitre('');
                      setNouvelleColonne(false);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-violet-600 hover:bg-violet-700 rounded-md px-2 py-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Ajouter
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNouvelleColonne(false);
                      setNouveauTitre('');
                    }}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNouvelleColonne(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 bg-slate-100/80 hover:bg-slate-200/80 border border-dashed border-slate-300 rounded-2xl px-3 py-3 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Ajouter une colonne
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
