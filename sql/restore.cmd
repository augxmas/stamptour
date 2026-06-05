@echo off
REM ============================================================
REM  tracker DB 복원 — mysql (Windows .cmd)
REM
REM  사용법:
REM    sql\restore.cmd sql\backups\tracker_YYYYMMDD_HHmmss.sql
REM    sql\restore.cmd sql\schema.sql
REM
REM  환경:
REM    MYSQL_PWD          : 비밀번호 (필수, 셸 변수)
REM    MYSQL              : mysql.exe 경로 (미지정 시 기본 경로)
REM    DB_USER, DB_HOST   : 미지정 시 tracker / 127.0.0.1
REM ============================================================

setlocal

if "%~1"=="" (
  echo Usage: sql\restore.cmd ^<dump-file.sql^>
  exit /b 1
)
set "DUMPFILE=%~1"

if not exist "%DUMPFILE%" (
  echo [ERROR] file not found: %DUMPFILE%
  exit /b 1
)

if "%MYSQL%"=="" set "MYSQL=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
if "%DB_USER%"=="" set "DB_USER=tracker"
if "%DB_HOST%"=="" set "DB_HOST=127.0.0.1"
set "DB_NAME=tracker"

if not exist "%MYSQL%" (
  echo [ERROR] mysql.exe not found: %MYSQL%
  exit /b 1
)
if "%MYSQL_PWD%"=="" (
  echo [ERROR] MYSQL_PWD env var is not set.
  exit /b 1
)

echo [INFO] Restoring from %DUMPFILE% into %DB_NAME%
"%MYSQL%" -u %DB_USER% -h %DB_HOST% --default-character-set=utf8mb4 %DB_NAME% < "%DUMPFILE%"
if errorlevel 1 (
  echo [ERROR] restore failed (errorlevel %errorlevel%^)
  exit /b 1
)
echo [DONE] restored.

endlocal
