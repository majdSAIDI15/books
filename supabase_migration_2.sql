-- =============================================================================
-- Migration 2 — corrections fonctionnelles
--
-- Ce fichier ne traite QUE ce qui empêche l'application de bien fonctionner.
-- (Le volet sécurité — politiques RLS, révocations — est dans
-- supabase_rls_roles.sql et n'est pas repris ici.)
--
-- À EXÉCUTER dans le SQL Editor de Supabase, d'un seul bloc.
-- =============================================================================


-- 1. Fonction de changement de rôle (bugs.md §2.9) ---------------------------
-- Le tableau de bord admin appelle `rpc('set_user_role')` : sans cette
-- fonction, le bouton « changer le rôle » échoue systématiquement.
--
-- L'`insert … on conflict` couvre la course de bugs.md §2.9 : juste après
-- `createUser`, la ligne `profiles` peut ne pas encore avoir été créée par le
-- trigger, et un simple `update` ne toucherait alors aucune ligne — sans que
-- Supabase considère cela comme une erreur. Le compte était créé avec le rôle
-- par défaut pendant que l'interface annonçait un succès.

create or replace function public.set_user_role(
  target_user_id uuid,
  new_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins integer;
begin
  if new_role not in ('admin', 'member') then
    raise exception 'دور غير صالح: %', new_role using errcode = '22023';
  end if;

  -- Un admin ne peut pas se rétrograder lui-même : il perdrait l'accès à la
  -- page sans aucun moyen de revenir en arrière depuis l'interface (§2.7).
  if target_user_id = auth.uid() and new_role <> 'admin' then
    raise exception 'لا يمكنك تغيير دورك الخاص' using errcode = '42501';
  end if;

  -- Ne jamais laisser le système sans administrateur.
  if new_role = 'member' then
    select count(*) into remaining_admins
    from public.profiles
    where role = 'admin' and id <> target_user_id;

    if remaining_admins = 0 then
      raise exception 'لا يمكن إزالة آخر مدير في النظام' using errcode = '23514';
    end if;
  end if;

  insert into public.profiles (id, role)
  values (target_user_id, new_role)
  on conflict (id) do update set role = excluded.role;
end;
$$;

grant execute on function public.set_user_role(uuid, text) to authenticated;


-- 2. Progression maximale distincte de la position (bugs.md §2.10) -----------
-- `last_page` = où le lecteur en est réellement (pour rouvrir au bon endroit).
-- `max_page`  = le plus loin qu'il ait atteint (pour le pourcentage lu).
-- Sans cette séparation, relire un chapitre antérieur faisait baisser la barre
-- de progression.

alter table public.reading_sessions
  add column if not exists max_page integer not null default 1;

-- Initialisation : jusqu'ici `last_page` contenait déjà le maximum atteint.
update public.reading_sessions
set max_page = greatest(coalesce(max_page, 1), coalesce(last_page, 1));


-- 3. Vignette de couverture (première page du PDF) --------------------------
-- Générée une fois par l'admin à l'upload et stockée dans le bucket `books`.
-- Sans cette colonne, chaque membre téléchargeait le début de CHAQUE PDF à
-- l'ouverture de la bibliothèque pour fabriquer la vignette dans son navigateur.

alter table public.books
  add column if not exists cover_url text;


-- 4. Coordonnées des surlignages (bugs.md §2.11) ----------------------------
-- Le surlignage est restauré en cherchant `selected_text` dans la couche texte.
-- Si le même passage apparaît plusieurs fois sur une page, impossible de savoir
-- lequel avait été sélectionné : on surligne la première occurrence.
-- `match_index` lève cette ambiguïté (0 = première occurrence).

alter table public.annotations
  add column if not exists match_index integer not null default 0;


-- 5. Marque-pages : table dédiée --------------------------------------------
-- Ils étaient jusqu'ici stockés dans `annotations` avec un `selected_text` vide,
-- faute de pouvoir créer une table. Cette convention fonctionne mais mélange
-- deux notions distinctes.

create table if not exists public.bookmarks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  page_number integer not null,
  label text,
  created_at timestamptz default now(),
  unique (user_id, book_id, page_number)
);

alter table public.bookmarks enable row level security;

drop policy if exists "Own bookmarks" on public.bookmarks;
create policy "Own bookmarks" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists bookmarks_user_book_idx
  on public.bookmarks (user_id, book_id, page_number);

-- Reprise des marque-pages déjà créés via l'ancienne convention.
insert into public.bookmarks (user_id, book_id, page_number, label, created_at)
select user_id, book_id, page_number, comment, created_at
from public.annotations
where coalesce(trim(selected_text), '') = ''
on conflict (user_id, book_id, page_number) do nothing;

delete from public.annotations
where coalesce(trim(selected_text), '') = '';


-- 6. `updated_at` géré par la base (bugs.md §5.5) ---------------------------
-- Il était écrit depuis le navigateur : une horloge cliente décalée faussait le
-- tri qui détermine le « livre en cours » d'un membre dans le tableau de bord.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reading_sessions_touch on public.reading_sessions;
create trigger reading_sessions_touch
  before insert or update on public.reading_sessions
  for each row execute function public.touch_updated_at();

drop trigger if exists book_notes_touch on public.book_notes;
create trigger book_notes_touch
  before insert or update on public.book_notes
  for each row execute function public.touch_updated_at();


-- 7. Index de performance (bugs.md §5.2) ------------------------------------

create index if not exists annotations_user_book_idx
  on public.annotations (user_id, book_id, page_number);

create index if not exists daily_logs_user_date_idx
  on public.daily_logs (user_id, date);
