import { SummaryValues } from '../types';
import { formatMinutesAsClock, formatSignedMinutesAsClock } from '../utils/time';

interface SummaryCardsProps {
  summary: SummaryValues;
}

function splitClock(value: string): { hours: string; minutes: string } {
  const [hours = '0', minutes = '00'] = value.replace('+', '').split(':');
  return { hours, minutes };
}

export default function SummaryCards({ summary }: SummaryCardsProps): JSX.Element {
  const requiredLabel = formatMinutesAsClock(summary.requiredMinutes);
  const remainingLabel = formatMinutesAsClock(summary.remainingMinutes);
  const additionalLabel = formatMinutesAsClock(summary.additionalOvertimeAvailableMinutes);
  const earlyLeaveLabel = formatSignedMinutesAsClock(summary.earlyLeaveAvailableMinutes);
  const approvalTotalLabel = formatMinutesAsClock(summary.overtimeApprovalTotalMinutes);

  const workedMinutes = Math.max(0, summary.requiredMinutes - summary.remainingMinutes);
  const progress =
    summary.requiredMinutes > 0
      ? Math.min(100, Math.round((workedMinutes / summary.requiredMinutes) * 100))
      : 100;
  const workedLabel = formatMinutesAsClock(workedMinutes);

  const remaining = splitClock(remainingLabel);

  return (
    <section className="surface-panel">
      <div className="mb-6 flex items-center gap-2">
        <span className="section-icon section-icon-green" aria-hidden="true">
          <svg className="h-8 w-8 overflow-visible" fill="none" viewBox="0 0 40 40">
            <path
              className="stroke-slate-900"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.8"
              d="M8 32V20h6v12M17 32V15h6v17M26 32V10h6v22"
            />
            <path
              className="stroke-emerald-500"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="3.4"
              d="M7.5 16.5l7-6.8 6.7 5.2L32 4.8M28.3 4.8H32v3.7"
            />
          </svg>
        </span>
        <h2 className="section-heading">2주 누적 요약</h2>
      </div>

      <div className="flex flex-col gap-10 md:flex-row md:items-center">
        <div className="flex-1">
          <h3 className="text-sm font-bold text-slate-500">이번 2주 남은 근무시간</h3>
          <div className="mb-4 mt-2 flex items-baseline gap-2">
            <span className="text-5xl font-extrabold tracking-tight text-indigo-600">
              {remaining.hours}
              <span className="ml-1 text-2xl font-bold text-indigo-400">h</span>{' '}
              {remaining.minutes}
              <span className="ml-1 text-2xl font-bold text-indigo-400">m</span>
            </span>
          </div>

          <div className="mb-3 h-4 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-4 rounded-full bg-indigo-500 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm font-medium text-slate-500">
            총 필수 {requiredLabel} 중{' '}
            <span className="font-bold text-slate-700">{workedLabel}</span> 근무 완료
          </p>
        </div>

        <div className="grid w-full flex-1 grid-cols-2 gap-x-8 gap-y-8 border-slate-100 md:border-l md:pl-10">
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-400">추가 가능 잔업시간</p>
            <p className="text-2xl font-extrabold text-emerald-500">{additionalLabel}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-400">조기퇴근 가능시간</p>
            <p className="text-2xl font-extrabold text-pink-500">{earlyLeaveLabel}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-400">야근결재 합계</p>
            <p className="text-2xl font-extrabold text-orange-500">{approvalTotalLabel}</p>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-400">필수 근무시간</p>
            <p className="text-2xl font-extrabold text-slate-700">{requiredLabel}</p>
          </div>
        </div>
      </div>

      {summary.requiredMinutes <= 0 ? (
        <p className="mt-4 text-xs text-slate-500">
          필수 근무시간이 0으로 계산되어 진행률은 100%로 표시됩니다.
        </p>
      ) : null}
    </section>
  );
}
