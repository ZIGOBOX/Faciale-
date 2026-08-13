# Dashboard — Agenda fusion exacte

Correction spécifique de l'Agenda personnel :

- fusion de `personalEvents` local + Supabase par ID ;
- un nouvel événement non encore synchronisé au cloud est donc conservé ;
- un événement déjà dans le cloud est aussi récupéré même si le local est ancien ;
- le planning affiche TOUS les `meetings` et `personalEvents` dont la date est aujourd'hui ;
- aucun filtre de statut n'est appliqué à l'agenda, conformément au rapport quotidien de Pilotage ;
- le pied de page indique le nombre d'événements Agenda personnel détectés aujourd'hui ;
- actualisation toutes les 5 secondes.

Les interventions du jour restent : maintenance dont date = aujourd'hui ou échéance = aujourd'hui.
