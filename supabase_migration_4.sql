-- =============================================================================
-- Migration 4 — ملاحظة ancrée à une zone marqueur
--
-- Chaque zone marqueur (`page_highlights`, migration 3) porte déjà des
-- coordonnées normalisées : elle repère donc un endroit précis de la page. On y
-- attache ici une note libre, éditée depuis une popup au clic du bouton
-- « + ملاحظة » qui apparaît sous la zone.
--
-- La note reste facultative : une zone sans note est un simple surlignage, comme
-- avant. `null` = pas de note ; on n'utilise pas la chaîne vide pour distinguer
-- les deux côté application.
--
-- À EXÉCUTER dans le SQL Editor de Supabase.
-- =============================================================================

alter table public.page_highlights
  add column if not exists note text;
