# Car Jaune Live — appli installable

Cars jaunes de La Réunion en temps réel : carte, horaires à l'arrêt (fiches carjaune.re),
mon trajet aller/retour, alertes d'arrivée selon ta position.

L'appli (ce dossier, sur GitHub Pages) parle au serveur **Google Apps Script** (`Code.gs`)
qui récupère les données officielles. Rien à payer, pas de carte bancaire.

## 0. Mise à jour automatique du serveur (à régler une seule fois)

Après ce réglage, chaque modification de `apps-script/Code.gs` poussée sur GitHub met à jour le serveur
**tout seul** : nouvelle version + même URL `/exec`. Plus besoin de « Gérer les déploiements ».

Sur ton PC, dans PowerShell :

```powershell
git clone https://github.com/Svperman/Car-Jaune-Live.git
cd Car-Jaune-Live\apps-script
.\setup-auto-deploy.ps1 -ScriptId "ID_DU_SCRIPT"
```

Le script active la connexion Google (`clasp login`) puis enregistre 2 secrets GitHub :
`CLASPRC_JSON` (tes identifiants clasp) et `SCRIPT_ID`. Suivi des mises à jour : onglet **Actions** du dépôt
(bouton **Run workflow** pour relancer à la main, même depuis le téléphone).

## 1. Le serveur Apps Script (Google Sheet « Car Jaune »)

Les fichiers du serveur sont dans `apps-script/` : `Code.gs` (le seul fichier à coller) et `appsscript.json`
(fuseau Indian/Reunion, application Web exécutée « en tant que moi », accès « Tout le monde »).

**Avec clasp (une commande)** :

```powershell
cd apps-script
.\deploy.ps1 -ScriptId "ID_DU_SCRIPT"
```

ID du script : Sheet « Car Jaune » → Extensions → Apps Script → ⚙️ Paramètres du projet → *ID du script*.
Pour les mises à jour suivantes en gardant la même URL : `.\deploy.ps1 -ScriptId "…" -DeploymentId "AKfy…"`.

**Ou à la main** : voir ci-dessous.

### À la main

1. Colle le nouveau `Code.gs` dans ton projet Apps Script (il ajoute l'API pour l'appli).
2. **Déployer → Gérer les déploiements → Modifier → Nouvelle version**.
3. Vérifie : *Exécuter en tant que* **Moi**, *Accès* **Tout le monde**.
4. Copie l'**URL de l'application Web** (elle se termine par `/exec`).

Test rapide dans le navigateur : `TON_URL/exec?action=getSchoolCalendar` doit afficher `{"ok":true,…}`.

## 2. Publier l'appli sur GitHub Pages

```powershell
# dans ce dossier
git init
git add .
git commit -m "Car Jaune Live : appli installable"
git branch -M main
git remote add origin https://github.com/Svperman/Car-Jaune-Live.git
git push -u origin main
```

Crée d'abord le dépôt **Car-Jaune-Live** (public) sur GitHub, puis :
**Settings → Pages → Source : Deploy from a branch → main / (root) → Save**.

L'appli sera en ligne sur : `https://svperman.github.io/Car-Jaune-Live/`

> Option : pour ne pas avoir à coller l'adresse au premier lancement, mets ton URL `/exec`
> dans `index.html` : `const API_URL = 'https://script.google.com/macros/s/…/exec';`

## 3. L'installer sur le téléphone

- **Android (Chrome)** : ouvre le lien → menu ⋮ → **Installer l'application**
  (ou bouton « 📲 Installer l'appli » en bas de page).
- **iPhone (Safari)** : ouvre le lien → bouton Partager → **Sur l'écran d'accueil**.
- **APK Android** (comme Carburant) : sur <https://www.pwabuilder.com>, colle l'adresse GitHub Pages
  → *Package for stores* → **Android** → télécharge l'APK.

Au premier lancement, colle l'adresse `/exec` de l'étape 1 (bouton **⚙️ Serveur** pour la changer).

## Notifications

1. **Installe l'appli** (iPhone : Safari → Partager → *Sur l'écran d'accueil* ; iOS 16.4 minimum).
2. Ouvre-la **depuis son icône**, onglet *Horaires à l'arrêt* → **🔔 Activer les notifications** → *Autoriser*.
   Une notification de test arrive tout de suite. La cloche 🔔 en haut indique l'état.
3. Active une alerte (un arrêt ou *Mon trajet*) : tu es prévenu avant chaque car, selon ta position.

- Les alertes tournent **tant que l'appli est ouverte** (même en arrière-plan quelques minutes ; l'écran reste allumé pendant les alertes).
- Pour les recevoir appli fermée : option **ntfy** (appli gratuite, sans compte).
- Si refusées : iPhone → Réglages → Notifications → Car Jaune ; Android → paramètres du site → Notifications.


## Nouveautés (réglages uniques)

- **Test avant publication** : chaque modification est testée par GitHub (téléphone + ordinateur) avant d'être mise en ligne.
  Réglage unique : **Settings → Pages → Source : « GitHub Actions »**. Résultats dans l'onglet **Actions**.
- **Alertes appli fermée** : ⚙️ → *Alertes appli fermée*. Ton serveur surveille ton car pendant tes créneaux
  et t'envoie la notification par l'appli **ntfy**. Une seule fois dans l'éditeur Apps Script :
  exécute **installPushTrigger** (autorisation du déclencheur).
- **Appli Android (APK)** : position partagée même appli fermée. Téléchargement :
  <https://github.com/Svperman/Car-Jaune-Live/releases/download/android/car-jaune.apk>
  (reconstruite par GitHub à chaque changement du dossier `android-app/`).

## Mettre à jour l'appli

Remplace `index.html`, puis dans `sw.js` change `const VERSION = 'cj-v1'` → `'cj-v2'`,
commit et push. Le téléphone prend la nouvelle version à la prochaine ouverture.
