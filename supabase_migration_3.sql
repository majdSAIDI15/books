-- =============================================================================
-- Migration 3 — surlignage « marqueur » (zones libres)
--
-- Le surlignage existant s'accroche au TEXTE : on sélectionne des mots, ils se
-- colorent. Ici on ajoute le geste du marqueur papier : on trace une zone sur la
-- page et elle se colore, quel que soit son contenu (texte, schéma, image).
--
-- Les coordonnées sont NORMALISÉES (0 → 1, en fraction de la largeur et de la
-- hauteur de la page). Elles restent donc valables quels que soient la taille de
-- l'écran, le zoom ou la densité de pixels — contrairement à des pixels bruts,
-- qui ne vaudraient que pour la fenêtre où le trait a été fait.
--
-- À EXÉCUTER dans le SQL Editor de Supabase.
-- =============================================================================

create table if not exists public.page_highlights (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  page_number integer not null,

  -- Coin supérieur gauche + dimensions, en fraction de la page.
  x real not null,
  y real not null,
  w real not null,
  h real not null,

  color text default 'yellow' check (color in ('yellow', 'blue', 'red', 'green')),
  created_at timestamptz default now(),

  constraint page_highlights_bounds check (
    x >= 0 and y >= 0 and w > 0 and h > 0 and x + w <= 1.001 and y + h <= 1.001
  )
);

alter table public.page_highlights enable row level security;

drop policy if exists "Own page highlights" on public.page_highlights;
create policy "Own page highlights" on public.page_highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists page_highlights_user_book_idx
  on public.page_highlights (user_id, book_id, page_number);
