# Supabase Sync Setup Checklist (WorkTime v2)

앱 동기화가 실제로 동작하려면 아래를 순서대로 완료하세요.

## 1) Vercel 배포 커밋 확인
- Production Deployment가 최신 커밋을 사용해야 합니다.
- 현재 기준 커밋: `9fb64f2` 이상.

## 2) Vercel 환경변수 확인
아래 키 중 URL/KEY가 각각 1개 이상 있어야 합니다.

- URL 후보
  - `VITE_SUPABASE_URL`
  - `SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
- ANON KEY 후보
  - `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

주의:
- URL/KEY는 반드시 같은 Supabase 프로젝트 쌍이어야 합니다.
- 값 수정 후에는 Production 재배포가 필요합니다.

## 3) Supabase SQL 실행
Supabase SQL Editor에서 `supabase/schema.sql` 전체 실행.

## 4) 테이블/함수 점검 SQL
아래 쿼리로 필수 객체가 만들어졌는지 확인.

```sql
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('users', 'periods', 'work_records');

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'cleanup_inactive_user_codes';
```

## 5) 권한/RLS 점검 SQL
```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('users', 'periods', 'work_records');

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('users', 'periods', 'work_records')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;
```

기대값:
- `rowscurity = false` (RLS 비활성)
- `anon`에 `select/insert/update/delete` 권한 존재

## 6) 앱 동작 검증
1. 앱 접속 후 "Supabase 환경변수" 경고가 없어야 함
2. 근무기록 1개 수정 후 2초 대기(자동저장) 또는 전체 저장
3. Supabase 테이블 데이터 증가 확인
4. 다른 기기에서 같은 동기화 코드 입력 후 동일 데이터 로드 확인

## 7) 자주 발생하는 오류
- `Could not find the table 'public.users' in the schema cache`
  - 원인: schema.sql 미실행 또는 다른 Supabase 프로젝트 URL 사용
- `permission denied` / `row-level security`
  - 원인: 권한/정책 미적용

