# Dashboard — café / préparation salle corrigé

Cause trouvée :
Pilotage ne stocke pas « Préparation salle & café » dans `personalEvents`.
Ces éléments sont stockés séparément dans :
`pst_room_preps_v106`

Le dashboard lit maintenant :
- Agenda personnel (`personalEvents`)
- Réunions / rendez-vous (`meetings`)
- Préparation salle & café (`pst_room_preps_v106`)
- Maintenance du jour / échéance du jour
- Demandes direction à échéance
- Chantiers / GPA à échéance
- Sécurité / qualité à échéance
- Contrôles périodiques du jour

Le pied de page indique séparément le nombre d'événements agenda et de préparations salle/café détectés aujourd'hui.
