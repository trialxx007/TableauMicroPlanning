import React, { useState, useEffect } from 'react';
import { CardFormData, CardItem, CardStatus, JalonCode, OrdreFabrication } from '../types/card.ts';
import { OFSubTable } from './OFSubTable.tsx';
import {
  getJalonInfo,
  normaliserCodeJalon,
  normaliserSemaine,
  SEMAINE_MAX,
  SEMAINE_MIN,
  type JalonEtat,
} from '../utils/jalons.ts';
import { useJalonCatalogue } from '../context/JalonCatalogueContext.tsx';
import { jalonApi } from '../services/api.ts';
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
  /** Appelé après l'ajout d'un jalon au catalogue global, pour le recharger. */
  onJalonAjoute?: () => void | Promise<void>;
}

type JalonState = { valide: boolean; semaine: number | null };

/** Une carte porte un état par code du catalogue ; un code absent vaut « En attente ». */
function jalonsInitiaux(card: CardItem | null | undefined): Record<JalonCode, JalonState> {
  const base: Record<JalonCode, JalonState> = {};
  for (const j of card?.jalons ?? []) {
    base[j.code] = { valide: Boolean(j.valide), semaine: j.semaine ?? null };
  }
  return base;
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
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [erreurJalon, setErreurJalon] = useState<string | null>(null);
  const [ouvertureAjout, setOuvertureAjout] = useState(false);

  useEffect(() => {
    if (initialData) {
      setClient(initialData.client);
      setNom(initialData.nom);
      setReference(initialData.reference);
      setModele(initialData.modele);
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
      setJalons({});
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
  }, [initialData, isOpen]);

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
  };

  /**
   * Ajout d'un type de jalon au catalogue global. Il s'applique donc à toutes les
   * cartes, pas seulement à celle-ci : l'interface le dit explicitement.
   */
  const handleAjoutJalon = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = normaliserCodeJalon(nouveauCode);
    if (!code) {
      setError('Le code du jalon est obligatoire.');
      return;
    }
    if (catalogue.some((j) => j.code === code)) {
      setError(`Le jalon ${code} existe déjà.`);
      return;
    }

    setAjoutEnCours(true);
    setError(null);
    try {
      await jalonApi.create(code, nouveauLibelle.trim() || code);
      setNouveauCode('');
      setNouveauLibelle('');
      await onJalonAjoute?.();
      setJalon(code, { valide: false, semaine: null });
    } catch (err) {
      setError((err as Error).message || "Impossible d'ajouter le jalon");
    } finally {
      setAjoutEnCours(false);
    }
  };

  const handleSupprimerJalon = async (code: JalonCode) => {
    if (!window.confirm(`Retirer le jalon ${code} du catalogue ? Il disparaîtra de toutes les cartes.`)) {
      return;
    }
    setErreurJalon(null);
    try {
      await jalonApi.remove(code);
      await onJalonAjoute?.();
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
        jalons: catalogue.map((j) => {
          const etat = jalons[j.code];
          return {
            code: j.code,
            valide: Boolean(etat?.valide),
            ...(etat?.semaine != null ? { semaine: etat.semaine } : {}),
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
  const infosJalons = catalogue.map((j) => {
    const etat = jalons[j.code];
    return getJalonInfo(j, { valide: Boolean(etat?.valide), semaine: etat?.semaine ?? null }, semaineCourante);
  });
  const jalonsEnRetard = infosJalons.filter((j) => j.enRetard);

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
                  {initialData ? `Fiche Carte • ${initialData.id}` : 'Nouvelle Carte de Commande'}
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
                  <span className="text-slate-300 mx-2">•</span>
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

          {/* Section 2: Jalons techniques (DT, TC, SMS, RDL) */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>Jalons</span>
              <span className="text-[11px] font-medium text-slate-400 normal-case">
                Semaine {semaineCourante}
              </span>
            </h3>

            <div className="flex items-stretch gap-1.5">
              {infosJalons.map((jalon) => {
                const planifie = jalon.etat === 'SEMAINE';
                // Le retard prime sur l'état. « En attente » n'a pas d'échéance, donc
                // rien à signaler : il reste gris. La semaine, quand le jalon est
                // planifié, porte sa propre couleur : rouge si dépassée, orange sinon.
                const theme = jalon.enRetard
                  ? {
                      boite: 'bg-rose-50 border-rose-300',
                      texte: 'text-rose-800',
                      trait: 'border-rose-400',
                      semaine: 'text-rose-700',
                    }
                  : jalon.etat === 'VALIDE'
                  ? {
                      boite: 'bg-emerald-50 border-emerald-300',
                      texte: 'text-emerald-800',
                      trait: 'border-emerald-400',
                      semaine: 'text-emerald-800',
                    }
                  : planifie
                  ? {
                      boite: 'bg-orange-50 border-orange-300',
                      texte: 'text-orange-800',
                      trait: 'border-orange-400',
                      semaine: 'text-orange-700',
                    }
                  : {
                      boite: 'bg-slate-50 border-slate-300',
                      texte: 'text-slate-600',
                      trait: 'border-slate-400',
                      semaine: '',
                    };

                return (
                  // grid + col-start/row-start identiques : affichage et contrôles
                  // partagent la même cellule, donc aucune largeur ne bouge au survol.
                  <div
                    key={jalon.code}
                    className={`group/j relative grid flex-1 min-w-0 rounded-md border px-1 py-1 ${theme.boite}`}
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
                        <span className={`font-bold ${theme.semaine}`}>S{jalon.semaine}</span>
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
                        className={`w-[68px] shrink-0 px-1 py-0.5 text-[11px] font-semibold leading-4 rounded border bg-white cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-blue-400 ${theme.texte} ${theme.trait}`}
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
                          value={jalon.semaine ?? ''}
                          onChange={(e) =>
                            setJalon(jalon.code, {
                              semaine: e.target.value === '' ? null : normaliserSemaine(e.target.value),
                            })
                          }
                          aria-label={`Semaine cible du jalon ${jalon.code}`}
                          className={`w-10 shrink-0 px-0.5 py-0.5 text-[11px] font-bold text-center leading-4 rounded border bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${
                            jalon.enRetard
                              ? 'text-rose-800 border-rose-400'
                              : 'text-orange-800 border-orange-400'
                          }`}
                        />
                      )}
                    </div>

                    {/* Retrait du jalon du catalogue. Doublon du catalogue uniquement :
                        un jalon propre à une carte n'a pas de sens ici. */}
                    {catalogue.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleSupprimerJalon(jalon.code)}
                        title={`Retirer le jalon ${jalon.code} du catalogue`}
                        aria-label={`Retirer le jalon ${jalon.code} du catalogue`}
                        className="absolute -top-1.5 -right-1.5 z-20 hidden group-hover/j:flex items-center justify-center w-4 h-4 rounded-full bg-white border border-slate-300 text-slate-400 hover:text-rose-600 hover:border-rose-300 shadow-xs"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Ajout d'un jalon au catalogue global. */}
              <button
                type="button"
                onClick={() => setOuvertureAjout((v) => !v)}
                title="Ajouter un jalon au catalogue"
                className="shrink-0 w-8 rounded-md border border-dashed border-slate-300 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/50 flex items-center justify-center"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {ouvertureAjout && (
              <form
                onSubmit={handleAjoutJalon}
                className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              >
                <input
                  type="text"
                  value={nouveauCode}
                  onChange={(e) => setNouveauCode(normaliserCodeJalon(e.target.value))}
                  placeholder="Code"
                  maxLength={3}
                  aria-label="Code du nouveau jalon"
                  className="w-16 px-2 py-1 text-xs font-bold uppercase text-center bg-white border border-slate-200 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                />
                <input
                  type="text"
                  value={nouveauLibelle}
                  onChange={(e) => setNouveauLibelle(e.target.value)}
                  placeholder="Intitulé (ex: Essayage)"
                  aria-label="Intitulé du nouveau jalon"
                  className="flex-1 min-w-[10rem] px-2 py-1 text-xs bg-white border border-slate-200 rounded focus:outline-hidden focus:ring-1 focus:ring-blue-400"
                />
                <button
                  type="submit"
                  disabled={ajoutEnCours}
                  className="px-2.5 py-1 text-xs font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {ajoutEnCours ? 'Ajout...' : 'Ajouter'}
                </button>
                <p className="w-full text-[10px] text-slate-500 leading-tight">
                  Le jalon rejoint le catalogue global : il sera disponible sur toutes les
                  cartes.
                </p>
                {erreurJalon && (
                  <p className="w-full text-[10px] font-semibold text-rose-600">{erreurJalon}</p>
                )}
              </form>
            )}

            {jalonsEnRetard.length > 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-rose-600 text-white rounded-lg shadow-2xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px motion-safe:animate-pulse" />
                <div className="text-xs">
                  <div className="font-bold">
                    Jalon en retard — semaine {semaineCourante} dépassée
                  </div>
                  <div className="text-rose-50">
                    {jalonsEnRetard
                      .map(
                        (j) =>
                          `${j.code} attendu S${j.semaine} (${semaineCourante - j.semaine!} sem. de retard)`
                      )
                      .join(' • ')}
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
                  if (nextOk) setJalon('RDL', { valide: true, semaine: null });
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
                  cardId={initialData?.id || 'NOUVELLE-CARTE'}
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
                🔒 Répartition des OF verrouillée
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
