-- SQL commands to create annotations and book_notes tables, plus RLS policies.
-- Execute these in your Supabase SQL Editor.

create table if not exists public.annotations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  page_number integer not null,
  selected_text text not null,
  color text default 'yellow' check (color in ('yellow', 'blue', 'red', 'green')),
  comment text,
  created_at timestamptz default now()
);

create table if not exists public.book_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  content text default '',
  updated_at timestamptz default now(),
  unique(user_id, book_id)
);

alter table public.annotations enable row level security;
alter table public.book_notes enable row level security;

create policy "Own annotations" on public.annotations
  for all using (auth.uid() = user_id);

create policy "Own notes" on public.book_notes
  for all using (auth.uid() = user_id);
