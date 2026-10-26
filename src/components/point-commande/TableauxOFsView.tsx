import React, { useEffect, useMemo, useState } from 'react';
import {
  CardItem,
  OrdreFabrication,
  OFType,
  OF_TYPES,
  normalizeOFType,
} from '@/src/types/card.ts';
import { AppPage, ViewSwitcher } from '@/src/components/layout/ViewSwitcher.tsx';
import { SessionBadge } from '@/src/components/layout/SessionBadge.tsx';
import { Profil } from '@/src/utils/auth.ts';
import { normalizeCases, computeOfQuantiteFinie } from './OFSubTable.tsx';
import { useLectureSeule } from '@/src/context/ProfilContext.tsx';
import { getNowParis, LIBELLE_FUSEAU } from '@/src/utils/dateFrance.ts';
import { Calendar, Clock, Table2 } from 'lucide-react';

interface TableauxOFsViewProps {
  cards: CardItem[];
  onUpdateCard: (id: string, updates: Partial<CardItem>) => Promise<void>;
  onChangePage: (page: AppPage) => void;
  onOpenCardModal?: (card: CardItem) => void;
  profil: Profil;
  onDeconnexion: () => void;
}

/** Un OF affiché dans les tableaux : ses cases + son type, éditables. */
const OF_TYPES_AFFICHES: OFType[] = ['L', 'O', 'I', 'BDA'];

/** Nombre de cases borné à 4 ou 5 (le menu ne propose plus que ces deux valeurs). */
function nbCasesBorne(nb: number | undefined): number {
  return Math.min(5, Math.max(4, nb || 5));
}

/**
 * Abréviations des colonnes de quantité d'un OF, de la gauche vers la droite.
 * `OF` est la dernière quantité (le total confié, qui ne bouge pas).
 */
function libellesCases(nb: number): string[] {
  const etapes = nb >= 5 ? ['PK', 'FA', 'FT', 'QL'] : ['PK', 'FT', 'QL'];
  return [...etapes, 'OF'];
}

/**
 * Recalcule les champs dérivés d'un OF après une saisie : la quantité finie est
 * la première case, le reste en découle, et le statut suit la progression.
 */
function recalcOF(of: OrdreFabrication): OrdreFabrication {
  const nb = nbCasesBorne(of.nbCases);
  const total = Number(of.quantiteDemandee) || 0;
  const cases = normalizeCases(of.casesEnCours, nb, total);
  const finie = Number(cases[0]) || 0;
  let statut = of.statut;
  if (finie >= total && total > 0) statut = 'TERMINE';
  else if (finie > 0 && of.statut === 'EN_ATTENTE') statut = 'EN_COURS';
  return {
    ...of,
    casesEnCours: cases,
    quantiteFinie: finie,
    resteAProduire: Math.max(0, total - finie),
    statut,
  };
}

/**
 * Applique la saisie d'une case. La dernière case est le total confié à l'OF :
 * la modifier change la quantité demandée de l'OF, pas une étape.
 */
function appliquerCase(of: OrdreFabrication, idx: number, val: number): OrdreFabrication {
  const nb = nbCasesBorne(of.nbCases);
  const cases = normalizeCases(of.casesEnCours, nb, of.quantiteDemandee);
  if (idx === nb - 1) {
    const total = Math.max(0, val);
    return recalcOF({
      ...of,
      quantiteDemandee: total,
      casesEnCours: normalizeCases(cases, nb, total),
    });
  }
  const next = [...cases];
  next[idx] = Math.max(0, val);
  return recalcOF({ ...of, casesEnCours: normalizeCases(next, nb, of.quantiteDemandee) });
}

