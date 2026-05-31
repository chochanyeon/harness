@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-harness.ps1" %*
exit /b %ERRORLEVEL%
