# Tracker DB 스냅샷 복구 가이드

## 파일

- `snapshot_YYYYMMDD_HHmm.sql` — 특정 시점의 전체 DB 스냅샷
  - 포함: 데이터베이스 생성문 + 모든 테이블 + 트리거 + 이벤트 + AES 함수/프로시저 + 데이터
  - 인코딩: UTF-8 (utf8mb4)
  - 형식: `mysqldump --triggers --events --single-transaction --add-drop-table --databases tracker` 결과에 routines 정의를 prepend

## 복구 방법

### Windows (PowerShell)

```powershell
$env:MYSQL_PWD = 'Tr@ck2r'   # tracker 사용자 비밀번호
& 'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -u tracker -h 127.0.0.1 < sql\backups\snapshot_YYYYMMDD_HHmm.sql
```

### Linux / Git Bash

```bash
MYSQL_PWD='Tr@ck2r' mysql -u tracker -h 127.0.0.1 < sql/backups/snapshot_YYYYMMDD_HHmm.sql
```

## 동작
1. `DROP DATABASE IF EXISTS tracker` → `CREATE DATABASE tracker`
2. routines (`fn_encrypt`, `fn_decrypt`, `sp_update_project_statuses`, `ev_daily_project_status_update`) 생성
3. 모든 테이블 DROP + CREATE + INSERT (스키마 + 데이터)

## 주의
- 복구 전 현재 DB 가 백업되었는지 확인 (스냅샷은 `DROP DATABASE` 포함)
- `.env` 의 `ENCRYPTION_KEY` 가 백업 시점과 동일해야 암호화된 필드(이름·이메일·전화 등) 복호화 가능
- 업로드된 이미지 파일(`uploads/` 디렉토리) 는 DB 스냅샷에 포함되지 않음 — 별도 백업 필요

## 신규 스냅샷 생성

```powershell
sql\backup.cmd
```

또는 수동:
```powershell
$ts = Get-Date -Format 'yyyyMMdd_HHmm'
$env:MYSQL_PWD='Tr@ck2r'
& cmd /c "`"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe`" -u tracker -h 127.0.0.1 --default-character-set=utf8mb4 --triggers --events --single-transaction --add-drop-table --add-drop-trigger --add-drop-database --databases tracker > sql\backups\tracker_snapshot_$ts.sql"
```
