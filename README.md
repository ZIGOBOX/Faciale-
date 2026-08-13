# Dashboard — agenda immédiat

Correction du planning du jour :

- `personalEvents` (Agenda personnel) est bien lu.
- La base locale `pilotage-service-technique-v25` est prioritaire sur le même navigateur.
- Un événement ajouté dans Pilotage est donc visible immédiatement dans le dashboard, sans attendre Supabase.
- Supabase est toujours interrogé toutes les 5 secondes pour la synchronisation distante.
- L'iframe Pilotage permet au cloud de remettre à jour la base locale si nécessaire.
- Le planning d'aujourd'hui n'est plus limité à 12 lignes : tous les événements du jour sont affichés.
- Planning du jour = meetings + personalEvents + interventions maintenance datées ou échues aujourd'hui.
