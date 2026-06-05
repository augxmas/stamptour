@echo off
REM ============================================================
REM  tracker DB 백업 — mysqldump (Windows .cmd)
REM
REM  사용법:
REM    sql\backup.cmd                  ^&^&  기본(전체 백업, 데이터 포함)
REM    sql\backup.cmd schema           ^&^&  스키마 + 객체만 (데이터 제외)
REM    sql\backup.cmd data             ^&^&  데이터만 (스키마 제외)
REM
REM  결과:
REM    sql\backups\tracker_YYYYMMDD_HHmmss[_schema|_data].sql
REM
REM  환경:
REM    MYSQL_PWD          : tracker 사용자 비밀번호 (반드시 셸 변수로 지정,
REM                         예: set MYSQL_PWD=... 또는 호출 시 한번만)
REM    MYSQLDUMP          : mysqldump.exe 경로 (미지정 시 기본 경로 사용)
REM    DB_USER, DB_HOST   : 미지정 시 tracker / 127.0.0.1
REM ============================================================

setlocal enabledelayedexpansion

if "%MYSQLDUMP%"=="" set "MYSQLDUMP=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
if "%DB_USER%"=="" set "DB_USER=tracker"
if "%DB_HOST%"=="" set "DB_HOST=127.0.0.1"
set "DB_NAME=tracker"

if not exist "%MYSQLDUMP%" (
  echo [ERROR] mysqldump not found: %MYSQLDUMP%
  echo Set MYSQLDUMP env var to the correct path.
  exit /b 1
)

if "%MYSQL_PWD%"=="" (
  echo [ERROR] MYSQL_PWD env var is not set. Set it before running, e.g.:
  echo   set MYSQL_PWD=your-password
  exit /b 1
)

REM 타임스탬프 YYYYMMDD_HHmmss
for /f "tokens=2 delims==" %%I in ('wmic os get LocalDateTime /value ^| find "="') do set "DT=%%I"
set "TS=%DT:~0,8%_%DT:~8,6%"

REM 백업 폴더
set "OUTDIR=%~dp0backups"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"

set "MODE=%~1"
if /i "%MODE%"=="schema" (
  set "OUTFILE=%OUTDIR%\tracker_%TS%_schema.sql"
  set "DUMP_OPTS=--no-data --routines --events --triggers --add-drop-table --add-drop-trigger --skip-comments"
  echo [INFO] Backing up SCHEMA + OBJECTS to %OUTFILE%
) else if /i "%MODE%"=="data" (
  set "OUTFILE=%OUTDIR%\tracker_%TS%_data.sql"
  set "DUMP_OPTS=--no-create-info --skip-triggers --skip-extended-insert --complete-insert --skip-comments"
  echo [INFO] Backing up DATA only to %OUTFILE%
) else (
  set "OUTFILE=%OUTDIR%\tracker_%TS%.sql"
  set "DUMP_OPTS=--routines --events --triggers --add-drop-database --databases --skip-extended-insert --complete-insert --skip-comments"
  echo [INFO] Backing up FULL DB to %OUTFILE%
)

"%MYSQLDUMP%" -u %DB_USER% -h %DB_HOST% --default-character-set=utf8mb4 %DUMP_OPTS% %DB_NAME% > "%OUTFILE%"
if errorlevel 1 (
  echo [ERROR] mysqldump failed (errorlevel %errorlevel%^)
  if exist "%OUTFILE%" del "%OUTFILE%"
  exit /b 1
)

for %%S in ("%OUTFILE%") do set "SIZE=%%~zS"
echo [DONE] %OUTFILE%  (!SIZE! bytes)

endlocal
