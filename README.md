# ZiGoBox — Liaison Pilotage Service Technique

Ce ZIP contient deux parties.

## 1. Nouveau GitHub
Les fichiers :
- `index.html`
- `style.css`
- `bridge.js`

peuvent être placés dans un nouveau dépôt GitHub Pages, par exemple :
`Pilotage-Remote`

La page permet d'envoyer :
- un message ;
- une alerte technique ;
- une demande d'intervention ;
- un statut incident résolu.

## 2. Connexion à ton Pilotage Service Technique actuel
Copie `pilotage-connector.js` dans le dépôt :
`service-Technique-2`

Puis ajoute juste avant `</body>` dans le `index.html` de ce dépôt :

```html
<script src="pilotage-connector.js"></script>
```

## Fonctionnement
Les deux pages étant sous `https://zigobox.github.io`, elles ont le même domaine navigateur.
Le système utilise :
- `BroadcastChannel` pour les échanges instantanés lorsque les deux pages sont ouvertes ;
- `localStorage` comme mémoire partagée et pour conserver le dernier message.

Aucun serveur ni base de données n'est nécessaire pour cette première version.

## Important
Cette communication est locale au navigateur/appareil utilisé.
Pour envoyer des informations d'un téléphone vers un PC différent, il faudra une base distante (par exemple Supabase ou Firebase).
