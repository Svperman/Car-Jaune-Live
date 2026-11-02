# Car Jaune Live — réglage UNIQUE du déploiement automatique (à lancer une seule fois sur ton PC Windows)
#
# Usage (PowerShell, depuis ce dossier) :
#   .\setup-auto-deploy.ps1 -ScriptId "ID_DU_SCRIPT"
#
# ID du script : ton projet Apps Script → ⚙️ Paramètres du projet → « ID du script »
# Ensuite, chaque modification de Code.gs poussée sur GitHub met le serveur à jour toute seule.

param([Parameter(Mandatory = $true)][string]$ScriptId)
$ErrorActionPreference = "Stop"
$repo = "Svperman/Car-Jaune-Live"

# 1. clasp
if (-not (Get-Command clasp -ErrorAction SilentlyContinue)) {
  Write-Host "Installation de clasp…" -ForegroundColor Yellow
  npm install -g @google/clasp
}

# 2. API Apps Script activée (obligatoire pour clasp)
Write-Host ""
Write-Host "Vérifie que « API Google Apps Script » est sur ACTIVÉ :" -ForegroundColor Yellow
Write-Host "  https://script.google.com/home/usersettings"
Start-Process "https://script.google.com/home/usersettings"
Read-Host "Appuie sur Entrée quand c'est activé"

# 3. connexion Google (crée %USERPROFILE%\.clasprc.json)
$rc = Join-Path $env:USERPROFILE ".clasprc.json"
if (-not (Test-Path $rc)) {
  Write-Host "Connexion à Google (avec le compte qui possède le script)…" -ForegroundColor Yellow
  clasp login
}
if (-not (Test-Path $rc)) { Write-Host "Connexion non terminée (.clasprc.json absent)." -ForegroundColor Red; exit 1 }
$creds = Get-Content $rc -Raw

# 4. secrets GitHub
if (Get-Command gh -ErrorAction SilentlyContinue) {
  Write-Host "Envoi des secrets dans GitHub avec gh…" -ForegroundColor Yellow
  $creds | gh secret set CLASPRC_JSON --repo $repo
  $ScriptId | gh secret set SCRIPT_ID --repo $repo
  Write-Host "Secrets CLASPRC_JSON et SCRIPT_ID enregistrés." -ForegroundColor Green
  Write-Host "Premier déploiement automatique…" -ForegroundColor Yellow
  gh workflow run "deploy-apps-script.yml" --repo $repo
  Write-Host "Suivi : https://github.com/$repo/actions" -ForegroundColor Green
} else {
  Set-Clipboard -Value $creds
  Write-Host ""
  Write-Host "Le contenu de .clasprc.json est COPIÉ dans le presse-papiers." -ForegroundColor Green
  Write-Host "Sur la page qui s'ouvre, crée 2 secrets (New repository secret) :" -ForegroundColor Yellow
  Write-Host "  CLASPRC_JSON  = Ctrl+V (le presse-papiers)"
  Write-Host "  SCRIPT_ID     = $ScriptId"
  Start-Process "https://github.com/$repo/settings/secrets/actions"
  Write-Host ""
  Write-Host "Puis : https://github.com/$repo/actions → « Déployer le serveur Apps Script » → Run workflow" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "C'est fini : à chaque modification de Code.gs sur GitHub, le serveur se met à jour tout seul (même URL /exec)." -ForegroundColor Green
