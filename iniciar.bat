@echo off
title FacilClaw
cd /d "%~dp0"

echo.
echo ==========================================
echo    Iniciando FacilClaw... 🚀
echo ==========================================
echo.

:: Verificar si node_modules existe
if not exist node_modules (
    echo 📦 No se encontraron las dependencias. Instalando...
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo ❌ Error crítico al instalar dependencias.
        pause
        exit /b %errorlevel%
    )
)

:: Lanzar el navegador en una ventana separada tras un breve delay
echo 🌐 Preparando el navegador...
start /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

echo.
echo 🤖 FacilClaw corriendo. Cierra esta ventana para detener el agente.
echo.

:: Iniciar el servidor
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo ❌ El servidor se ha detenido inesperadamente.
    pause
)
