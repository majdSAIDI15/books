-- =============================================================================
-- Protection de la colonne profiles.role  (corrige bugs.md §1.4)
--
-- Problème : l'application modifiait profiles.role via le client `anon`.
-- Si la politique RLS de profiles autorise un utilisateur à modifier sa propre
-- ligne (formulation la plus courante), alors n'importe quel membre pouvait se
-- promouvoir administrateur depuis la console du navigateur :
--
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', <son id>)
--
-- ProtectedRoute ne protège que l'affichage ; il n'existait aucune barrière
-- côté serveur.
--
-- À EXÉCUTER dans le SQL Editor de Supabase.
-- =============================================================================


-- 1. Vérifier l'état actuel (à lire avant d'appliquer la suite) --------------
--
--   select * from pg_policies where schemaname = 'public' and tablename = 'profiles';
--
-- Si une politique UPDATE existe avec `using (auth.uid() = id)` sans restriction
-- de colonne, la faille est active.


-- 2. Interdire toute écriture directe de la colonne role ---------------------
-- Les utilisateurs gardent le droit de modifier leur nom, mais plus leur rôle.

revoke update (role) on public.profiles from authenticated;
revoke update (role) on public.profiles from anon;


-- 3. Fonction serveur autorisée à écrire le rôle -----------------------------
-- SECURITY DEFINER : s'exécute avec les droits du propriétaire, donc contourne
-- le revoke ci-dessus — mais uniquement après avoir revérifié que l'appelant
-- est réellement administrateur, côté serveur, à partir de auth.uid().

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
  caller_role text;
  remaining_admins integer;
begin
  -- L'appelant doit être authentifié et administrateur.
  select role into caller_role from public.profiles where id = auth.uid();

  if caller_role is distinct from 'admin' then
    raise exception 'ليست لديك صلاحية تغيير الأدوار'
      using errcode = '42501';
  end if;

  if new_role not in ('admin', 'member') then
    raise exception 'دور غير صالح: %', new_role
      using errcode = '22023';
  end if;

  -- Un admin ne peut pas se rétrograder lui-même (il perdrait l'accès).
  if target_user_id = auth.uid() and new_role <> 'admin' then
    raise exception 'لا يمكنك تغيير دورك الخاص'
      using errcode = '42501';
  end if;

  -- Ne jamais laisser le système sans aucun administrateur.
  if new_role = 'member' then
    select count(*) into remaining_admins
    from public.profiles
    where role = 'admin' and id <> target_user_id;

    if remaining_admins = 0 then
      raise exception 'لا يمكن إزالة آخر مدير في النظام'
        using errcode = '23514';
    end if;
  end if;

  -- upsert : la ligne profiles peut ne pas encore exister juste après
  -- createUser (le trigger est asynchrone). Corrige aussi bugs.md §2.9.
  insert into public.profiles (id, role)
  values (target_user_id, new_role)
  on conflict (id) do update set role = excluded.role;
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;


-- 4. Empêcher un membre de modifier la table books ---------------------------
-- (corrige bugs.md §1.5 : le lecteur PDF écrivait books.total_pages avec la
-- session du membre. Cette écriture a été retirée du code client.)

alter table public.books enable row level security;

drop policy if exists "books lisibles par tous les connectés" on public.books;
create policy "books lisibles par tous les connectés" on public.books
  for select to authenticated using (true);

drop policy if exists "books modifiables par les admins" on public.books;
create policy "books modifiables par les admins" on public.books
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- 5. Index manquant sur annotations (corrige bugs.md §5.2) -------------------

create index if not exists annotations_user_book_idx
  on public.annotations (user_id, book_id, page_number);
