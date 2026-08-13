# Tableau de bord quotidien — raccordements exacts

Cette version reprend les règles métier du vrai `app.js` de Pilotage Service Technique.

Raccordements :
- Présence agents : agents actifs + `dayInfo()` reconstruit depuis weeklyPlans, rotations, rotationExceptions et agentDays.
- Actions urgentes : issues + maintenance + requests + works + notes + personalEvents + reportNonconformities non déjà liées.
- Retards : issues + maintenance + requests + works + notes avec échéance dépassée.
- Interventions ouvertes : maintenance non clôturée.
- À faire : statuts À qualifier / À faire / Planifié.
- Conformité ménage : contrôles des 30 derniers jours, overallStatus conforme et tâches faibles.
- Contrôles périodiques : `nextDate` ou calcul `lastDate + intervalMonths`, En retard / Bientôt / À jour.
- Planning d'aujourd'hui : équipe du jour via dayInfo + meetings + personalEvents du jour + maintenance dont date ou échéance = aujourd'hui.
- Charge par domaine : maintenance ouverte groupée par `family`.
- Graphiques : calculés uniquement à partir de ces mêmes données réelles, aucune valeur fictive.

Source cloud :
- Supabase `app_state`
- utilisateur de la session connectée
- rafraîchissement toutes les 5 secondes
- localStorage uniquement en secours
