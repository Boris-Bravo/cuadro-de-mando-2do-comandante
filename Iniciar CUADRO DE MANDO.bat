@echo off
title Cuadro de Mando y Control del 2do Comandante
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
