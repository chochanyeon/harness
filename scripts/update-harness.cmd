@echo off
setlocal
chcp 65001 >nul
set PYTHONIOENCODING=utf-8

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-harness.ps1" %*
exit /b %ERRORLEVEL%
