QualPack V20_2 — Correctifs bugfix
====================================
Date : Avril 2026

CORRECTIONS APPORTÉES
----------------------

1. [DASHBOARD] Rapport PDF V2 — Génération bloquée
   Fichier : pdf-v2.js
   Cause   : Des apostrophes typographiques courbes (unicode U+2019) à l'intérieur
             de chaînes JS délimitées par des apostrophes droites (') provoquaient
             une erreur de parsing silencieuse empêchant toute exécution de
             generatePDFV2().
   Corrigé : Remplacement par des guillemets doubles sur les lignes problématiques.

2. [DASHBOARD] Rapport PDF V2 — Détection librairie jsPDF
   Fichier : pdf-v2.js
   Cause   : La vérification `typeof window.jspdf === 'undefined'` pouvait échouer
             si la librairie s'attachait différemment selon le navigateur ou le
             mode de chargement asynchrone.
   Corrigé : Détection multi-mécanisme : window.jspdf || jsPDF direct.

3. [HISTORIQUE] Export Excel — "Erreur export Excel"
   Fichiers : index.html (genExcel, genExcelPesee, genExcelDet)
   Cause   : `typeof XLSX === 'undefined'` échouait car la librairie s'attachait
             à `window.XLSX` (et non à une variable globale nue) lors du
             chargement asynchrone depuis le CDN ou les libs locales.
             De plus, genExcel() utilisait des appels IndexedDB directs au lieu
             des helpers déjà disponibles.
   Corrigé : Résolution robuste `window.XLSX || XLSX` dans les 3 fonctions.
             genExcel() utilise désormais getAllPesees() / getAllDetecteurs().

4. [HISTORIQUE] Synchronisation — "Erreur de synchronisation"
   Fichier : index.html (manualSync)
   Cause   : Le catch global n'interceptait pas correctement les erreurs réseau
             de syncPending(), affichant un message générique peu informatif.
   Corrigé : Gestion d'erreur à deux niveaux :
             - Erreur réseau/fetch → "Serveur inaccessible — données conservées localement"
             - Autre erreur       → Message précis avec détail de l'exception
             Les données locales ne sont jamais perdues.

FICHIERS MODIFIÉS
-----------------
- pdf-v2.js    : corrections 1 et 2
- index.html   : corrections 3 et 4

FICHIERS INCHANGÉS
------------------
- db.js, sync.js, lignes.js, sw.js, manifest.json
- Tous les assets, icônes, librairies

COMPATIBILITÉ
-------------
Cette version est un remplacement direct de QualPack_V20.
Aucune migration de données ni mise à jour Supabase requise.
