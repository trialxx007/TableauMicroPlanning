import React from 'react';
import { createPortal } from 'react-dom';
import { Archive, CalendarCheck2, FileSpreadsheet, RotateCcw, TrendingUp, X } from 'lucide-react';
import {
  CardItem,
  CardStatus,
  OF_TYPES,
  OFType,
  OrdreFabrication,
  SousOrdreFabrication,
  normalizeOFType,
} from '@/src/types/card.ts';
import { useLectureSeule } from '@/src/context/ProfilContext.tsx';
import { computeOfQuantiteFinie, normalizeCases } from './OFSubTable.tsx';

interface ArchiveViewProps {
  cards: CardItem[];
  onReactivateCard: (id: string) => Promise<void>;
}

export const ArchiveView: React.FC<ArchiveViewProps> = ({ cards, onReactivateCard }) => {
  const lectureSeule = useLectureSeule();
  const [reactivatingId, setReactivatingId] = React.useState<string | null>(null);
  const [selectedCard, setSelectedCard] = React.useState<CardItem | null>(null);

  React.useEffect(() => {
    if (!selectedCard) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedCard(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCard]);

  const handleReactivate = async (card: CardItem) => {
    setReactivatingId(card.id);
    try {
      await onReactivateCard(card.id);
    } finally {
      setReactivatingId(null);
    }
  };

  const libelleStatut = (statut: CardStatus) =>
    statut === 'TERMINE'
      ? 'Terminé'
      : statut === 'EN_COURS'
        ? 'En cours'
        : statut === 'BLOQUE'
          ? 'Bloqué'
          : 'En attente';
  const classeBadgeStatut = (statut: CardStatus) =>
    statut === 'TERMINE'
      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
      : statut === 'EN_COURS'
        ? 'bg-blue-100 text-blue-800 border-blue-200'
        : statut === 'BLOQUE'
          ? 'bg-rose-100 text-rose-800 border-rose-200'
          : 'bg-amber-100 text-amber-800 border-amber-200';
  const formaterQuantite = (quantite: number) => (Number(quantite) || 0).toLocaleString('fr-FR');
  const selectedOfs = selectedCard?.ofs ?? [];
  const libellesCases = (nb: number) => [
    ...(nb >= 5 ? ['PK', 'FA', 'FT', 'QL'] : ['PK', 'FT', 'QL']),
    'OF',
  ];
  const progressPct =
    selectedCard && selectedCard.quantiteDemandee > 0
      ? Math.min(100, Math.round((selectedCard.quantiteFinie / selectedCard.quantiteDemandee) * 100))
      : 0;

  const renderCases = (owner: OrdreFabrication | SousOrdreFabrication) => {
    const nbCases = Math.min(5, Math.max(4, owner.nbCases || 5));
    const cases = normalizeCases(owner.casesEnCours, nbCases, owner.quantiteDemandee);
    const labels =
      owner.casesLabels?.length === nbCases ? owner.casesLabels : libellesCases(nbCases);
    return (
      <div className="flex items-center gap-1">
        {cases.map((value, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="px-0.5 font-bold text-slate-300">/</span>}
            <span className="flex flex-col items-center">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {labels[index]}
              </span>
              <span className="w-12 rounded border border-slate-300 bg-slate-100 px-1 py-0.5 text-center text-[11px] font-bold tabular-nums text-slate-700">
                {formaterQuantite(value)}
              </span>
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderSousOf = (sousOf: SousOrdreFabrication) => {
    const finie = computeOfQuantiteFinie(sousOf);
    return (
      <div
        key={sousOf.id}
        className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-1.5"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
            {sousOf.codeSousOF}
          </span>
          <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-900">
            {sousOf.titre}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${OF_TYPES[normalizeOFType(sousOf.type)].classe}`}>
            {normalizeOFType(sousOf.type)}
          </span>
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classeBadgeStatut(sousOf.statut)}`}>
            {libelleStatut(sousOf.statut)}
          </span>
          <span className="text-[10px] text-slate-500">
            Reste {formaterQuantite(Math.max(0, sousOf.quantiteDemandee - finie))}
          </span>
        </div>
        {renderCases(sousOf)}
      </div>
    );
  };

  const renderOf = (of: OrdreFabrication, index: number) => {
    const finie = computeOfQuantiteFinie(of);
    const type: OFType = normalizeOFType(of.type);
    return (
      <div
        key={of.id}
        className={`overflow-hidden rounded-xl border bg-white shadow-2xs ${
          of.isLocked ?? (of.statut === 'TERMINE' || of.statut === 'BLOQUE')
            ? 'border-amber-300'
            : 'border-slate-300'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-slate-200 bg-slate-100/70 p-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-900 shadow-2xs">
              {of.codeOF || `OF${index + 1}`}
            </span>
            <span className="truncate text-xs font-bold text-slate-900">
              {of.titre || of.nomExecutant}
            </span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${OF_TYPES[type].classe}`}>
              {type}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${classeBadgeStatut(of.statut)}`}>
              {libelleStatut(of.statut)}
            </span>
            <span className="text-[10px] text-slate-500">
              Reste {formaterQuantite(Math.max(0, of.quantiteDemandee - finie))}
            </span>
          </div>
        </div>
        <div className="space-y-2 p-2">
          {renderCases(of)}
          {of.sousOfs && of.sousOfs.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-0.5 text-[10px] font-bold text-slate-500">
                <span>Sous-OF de {of.codeOF || `OF${index + 1}`} ({of.sousOfs.length})</span>
                <span className="text-slate-400">
                  Total confié : {formaterQuantite(of.quantiteDemandee)}
                </span>
              </div>
              {of.sousOfs.map(renderSousOf)}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="page-container flex-1 py-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Archive className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-bold tracking-tight text-slate-900">
            Archive des modèles terminés
          </h2>
          <p className="text-xs text-slate-500">
            Les modèles terminés sont retirés des vues opérationnelles.
          </p>
        </div>
        <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
          {cards.length} modèle{cards.length > 1 ? 's' : ''}
        </span>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <Archive className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <h3 className="mb-1 text-base font-semibold text-slate-900">
            Aucun modèle dans l’archive
          </h3>
          <p className="mx-auto max-w-sm text-xs text-slate-500">
            Les modèles apparaîtront ici lorsque vous les marquerez comme terminés depuis leur fiche.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <th className="px-4 py-3">Client</th>
                  <th className="px-4 py-3">Modèle</th>
                  <th className="px-4 py-3">Saison</th>
                  <th className="px-4 py-3">Terminé le</th>
                  {!lectureSeule && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((card) => (
                  <tr
                    key={card.id}
                    onClick={() => setSelectedCard(card)}
                    className="cursor-pointer text-sm text-slate-700 transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-4 py-3 font-medium">{card.client}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedCard(card)}
                        className="cursor-pointer text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                        title={`Afficher les détails de ${card.modele}`}
                      >
                        {card.modele}
                      </button>
                    </td>
                    <td className="px-4 py-3">{card.batch}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                        <CalendarCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                        {card.dateTerminaison || card.dateDernierPoint || '—'}
                      </span>
                    </td>
                    {!lectureSeule && (
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={reactivatingId !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleReactivate(card);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Réactiver
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedCard && createPortal(
        <div
          className="fixed inset-0 z-[100] flex animate-in items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs fade-in duration-150"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedCard(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-card-title"
            className="flex max-h-[85vh] w-full max-w-2xl animate-in fade-in zoom-in-95 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl duration-150"
          >
            <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 id="archive-card-title" className="text-base font-bold text-slate-900">
                      Fiche Carte ⬢ {selectedCard.id}
                    </h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${classeBadgeStatut(selectedCard.statut)}`}>
                      {libelleStatut(selectedCard.statut)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-900">{selectedCard.client}</span>
                    {' · '}{selectedCard.modele}{' · Saison '}{selectedCard.batch}
                    {' · Terminé le '}{selectedCard.dateTerminaison || selectedCard.dateDernierPoint || '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCard(null)}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600"
                aria-label="Fermer les détails"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-5 overflow-y-auto p-5">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 font-medium text-slate-600">
                    <TrendingUp className="h-3.5 w-3.5 text-blue-600" />
                    Avancement {progressPct}%
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formaterQuantite(selectedCard.quantiteFinie)} / {formaterQuantite(selectedCard.quantiteDemandee)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      selectedCard.resteAProduire === 0
                        ? 'bg-emerald-500'
                        : progressPct > 50
                          ? 'bg-blue-600'
                          : 'bg-amber-500'
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
                  <div><span className="text-slate-500">Demandée : </span><strong>{formaterQuantite(selectedCard.quantiteDemandee)}</strong></div>
                  <div><span className="text-slate-500">Terminée : </span><strong>{formaterQuantite(selectedCard.quantiteFinie)}</strong></div>
                  <div><span className="text-slate-500">Reste : </span><strong>{formaterQuantite(selectedCard.resteAProduire)}</strong></div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600">Ordres de fabrication</h4>
                  <span className="text-xs text-slate-500">{selectedOfs.length} OF</span>
                </div>
                {selectedOfs.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
                    Aucun OF enregistré pour ce modèle.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <div className="min-w-[420px] px-3">
                      <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,auto)] gap-x-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        <span>OF / exécutant</span>
                        <span>Demandée</span>
                        <span>Terminée</span>
                        <span>Reste</span>
                      </div>
                      {selectedOfs.map(renderOf)}
                    </div>
                  </div>
                )}
              </div>

              {selectedCard.notes && (
                <div>
                  <h4 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Notes</h4>
                  <p className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                    {selectedCard.notes}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>,
        document.body
      )}
    </main>
  );
};
