@echo off
chcp 65001 > nul
echo ========================================
echo  📤 SUBIR CAMBIOS A GITHUB - IXORA
echo ========================================
echo.

REM Verificar si existe el repositorio
if not exist .git (
    echo ⚠️ No se encontró repositorio Git. Inicializando...
    git init
    git remote add origin https://github.com/alexxcrz/IXORA.git
    echo ✅ Repositorio inicializado
    echo.
)

REM Solicitar mensaje de commit
set /p mensaje="💬 Mensaje del commit: "
if "%mensaje%"=="" set mensaje=Actualización automática

echo.
echo 📋 Agregando archivos...
git add .

echo.
echo 💾 Creando commit...
git commit -m "%mensaje%"

echo.
echo 📤 Subiendo a GitHub...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo ⚠️ Error al hacer push. Intentando con master...
    git push -u origin master
)

echo.
echo ========================================
echo  ✅ CAMBIOS SUBIDOS EXITOSAMENTE
echo ========================================
echo.
pause
