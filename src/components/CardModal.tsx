import React, { useState, useEffect } from 'react';
import { CardFormData, CardItem, CardStatus, OrdreFabrication } from '../types/card.ts';
import { OFSubTable } from './OFSubTable.tsx';
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
  Building2,
  Handshake,
} from 'lucide-react';

interface CardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CardFormData) => Promise<void>;
  initialData?: CardItem | null;
}

export const CardModal: React.FC<CardModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
}) => {
  const [client, setClient] = useState('');
  const [nom, setNom] = useState('');
  const [reference, setReference] = useState('');
  const [modele, setModele] = useState('');
  const [dt, setDt] = useState(false);
  const [tc, setTc] = useState(false);
  const [sms, setSms] = useState(false);
  const [rdl, setRdl] = useState(false);
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

  useEffect(() => {
    if (initialData) {
      setClient(initialData.client);
      setNom(initialData.nom);
      setReference(initialData.reference);
      setModele(initialData.modele);
      setDt(initialData.dt);
      setTc(initialData.tc);
      setSms(initialData.sms);
      setRdl(Boolean(initialData.rdl));
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
      setDt(false);
      setTc(false);
      setSms(false);
      setRdl(false);
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
        dt,
        tc,
        sms,
        rdl: Boolean(rdl),
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
              <p className="text-xs text-slate-500">
                {initialData
                  ? 'Représentation complète et paramètres de la carte de production'
                  : "Création d'une nouvelle carte pour le point commande journalière"}
              </p>
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
                    Avancement global ({progressPct}%)
                  </span>
                  <span className="font-semibold text-slate-900">
                    {quantiteFinie} / {quantiteDemandee} unités
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
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <span>1. Identifiants de la Carte</span>
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
                  placeholder="ex: Christian Dior, Chanel, Hermès..."
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
                  placeholder="ex: OF-CD-2026-001"
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
                  placeholder="ex: Robe Soirée Couture, Veste Tailleur Tweed"
                  value={modele}
                  onChange={(e) => setModele(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              {/* Nom */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom de la carte <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: Robe Soie Plissée Soleil, Veste Smoking"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Identifiants & Jalons techniques (DT, TC, SMS, RDL) */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
              <span>2. Validations & Jalons Techniques (DT • TC • SMS • RDL)</span>
              <span className="text-[11px] font-normal text-slate-400 lowercase">
                (cliquez pour basculer l'état)
              </span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* DT */}
              <div
                onClick={() => setDt(!dt)}
                className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${
                  dt
                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">DT</span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      dt ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {dt ? <Check className="w-3 h-3 stroke-[3]" /> : '✕'}
                  </div>
                </div>
                <div className="text-xs font-semibold">Dossier Technique</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {dt ? 'Dossier validé' : 'En attente validation'}
                </div>
              </div>

              {/* TC */}
              <div
                onClick={() => setTc(!tc)}
                className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${
                  tc
                    ? 'bg-emerald-50/70 border-emerald-300 text-emerald-900 ring-2 ring-emerald-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">TC</span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      tc ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {tc ? <Check className="w-3 h-3 stroke-[3]" /> : '✕'}
                  </div>
                </div>
                <div className="text-xs font-semibold">Type Conforme</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {tc ? 'Type conforme validé' : 'En attente conformité'}
                </div>
              </div>

              {/* SMS */}
              <div
                onClick={() => setSms(!sms)}
                className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${
                  sms
                    ? 'bg-indigo-50/70 border-indigo-300 text-indigo-900 ring-2 ring-indigo-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">SMS</span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      sms ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {sms ? <Check className="w-3 h-3 stroke-[3]" /> : '✕'}
                  </div>
                </div>
                <div className="text-xs font-semibold truncate">Sales Man's Sample</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {sms ? 'Échantillon validé' : 'Échantillon non prêt'}
                </div>
              </div>

              {/* RDL */}
              <div
                onClick={() => setRdl(!rdl)}
                className={`p-3 rounded-xl border cursor-pointer select-none transition-all ${
                  rdl
                    ? 'bg-purple-50/70 border-purple-300 text-purple-900 ring-2 ring-purple-500/20'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">RDL</span>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                      rdl ? 'bg-purple-600 text-white' : 'bg-slate-200 text-slate-400'
                    }`}
                  >
                    {rdl ? <Check className="w-3 h-3 stroke-[3]" /> : '✕'}
                  </div>
                </div>
                <div className="text-xs font-semibold truncate">Réunion De Lancement</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {rdl ? 'OF programmé en RDL' : 'OF à programmer en RDL'}
                </div>
              </div>
            </div>
          </div>

          {/* Section: Accord OK Prod & Répartition des OFs (Interne / Sous-traitance) */}
          <div className="space-y-3 p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCheck className={`w-5 h-5 ${okProd ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="text-sm font-bold text-slate-800">
                    Accord OK Production ("OK Prod")
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      okProd
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}
                  >
                    {okProd ? 'OK Prod Validé en RDL ✓' : 'En attente OK Prod (RDL)'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Une fois l'accord "OK Prod" validé durant la RDL pour cette carte, la répartition des OFs (OF1 Interne, OF2 & OF3 Sous-traitants) s'affiche pour ventiler proprement la production.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextOk = !okProd;
                  setOkProd(nextOk);
                  if (nextOk) setRdl(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                  okProd
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                {okProd ? 'OK Prod Validé ✓ (Cliquer pour révoquer)' : 'Valider OK Prod (RDL)'}
              </button>
            </div>

            {/* Cette répartition apparaît uniquement dans la carte, une fois l'OK Prod validé durant la RDL */}
            {okProd ? (
              <div className="pt-2 border-t border-slate-200/80">
                <div className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>Répartition des OF de cette carte • Validée en RDL (Accord OK Prod ✓)</span>
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
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs text-amber-800 flex items-center justify-between gap-2">
                <span>
                  🔒 <strong>Répartition des OF verrouillée :</strong> Validez l'accord OK Prod durant la RDL pour faire apparaître la répartition des OFs de cette carte.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setOkProd(true);
                    setRdl(true);
                  }}
                  className="px-2.5 py-1 text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-50 border border-emerald-300 rounded shadow-2xs cursor-pointer whitespace-nowrap"
                >
                  Valider OK Prod
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Quantités & Reste à produire */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              3. Quantités & Point de Production
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Demandée */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantité Demandée
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
                  Quantité Finie (Point)
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
                  Reste à Produire
                </label>
                <div
                  className={`px-3 py-2 border rounded-lg text-sm font-bold flex items-center justify-between ${
                    reste === 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                  }`}
                >
                  <span>{reste.toLocaleString('fr-FR')} unités</span>
                  {reste === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Statut & Décision de Réunion */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              4. Statut & Décisions Réunion Journalière d'Atelier
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Statut de la Carte
                </label>
                <select
                  value={statut}
                  onChange={(e) => setStatut(e.target.value as CardStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer"
                >
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="EN_COURS">En cours</option>
                  <option value="TERMINE">Terminé</option>
                  <option value="BLOQUE">Bloqué (Alerte)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Décision Réunion Journalière
                </label>
                <input
                  type="text"
                  placeholder="ex: Relance client DT à 11h, banc 4 attribué..."
                  value={decisionReunion}
                  onChange={(e) => setDecisionReunion(e.target.value)}
                  className="w-full px-3 py-2 bg-blue-50/50 border border-blue-200 rounded-lg text-sm text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Remarques & Notes générales atelier
              </label>
              <input
                type="text"
                placeholder="ex: Priorité ligne 2, expédition vendredi..."
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
