Comparaison de stayId (CSV/JSON)
================================

Application locale (Node + UI sombre) pour importer deux fichiers CSV/JSON, extraire toutes les valeurs `stayId` de chacun, et afficher:
- Tableau des `stayId` du fichier 1
- Tableau des `stayId` du fichier 2
- Tableau de synthèse des `stayId` présents dans le fichier 1 mais absents du fichier 2 (uniques)

Formats acceptés
----------------
- JSON: un tableau d’objets, par exemple `{ "stayId": "452694166", ... }`
- CSV: soit une colonne `stayId`/`stayID`/`stay_id`, soit une colonne `json`/`payload`/`message` qui contient un JSON par ligne

Prérequis
---------
- Node.js 18+

Installation
------------
```bash
npm install
```

Lancement
--------
```bash
npm start
```
Ouvrir `http://localhost:3000` puis sélectionner vos deux fichiers et cliquer « Analyser ».

Notes
-----
- Le traitement se fait entièrement dans le navigateur (aucun upload serveur).
- Les tableaux affichent toutes les occurrences (y compris doublons) pour chaque fichier. La synthèse liste des `stayId` uniques du F1 qui ne figurent pas dans F2.

Structure
---------
- `src/server.js` — serveur Express statique
- `public/index.html` — UI d’import et résultats
- `public/styles.css` — thème sombre
- `public/app.js` — parsing et comparaison côté client
