# Car Jaune Live — envoi et déploiement du serveur Apps Script (attaché au Google Sheet « Car Jaune »)
#
# Usage (PowerShell, depuis ce dossier) :
#   .\deploy.ps1 -ScriptId "ID_DU_SCRIPT"                     # 1er déploiement
#   .\deploy.ps1 -ScriptId "ID_DU_SCRIPT" -DeploymentId "AKfy…"  # mise à jour, même URL /exec
#
# ID du script : Google Sheet « Car Jaune » → Extensions → Apps Script → ⚙️ Paramètres du projet → « ID du script »

param(
  [Parameter(Mandatory = $true)][string]$ScriptId,
  [string]$DeploymentId = ""
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
  Write-Host "clasp n'est pas installé : npm install -g @google/clasp" -ForegroundColor Red; exit 1
}

# Projet visé (le script attaché au Sheet « Car Jaune »)
'{"scriptId":"' + $ScriptId + '","rootDir":"."}' | Set-Content -Encoding ascii .clasp.json
@"
**/**
!Code.gs
!appsscript.json
"@ | Set-Content -Encoding ascii .claspignore

Write-Host "Envoi de Code.gs et appsscript.json…" -ForegroundColor Yellow
clasp push --force
if ($LASTEXITCODE -ne 0) {
  Write-Host "Échec de l'envoi. Vérifie : 'clasp login' fait, et l'API Apps Script activée sur https://script.google.com/home/usersettings" -ForegroundColor Red
  exit 1
}

$desc = "Car Jaune Live " + (Get-Date -Format "yyyy-MM-dd HH:mm")
Write-Host "Déploiement de l'application Web…" -ForegroundColor Yellow
if ($DeploymentId) {
  clasp deploy --deploymentId $DeploymentId --description $desc
  if ($LASTEXITCODE -ne 0) { clasp update-deployment $DeploymentId --description $desc }
} else {
  clasp deploy --description $desc
  if ($LASTEXITCODE -ne 0) { clasp create-deployment --description $desc }
}
if ($LASTEXITCODE -ne 0) { Write-Host "Échec du déploiement." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "Déploiements :" -ForegroundColor Green
clasp deployments 2>$null; if ($LASTEXITCODE -ne 0) { clasp list-deployments }
Write-Host ""
Write-Host "Ton URL : https://script.google.com/macros/s/<ID_DE_DEPLOIEMENT>/exec" -ForegroundColor Green
Write-Host "(ID_DE_DEPLOIEMENT = la ligne 'AKfy…' ci-dessus, pas celle marquée @HEAD)"
Write-Host ""
Write-Host "1re fois seulement : ouvre l'éditeur (clasp open-script) et exécute 'refreshSchoolCalendar' pour autoriser l'accès Internet." -ForegroundColor Yellow
