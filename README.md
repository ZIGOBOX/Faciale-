# ZiGoBox — Reconnaissance faciale + roue

Petit projet web statique prêt pour **GitHub Pages**.

## Fonctionnement

1. Ouvre la page.
2. Clique sur **Activer la caméra**.
3. Place une personne devant la caméra.
4. Clique sur **Enregistrer ce visage**.
5. Lorsque ce visage est reconnu de nouveau, la roue se déclenche automatiquement.
6. Les lots peuvent être modifiés depuis l'interface.

## Mise en ligne sur GitHub

1. Crée un nouveau dépôt GitHub, par exemple `zigobox-face-wheel`.
2. Décompresse le ZIP.
3. Envoie `index.html`, `style.css`, `app.js` et ce fichier `README.md` à la racine du dépôt.
4. Dans GitHub : **Settings → Pages**.
5. Choisis **Deploy from a branch**.
6. Branche : `main`, dossier : `/root`.
7. Enregistre.
8. GitHub fournit ensuite une adresse du type :
   `https://TON-COMPTE.github.io/zigobox-face-wheel/`

## Important

- La caméra fonctionne uniquement sur une page sécurisée **HTTPS** ou en localhost.
- GitHub Pages utilise HTTPS, donc c'est compatible.
- Le visage enregistré est stocké dans `localStorage` du navigateur, sous forme de vecteur numérique.
- Les données ne sont pas envoyées à un serveur par ce projet.
- La bibliothèque IA `@vladmandic/human` est chargée depuis un CDN et nécessite donc Internet au premier chargement.
- Pour un usage professionnel/public, prévois un écran d'information et le consentement approprié avant d'utiliser de la reconnaissance faciale.

## Réglage du seuil

Le curseur **Seuil de reconnaissance** règle la tolérance :

- plus haut = plus strict ;
- plus bas = plus permissif.

La valeur de départ `0.62` est volontairement prudente, mais elle peut devoir être ajustée selon la caméra et l'éclairage.

## Personnalisation ZiGoBox

Tu peux modifier :
- le logo/titre dans `index.html`;
- les couleurs dans `style.css`;
- les lots dans l'interface;
- le délai entre deux déclenchements;
- l'activation/désactivation du lancement automatique.
