# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server
npm run build    # production build
npm run lint     # eslint (flat config, eslint.config.js)
npm run preview  # serve the built bundle
```

There is no test suite and no test runner configured.

## What this is

An Arabic (RTL) reading-tracker web app: admins upload PDF books and manage member accounts; members read PDFs in-browser while their page progress, daily page counts, highlights, and notes sync to Supabase. Deployed on Vercel ([vercel.json](vercel.json) rewrites everything to `/index.html` for client-side routing).

Stack: React 19 + Vite + React Router 7 + Tailwind + Supabase (auth, Postgres, storage) + react-pdf + OneSignal web push. No TypeScript.

## Architecture

**Auth and roles.** [src/context/AuthContext.jsx](src/context/AuthContext.jsx) holds `user` (Supabase auth user) and `profile` (row from `profiles`, which carries `role`: `'admin' | 'member'`). It exposes `setUser`/`setProfile`/`setLoading` deliberately so [Login.jsx](src/pages/Login.jsx) can populate state and hard-redirect (`window.location.href`) immediately after sign-in rather than waiting for `onAuthStateChange` — the login redirect has been a repeat source of bugs (see git history), so change that flow carefully.

[ProtectedRoute.jsx](src/components/ProtectedRoute.jsx) gates by `requiredRole` and includes a 3-second `window.location.reload()` watchdog if `loading` never resolves.

**Two Supabase clients** ([src/lib/supabase.js](src/lib/supabase.js)): `supabase` (anon key, all normal reads/writes, subject to RLS) and `supabaseAdmin` (service-role key, `null` when `VITE_SUPABASE_SERVICE_ROLE_KEY` is unset). Only [AdminDashboard.jsx](src/pages/AdminDashboard.jsx) uses `supabaseAdmin`, for `auth.admin.createUser/updateUserById/deleteUser/listUsers`; it degrades gracefully — code must keep null-checking it and disabling those UI controls.

**Data model** (tables referenced from code; [supabase_schema.sql](supabase_schema.sql) only covers the two newest):
- `profiles` — id (= auth user id), name, role
- `books` — title, `pdf_url` (public URL in the `books` storage bucket), `total_pages`
- `reading_sessions` — unique `(user_id, book_id)`, `last_page`
- `daily_logs` — unique `(user_id, book_id, date)`, `pages_read`
- `annotations` — highlight color + optional comment, per `page_number`
- `book_notes` — unique `(user_id, book_id)`, free-text `content`

All writes to these use `upsert` with the matching `onConflict` string. `pages_read` is written as `Math.max(alreadyReadToday, maxPageReached)`, and `date` comes from `getLocalDateStr()` (timezone-shifted local date, not UTC) — keep both conventions when touching progress logic.

**PDF reader** ([src/pages/PDFReader.jsx](src/pages/PDFReader.jsx), the most delicate file). All pages render in one scroll column; only pages within ±3 of `currentPage` mount a real `<Page>`, the rest are fixed-height placeholders sized `pageWidth * 1.414`. An `IntersectionObserver` on `.page-wrapper` elements drives `currentPage`. pdf.js worker is loaded from unpkg CDN.

Progress saving is three-layered and intentionally redundant: a 3s debounce, an unmount cleanup effect, and a `beforeunload` handler that posts to the Supabase REST endpoint directly with `fetch(..., { keepalive: true })`. Notes autosave on a 3s debounce plus unmount.

Highlights are **not** stored as coordinates. They are re-applied by string-matching `selected_text` against spans in react-pdf's rendered text layer and rewriting `span.innerHTML` with a `<mark class="custom-pdf-highlight">`. This is why `renderTextLayer` must stay `true` and why re-highlighting is triggered on render/annotation-load with small `setTimeout` delays.

## Conventions

- All user-facing copy is Arabic; the document is `dir="rtl"` and layouts use `space-x-reverse`, `pr-*`/right-anchored icons. New UI must follow.
- Style via the Tailwind theme tokens in [tailwind.config.js](tailwind.config.js) (`primary`, `bgMain`, `textPrimary`, `textSecondary`, `cardBorder`, `danger`, `rounded-custom`, `font-arabic`) rather than raw hex — though some older files still hardcode hex.
- Every `VITE_*` env var is exposed to the browser bundle, including the service-role key when set. It is in `.env` and gitignored; treat `supabaseAdmin` as an admin-convenience feature, not a security boundary — RLS is what actually protects data.
