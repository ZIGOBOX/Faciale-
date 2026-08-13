# Suivi des agents — Version connectée

Cette version est prévue pour fonctionner avec :
https://zigobox.github.io/service-Technique-2/

Elle lit automatiquement les données partagées par le site Pilotage via :
- `BroadcastChannel`
- `localStorage`
- `zigobox_pilotage_event`
- `zigobox_pilotage_log`
- `zigobox_pilotage_inbox`

## URL conseillée
Crée un dépôt GitHub :
`suivi-agents`

URL :
https://zigobox.github.io/suivi-agents/

## Important
Les deux sites doivent rester sous le même domaine :
`https://zigobox.github.io/...`

La connexion est alors automatique dans le même navigateur.

## Ce qui remonte automatiquement
- dernier événement ;
- alertes ;
- demandes d'intervention ;
- incidents résolus ;
- messages INFO ;
- compteurs du tableau de bord.

La présence des agents est mémorisée localement dans le tableau de bord.
