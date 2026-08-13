# Dashboard Pilotage — V1.9.0

Build : 2026-08-13 21:21

Cette version conserve tous les raccordements existants :
- urgences ;
- retards ;
- interventions ouvertes ;
- contrôles périodiques ;
- conformité ménage ;
- présence agents en temps réel ;
- charge de travail ;
- graphiques ;
- synchronisation toutes les 5 secondes.

Seul le bloc « Planning d'aujourd'hui » a été remplacé pour recopier la logique du vrai `eventsForDate()` de Pilotage :
- Agenda personnel
- Réunions / rendez-vous
- Notes à échéance
- Maintenance à échéance
- Demandes direction à échéance
- Chantiers / GPA à échéance
- Sécurité / qualité à échéance
- Contrôles périodiques
- Préparation salle & café (`pst_room_preps_v106`)
- Vacances / fermetures

Le module poubelles n'est pas inventé s'il n'est pas exposé au dashboard.

Version visible en bas : V1.9.0
