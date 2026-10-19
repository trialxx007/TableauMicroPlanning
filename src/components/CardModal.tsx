import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  CardFormData,
  CardItem,
  CardStatus,
  JalonCategorie,
  JalonCode,
  LIBELLE_TYPE_CARTE,
  OrdreFabrication,
  SousOrdreFabrication,
  TypeCarte,
  OFType,
  OF_TYPES,
  normalizeOFType,
} from '../types/card.ts';
import { OFSubTable, computeOfQuantiteFinie } from './OFSubTable.tsx';
import {
  getJalonInfo,
  appliquerReglePpsRdl,
  normaliserCodeJalon,
  normaliserDateJalon,
  normaliserSemaine,
  rangsParCategorie,
  SEMAINE_MAX,
  SEMAINE_MIN,
  dateCourteJalon,
  dateDuJourJalon,
  themeJalon,
  marqueJalon,
  titreCategorie,
  okProdAuto,
  CODES_OK_PROD,
  CODE_NOMENCLATURE_R,
  type JalonEtat,
} from '../utils/jalons.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { jalonApi } from '../services/api.ts';
import { categorieParCode, CATEGORIES_PAR_CODE, cataloguePourType, NOMENCLATURES_PAR_TYPE } from '../data/mockJalons.ts';
import { getNowParis, getSemaineISO } from '../utils/dateFrance.ts';
import {
  X,
  Check,
  Calendar,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Plus,
  Building2,
  Handshake,
  Lock,
} from 'lucide-react';

interface CardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CardFormData) => Promise<void>;
  initialData?: CardItem | null;
  /**
   * Pré-remplissage appliqué uniquement en mode création (initialData null) :
   * par exemple okProd/statut préréservés pour une case du Suivi Global.
   */
  createPrefill?: Partial<CardFormData> | null;
  /**
   * Appelé après l'ajout ou le retrait d'un jalon sur cette carte, pour recharger
   * le catalogue partagé et les cartes. Le jalon reste propre à la carte : les
   * autres ne sont pas modifiées.
   */
  onJalonAjoute?: () => void | Promise<void>;
}

type JalonState = {
  valide: boolean;
  semaine: number | null;
  semaineFin: number | null;
  date: string | null;
  tbc: boolean;
  valideLe: string | null;
};

const JALON_INITIAL: JalonState = {
  valide: false,
  semaine: null,
  semaineFin: null,
  date: null,
  tbc: false,
  valideLe: null,
};

/** Une carte porte ses propres jalons : seuls ceux qu'elle a lui sont affichables. */
function jalonsInitiaux(card: CardItem | null | undefined): Record<JalonCode, JalonState> {
  const base: Record<JalonCode, JalonState> = {};
  for (const j of card?.jalons ?? []) {
    base[j.code] = {
      valide: Boolean(j.valide),
      semaine: j.semaine ?? null,
      semaineFin: j.semaineFin ?? null,
      date: j.date ?? null,
      tbc: Boolean(j.tbc),
      valideLe: j.valideLe ?? null,
    };
  }
  return base;
}

/** Jalons d'un catalogue(positionnés en attente, sans échéance). Sert au
 *  pré-remplissage d'une carte neuve avec les nomenclatures de son type. */
function preremplirJalons(entrees: { code: string }[]): Record<JalonCode, JalonState> {
  const base: Record<JalonCode, JalonState> = {};
  for (const j of entrees) base[j.code] = { ...JALON_INITIAL };
  return base;
}

/**
 * Changement de nature de matière : les nomenclatures propres au nouveau type
 * remplacent celles de l'ancien. Les statuts, communs aux deux, sont laissés en
 * place avec l'état déjà saisi, et un code partagé entre les deux types (AI, AF,
 * AC) conserve également son état plutôt que de repartir à zéro.
 */
function basculerType(
  actuel: TypeCarte,
  nouveau: TypeCarte,
  jalons: Record<JalonCode, JalonState>
): Record<JalonCode, JalonState> {
  if (actuel === nouveau) return jalons;
  const attendues = cataloguePourType(nouveau);
  const codesAttendus = new Set(attendues.map((j) => j.code));
  const suivant: Record<JalonCode, JalonState> = {};
  // Un code qui survit au changement de type garde l'état déjà saisi.
  for (const [code, etat] of Object.entries(jalons)) {
    if (codesAttendus.has(code)) suivant[code] = etat;
  }
  // Les nomenclatures propres au nouveau type, elles, arrivent en attente.
  for (const j of attendues) {
    if (!(j.code in suivant)) suivant[j.code] = { ...JALON_INITIAL };
  }
  return suivant;
}

