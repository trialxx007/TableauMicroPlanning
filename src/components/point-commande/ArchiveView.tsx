import React from 'react';
import { Archive, CalendarCheck2, RotateCcw } from 'lucide-react';
import { CardItem } from '@/src/types/card.ts';
import { useLectureSeule } from '@/src/context/ProfilContext.tsx';

interface ArchiveViewProps {
  cards: CardItem[];
  onReactivateCard: (id: string) => Promise<void>;
}

export const ArchiveView: React.FC<ArchiveViewProps> = ({ cards, onReactivateCard }) => {
  const lectureSeule = useLectureSeule();
  const [reactivatingId, setReactivatingId] = React.useState<string | null>(null);

  const handleReactivate = async (card: CardItem) => {
    setReactivatingId(card.id);
    try {
      await onReactivateCard(card.id);
    } finally {
      setReactivatingId(null);
    }
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
                  <tr key={card.id} className="text-sm text-slate-700 hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium">{card.client}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{card.modele}</td>
                    <td className="px-4 py-3">{card.batch}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-500">
                        <CalendarCheck2 className="h-3.5 w-3.5 text-emerald-600" />
                        {card.dateTerminaison}
                      </span>
                    </td>
                    {!lectureSeule && (
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={reactivatingId !== null}
                          onClick={() => void handleReactivate(card)}
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
    </main>
  );
};
