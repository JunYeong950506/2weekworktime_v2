# 2주 탄력근무 근태 계산기 (웹앱)

엑셀 계산 로직을 TypeScript 함수로 재구현한 개인용 웹앱입니다.
시간 계산은 내부적으로 모두 분(`minute`) 정수로 처리하고, 화면에는 `h:mm` 형식으로 표시합니다.

## 기술 스택
- React + TypeScript + Vite
- Tailwind CSS
- dayjs
- localStorage
- Supabase (동기화 코드 기반 서버 동기화)

## 주요 기능
- 2주 시작일 입력 시 14일 자동 생성
- 출근/퇴근 입력: 직접 수정 + 현재시간 자동 입력
- 근무 유형, 공가, 공휴일, 비업무시간, 실제 야근결재 입력
- 오늘 근무 입력 카드와 최근 2주 근무 기록 팝업 동기화
- 누적 요약 카드 자동 계산
- 구간 생성, 선택, 복사
- 현재 구간 삭제
- 전체 데이터 초기화
- 동기화 코드 보기, 코드 복사, 코드 입력으로 다른 기기에서 불러오기

## 데이터 모델
```ts
Period {
  id: string;
  label: string;          // 예: 2026_02_2구간
  startDate: string;      // YYYY-MM-DD
  createdAt: string;      // ISO
  records: DayRecord[];
}

DayRecord {
  date: string;           // YYYY-MM-DD
  isHoliday: boolean;
  annualLeaveType: 'none' | 'quarter' | 'half' | 'full' | 'official';
  officialLeaveMinutes: number;
  clockIn: string;        // HH:mm | ""
  clockOut: string;       // HH:mm | ""
  mealCount: 0 | 1 | 2;
  nonWorkMinutes: number;
  claimedOtMinutes: number;
  workMinutes: number | null;
  regularMinutes: number | null;
  overtimeMinutes: number | null;
  recommendedOtMinutes: number | null;
  earlyLeaveBalanceMinutes: number | null;
}
```

## localStorage 저장 방식
- 앱 상태 key: `flex-work-2week-app-v1`
- 사용자 코드 key: `flex-work-2week-user-code-v1`
- 로컬 자동저장 후 필요 시 서버 동기화가 함께 동작합니다.

## 실행 방법
```bash
npm.cmd install
npm.cmd run dev
```

브라우저에서 표시되는 주소(보통 `http://localhost:5173`)로 접속합니다.

## 빌드 방법
```bash
npm.cmd run build
npm.cmd run preview
```

## 환경변수
서버 동기화를 사용하려면 아래 환경변수가 필요합니다.

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

카페 번호표 알림을 사용하려면 Vercel 환경변수에 아래 값을 추가합니다.

```bash
VITE_VAPID_PUBLIC_KEY=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@example.com
SUPABASE_SERVICE_ROLE_KEY=...
OCR_WORKER_TOKEN=...
CRON_SECRET=...
FIREBASE_SERVICE_ACCOUNT_JSON=...
```

`FIREBASE_SERVICE_ACCOUNT_JSON` 대신 `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`를 나눠서 설정할 수도 있습니다.
`VAPID_PRIVATE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OCR_WORKER_TOKEN`, `CRON_SECRET`, Firebase Admin 키는 서버 전용입니다.
Android WebView 앱 푸시는 Firebase Cloud Messaging을 사용하므로 APK 빌드에는 `android/app/google-services.json`이 필요합니다.
Vercel Cron은 매일 18:00 KST에 카페 감지/알림 이력과 등록 대기 데이터를 초기화합니다. 기기 Push 구독 정보는 유지합니다.

OCR Worker가 `/api/internal/cafe-number`로 번호를 보낼 때는 `mainNumber`와
`listNumbers`를 함께 보낼 수 있습니다. 서버는 `mainNumber`를 우선 사용하고,
메인 번호가 없으면 `listNumbers`의 최댓값을 현재 번호로 사용합니다.

공공데이터포털 한국천문연구원 API를 fallback으로 사용하려면 Vercel 환경변수에 아래 값을 추가합니다.

```bash
KASI_HOLIDAY_API_KEY=...
```

`KASI_HOLIDAY_API_KEY`는 공공데이터포털 한국천문연구원 특일 정보 API
서비스키입니다. 1차 공휴일 소스인 `@kyungseopk1m/holidays-kr`는 API 키가 필요 없고,
KASI 키는 1차 소스 실패 시 `/api/holidays` 서버리스 함수에서만 fallback으로 사용합니다.

## 공휴일 계산
공휴일 판정 우선순위는 아래와 같습니다.

1. `@kyungseopk1m/holidays-kr`로 받아온 연도별 캐시
2. KASI 한국천문연구원 특일 정보 API fallback
3. `date-holidays`의 `new Holidays('KR')`
4. 5월 1일 고정 휴일 규칙

최종 휴일 여부는 위 기준 중 하나라도 휴일이면 `true`입니다.

공식 API 캐시는 브라우저 localStorage에 연도별 JSON으로 저장합니다.

- key 형식: `flex-work-2week-holidays-{year}-v2`
- 예: `flex-work-2week-holidays-2026-v2`

캐시가 없으면 `/api/holidays?year=YYYY`를 호출하고, 서버리스 함수가
`@kyungseopk1m/holidays-kr`의 `holidays(year)`를 먼저 호출해 해당 연도 공휴일 JSON을
반환합니다. 이 호출이 실패하면 KASI 한국천문연구원 특일 정보 API의 `getRestDeInfo`를
1~12월 반복 호출해 fallback합니다. 캐시가 있으면 같은 브라우저에서는 재호출하지 않습니다.

1차 API 호출 실패, fallback 환경변수 누락, 캐시 저장 실패가 발생해도 앱은 계속 동작합니다.
이 경우 `date-holidays + 5월 1일` 규칙으로 fallback 계산합니다.

새 연도는 앱 재빌드 없이 최초 조회 시 해당 연도 캐시를 생성해 사용합니다.

## 주요 코드 위치
- 앱 진입: `src/App.tsx`
- 오늘 근무 입력 카드: `src/components/TodayQuickEntryCard.tsx`
- 최근 2주 근무 기록/수정 팝업: `src/components/TimesheetTable.tsx`
- 계산 로직: `src/utils/calculations.ts`
- 저장/복구: `src/utils/storage.ts`
- 서버 동기화: `src/utils/remoteSync.ts`
- 공휴일 판정: `src/utils/holidayProvider.ts`, `api/holidays.js`
- 카페 번호표 알림: `src/features/cafe-number-alert/`, `api/cafe-alert/`
- Sync API: `api/sync.js`, `src/utils/remoteSync.ts`

## Supabase 설정
- 스키마 파일: `supabase/schema.sql`
- 카페 알림 migration: `supabase/migrations/20260708_create_cafe_number_alert.sql`
- 점검 문서: `supabase/SETUP_CHECKLIST.md`
