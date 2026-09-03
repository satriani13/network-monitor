@echo off
title Network Monitor
cd /d "%~dp0"

:: Try common Python locations
set PYTHON=
if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set PYTHON="%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set PYTHON="%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set PYTHON="%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if exist "C:\Python313\python.exe" set PYTHON="C:\Python313\python.exe"
if exist "C:\Python312\python.exe" set PYTHON="C:\Python312\python.exe"

:: Fallback to PATH
if "%PYTHON%"=="" (
  where python >nul 2>&1 && set PYTHON=python
)
if "%PYTHON%"=="" (
  where python3 >nul 2>&1 && set PYTHON=python3
)

if "%PYTHON%"=="" (
  echo ERROR: Python no encontrado.
  echo Instala Python 3.11+ desde https://python.org y asegurate de marcar
  echo "Add Python to PATH" durante la instalacion.
  pause
  exit /b 1
)

echo Usando Python: %PYTHON%
echo Instalando dependencias...
%PYTHON% -m pip install -r requirements.txt --quiet

echo.
echo =========================================
echo  Network Monitor  ^|  http://localhost:5000
echo =========================================
echo.

%PYTHON% app.py

pause
