# Tableau de bord quotidien — connexion cloud fiable

Cette version ne dépend plus principalement de l'iframe ou du localStorage.

Elle utilise directement la même configuration Supabase que Pilotage Service Technique :
- configuration : `/service-Technique-2/supabase-config.js`
- authentification : session Supabase existante
- table : `app_state`
- sélection : ligne du `user_id` connecté
- champ lu : `data`
- actualisation : toutes les 5 secondes

Le localStorage `pilotage-service-technique-v25` sert uniquement de secours si le serveur est momentanément inaccessible.

Le tableau de bord indique maintenant clairement :
- `Connecté au Pilotage ✓`
- `Synchronisation…`
- `Mode local • serveur indisponible`
- `Données indisponibles`

Pour que la connexion cloud fonctionne, l'utilisateur doit être connecté au Pilotage Service Technique dans le même navigateur.
