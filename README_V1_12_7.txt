DASHBOARD V1.12.7 — INTERVENTIONS OUVERTES NATIVE

Correction forte :
- la case INTERVENTIONS OUVERTES est maintenant écrite directement dans le HTML ;
- elle fait partie des cases normales du drag & drop ;
- elle apparaît dans le dashboard dès le chargement ;
- elle peut être déplacée, redimensionnée, masquée/restaurée comme les autres cases ;
- elle utilise exactement `db.maintenance` et `isClosedStatus()`, donc la même logique que le compteur du dashboard ;
- elle affiche toutes les interventions non clôturées / non terminées selon la règle existante du dashboard.

La synchronisation Pilotage V134 n'est pas modifiée.
