import { DayRecord, DayRecordMeta } from '../types';
import {
  formatDateCell,
  formatMinutesAsClock,
  formatSignedMinutesAsClock,
  isToday,
} from '../utils/time';

interface TimesheetTableProps {
  records: DayRecord[];
  rowMeta: DayRecordMeta[];
  onPatchRecord: (
    index: number,
    patch: Partial<
      Pick<
        DayRecord,
        | 'isHoliday'
        | 'clockIn'
        | 'clockOut'
        | 'dinnerChecked'
        | 'nonWorkMinutes'
        | 'claimedOtMinutes'
      >
    >,
  ) => void;
}

function TimeInputCell({
  value,
  min,
  max,
  clearLabel,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  clearLabel: string;
  onChange: (value: string) => void;
}): JSX.Element {
  const hasValue = value.trim() !== '';

  return (
    <div className="relative mx-auto w-[85%] min-w-[95px]">
      <input
        type="time"
        step={60}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        title="HH:mm (24시간 형식)"
        className={`h-8 w-full min-w-[150px] rounded-md border border-slate-300 bg-sky-50 py-1 pl-2 text-[11px] table-time-input ${
          hasValue ? 'pr-2' : 'pr-2'
        }`}
      />

      {hasValue ? (
        <button
          type="button"
          onClick={() => onChange('')}
          title={clearLabel}
          aria-label={clearLabel}
          className="absolute right-8 top-1/2 inline-flex h-6 -translate-y-1/2 items-center text-[11px] font-semibold text-slate-700 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        >
          <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 leading-none">&times;</span>
        </button>
      ) : null}
    </div>
  );
}

export default function TimesheetTable({
  records,
  rowMeta,
  onPatchRecord,
}: TimesheetTableProps): JSX.Element {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[1300px] border-collapse text-xs">
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="px-1.5 py-1.5">날짜</th>
            <th className="px-1.5 py-1.5">공휴일</th>
            <th className="px-1.5 py-1.5">출근시간</th>
            <th className="px-1.5 py-1.5">퇴근시간</th>
            <th className="px-1.5 py-1.5">석식</th>
            <th className="px-1.5 py-1.5">비업무시간(분)</th>
            <th className="px-1.5 py-1.5">근무시간</th>
            <th className="px-1.5 py-1.5">정규 업무시간</th>
            <th className="px-1.5 py-1.5">추가 근무시간</th>
            <th className="px-1.5 py-1.5">권장 야근결재</th>
            <th className="px-1.5 py-1.5">실제 야근결재(분)</th>
            <th className="px-1.5 py-1.5">조기퇴근 적립/부족</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record, index) => {
            const meta = rowMeta[index];
            const hasError = (meta?.validationErrors.length ?? 0) > 0;

            return (
              <tr
                key={record.date}
                className={`${
                  isToday(record.date)
                    ? 'bg-amber-50/80'
                    : index % 2 === 0
                      ? 'bg-white'
                      : 'bg-slate-50/60'
                } border-b border-slate-200 align-top`}
              >
                <td className="px-1.5 py-1.5 font-medium text-slate-800">
                  <div>{formatDateCell(record.date)}</div>
                  {hasError ? (
                    <div className="mt-1 text-xs text-rose-600">
                      {meta.validationErrors.join(' / ')}
                    </div>
                  ) : null}
                </td>

                <td className="px-1.5 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={record.isHoliday}
                    onChange={(event) =>
                      onPatchRecord(index, { isHoliday: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>

                <td className="px-1.5 py-1.5">
                  <TimeInputCell
                    value={record.clockIn}
                    min="06:00"
                    max="23:59"
                    clearLabel="출근시간 지우기"
                    onChange={(value) => onPatchRecord(index, { clockIn: value })}
                  />
                </td>

                <td className="px-1.5 py-1.5">
                  <TimeInputCell
                    value={record.clockOut}
                    min="00:00"
                    max="23:59"
                    clearLabel="퇴근시간 지우기"
                    onChange={(value) => onPatchRecord(index, { clockOut: value })}
                  />
                </td>

                <td className="px-1.5 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={record.dinnerChecked}
                    onChange={(event) =>
                      onPatchRecord(index, { dinnerChecked: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </td>

                <td className="px-1.5 py-1.5 text-center">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={record.nonWorkMinutes}
                    onFocus={(event) => {
                      if (record.nonWorkMinutes === 0) {
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      onPatchRecord(index, {
                        nonWorkMinutes: Number(event.target.value || 0),
                      })
                    }
                    className="w-20 rounded-md border border-slate-300 bg-sky-50 px-2 py-1 text-right text-[11px]"
                  />
                </td>

                <td className="px-1.5 py-1.5 text-center font-semibold text-slate-700">
                  {formatMinutesAsClock(record.workMinutes)}
                </td>

                <td className="bg-slate-100 px-1.5 py-1.5 text-center font-semibold text-slate-700">
                  {formatMinutesAsClock(record.regularMinutes)}
                </td>

                <td className="bg-slate-100 px-1.5 py-1.5 text-center font-semibold text-slate-700">
                  {formatMinutesAsClock(record.overtimeMinutes)}
                </td>

                <td className="bg-slate-100 px-1.5 py-1.5 text-center font-semibold text-slate-700">
                  {formatMinutesAsClock(record.recommendedOtMinutes)}
                </td>

                <td className="px-1.5 py-1.5 text-center">
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={record.claimedOtMinutes}
                    onFocus={(event) => {
                      if (record.claimedOtMinutes === 0) {
                        event.currentTarget.select();
                      }
                    }}
                    onChange={(event) =>
                      onPatchRecord(index, {
                        claimedOtMinutes: Number(event.target.value || 0),
                      })
                    }
                    className="w-20 rounded-md border border-slate-300 bg-sky-50 px-2 py-1 text-right text-[11px]"
                  />
                </td>

                <td className="bg-slate-100 px-1.5 py-1.5 text-center font-semibold text-slate-700">
                  {formatSignedMinutesAsClock(record.earlyLeaveBalanceMinutes)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
