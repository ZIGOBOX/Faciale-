# Dashboard Pilotage — V1.10.4

Build : 2026-08-14 15:58

Correction majeure de synchronisation.

Le dashboard ne lance plus sa propre synchronisation Supabase.
Pilotage Service Technique V128 devient l'unique source de synchronisation.

Le dashboard :
- lit `PSTMainState` de Pilotage V128 ;
- écoute `pst:data-loaded` ;
- relit l'état vivant chaque seconde sans requête réseau ;
- utilise le miroir/pending V128 seulement en secours ;
- n'envoie aucune donnée au cloud.

Conservé :
- Aujourd'hui / Semaine ;
- scroll du planning ;
- heures début / fin ;
- poubelles la veille ;
- Top 5 urgences sélectionnable ;
- présence temps réel ;
- maintenance, contrôles, ménage, graphiques ;
- boîte à liens personnalisés.
