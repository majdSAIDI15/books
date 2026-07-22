// Aides pour les défis de lecture (التحديات). La progression d'un membre est
// CALCULÉE ici, côté client, à partir de ses données déjà chargées
// (books / sessions / daily_logs) + la définition du défi. Aucune donnée
// supplémentaire n'est stockée : la vérité reste `daily_logs`/`reading_sessions`.
//
// Le CLASSEMENT (données des autres membres) passe par la RPC SECURITY DEFINER
// `challenge_leaderboard` — voir supabase_migration_5.sql.

// ── Libellés (arabe) ────────────────────────────────────────────────────────

export const SCOPE_LABELS = {
  general: 'كل الكتب',
  category: 'تصنيف معيّن',
  books: 'كتب محدّدة',
}

export const GOAL_LABELS = {
  daily_pages: 'صفحات يومياً',
  total_pages: 'إجمالي صفحات',
  finish_books: 'إنهاء عدد من الكتب',
  finish_specific: 'إنهاء كتب محدّدة',
}

export const RANK_LABELS = {
  books_finished: 'الأكثر إنهاءً للكتب',
  pages_in_scope: 'الأكثر قراءةً للصفحات',
}

/** Résumé lisible de l'objectif d'un défi, ex. « ٢٠ صفحة يومياً ». */
export function goalSummary(challenge) {
  const v = challenge.goal_value
  switch (challenge.goal_type) {
    case 'daily_pages': return `${v} صفحة يومياً`
    case 'total_pages': return `${v} صفحة خلال الفترة`
    case 'finish_books': return `إنهاء ${v} كتاب`
    case 'finish_specific': return 'إنهاء الكتب المحدّدة'
    default: return ''
  }
}

/** Résumé lisible de la portée, ex. « تصنيف: تاريخ ». */
export function scopeSummary(challenge) {
  switch (challenge.scope_type) {
    case 'category': return `تصنيف: ${challenge.category || '—'}`
    case 'books': return 'كتب محدّدة'
    default: return 'كل الكتب'
  }
}

// ── Dates ───────────────────────────────────────────────────────────────────
// Les dates sont des chaînes 'YYYY-MM-DD' comparables lexicographiquement.

const MS_DAY = 86400000
const dayCount = (from, to) => Math.floor((Date.parse(to) - Date.parse(from)) / MS_DAY) + 1

/** 'upcoming' avant le début · 'active' pendant · 'ended' après la fin. */
export function challengeStatus(challenge, todayStr) {
  if (todayStr < challenge.start_date) return 'upcoming'
  if (todayStr > challenge.end_date) return 'ended'
  return 'active'
}

export const STATUS_LABELS = {
  upcoming: 'لم يبدأ بعد',
  active: 'جارٍ',
  ended: 'انتهى',
}

/** Jours restants jusqu'à la fin (0 si terminé). */
export function daysRemaining(challenge, todayStr) {
  if (todayStr > challenge.end_date) return 0
  const from = todayStr < challenge.start_date ? challenge.start_date : todayStr
  return Math.max(0, dayCount(from, challenge.end_date))
}

// ── Portée : ensemble des ids de livres concernés ───────────────────────────

/**
 * @param challenge  la ligne du défi
 * @param books      tous les livres connus du membre (avec category, total_pages)
 * @param bookIdsByChallenge  Map<challengeId, string[]> issue de challenge_books
 */
export function getScopeBookIds(challenge, books, bookIdsByChallenge) {
  if (challenge.scope_type === 'category') {
    return new Set(books.filter(b => b.category === challenge.category).map(b => b.id))
  }
  if (challenge.scope_type === 'books') {
    return new Set(bookIdsByChallenge.get(challenge.id) || [])
  }
  return new Set(books.map(b => b.id)) // general
}

// ── Progression personnelle ─────────────────────────────────────────────────

/**
 * Calcule la progression du membre pour un défi.
 * @returns {{
 *   percent:number, primaryLabel:string, secondaryLabel:string,
 *   metToday:(boolean|null), streak:number,
 *   pagesInScope:number, booksFinished:number
 * }}
 */
export function computeChallengeProgress(challenge, ctx, todayStr) {
  const { books, sessions, allLogs, bookIdsByChallenge } = ctx
  const scopeIds = getScopeBookIds(challenge, books, bookIdsByChallenge)
  const { start_date: start, end_date: end } = challenge

  // Pages lues dans le périmètre, sur la période, regroupées par date.
  const byDate = new Map()
  let pagesInScope = 0
  for (const log of allLogs) {
    if (!scopeIds.has(log.book_id)) continue
    if (log.date < start || log.date > end) continue
    const n = log.pages_read || 0
    pagesInScope += n
    byDate.set(log.date, (byDate.get(log.date) || 0) + n)
  }

  // Livres du périmètre terminés (page atteinte ≥ total).
  const finishedIds = new Set()
  for (const s of sessions) {
    if (!scopeIds.has(s.book_id)) continue
    const b = books.find(x => x.id === s.book_id)
    if (!b || !b.total_pages) continue
    if (Math.max(s.max_page || 0, s.last_page || 0) >= b.total_pages) finishedIds.add(s.book_id)
  }
  const booksFinished = finishedIds.size
  const todayPages = byDate.get(todayStr) || 0

  let percent = 0
  let primaryLabel = ''
  let secondaryLabel = ''
  let metToday = null
  let streak = 0

  if (challenge.goal_type === 'daily_pages') {
    const target = challenge.goal_value || 0
    metToday = target > 0 && todayPages >= target

    // Assiduité = jours atteints / jours écoulés (bornés à la période).
    const lastDay = todayStr < end ? todayStr : end
    const elapsed = lastDay < start ? 0 : dayCount(start, lastDay)
    let daysMet = 0
    for (const [, v] of byDate) if (v >= target) daysMet++
    percent = elapsed > 0 ? Math.min(100, Math.round((daysMet / elapsed) * 100)) : 0

    // Série : jours consécutifs atteints en remontant depuis aujourd'hui.
    let cursor = lastDay
    while (cursor >= start) {
      if ((byDate.get(cursor) || 0) >= target && target > 0) {
        streak++
        cursor = new Date(Date.parse(cursor) - MS_DAY).toISOString().slice(0, 10)
      } else break
    }

    primaryLabel = `${todayPages} / ${target} صفحة اليوم`
    secondaryLabel = `${daysMet}/${elapsed} يوم ملتزم`
  } else if (challenge.goal_type === 'total_pages') {
    const target = challenge.goal_value || 0
    percent = target > 0 ? Math.min(100, Math.round((pagesInScope / target) * 100)) : 0
    primaryLabel = `${pagesInScope} / ${target} صفحة`
  } else if (challenge.goal_type === 'finish_books') {
    const target = challenge.goal_value || 0
    percent = target > 0 ? Math.min(100, Math.round((booksFinished / target) * 100)) : 0
    primaryLabel = `${booksFinished} / ${target} كتاب`
  } else if (challenge.goal_type === 'finish_specific') {
    const targetIds = bookIdsByChallenge.get(challenge.id) || []
    const done = targetIds.filter(id => finishedIds.has(id)).length
    percent = targetIds.length > 0 ? Math.min(100, Math.round((done / targetIds.length) * 100)) : 0
    primaryLabel = `${done} / ${targetIds.length} كتاب`
  }

  return { percent, primaryLabel, secondaryLabel, metToday, streak, pagesInScope, booksFinished }
}
