# Suivi des agents — collecte automatique réelle

Cette version a été construite à partir des fichiers source de Pilotage Service Technique V121.

## Source réelle
La base principale utilise exactement la clé :
`pilotage-service-technique-v25`

Le dashboard est conçu pour être publié sous le même domaine GitHub Pages :
- Pilotage : `https://zigobox.github.io/service-Technique-2/`
- Dashboard conseillé : `https://zigobox.github.io/suivi-agents/`

## Pourquoi cette version est plus fiable
Le dashboard charge Pilotage Service Technique dans une iframe invisible, autorisée car les deux pages sont sur `zigobox.github.io`.
Il récupère directement les KPI déjà calculés par l'application d'origine :
- Agents actifs / présents
- Actions urgentes / retards
- Interventions ouvertes / à faire
- Conformité ménage / points faibles
- Contrôles périodiques en retard / bientôt
- Notes actives / échéances proches

Les listes utilisent les vrais tableaux de la base V121 :
`agents`, `agentDays`, `maintenance`, `issues`, `requests`, `works`, `notes`, `personalEvents`, `meetings`, `periodic`.

Le tableau de bord relit les données toutes les 5 secondes et écoute aussi les changements de localStorage.

## Installation
Créer un dépôt `suivi-agents`, placer `index.html`, `style.css`, `dashboard.js` à la racine et activer GitHub Pages.
