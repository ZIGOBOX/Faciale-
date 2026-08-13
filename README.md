# Suivi des agents — Connexion réelle à Pilotage Service Technique

Cette version ne dépend plus d'un faux canal de messages.

Elle analyse directement les données JSON stockées dans `localStorage` par :
https://zigobox.github.io/service-Technique-2/

Comme le nouveau dashboard sera lui aussi sous `https://zigobox.github.io/...`, le navigateur autorise l'accès au même stockage d'origine.

## Dépôt conseillé
`suivi-agents`

URL :
https://zigobox.github.io/suivi-agents/

## Fonctionnement
Le dashboard recherche automatiquement dans la base locale les jeux de données correspondant à :
- agents ;
- interventions ;
- absences / congés / RTT ;
- rendez-vous ;
- contrôles périodiques ;
- notes ;
- sécurité / problématiques.

Le fichier affiche aussi une rubrique « Dernières données détectées » pour vérifier à quelles structures de la base il s'est connecté.

## Important
Ouvre d'abord Pilotage Service Technique sur le même navigateur et connecte-toi normalement, puis ouvre Suivi des agents.
