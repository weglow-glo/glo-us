@echo off
rem ebut WMS runner wrapper for Windows Task Scheduler (launched hidden via wms-task.vbs).
rem Usage: wms-task.cmd push|pull|both  -- output appends to wms-runner.log
rem NOTE: keep this file ASCII-only; cmd.exe parses batch files in the ANSI codepage.
setlocal
cd /d "%~dp0.."
call npx tsx scripts\wms-runner.ts %1 >> "%~dp0wms-runner.log" 2>&1
endlocal
