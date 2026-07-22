-- =============================================================================
-- Migration 5 — Défis / programmes de lecture (التحديات / البرامج)
--
-- Un défi impose un RYTHME (objectif) sur un PÉRIMÈTRE de livres (portée), pendant
-- une PÉRIODE, avec un prix optionnel. Les membres s'y inscrivent ; la progression
-- est CALCULÉE à partir des données déjà suivies (daily_logs / reading_sessions),
-- sans double-saisie.
--
-- Choix de conception :
--   - Créés par l'ADMIN uniquement (comme les livres).
--   - Chaque niveau (5 p/j, 20 p/j…) est un défi séparé (pas de sous-niveaux).
--   - 4 types d'objectif ; l'admin choisit au cas par cas.
--
-- À EXÉCUTER dans le SQL Editor de Supabase.
-- =============================================================================

-- Petit helper : l'appelant est-il admin ? SECURITY DEFINER pour lire profiles
-- sans être bloqué par sa propre RLS. Réutilisé par toutes les policies ci-dessous.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

grant execute on function public.is_admin() to authenticated;

-- ── Table des défis ─────────────────────────────────────────────────────────
create table if not exists public.challenges (
  id uuid default gen_random_uuid() primary key,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,

  -- Portée : tout livre / une catégorie / une liste de livres précis.
  scope_type text not null default 'general'
    check (scope_type in ('general', 'category', 'books')),
  category text,                       -- utilisé si scope_type = 'category'

  -- Objectif (le rythme imposé).
  goal_type text not null
    check (goal_type in ('daily_pages', 'total_pages', 'finish_books', 'finish_specific')),
  goal_value integer,                  -- pages/jour, total pages, ou nb de livres ; null pour finish_specific

  -- Métrique de classement / gagnant.
  rank_metric text not null default 'books_finished'
    check (rank_metric in ('books_finished', 'pages_in_scope')),

  start_date date not null,
  end_date date not null,
  prize text,
  is_published boolean not null default true,
  created_at timestamptz default now(),

  constraint challenges_dates check (end_date >= start_date)
);

-- Livres précis attachés à un défi (scope_type='books' et/ou goal_type='finish_specific').
create table if not exists public.challenge_books (
  challenge_id uuid references public.challenges(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  primary key (challenge_id, book_id)
);

-- Inscriptions des membres.
create table if not exists public.challenge_enrollments (
  id uuid default gen_random_uuid() primary key,
  challenge_id uuid references public.challenges(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  enrolled_at timestamptz default now(),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  unique (challenge_id, user_id)
);

create index if not exists challenge_enrollments_user_idx
  on public.challenge_enrollments (user_id);
create index if not exists challenge_books_challenge_idx
  on public.challenge_books (challenge_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.challenges enable row level security;
alter table public.challenge_books enable row level security;
alter table public.challenge_enrollments enable row level security;

-- Défis : lecture des publiés par tout membre connecté ; écriture réservée admin.
drop policy if exists "challenges read" on public.challenges;
create policy "challenges read" on public.challenges
  for select using (is_published or public.is_admin());

drop policy if exists "challenges admin write" on public.challenges;
create policy "challenges admin write" on public.challenges
  for all using (public.is_admin()) with check (public.is_admin());

-- Livres d'un défi : lecture pour tous les connectés ; écriture admin.
drop policy if exists "challenge_books read" on public.challenge_books;
create policy "challenge_books read" on public.challenge_books
  for select using (auth.uid() is not null);

drop policy if exists "challenge_books admin write" on public.challenge_books;
create policy "challenge_books admin write" on public.challenge_books
  for all using (public.is_admin()) with check (public.is_admin());

-- Inscriptions : lisibles par tous les connectés (pour le classement / le nombre
-- de participants) ; un membre ne gère QUE ses propres inscriptions, l'admin toutes.
drop policy if exists "enroll read" on public.challenge_enrollments;
create policy "enroll read" on public.challenge_enrollments
  for select using (auth.uid() is not null);

drop policy if exists "enroll insert own" on public.challenge_enrollments;
create policy "enroll insert own" on public.challenge_enrollments
  for insert with check (user_id = auth.uid());

drop policy if exists "enroll update own or admin" on public.challenge_enrollments;
create policy "enroll update own or admin" on public.challenge_enrollments
  for update using (user_id = auth.uid() or public.is_admin());

drop policy if exists "enroll delete own or admin" on public.challenge_enrollments;
create policy "enroll delete own or admin" on public.challenge_enrollments
  for delete using (user_id = auth.uid() or public.is_admin());

-- ── Classement ──────────────────────────────────────────────────────────────
-- Le classement doit lire les données de lecture des AUTRES membres (daily_logs,
-- reading_sessions), que leur RLS protège. On passe donc par une fonction
-- SECURITY DEFINER qui ne renvoie que des AGRÉGATS (pages lues, livres terminés)
-- pour les inscrits du défi — jamais les lignes brutes.
--
--   pages_in_scope : somme des pages lues dans le périmètre, sur la période.
--   books_finished : livres du périmètre terminés (page max ≥ total), dont la
--                    session a été mise à jour avant la fin de période (approx.
--                    de « terminé pendant le défi », faute d'horodatage de fin).
create or replace function public.challenge_leaderboard(p_challenge_id uuid)
returns table (
  user_id uuid,
  name text,
  pages_in_scope bigint,
  books_finished bigint
)
language sql
security definer
stable
set search_path = public
as $$
  with ch as (
    select * from public.challenges where id = p_challenge_id
  ),
  scope_books as (
    select b.id, b.total_pages
    from public.books b, ch
    where ch.scope_type = 'general'
       or (ch.scope_type = 'category' and b.category = ch.category)
       or (ch.scope_type = 'books'
           and b.id in (select book_id from public.challenge_books where challenge_id = ch.id))
  )
  select
    e.user_id,
    pr.name,
    coalesce((
      select sum(dl.pages_read)::bigint
      from public.daily_logs dl, ch
      where dl.user_id = e.user_id
        and dl.book_id in (select id from scope_books)
        and dl.date between ch.start_date and ch.end_date
    ), 0) as pages_in_scope,
    coalesce((
      select count(*)::bigint
      from public.reading_sessions rs
      join scope_books sb on sb.id = rs.book_id, ch
      where rs.user_id = e.user_id
        and sb.total_pages > 0
        and greatest(coalesce(rs.max_page, 0), coalesce(rs.last_page, 0)) >= sb.total_pages
        and rs.updated_at::date <= ch.end_date
    ), 0) as books_finished
  from public.challenge_enrollments e
  join public.profiles pr on pr.id = e.user_id
  where e.challenge_id = p_challenge_id;
$$;

grant execute on function public.challenge_leaderboard(uuid) to authenticated;
