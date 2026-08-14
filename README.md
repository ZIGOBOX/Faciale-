# Dashboard Pilotage — V1.10.5

Build : 2026-08-14 16:05

Version vérifiée contre le ZIP Pilotage Service Technique V134.

Corrections V134 :
- lecture de `pst_offline_pending_v130` ;
- lecture de `pst_offline_mirror_v130` ;
- état vivant `PSTMainState` toujours prioritaire ;
- écoute de `pst:data-loaded` conservée ;
- planning aligné sur `eventsForDate()` V134 ;
- date OU échéance pour notes, maintenance, direction, chantiers et sécurité ;
- contrôles ménage ajoutés au planning ;
- préparations salle/café via `db.roomPreps` et heure café ;
- anciens caches V128 seulement en compatibilité de secours ;
- rappel poubelles conservé la veille.

Le dashboard reste en lecture seule : Pilotage V134 est seul responsable de la synchronisation Supabase.
