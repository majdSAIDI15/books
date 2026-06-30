-- SQL commands to create annotations and book_notes tables, plus RLS policies.
-- Execute these in your Supabase SQL Editor.

-- 1. Create public.annotations table
create table if not exists public.annotations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  page_number integer not null,
  selected_text text not null,
  color text default 'yellow',
  comment text,
  created_at timestamptz default now()
);

-- Enable RLS on annotations
alter table public.annotations enable row level security;

-- Create policies for annotations
create policy "Users can view their own annotations"
  on public.annotations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own annotations"
  on public.annotations for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own annotations"
  on public.annotations for update
  using (auth.uid() = user_id);

create policy "Users can delete their own annotations"
  on public.annotations for delete
  using (auth.uid() = user_id);


-- 2. Create public.book_notes table
create table if not exists public.book_notes (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  book_id uuid references public.books(id) on delete cascade,
  content text,
  updated_at timestamptz default now(),
  unique(user_id, book_id)
);

-- Enable RLS on book_notes
alter table public.book_notes enable row level security;

-- Create policies for book_notes
create policy "Users can view their own book notes"
  on public.book_notes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own book notes"
  on public.book_notes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own book notes"
  on public.book_notes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own book notes"
  on public.book_notes for delete
  using (auth.uid() = user_id);
