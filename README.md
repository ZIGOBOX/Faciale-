# Dashboard Pilotage — V1.10.0

Build : 2026-08-14 11:58

Cette version est raccordée spécifiquement à Pilotage Service Technique V128.

Corrections importantes :
- lecture directe de `window.PSTMainState.get()` dans l'iframe Pilotage ;
- prise en charge du miroir V128 `pst_offline_mirror_v128` ;
- prise en charge du cache hors ligne `pst_offline_pending_v128` ;
- `roomPreps` lu directement dans la base V128 ;
- Planning d'aujourd'hui basé directement sur la vraie fonction `eventsForDate()` de Pilotage V128 quand elle est disponible ;
- mise à jour visuelle toutes les 1 seconde ;
- synchronisation Supabase toujours toutes les 5 secondes ;
- rappel poubelles conservé la veille selon ton choix.

Tout le reste de la V1.9.5 est conservé : urgences, Top 5 sélectionnable, présence, contrôles, maintenance, ménage, graphiques et boîte à liens.
