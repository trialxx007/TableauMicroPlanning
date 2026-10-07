import React, { useMemo, useState, useEffect } from 'react';
import {
  CardFormData,
  CardItem,
  CardStatus,
  JalonCategorie,
  JalonCode,
  LIBELLE_TYPE_CARTE,
  OrdreFabrication,
  TypeCarte,
} from '../types/card.ts';
import { OFSubTable } from './OFSubTable.tsx';
import {
  getJalonInfo,
  normaliserCodeJalon,
  normaliserSemaine,
  rangsParCategorie,
  SEMAINE_MAX,
  SEMAINE_MIN,
  themeJalon,
  titreCategorie,
  type JalonEtat,
} from '../utils/jalons.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { jalonApi } from '../services/api.ts';
import { categorieParCode, cataloguePourType, NOMENCLATURES_PAR_TYPE } from '../data/mockJalons.ts';
import { getSemaineISO } from '../utils/dateFrance.ts';
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
  Plus,
} from 'lucide-react';

interface CardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CardFormData) => Promise<void>;
  initialData?: CardItem | null;
  /**
   * Appelé après l'ajout ou le retrait d'un jalon sur cette carte, pour recharger
   * le catalogue partagé et les cartes. Le jalon reste propre à la carte : les
   * autres ne sont pas modifiées.
   */
  onJalonAjoute?: () => void | Promise<void>;
}

type JalonState = { valide: boolean; semaine: number | null };

/** Une carte porte ses propres jalons : seuls ceux qu'elle a lui sont affichables. */
function jalonsInitiaux(card: CardItem | null | undefined): Record<JalonCode, JalonState> {
  const base: Record<JalonCode, JalonState> = {};
  for (const j of card?.jalons ?? []) {
    base[j.code] = { valide: Boolean(j.valide), semaine: j.semaine ?? null };
  }
  return base;
}

/** Jalons d'un catalogue(positionnés en attente, sans échéance). Sert au
 *  pré-remplissage d'une carte neuve avec les nomenclatures de son type. */
function preremplirJalons(entrees: { code: string }[]): Record<JalonCode, JalonState> {
  const base: Record<JalonCode, JalonState> = {};
  for (const j of entrees) base[j.code] = { valide: false, semaine: null };
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
    if (!(j.code in suivant)) suivant[j.code] = { valide: false, semaine: null };
  }
  return suivant;
}