export const CardModal: React.FC<CardModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  createPrefill,
  onJalonAjoute,
}) => {
  const catalogue = useJalonCatalogue();
  const [client, setClient] = useState('');
  const [batch, setBatch] = useState('');
  const [modele, setModele] = useState('');
  // Nature de matière de la carte. Elle commande le jeu de nomenclatures proposé :
  // R (Raphia) porte R, AC, AF et AI ; T (Tissus) porte AI, AF et AC. Les cartes
  // antérieures à ce choix sont lues Raphia, le type le plus courant.
  const [typeCarte, setTypeCarte] = useState<TypeCarte>(
    (initialData?.typeCarte as TypeCarte) ?? 'R'
  );
  const [jalons, setJalons] = useState<Record<JalonCode, JalonState>>({});
  const [okProd, setOkProd] = useState(false);
  const [ofs, setOfs] = useState<OrdreFabrication[]>([]);
  const [quantiteDemandee, setQuantiteDemandee] = useState<number>(100);
  const [quantiteFinie, setQuantiteFinie] = useState<number>(0);
  const [statut, setStatut] = useState<CardStatus>('EN_ATTENTE');
  const [decisionReunion, setDecisionReunion] = useState('');
  const [notes, setNotes] = useState('');
  const [chaineId, setChaineId] = useState<string | undefined>(undefined);
  const [chaineNom, setChaineNom] = useState<string | undefined>(undefined);
  const [chaineCategorie, setChaineCategorie] = useState<string | undefined>(undefined);
  const [isAddingOF, setIsAddingOF] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);


  const [nouveauCode, setNouveauCode] = useState('');
  // Grandeur du jalon en cours de saisie : vert pour une nomenclature, bleu pour
  // un statut. Le code saisi la devine (ou le bloc d'où vient le « + »).
  const [nouvelleCategorie, setNouvelleCategorie] = useState<JalonCategorie>('STATUT');
  // Grandeur choisie pour les jalons ajoutés à une carte qui n'est pas encore
  // enregistrée : le catalogue ne les connaît pas encore, elle ne peut venir que
  // d'ici. Elle est vidée dès que la carte est sauvegardée.
  const [categoriesEnAttente, setCategoriesEnAttente] = useState<
    Record<JalonCode, JalonCategorie>
  >({});
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [erreurJalon, setErreurJalon] = useState<string | null>(null);
  const [ouvertureAjout, setOuvertureAjout] = useState(false);
  // Popover pour ajouter une nomenclature : liste les codes dispo pour le type carte
  const [popoverAnchor, setPopoverAnchor] = useState<HTMLElement | null>(null);
  const [popoverCategorie, setPopoverCategorie] = useState<JalonCategorie | null>(null);
  // La popover n'est pas un descendant du bouton : pour ne pas la fermer quand
  // on clique dedans, on exclut aussi son propre nœud du « clic extérieur ».
  const popoverRef = useRef<HTMLDivElement | null>(null);
  // Saisie de la semaine en cours, par code. Sans ce brouillon, effacer le champ
  // passerait le jalon à « En attente » et le champ disparaîtrait aussitôt : on ne
  // pourrait plus retaper une semaine. Le brouillon vit le temps de la saisie, la
  // semaine enregistrée ne change qu'à la validation du champ (blur) ou à l'enregistrement.
  const [brouillonSemaine, setBrouillonSemaine] = useState<Record<string, string | undefined>>({});
  useEffect(() => {
    if (initialData) {
      setClient(initialData.client);
      setBatch(initialData.batch);
      setModele(initialData.modele);
      setTypeCarte((initialData.typeCarte as TypeCarte) ?? 'R');
      setJalons(jalonsInitiaux(initialData));
      setOkProd(Boolean(initialData.okProd));
      const normalizedOfs = (initialData.ofs || []).map((o) => ({
        ...o,
        quantiteFinie: computeOfQuantiteFinie(o),
      }));
      setOfs(normalizedOfs);
      setQuantiteDemandee(initialData.quantiteDemandee);
      setQuantiteFinie(initialData.quantiteFinie);
      if (normalizedOfs.length > 0) {
        setQuantiteFinie(normalizedOfs.reduce((sum, o) => sum + o.quantiteFinie, 0));
      }
      setStatut(initialData.statut);
      setDecisionReunion(initialData.decisionReunion || '');
      setNotes(initialData.notes || '');
      setChaineId(initialData.chaineId);
      setChaineNom(initialData.chaineNom);
      setChaineCategorie(initialData.chaineCategorie);
    } else {
      setClient('');
      setBatch(`OF-2026-${Math.floor(1000 + Math.random() * 9000)}`);
      setModele('');
      setTypeCarte('R');
      setJalons(preremplirJalons(cataloguePourType('R')));
      setOkProd(false);
      setOfs([]);
      setQuantiteDemandee(200);
      setQuantiteFinie(0);
      setStatut('EN_ATTENTE');
      setDecisionReunion('');
      setNotes('');
      setChaineId(undefined);
      setChaineNom(undefined);
      setChaineCategorie(undefined);
      // Pré-remplissage venu du Suivi Global (création dans une case vide).
      if (createPrefill) {
        if (createPrefill.okProd !== undefined) setOkProd(Boolean(createPrefill.okProd));
        if (createPrefill.statut) setStatut(createPrefill.statut);
        if (createPrefill.quantiteDemandee) setQuantiteDemandee(createPrefill.quantiteDemandee);
        if (createPrefill.modele) setModele(createPrefill.modele);
        if (createPrefill.client) setClient(createPrefill.client);
        if (createPrefill.batch) setBatch(createPrefill.batch);
        if (createPrefill.typeCarte) setTypeCarte(createPrefill.typeCarte as TypeCarte);
        if (createPrefill.ofs && createPrefill.ofs.length > 0) setOfs(createPrefill.ofs);
      }
    }
    setError(null);
    setCopied(false);
    setErreurJalon(null);
    setBrouillonSemaine({});
    setNouvelleCategorie('STATUT');
    setCategoriesEnAttente({});
    setIsAddingOF(false);
  }, [initialData, isOpen, createPrefill]);

  // Codes portés par cette carte, regroupés par grandeur : les nomenclatures à la
  // suite, puis les statuts. Le hook est appelé avant le retour anticipé : tous les
  // hooks doivent tourner à chaque rendu.
  // Nomenclatures disposées comme les pastilles R/T au-dessus : même ordre que
  // NOMENCLATURES_PAR_TYPE pour le type courant, R éventuel toujours en tête,
  // puis les statuts dans l'ordre du catalogue. Un code activé depuis les pastilles
  // mais absent du catalogue partagé repartirait en 999 et ouvrirait une seconde
  // section « Nomenclature » après les statuts.
  const codesCarteJalons = useMemo(() => {
    const rang = rangsParCategorie(catalogue);
    const ordreNomenclatures = new Map<string, number>();
    NOMENCLATURES_PAR_TYPE[typeCarte].forEach((n, i) => ordreNomenclatures.set(n.code, i));
    const rangCode = (code: JalonCode) => {
      if (code === 'R') return -1;
      const local = ordreNomenclatures.get(code);
      if (local !== undefined) return local;
      return 1000 + (rang.get(code) ?? 999);
    };
    const grandeur = (code: JalonCode) => (categorieParCode(code) === 'NOMENCLATURE' ? 0 : 1);
    return Object.keys(jalons).sort((a, b) => {
      const g = grandeur(a) - grandeur(b);
      if (g !== 0) return g;
      return rangCode(a) - rangCode(b);
    });
  }, [jalons, catalogue, typeCarte]);

  // Fermer le popover nomenclature si clic en dehors (doit être avant le early return)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const node = e.target as Node;
      if (
        popoverAnchor &&
        !popoverAnchor.contains(node) &&
        !popoverRef.current?.contains(node)
      ) {
        setPopoverAnchor(null);
        setPopoverCategorie(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [popoverAnchor]);

  if (!isOpen) return null;

  const handleCopyReference = (e: React.MouseEvent) => {
    e.preventDefault();
    if (batch) {
      navigator.clipboard.writeText(batch);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const setJalon = (code: JalonCode, patch: Partial<JalonState>) => {
    setJalons((prev) => ({
      ...prev,
      [code]: {
        valide: prev[code]?.valide ?? false,
        semaine: prev[code]?.semaine ?? null,
        semaineFin: prev[code]?.semaineFin ?? null,
        date: prev[code]?.date ?? null,
        tbc: prev[code]?.tbc ?? false,
        valideLe: prev[code]?.valideLe ?? null,
        ...patch,
      },
    }));
  };

  /**
   * Listbox des états. « En attente », « TBC » et « Validé » effacent l'échéance.
   * « Semaine » et « Date » exigent une échéance : on la pré-remplit (semaine ou
   * jour courants) si le jalon n'en a pas encore, pour ne pas retomber en attente.
   */
  const setJalonEtat = (code: JalonCode, etat: JalonEtat) => {
    if (etat === 'VALIDE')
      setJalon(code, {
        valide: true,
        semaine: null,
        semaineFin: null,
        date: null,
        tbc: false,
        // On conserve l'horodatage de la validation initiale, on ne le réécrit
        // pas à chaque aller-retour dans la listbox.
        valideLe: jalons[code]?.valideLe ?? `${getNowParis().dateStr} à ${getNowParis().timeStr}`,
      });
    else if (etat === 'EN_ATTENTE')
      setJalon(code, { valide: false, valideLe: null, semaine: null, semaineFin: null, date: null, tbc: false });
    else if (etat === 'TBC')
      setJalon(code, { valide: false, valideLe: null, semaine: null, semaineFin: null, date: null, tbc: true });
    else if (etat === 'DATE')
      setJalon(code, {
        valide: false,
        valideLe: null,
        tbc: false,
        semaine: null,
        semaineFin: null,
        date: jalons[code]?.date ?? dateDuJourJalon(),
      });
    else
      setJalon(code, {
        valide: false,
        valideLe: null,
        tbc: false,
        date: null,
        semaine: jalons[code]?.semaine ?? getSemaineISO(),
      });
    setBrouillonSemaine((prev) => ({ ...prev, [code]: undefined }));
  };

  /** Saisie libre de la semaine : on garde le texte brut, on n'engage que les
   *  valeurs exploitables. Un champ vidé ne change rien tant qu'il reste ciblé. */
  const saisirSemaine = (code: JalonCode, brut: string) => {
    setBrouillonSemaine((prev) => ({ ...prev, [code]: brut }));
    if (brut.trim() === '') return;
    setJalon(code, { semaine: normaliserSemaine(brut) });
  };

  /** Sortie du champ : une saisie incomplète est normalisée, un champ vide
   *  remet le jalon en attente. */
  const validerSemaine = (code: JalonCode) => {
    const brut = brouillonSemaine[code];
    if (brut === undefined) return;
    setBrouillonSemaine((prev) => ({ ...prev, [code]: undefined }));
    if (brut.trim() === '') setJalon(code, { semaine: null });
    else setJalon(code, { semaine: normaliserSemaine(brut) });
  };

  /**
   * Ajout d'un jalon sur CETTE carte. Le code et son intitulé rejoignent le
   * catalogue partagé (une seule base pour tout le monde), mais l'état n'est créé
   * que pour la carte : les autres modèles n'en portent pas.
   * Les erreurs restent dans `erreurJalon` pour s'afficher sous le formulaire,
   * et non dans l'erreur générale de la carte.
   */
  const handleAjoutJalon = async () => {
    const code = normaliserCodeJalon(nouveauCode);
    if (!code) {
      setErreurJalon('Le code du jalon est obligatoire.');
      return;
    }
    if (jalons[code]) {
      setErreurJalon(`Cette carte porte déjà le jalon ${code}.`);
      return;
    }

    setAjoutEnCours(true);
    setErreurJalon(null);
    try {
      // Carte neuve : pas encore d'id en base, le jalon part avec la sauvegarde.
      if (initialData?.id) {
        // Le libellé par défaut est le code lui-même : l'utilisateur ne saisit
        // que le code, l'intitulé affiché reste le code (modifiable plus tard).
        await jalonApi.create(
          code,
          code,
          nouvelleCategorie,
          initialData.id
        );
        await onJalonAjoute?.();
      } else {
        // Sans id, le code n'existe pas encore au catalogue : on retient la
        // grandeur ici pour l'envoyer avec la carte, sinon elle serait devinée.
        setCategoriesEnAttente((prev) => ({ ...prev, [code]: nouvelleCategorie }));
      }
      setNouveauCode('');
      setNouvelleCategorie('STATUT');
      setJalon(code, { valide: false, valideLe: null, semaine: null });
    } catch (err) {
      setErreurJalon((err as Error).message || "Impossible d'ajouter le jalon");
    } finally {
      setAjoutEnCours(false);
    }
  };

  const handleSupprimerJalon = async (code: JalonCode) => {
    if (
      !window.confirm(
        `Retirer le jalon ${code} de cette carte ? Les autres cartes qui le portent le conservent.`
      )
    ) {
      return;
    }
    setErreurJalon(null);
    try {
      if (initialData?.id) {
        await jalonApi.removeFromCard(initialData.id, code);
        await onJalonAjoute?.();
      }
      setJalons((prev) => {
        const suivant = { ...prev };
        delete suivant[code];
        return suivant;
      });
    } catch (err) {
      setErreurJalon((err as Error).message || 'Suppression impossible');
    }
  };

  /**
   * Désactivation / activation d’une nomenclature depuis les pastilles R ou T.
   * Une pastille allumée dit que la carte porte le code ; un clic l'en retire,
   * un second clic le remet en attente. Cliquer un code d'un type inactif bascule
   * d’abord la nature de matière, puis applique le même toggling.
   */
  const basculerNomenclature = (t: TypeCarte, code: JalonCode) => {
    setJalons((prev) => {
      const base = t === typeCarte ? prev : basculerType(typeCarte, t, prev);
      if (!(code in base))
        return { ...base, [code]: { ...JALON_INITIAL } };
      const suivant = { ...base };
      delete suivant[code];
      return suivant;
    });
    if (t !== typeCarte) setTypeCarte(t);
  };

  /** Les 4 jalons techniques n'ont plus leur propre section : leur etat vit
   *  dans la liste des jalons du haut (DT, TC, RDL). */
  // Règle d'accord : dès que DT, TC, FT et RDL sont validés, l'OK Prod est accordé
  // automatiquement (validé à l'enregistrement côté serveur aussi). Avant ce stade,
  // la validation manuelle du bouton reste possible.
  const autoOkProd = CODES_OK_PROD.every((code) => jalons[code]?.valide === true);
  const okProdEffectif = okProd || autoOkProd;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client.trim() || !batch.trim() || !modele.trim()) {
      setError('Veuillez renseigner le client, le batch et le nom.');
      return;
    }

    if (quantiteDemandee <= 0) {
      setError('La quantité demandée doit être supérieure à 0.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        client: client.trim(),
        batch: batch.trim(),
        modele: modele.trim(),
        typeCarte,
        // Seuls les jalons portés par la carte sont envoyés : rien d'autre n'est créé pour elle.
        jalons: codesCarteJalons.map((code) => {
          const etat = jalons[code];
          const brouillon = brouillonSemaine[code];
          const semaine =
            brouillon === undefined
              ? etat?.semaine ?? null
              : brouillon.trim() === ''
              ? null
              : normaliserSemaine(brouillon);
          return {
            code,
            valide: Boolean(etat?.valide),
            ...(semaine != null ? { semaine } : {}),
            ...(code === 'R' && etat?.semaineFin != null ? { semaineFin: etat.semaineFin } : {}),
            ...(etat?.date != null && normaliserDateJalon(etat.date) != null
              ? { date: normaliserDateJalon(etat.date) as string }
              : {}),
            ...(etat?.tbc ? { tbc: true } : {}),
            ...(etat?.valide && etat?.valideLe ? { valideLe: etat.valideLe } : {}),
            ...(categoriesEnAttente[code] ? { categorie: categoriesEnAttente[code] } : {}),
          };
        }),
        dateRdl: jalons['RDL']?.valide ? getNowParis().dateStr : undefined,
        okProd: Boolean(okProd),
        dateOkProd: okProd ? getNowParis().dateStr : undefined,
        ofs,
        quantiteDemandee: Number(quantiteDemandee),
        quantiteFinie: Number(quantiteFinie),
        statut,
        decisionReunion: decisionReunion.trim() || undefined,
        notes: notes.trim() || undefined,
        chaineId,
        chaineNom,
        chaineCategorie,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || 'Erreur lors de la sauvegarde');
    } finally {
      setIsSubmitting(false);
    }
  };

  const reste = Math.max(0, quantiteDemandee - quantiteFinie);
  const progressPct =
    quantiteDemandee > 0 ? Math.min(100, Math.round((quantiteFinie / quantiteDemandee) * 100)) : 0;

  const semaineCourante = getSemaineISO();
  const infosJalons = codesCarteJalons.map((code) => {
    const entree = catalogue.find((j) => j.code === code) ?? {
      code,
      libelle: code,
      categorie: categorieParCode(code),
      ordre: 0,
    };
    const etat = jalons[code];
    return appliquerReglePpsRdl(
      getJalonInfo(
        entree,
        {
          valide: Boolean(etat?.valide),
          semaine: etat?.semaine ?? null,
          semaineFin: etat?.semaineFin ?? null,
          date: etat?.date ?? null,
          tbc: etat?.tbc,
        },
        semaineCourante
      ),
      Object.entries(jalons).map(([c, e]) => ({
        code: c,
        semaine: e.semaine,
        date: e.date,
      })),
      semaineCourante
    );
  });
  const jalonsEnRetard = infosJalons.filter((j) => j.enRetard);

  // Jalons regroupés par grandeur, pour les poser par blocs séparés par un filet.
  // Un simple repérage des changements de catégorie suffit : la liste est déjà triée.
  const groupesCarte = infosJalons.reduce<
    { categorie: JalonCategorie; jalons: typeof infosJalons }[]
  >((groupes, j) => {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.categorie === j.categorie) dernier.jalons.push(j);
    else groupes.push({ categorie: j.categorie, jalons: [j] });
    return groupes;
  }, []);

  const getStatusBadge = (s: CardStatus) => {
    switch (s) {
      case 'EN_COURS':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'TERMINE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'BLOQUE':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'EN_ATTENTE':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header with Card Representation */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  {initialData ? `Fiche Carte ⬢ ${initialData.id}` : 'Nouvelle Carte de Commande'}
                </h2>
                {initialData && (
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${getStatusBadge(
                      statut
                    )}`}
                  >
                    {statut === 'EN_COURS'
                      ? 'En cours'
                      : statut === 'TERMINE'
                      ? 'Terminé'
                      : statut === 'BLOQUE'
                      ? 'Bloqué'
                      : 'En attente'}
                  </span>
                )}
              </div>

                {initialData && (
                  <div className="mb-1.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-semibold text-slate-900">{client || 'Client'}</span>
                    <span className="font-medium text-slate-700">{modele || 'Nom'}</span>
                  </div>
                )}

              <div className="max-w-[340px] min-w-[220px]">
                {/* Progress bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-600 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                      Avancement {progressPct}%
                    </span>
                    <span className="font-semibold text-slate-900">
                      {quantiteFinie} / {quantiteDemandee}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        reste === 0
                          ? 'bg-emerald-500'
                          : progressPct > 50
                          ? 'bg-blue-600'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              </div>
              {initialData && (
              <div className="mt-1.5 text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      {initialData.dateCreation && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          Créé le {initialData.dateCreation}
                        </span>
                      )}
                    {initialData.dateDernierPoint && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        Point: {initialData.dateDernierPoint}
                      </span>
                    )}
              </div>
              )}

            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setOkProd(!okProdEffectif)}
              disabled={autoOkProd}
              title={
                autoOkProd
                  ? 'OK Prod auto validé : DT, TC, FT et RDL sont validés'
                  : okProd
                  ? 'Cliquer pour révoquer l’OK Prod'
                  : 'Valider l’OK Prod'
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold whitespace-nowrap transition-colors ${
                okProdEffectif
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 animate-pulse'
              } ${autoOkProd ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>
                {okProdEffectif ? (autoOkProd ? 'OK Prod auto' : 'OK Prod validé') : 'Valider OK Prod'}
              </span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* Section 1: Identifiants principaux */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Identifiants
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Client */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Client <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Dior"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Batch */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Batch <span className="text-rose-500">*</span>
                  </label>
                  {batch && (
                    <button
                      type="button"
                      onClick={handleCopyReference}
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <CheckCheck className="w-3 h-3 text-emerald-600" />
                          <span className="text-emerald-600 font-medium">Copié</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copier</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="ex: OF-2026-001"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Nature de matière : commande le jeu de nomenclatures de la carte.
                  Chaque code se désactive séparément : la pastille état dit si la
                  carte porte réellement ce jalon. */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nature de matière
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['R', 'T'] as TypeCarte[]).map((t) => {
                    const actif = typeCarte === t;
                    return (
                      <div
                        key={t}
                        className={`rounded-lg border transition-all ${
                          actif
                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setTypeCarte(t);
                            setJalons((prev) => basculerType(typeCarte, t, prev));
                          }}
                          aria-pressed={actif}
                          className="w-full text-left px-3 pt-2 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                actif ? 'bg-blue-600' : 'bg-slate-300'
                              }`}
                            />
                            <span className="text-sm font-semibold text-slate-900">
                              {t} — {LIBELLE_TYPE_CARTE[t]}
                            </span>
                          </span>
                        </button>

                        <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-2">
                          {NOMENCLATURES_PAR_TYPE[t].map((n) => {
                            const present = n.code in jalons;
                            return (
                              <button
                                key={n.code}
                                type="button"
                                onClick={() => basculerNomenclature(t, n.code)}
                                title={`${n.libelle} — ${present ? 'sélectionné' : 'désactivé'}`}
                                aria-pressed={present}
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-mono font-semibold transition-colors cursor-pointer ${
                                  present
                                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100'
                                    : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500'
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${present ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                {n.code}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Nom */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Robe Soirée Haute Couture"
                  value={modele}
                  onChange={(e) => setModele(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Quantité demandée */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantité demandée <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="ex: 200"
                  value={quantiteDemandee}
                  onChange={(e) => setQuantiteDemandee(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2 : les jalons, répartis par grandeur. Il n'y a plus de titre unique
              « Jalons » : chaque bloc porte l'intitulé de sa catégorie, ce qui
              remplace l'ancien filet vertical entre les deux groupes. */}
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-slate-400">
                Suivi de la carte — semaine {semaineCourante}
              </span>
            </div>

            {groupesCarte.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic px-1 py-2">
                Aucun jalon suivi sur cette carte. Utilisez « + » pour en ajouter.
              </p>
            ) : (
              <div className="space-y-3">
                {groupesCarte.map((groupe) => (
                  <div key={groupe.categorie} className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full ${
                          groupe.categorie === 'NOMENCLATURE' ? 'bg-emerald-500' : 'bg-blue-500'
                        }`}
                      />
                      <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        {titreCategorie(groupe.categorie)}
                      </h4>
                      {/* L'ajout se fait depuis le groupe visé : la grandeur est déjà
                          préselectionnée dans le formulaire, il n'y a plus à la choisir. */}
                      {groupe.categorie === 'NOMENCLATURE' ? (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              setNouvelleCategorie(groupe.categorie);
                              setPopoverAnchor(e.currentTarget);
                              setPopoverCategorie(groupe.categorie);
                            }}
                            title={`Ajouter dans ${titreCategorie(groupe.categorie).toLowerCase()}`}
                            aria-label={`Ajouter dans ${titreCategorie(groupe.categorie).toLowerCase()}`}
                            className="w-4 h-4 rounded border border-dashed border-slate-300 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50/50 flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Plus className="w-2.5 h-2.5" />
                          </button>
                          {popoverAnchor && popoverCategorie === groupe.categorie && (
                            <div
                              ref={popoverRef}
                              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg p-2 min-w-[140px]"
                            >
                              {NOMENCLATURES_PAR_TYPE[typeCarte]
                                .filter((n) => !(n.code in jalons))
                                .map((n) => (
                                  <button
                                    key={n.code}
                                    type="button"
                                    onClick={() => {
                                      basculerNomenclature(typeCarte, n.code);
                                      setPopoverAnchor(null);
                                      setPopoverCategorie(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-[11px] font-mono font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 rounded transition-colors flex items-center gap-2"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>{n.code}</span>
                                    <span className="text-[10px] text-slate-400 ml-auto">{n.libelle}</span>
                                  </button>
                                ))}
                              {NOMENCLATURES_PAR_TYPE[typeCarte].every((n) => n.code in jalons) && (
                                <p className="px-3 py-2 text-[10px] text-slate-400 text-center">
                                  Toutes les nomenclatures {LIBELLE_TYPE_CARTE[typeCarte]} sont déjà ajoutées
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setNouvelleCategorie(groupe.categorie);
                            setOuvertureAjout(true);
                          }}
                          title={`Ajouter dans ${titreCategorie(groupe.categorie).toLowerCase()}`}
                          aria-label={`Ajouter dans ${titreCategorie(groupe.categorie).toLowerCase()}`}
                          className="w-4 h-4 rounded border border-dashed border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    {/* Les pastilles gardent une largeur fixe et se rabattent sur la
                        ligne suivante quand la place manque. À l'édition elles
                        grandissent vers le bas (jamais latéralement), sans recouvrir
                        leurs voisines ni casser l'alignement de la rangée. */}
                    <div className="flex flex-wrap items-start gap-1.5">
                      {groupe.jalons.map((jalon) => {
                const planifie = jalon.etat === 'SEMAINE';
                const datePrevue = jalon.etat === 'DATE';
                // La teinte vient de la grandeur du jalon (vert nomenclature,
                // bleu statut) ; seule la nuance change avec l'avancement, et le
                // rouge reste réservé au retard. Couleurs partagées avec le tableau.
                const theme = themeJalon(jalon);

                return (
                  // La pastille grandit vers le BAS au survol/focus pour révéler les
                  // contrôles (état + semaine/date) : largeur fixe (7rem), hauteur
                  // animée. Aucun chevauchement latéral, la rangée ne se casse pas.
                  <div
                    key={jalon.code}
                    className="group/j relative min-w-[7rem] shrink-0 self-start"
                  >
                    <div className={`rounded-md border ${theme.fond}`}>
                      {/* En-tête compact : code et marque courte (✓, S40, 12/06, TBC, —).
                          Il reste visible pendant l'édition et fixe la largeur. Le
                          bouton de retrait occupe d'emblée sa place (spacer + bouton)
                          pour que l'en-tête ne se décale jamais au survol. */}
                      <div className="flex items-center gap-1 px-1 py-0.5">
                        <span className="w-4 shrink-0" aria-hidden="true" />
                        <span
                          className={`flex flex-1 min-w-[max-content] items-center justify-center gap-1 whitespace-nowrap text-[11px] leading-4 ${theme.texte}`}
                        >
                          {jalon.enRetard ? (
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                          ) : jalon.etat === 'VALIDE' ? (
                            <Check className="w-3 h-3 shrink-0" />
                          ) : planifie || datePrevue ? (
                            <Calendar className="w-3 h-3 shrink-0" />
                          ) : (
                            <Clock className="w-3 h-3 shrink-0" />
                          )}
                          <span className="font-bold">{jalon.code}:</span>
                          {/* Marque courte, identique au tableau et au suivi : sa largeur
                              ne dépend plus du libellé complet. */}
                          <span className="inline-block min-w-[2rem] text-center font-bold">
                            {marqueJalon(jalon)}
                          </span>
                        </span>
                        {/* Retrait du jalon de CETTE carte. Le catalogue partagé et les
                            autres cartes sont intacts : le code reste disponible ailleurs. */}
                        <button
                          type="button"
                          onClick={() => handleSupprimerJalon(jalon.code)}
                          title={`Retirer le jalon ${jalon.code} de cette carte`}
                          aria-label={`Retirer le jalon ${jalon.code} de cette carte`}
                          className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-black/10 bg-white/90 text-slate-500 opacity-0 transition-opacity hover:border-rose-300 hover:bg-white hover:text-rose-600 group-hover/j:opacity-100 group-focus-within/j:opacity-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>

                      {/* Contrôles révélés vers le BAS, dans le flux : la pastille grandit
                          en hauteur (grid-rows 0fr→1fr) et pousse le contenu suivant au
                          lieu de s'étaler latéralement sur ses voisines. */}
                      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover/j:grid-rows-[1fr] group-focus-within/j:grid-rows-[1fr]">
                        <div className="overflow-hidden">
                          <div className="flex flex-col items-center gap-1 border-t border-black/5 px-1 pb-1 pt-1">
                            <select
                              value={jalon.etat}
                              onChange={(e) => setJalonEtat(jalon.code, e.target.value as JalonEtat)}
                              aria-label={`État du jalon ${jalon.code}`}
                              className={`w-[6.5rem] px-1 py-0.5 text-[11px] font-semibold leading-4 rounded border bg-white cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-400 ${theme.controle} ${theme.bordure}`}
                            >
                              <option value="EN_ATTENTE">En attente</option>
                              <option value="SEMAINE">Semaine</option>
                              <option value="DATE">Date</option>
                              <option value="TBC">TBC</option>
                              <option value="VALIDE">Validé</option>
                            </select>

                            {/* Le champ semaine n'existe que pour l'état « Semaine ». */}
                            {planifie && (
                              <input
                                type="number"
                                min={SEMAINE_MIN}
                                max={SEMAINE_MAX}
                                placeholder="S--"
                                value={brouillonSemaine[jalon.code] ?? (jalon.semaine ?? '')}
                                onChange={(e) => saisirSemaine(jalon.code, e.target.value)}
                                onBlur={() => validerSemaine(jalon.code)}
                                aria-label={`Semaine cible du jalon ${jalon.code}`}
                                className={`w-16 px-1 py-0.5 text-[11px] font-bold text-center leading-4 rounded border bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${theme.controle} ${theme.bordure}`}
                              />
                            )}

                            {/* Nomenclature R : semaine de fin de la plage (marge).
                                Orange de la semaine cible à cette fin, rouge au-delà. */}
                            {planifie && jalon.code === CODE_NOMENCLATURE_R && (
                              <input
                                type="number"
                                min={SEMAINE_MIN}
                                max={SEMAINE_MAX}
                                placeholder="fin"
                                value={jalon.semaineFin ?? ''}
                                onChange={(e) =>
                                  setJalon(jalon.code, {
                                    semaineFin:
                                      e.target.value.trim() === ''
                                        ? null
                                        : normaliserSemaine(e.target.value),
                                  })
                                }
                                aria-label={`Semaine de fin du jalon ${jalon.code}`}
                                title="Semaine de fin de la marge (orange jusqu'ici, rouge au-delà)"
                                className={`w-16 px-1 py-0.5 text-[11px] font-bold text-center leading-4 rounded border bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${theme.controle} ${theme.bordure}`}
                              />
                            )}

                            {/* Le calendrier n'existe que pour l'état « Date ». */}
                            {datePrevue && (
                              <input
                                type="date"
                                value={jalon.date ?? ''}
                                onChange={(e) => setJalon(jalon.code, { date: e.target.value || null })}
                                aria-label={`Date cible du jalon ${jalon.code}`}
                                className={`w-[6.5rem] px-1 py-0.5 text-[11px] font-semibold leading-4 rounded border bg-white cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-400 ${theme.controle} ${theme.bordure}`}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ouvertureAjout && nouvelleCategorie === 'STATUT' && (
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <input
                  type="text"
                  value={nouveauCode}
                  onChange={(e) => {
                    const suivant = normaliserCodeJalon(e.target.value);
                    setNouveauCode(suivant);
                    // Un code connu se range tout seul (vert nomenclature / bleu
                    // statut) ; un code nouveau garde celle du groupe d'origine.
                    if (suivant in CATEGORIES_PAR_CODE) setNouvelleCategorie(categorieParCode(suivant));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAjoutJalon();
                    }
                  }}
                  placeholder="Code"
                  maxLength={3}
                  aria-label="Code du nouveau jalon"
                  autoFocus
                  className="w-16 px-2 py-1 text-xs font-bold uppercase text-center bg-white border border-slate-200 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="button"
                  onClick={handleAjoutJalon}
                  disabled={ajoutEnCours}
                  className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {ajoutEnCours ? 'Ajout...' : 'Ajouter'}
                </button>
                <p className="w-full text-[10px] text-slate-500 leading-tight">
                  Un code connu se range tout seul{' '}
                  <span className="font-semibold text-blue-600">
                    {titreCategorie(nouvelleCategorie).toLowerCase()}
                  </span>
                  ; le jalon n'apparaît que sur cette carte, mais son code reste
                  réutilisable sur une autre.
                </p>
                {erreurJalon && (
                  <p className="w-full text-[10px] font-semibold text-rose-600">{erreurJalon}</p>
                )}
              </div>
            )}

            {jalonsEnRetard.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-rose-600 text-white rounded-lg shadow-2xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px motion-safe:animate-pulse" />
                <div className="text-xs">
                  <div className="font-bold">
                    Jalon en retard à semaine {semaineCourante} dépassée
                  </div>
                  <div className="text-rose-50">
                    {jalonsEnRetard
                      .map((j) =>
                        j.etat === 'DATE' && j.date
                          ? `${j.code} attendu le ${dateCourteJalon(j.date)}`
                          : `${j.code} attendu S${j.semaine} (${
                              semaineCourante - (j.semaine ?? semaineCourante)
                            } sem. de retard)`
                      )
                      .join(' ⬢ ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: OFs (Initiatives / ONY / LOI / BDA) */}
          <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="text-xs font-bold text-slate-800 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-600"></span><span>OF</span></span>
              </span>
              {!isAddingOF && <button type="button" onClick={() => setIsAddingOF(true)} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg shadow-2xs transition-colors cursor-pointer"><Plus className="w-3 h-3" /><span>Ajouter un OF</span></button>}
            </div>
            <OFSubTable cardId={initialData?.id || 'NOUVELLE-CARTE'} totalDemandee={quantiteDemandee} onChangeTotalDemandee={setQuantiteDemandee} ofs={ofs} isAddingOF={isAddingOF} onCloseAddOF={() => setIsAddingOF(false)} onUpdateOFs={(newOfs) => { setOfs(newOfs); const totalFinie = newOfs.reduce((sum, o) => sum + computeOfQuantiteFinie(o), 0); if (newOfs.length > 0) { setQuantiteFinie(totalFinie); } }} />
          </div>

          {/* Section 3: Remarques */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Remarques
            </h3>

            <textarea
              rows={7}
              placeholder="ex: Priorité ligne 2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 leading-relaxed focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
            />
          </div>

          {/* Footer buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{initialData ? 'Enregistrer les modifications' : 'Créer la carte'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