const OFRowEditable: React.FC<{
  of: OrdreFabrication;
  numero: number;
  onCommitCase: (idx: number, val: number) => void;
  onCommitType: (t: OFType) => void;
  /** Profil Production : quantités modifiables, mais pas le type d'OF. */
  typeModifiable?: boolean;
}> = ({ of, numero, onCommitCase, onCommitType, typeModifiable = true }) => {
  const lectureSeule = useLectureSeule();
  const typeDesactive = lectureSeule || !typeModifiable;
  const nb = nbCasesBorne(of.nbCases);
  const cases = normalizeCases(of.casesEnCours, nb, of.quantiteDemandee);
  const type = normalizeOFType(of.type);

  return (
    <div className="flex items-center gap-1.5">
      <span className="w-6 text-right text-[11px] font-bold text-slate-500 tabular-nums">
        {numero}:
      </span>

      <div className="inline-flex items-center">
        {cases.map((val, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <span className="px-0.5 text-slate-300 font-bold select-none">/</span>}
            <input
              type="number"
              min={0}
              defaultValue={val}
              disabled={lectureSeule}
              onBlur={(e) => onCommitCase(idx, parseInt(e.target.value, 10) || 0)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              }}
              title={
                idx === nb - 1
                  ? 'Total confié à cet OF (dernière quantité, fixe)'
                  : `Case ${idx + 1} : quantité ayant atteint cette étape`
              }
              className={`w-12 text-center text-[11px] font-bold px-1 py-0.5 rounded border border-slate-300 focus:outline-hidden focus:border-emerald-500 focus:bg-emerald-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                idx === nb - 1 ? 'bg-slate-100 text-slate-900' : 'bg-white text-slate-700'
              } ${lectureSeule ? 'cursor-default' : ''}`}
            />
          </React.Fragment>
        ))}
      </div>

      <select
        value={type}
        disabled={typeDesactive}
        onChange={(e) => onCommitType(e.target.value as OFType)}
        title={`Traitant : ${OF_TYPES[type].label}`}
        className={`text-[11px] font-bold rounded-md px-1.5 py-0.5 border ${typeDesactive ? 'cursor-default' : 'cursor-pointer'} ${OF_TYPES[type].classe}`}
      >
        {OF_TYPES_AFFICHES.map((t) => (
          <option key={t} value={t} title={OF_TYPES[t].label}>
            {t}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * Vue « Tableaux des OFs » : un tableau par client, une ligne par carte, et pour
 * chaque carte ses OFs (cases + type) éditables.
 */
export const TableauxOFsView: React.FC<TableauxOFsViewProps> = ({
  cards,
  onUpdateCard,
  onChangePage,
  onOpenCardModal,
  profil,
  onDeconnexion,
}) => {
  // Production : seule la quantité des OFs est modifiable, pas leur type.
  const typeModifiable = profil.id !== 'production';
  const [parisTime, setParisTime] = useState(getNowParis().timeStr);
  const { fullFrenchDate } = getNowParis();

  useEffect(() => {
    const timer = setInterval(() => setParisTime(getNowParis().timeStr), 15000);
    return () => clearInterval(timer);
  }, []);

  // Un tableau par client, et seulement les cartes qui portent au moins un OF.
  const parClient = useMemo(() => {
    const map = new Map<string, CardItem[]>();
    for (const card of cards) {
      if (!card.ofs || card.ofs.length === 0) continue;
      const liste = map.get(card.client) ?? [];
      liste.push(card);
      map.set(card.client, liste);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0], 'fr'))
      .map(
        ([client, liste]) =>
          [
            client,
            [...liste].sort(
              (a, b) =>
                a.modele.localeCompare(b.modele, 'fr') ||
                a.batch.localeCompare(b.batch, 'fr')
            ),
          ] as [string, CardItem[]]
      );
  }, [cards]);

  const commitOfs = (card: CardItem, newOfs: OrdreFabrication[]) => {
    const quantiteFinie = newOfs.reduce((sum, o) => sum + computeOfQuantiteFinie(o), 0);
    onUpdateCard(card.id, { ofs: newOfs, quantiteFinie });
  };

  const handleCaseCommit = (card: CardItem, ofIndex: number, idx: number, val: number) => {
    const newOfs = card.ofs.map((o, i) => (i === ofIndex ? appliquerCase(o, idx, val) : o));
    commitOfs(card, newOfs);
  };

  const handleTypeCommit = (card: CardItem, ofIndex: number, t: OFType) => {
    const newOfs = card.ofs.map((o, i) =>
      i === ofIndex ? { ...o, type: t, nomExecutant: OF_TYPES[t].label } : o
    );
    commitOfs(card, newOfs);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-16">
      {/* Bandeau haut : titre, date/heure, sélecteur de vue */}
      <div className="relative z-20 border-b border-slate-200 bg-white shadow-xs">
        <div className="page-container py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between min-[900px]:gap-6">
            {/* Brand */}
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                <Table2 className="h-6 w-6" />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <h1 className="m-0 whitespace-normal text-[22px] font-medium leading-[1.2] text-slate-900 min-[900px]:overflow-hidden min-[900px]:text-ellipsis min-[900px]:whitespace-nowrap">
                  Tableaux des OFs
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    {fullFrenchDate}
                  </span>
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 px-2 py-0.5 font-medium tabular-nums text-slate-900">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{parisTime}</span>
                    <span className="text-[11px] font-medium text-slate-400">{LIBELLE_FUSEAU}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex min-w-0 flex-wrap items-center gap-2.5 min-[900px]:justify-end">
              <SessionBadge profil={profil} onDeconnexion={onDeconnexion} />
            </div>

            </div>

            {/* Tabs */}
            <div className="min-w-0">
              <ViewSwitcher currentPage="tableaux-ofs" onChangePage={onChangePage} />
            </div>
          </div>
        </div>
      </div>

      <div className="page-container py-6 grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {parClient.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <Table2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">Aucun OF à afficher</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Ajoutez des OFs depuis une carte pour les retrouver ici, regroupés par client et par
              modèle.
            </p>
          </div>
        ) : (
          parClient.map(([client, cartesClient]) => {
            // Une seule mention des colonnes de cases, en haut du tableau :
            // on se base sur le nombre de cases du premier OF de la section.
            const nbSection = nbCasesBorne(cartesClient[0]?.ofs?.[0]?.nbCases);
            return (
            <section
            key={client}
            className="min-w-0 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden"
          >
              <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
                <h2 className="text-sm font-bold tracking-tight">{client}</h2>
                <span className="text-[11px] font-semibold text-slate-300">
                  {cartesClient.length} carte{cartesClient.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-2 font-bold w-56">Modèle</th>
                      <th className="px-4 py-2 font-bold align-top">
                        <div className="space-y-1.5">
                          <div>Ordres de fabrication</div>
                          {/* Une seule mention des colonnes de cases (abréviations). */}
                          <div className="flex items-center gap-1.5 normal-case tracking-normal">
                            <span className="w-6" aria-hidden="true" />
                            <div className="inline-flex items-center">
                              {libellesCases(nbSection).map((l, i) => (
                                <React.Fragment key={l}>
                                  {i > 0 && (
                                    <span
                                      className="mx-1 h-3 w-px bg-slate-300"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="w-12 text-center text-[10px] font-bold uppercase tracking-wider leading-none text-slate-400">
                                    {l}
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartesClient.map((card) => (
                      <tr key={card.id} className="border-t border-slate-100 align-top">
                        <td className="px-4 py-3">
                          {onOpenCardModal ? (
                            <button
                              type="button"
                              onClick={() => onOpenCardModal(card)}
                              title="Ouvrir la carte"
                              className="text-left cursor-pointer group"
                            >
                              <span className="font-bold text-sm text-slate-900 group-hover:text-emerald-700">
                                {card.modele}
                              </span>
                              <span className="block text-[11px] text-slate-400">
                                {card.batch}
                              </span>
                            </button>
                          ) : (
                            <>
                              <span className="font-bold text-sm text-slate-900">
                                {card.modele}
                              </span>
                              <span className="block text-[11px] text-slate-400">
                                {card.batch}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {card.ofs.map((of, i) => (
                              <OFRowEditable
                                key={of.id}
                                of={of}
                                numero={i + 1}
                                onCommitCase={(idx, val) => handleCaseCommit(card, i, idx, val)}
                                onCommitType={(t) => handleTypeCommit(card, i, t)}
                                typeModifiable={typeModifiable}
                              />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            );
          })
        )}
      </div>
    </div>
  );
};