export const CardModal: React.FC<CardModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  onJalonAjoute,
}) => {
  const catalogue = useJalonCatalogue();
  const [client, setClient] = useState('');
  const [nom, setNom] = useState('');
  const [reference, setReference] = useState('');
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nouveauCode, setNouveauCode] = useState('');
  const [nouveauLibelle, setNouveauLibelle] = useState('');
  // Grandeur du jalon en cours de saisie : vert pour une nomenclature, bleu pour
  // un statut. Le code saisi la devine, l'utilisateur peut corriger.
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
  // Saisie de la semaine en cours, par code. Sans ce brouillon, effacer le champ
  // passerait le jalon à « En attente » et le champ disparaîtrait aussitôt : on ne
  // pourrait plus retaper une semaine. Le brouillon vit le temps de la saisie, la
  // semaine enregistrée ne change qu'à la validation du champ (blur) ou à l'enregistrement.
  const [brouillonSemaine, setBrouillonSemaine] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (initialData) {
      setClient(initialData.client);
      setNom(initialData.nom);
      setReference(initialData.reference);
      setModele(initialData.modele);
      setTypeCarte((initialData.typeCarte as TypeCarte) ?? 'R');
      setJalons(jalonsInitiaux(initialData));
      setOkProd(Boolean(initialData.okProd));
      setOfs(initialData.ofs || []);
      setQuantiteDemandee(initialData.quantiteDemandee);
      setQuantiteFinie(initialData.quantiteFinie);
      setStatut(initialData.statut);
      setDecisionReunion(initialData.decisionReunion || '');
      setNotes(initialData.notes || '');
    } else {
      setClient('');
      setNom('');
      setReference(`OF-2026-${Math.floor(1000 + Math.random() * 9000)}`);
      setModele('');
      setTypeCarte('R');
      // Une carte neuve part avec les nomenclatures de son type déjà en attente :
      // elles restent modifiables ensuite, mais l'utilisateur n'a rien à saisir.
      setJalons(preremplirJalons(cataloguePourType('R')));
      setOkProd(false);
      setOfs([]);
      setQuantiteDemandee(200);
      setQuantiteFinie(0);
      setStatut('EN_ATTENTE');
      setDecisionReunion('');
      setNotes('');
    }
    setError(null);
    setCopied(false);
    setErreurJalon(null);
    setBrouillonSemaine({});
    setNouvelleCategorie('STATUT');
    setCategoriesEnAttente({});
  }, [initialData, isOpen]);

  // Codes portés par cette carte, regroupés par grandeur : les nomenclatures à la
  // suite, puis les statuts. Le hook est appelé avant le retour anticipé : tous les
  // hooks doivent tourner à chaque rendu.
  const codesCarteJalons = useMemo(() => {
    const rang = rangsParCategorie(catalogue);
    return Object.keys(jalons).sort((a, b) => (rang.get(a) ?? 999) - (rang.get(b) ?? 999));
  }, [jalons, catalogue]);

  if (!isOpen) return null;

  const handleCopyReference = (e: React.MouseEvent) => {
    e.preventDefault();
    if (reference) {
      navigator.clipboard.writeText(reference);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const setJalon = (code: JalonCode, patch: Partial<JalonState>) => {
    setJalons((prev) => ({
      ...prev,
      [code]: { valide: prev[code]?.valide ?? false, semaine: prev[code]?.semaine ?? null, ...patch },
    }));
  };

  /**
   * Listbox : trois choix distincts. « En attente » efface la semaine, « Validé » aussi.
   * « Semaine » exige une semaine cible : on la pré-remplit avec la semaine courante
   * si le jalon n'en a pas encore, pour ne pas retomber immédiatement sur « En attente ».
   */
  const setJalonEtat = (code: JalonCode, etat: JalonEtat) => {
    if (etat === 'VALIDE') setJalon(code, { valide: true, semaine: null });
    else if (etat === 'EN_ATTENTE') setJalon(code, { valide: false, semaine: null });
    else setJalon(code, { valide: false, semaine: jalons[code]?.semaine ?? getSemaineISO() });
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
        await jalonApi.create(
          code,
          nouveauLibelle.trim() || code,
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
      setNouveauLibelle('');
      setNouvelleCategorie('STATUT');
      setJalon(code, { valide: false, semaine: null });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client.trim() || !nom.trim() || !reference.trim() || !modele.trim()) {
      setError('Veuillez renseigner le client, le nom, la référence et le modèle.');
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
        nom: nom.trim(),
        reference: reference.trim(),
        modele: modele.trim(),
        typeCarte,
        // Seuls les jalons portés par la carte sont envoyés : rien d'autre n'est créé pour elle.
        jalons: codesCarteJalons.map((code) => {
          const etat = jalons[code];
          // Une semaine encore en cours de saisie est engagée ici : sans cela, un
          // champ laissé vide au moment de l'enregistrement garderait l'ancienne semaine.
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
            // Envoyée au catalogue à la création de la carte, puis plus jamais relue.
            ...(categoriesEnAttente[code] ? { categorie: categoriesEnAttente[code] } : {}),
          };
        }),
        okProd: Boolean(okProd),
        ofs,
        quantiteDemandee: Number(quantiteDemandee),
        quantiteFinie: Number(quantiteFinie),
        statut,
        decisionReunion: decisionReunion.trim() || undefined,
        notes: notes.trim() || undefined,
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
    return getJalonInfo(
      entree,
      { valide: Boolean(etat?.valide), semaine: etat?.semaine ?? null },
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
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700">
              {error}
            </div>
          )}

          {/* If existing card: Quick Overview Banner */}
          {initialData && (
            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">{client || 'Client'}</span>
                  <span className="text-slate-300 mx-2">⬢</span>
                  <span className="font-medium text-slate-700">{modele || 'Modèle'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {initialData.dateCreation && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Créée le {initialData.dateCreation}
                    </span>
                  )}
                  {initialData.dateDernierPoint && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Point: {initialData.dateDernierPoint}
                    </span>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              <div>
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

              {/* Référence */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Référence <span className="text-rose-500">*</span>
                  </label>
                  {reference && (
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
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-mono focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Nature de matière : commande le jeu de nomenclatures de la carte */}
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nature de matière
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['R', 'T'] as TypeCarte[]).map((t) => {
                    const actif = typeCarte === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setTypeCarte(t);
                          setJalons((prev) => basculerType(typeCarte, t, prev));
                        }}
                        aria-pressed={actif}
                        className={`text-left px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                          actif
                            ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500/30'
                            : 'bg-slate-50 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
                        }`}
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
                        <span className="block mt-0.5 text-[11px] text-slate-500 font-mono">
                          {NOMENCLATURES_PAR_TYPE[t].map((n) => n.code).join(' · ')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modèle */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modèle <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Robe Soirée"
                  value={modele}
                  onChange={(e) => setModele(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Nom */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Robe Soie Plissée"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
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
                      <button
                        type="button"
                        onClick={() => {
                          setNouvelleCategorie(groupe.categorie);
                          setOuvertureAjout((v) => !v);
                        }}
                        title={`Ajouter dans ${titreCategorie(groupe.categorie).toLowerCase()}`}
                        aria-label={`Ajouter dans ${titreCategorie(groupe.categorie).toLowerCase()}`}
                        className="w-4 h-4 rounded border border-dashed border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </button>
                    </div>
                    {/* Les pastilles se rabattent sur la ligne suivante quand la place manque :
                        elles gardent la largeur de leur contenu au lieu de se
                        partager la ligne, sinon une carte avec dix jalons prenait
                        deux rangées de cases surdimensionnées. */}
                    <div className="flex flex-wrap items-stretch gap-1.5">
                      {groupe.jalons.map((jalon) => {
                const planifie = jalon.etat === 'SEMAINE';
                // La teinte vient de la grandeur du jalon (vert nomenclature,
                // bleu statut) ; seule la nuance change avec l'avancement, et le
                // rouge reste réservé au retard. Couleurs partagées avec le tableau.
                const theme = themeJalon(jalon);

                return (
                  // grid + col-start/row-start identiques : affichage et contrôles
                  // partagent la même cellule, donc aucune largeur ne bouge au survol.
                  <div
                    key={jalon.code}
                    className={`group/j relative grid shrink-0 min-w-[4.75rem] rounded-md border px-1 py-0.5 ${theme.fond}`}
                  >
                    {/* Couche 1 : code, statut et date cible. */}
                    <span
                      className={`col-start-1 row-start-1 relative z-0 flex items-center justify-center gap-1 whitespace-nowrap text-[11px] leading-4 ${theme.texte} group-hover/j:opacity-0 group-focus-within/j:opacity-0`}
                    >
                      {jalon.enRetard ? (
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                      ) : jalon.etat === 'VALIDE' ? (
                        <Check className="w-3 h-3 shrink-0" />
                      ) : planifie ? (
                        <Calendar className="w-3 h-3 shrink-0" />
                      ) : (
                        <Clock className="w-3 h-3 shrink-0" />
                      )}
                      <span className="font-bold">{jalon.code}:</span>
                      {/* « Semaine » se lit juste S40, sans répéter le mot : le
                          préfixe du code suffit et la place reste disponible. */}
                      {planifie && jalon.semaine != null ? (
                        <span className="font-bold">S{jalon.semaine}</span>
                      ) : (
                        <span>{jalon.etatLibelle}</span>
                      )}
                    </span>

                    {/* Couche 2 : les vrais contrôles, au survol ou au focus.
                        z-10 est indispensable : sans lui, le passage de opacité 1 -> 0
                        ferait passer l'affichage au-dessus des contrôles et lui volerait les clics. */}
                    <div className="col-start-1 row-start-1 relative z-10 flex items-center justify-center gap-1 opacity-0 pointer-events-none group-hover/j:opacity-100 group-hover/j:pointer-events-auto group-focus-within/j:opacity-100 group-focus-within/j:pointer-events-auto">
                      <span className={`text-[11px] font-bold leading-4 ${theme.texte}`}>
                        {jalon.code}:
                      </span>

                      <select
                        value={jalon.etat}
                        onChange={(e) => setJalonEtat(jalon.code, e.target.value as JalonEtat)}
                        aria-label={`État du jalon ${jalon.code}`}
                        className={`w-[60px] shrink-0 px-1 py-0.5 text-[11px] font-semibold leading-4 rounded border bg-white cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-400 ${theme.controle} ${theme.bordure}`}
                      >
                        <option value="EN_ATTENTE">En attente</option>
                        <option value="SEMAINE">Semaine</option>
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
                          className={`w-8 shrink-0 px-0.5 py-0.5 text-[11px] font-bold text-center leading-4 rounded border bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${theme.controle} ${theme.bordure}`}
                        />
                      )}
                    </div>

                    {/* Retrait du jalon de CETTE carte. Le catalogue partagé et les autres
                        cartes sont intacts : le code reste disponible pour une autre carte. */}
                    <button
                      type="button"
                      onClick={() => handleSupprimerJalon(jalon.code)}
                      title={`Retirer le jalon ${jalon.code} de cette carte`}
                      aria-label={`Retirer le jalon ${jalon.code} de cette carte`}
                      className="absolute -top-1.5 -right-1.5 z-20 hidden group-hover/j:flex items-center justify-center w-4 h-4 rounded-full bg-white border border-slate-300 text-slate-400 hover:text-rose-600 hover:border-rose-300 shadow-xs"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {ouvertureAjout && (
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                <input
                  type="text"
                  value={nouveauCode}
                  onChange={(e) => {
                    const suivant = normaliserCodeJalon(e.target.value);
                    setNouveauCode(suivant);
                    // Le code Devine la grandeur le temps de la frappe ; le sélecteur
                    // reste disponible pour corriger un code inconnu ou mal classé.
                    if (suivant) setNouvelleCategorie(categorieParCode(suivant));
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
                  className="w-16 px-2 py-1 text-xs font-bold uppercase text-center bg-white border border-slate-200 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="text"
                  value={nouveauLibelle}
                  onChange={(e) => setNouveauLibelle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAjoutJalon();
                    }
                  }}
                  placeholder="Intitulé (ex: Essayage)"
                  aria-label="Intitulé du nouveau jalon"
                  className="flex-1 min-w-[10rem] px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                />
                {/* Le formulaire est ouvert depuis un groupe, sa grandeur est déjà préselectionnée.
                Les deux boutons permettent de la corriger — un code inconnu, ou un
                code connu classé dans l'autre groupe. */}
                <div
                  role="group"
                  aria-label="Catégorie du nouveau jalon"
                  className="flex overflow-hidden rounded border border-slate-200"
                >
                  {(['NOMENCLATURE', 'STATUT'] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={nouvelleCategorie === cat}
                      onClick={() => setNouvelleCategorie(cat)}
                      title={
                        cat === 'NOMENCLATURE'
                          ? 'Nomenclature : le jalon nomme la pièce, il s’affiche en vert'
                          : 'Statut : le jalon décrit l’avancement, il s’affiche en bleu'
                      }
                      className={`px-2 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                        nouvelleCategorie === cat
                          ? cat === 'NOMENCLATURE'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-blue-600 text-white'
                          : cat === 'NOMENCLATURE'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {titreCategorie(cat)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAjoutJalon}
                  disabled={ajoutEnCours}
                  className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                >
                  {ajoutEnCours ? 'Ajout...' : 'Ajouter'}
                </button>
                <p className="w-full text-[10px] text-slate-500 leading-tight">
                  Ajouté à cette carte uniquement, dans{' '}
                  <strong className="font-semibold">
                    {titreCategorie(nouvelleCategorie).toLowerCase()}
                  </strong>
                  . Son intitulé et sa catégorie rejoignent le catalogue commun,
                  réutilisable sur une autre carte.
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
                      .map(
                        (j) =>
                          `${j.code} attendu S${j.semaine} (${semaineCourante - j.semaine!} sem. de retard)`
                      )
                      .join(' ⬢ ')}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Accord OK Prod & Répartition des OFs (Interne / Sous-traitance) */}
          <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCheck className={`w-4 h-4 ${okProd ? 'text-emerald-600' : 'text-slate-400'}`} />
                <span className="text-sm font-bold text-slate-800">OK Prod</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    okProd
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  {okProd ? 'Validé' : 'En attente'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextOk = !okProd;
                  setOkProd(nextOk);
                  // L'OK Prod entraîne la RDL, mais seulement si cette carte porte
                  // le jalon : sinon on créerait un jalon qui n'a pas été demandé.
                  if (nextOk && jalons['RDL']) {
                    setJalon('RDL', { valide: true, semaine: null });
                  }
                }}
                title={okProd ? 'Révoquer la validation' : 'Valider'}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                  okProd
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {okProd ? '✓ Validé' : 'Valider'}
              </button>
            </div>

            {/* Cette répartition apparaît uniquement dans la carte, une fois l'OK Prod validé durant la RDL */}
            {okProd ? (
              <div className="pt-3 border-t border-slate-200/80">
                <div className="text-xs font-bold text-slate-800 mb-2">
                  Répartition des OF
                </div>
                <OFSubTable
                  totalDemandee={quantiteDemandee}
                  ofs={ofs}
                  onUpdateOFs={(newOfs) => {
                    setOfs(newOfs);
                    const totalFinie = newOfs.reduce((sum, o) => sum + o.quantiteFinie, 0);
                    if (newOfs.length > 0) {
                      setQuantiteFinie(totalFinie);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="pt-3 border-t border-slate-200/80 text-xs text-slate-400">
                Ex. Répartition des OF verrouillée
              </div>
            )}
          </div>

          {/* Section 3: Quantités & Reste à produire */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quantités
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Demandée */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Demandée
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantiteDemandee}
                  onChange={(e) =>
                    setQuantiteDemandee(Math.max(1, parseInt(e.target.value, 10) || 0))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Finie */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Finie
                </label>
                <input
                  type="number"
                  min="0"
                  max={quantiteDemandee}
                  value={quantiteFinie}
                  onChange={(e) =>
                    setQuantiteFinie(Math.max(0, parseInt(e.target.value, 10) || 0))
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 font-semibold focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Reste à produire */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reste
                </label>
                <div
                  className={`px-3 py-2 border rounded-lg text-sm font-bold flex items-center justify-between ${
                    reste === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  <span>                    {reste.toLocaleString('fr-FR')} u.</span>
                  {reste === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Statut & Décision de Réunion */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Statut & Décision
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Statut
                </label>
                <select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value as CardStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="TERMINE">Terminé</option>
                  <option value="BLOQUE">Bloqué</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Décision
                </label>
                <input
                  type="text"
                  placeholder="ex: Relance DT à 11h"
                  value={decisionReunion}
                  onChange={(e) => setDecisionReunion(e.target.value)}
                  className="w-full px-3 py-2 bg-blue-50/50 border border-blue-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarques
              </label>
              <input
                type="text"
                placeholder="ex: Priorité ligne 2"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
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
