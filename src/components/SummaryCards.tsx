import { SummaryValues } from '../types';
import { formatMinutesAsClock, formatSignedMinutesAsClock } from '../utils/time';

interface SummaryCardsProps {
  summary: SummaryValues;
}

export default function SummaryCards({ summary }: SummaryCardsProps): JSX.Element {
  const cards = [
    {
      title: '필수 근무시간',
      value: formatMinutesAsClock(summary.requiredMinutes),
      color: 'from-blue-50 to-blue-100 text-blue-900',
    },
    {
      title: '남은 근무시간',
      value: formatMinutesAsClock(summary.remainingMinutes),
      color: 'from-amber-50 to-amber-100 text-amber-900',
    },
    {
      title: '추가 가능 잔업시간',
      value: formatMinutesAsClock(summary.additionalOvertimeAvailableMinutes),
      color: 'from-emerald-50 to-emerald-100 text-emerald-900',
    },
    {
      title: '조기퇴근 가능시간',
      value: formatSignedMinutesAsClock(summary.earlyLeaveAvailableMinutes),
      color: 'from-rose-50 to-rose-100 text-rose-900',
    },
    {
      title: '야근결재 합계',
      value: formatMinutesAsClock(summary.overtimeApprovalTotalMinutes),
      color: 'from-slate-50 to-slate-200 text-slate-900',
    },
  ];

  return (
    <section className="grid max-[360px]:grid-cols-1 grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
      {cards.map((card) => (
        <article
          key={card.title}
          className={`rounded-2xl bg-gradient-to-br p-3 sm:p-4 shadow-soft ${card.color}`}
        >
          <p className="text-[11px] sm:text-xs font-semibold tracking-wide text-slate-600">
            {card.title}
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-bold">{card.value}</p>
        </article>
      ))}
    </section>
  );
}