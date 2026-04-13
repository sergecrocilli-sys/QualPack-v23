-- ================================================================
-- QualPack V19.7 — Configuration Supabase
-- À exécuter dans SQL Editor de votre projet Supabase
-- ================================================================

-- Désactiver RLS sur les tables utilisées par l'app sans authentification
ALTER TABLE IF EXISTS public.clients    DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.produits   DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.operateurs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pesees     DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.detecteurs DISABLE ROW LEVEL SECURITY;

-- Table de référence des lignes de production
CREATE TABLE IF NOT EXISTS public.lignes (
  id text PRIMARY KEY,
  nom text NOT NULL,
  detecteur_defaut text NULL
);

ALTER TABLE IF EXISTS public.lignes DISABLE ROW LEVEL SECURITY;

-- Unicité logique d'une ligne par son nom
CREATE UNIQUE INDEX IF NOT EXISTS idx_lignes_nom_unique ON public.lignes (nom);

-- Contrôle recommandé pour éviter les doublons produits d'un même client
CREATE UNIQUE INDEX IF NOT EXISTS idx_produits_client_nom_unique ON public.produits (client_id, nom);

-- Vérification
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
