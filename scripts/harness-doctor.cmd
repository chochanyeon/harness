@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0harness-doctor.ps1" %*
exit /b %ERRORLEVEL%
