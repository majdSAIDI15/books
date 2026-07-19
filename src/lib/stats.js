/**
 * Helpers de dates et de statistiques de lecture.
 *
 * Source unique de vérité : ces fonctions étaient auparavant dupliquées dans
 * AdminDashboard.jsx, MemberDashboard.jsx et MemberRow.jsx, avec des
 * comportements déjà divergents.
 *
 * Règle importante : daily_logs a pour clé unique (user_id, book_id, date).
 * Il y a donc UNE LIGNE PAR LIVRE ET PAR JOUR. Toute agrégation par date doit
 * sommer les lignes correspondantes, jamais en prendre une seule.
 */

export const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

/** Date locale au format YYYY-MM-DD, décalée de `offsetDays` dans le passé. */
export const getLocalDateStr = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().split('T')[0]
}

/**
 * Parse 'YYYY-MM-DD' en Date LOCALE (minuit local).
 * `new Date('2026-07-19')` donnerait minuit UTC, dont le getDay() local est
 * décalé d'un jour pour tous les fuseaux négatifs.
 */
export const parseLocalDate = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** Nom du jour en arabe pour une date 'YYYY-MM-DD'. */
export const getDayName = (dateStr) => ARABIC_DAYS[parseLocalDate(dateStr).getDay()]

/** Total des pages lues à une date donnée, tous livres confondus. */
export const sumPagesForDate = (logs, dateStr) =>
  (logs || []).reduce((sum, l) => (l.date === dateStr ? sum + (l.pages_read || 0) : sum), 0)

/**
 * Données du graphique.
 * `range` : 7 | 30 | '7' | '30' | 'all'
 */
export const buildChartData = (logs, range = 7) => {
  const safeLogs = logs || []
  let totalDays

  if (range === 'all') {
    if (safeLogs.length === 0) return []
    const earliest = safeLogs.reduce((min, l) => (l.date < min ? l.date : min), safeLogs[0].date)
    const diffMs = parseLocalDate(getLocalDateStr()) - parseLocalDate(earliest)
    totalDays = Math.max(1, Math.floor(diffMs / 86400000) + 1)
  } else {
    totalDays = Number(range) || 7
  }

  const result = []
  for (let i = totalDays - 1; i >= 0; i--) {
    const dateStr = getLocalDateStr(i)
    result.push({
      date: dateStr,
      day: getDayName(dateStr),
      pages: sumPagesForDate(safeLogs, dateStr),
    })
  }
  return result
}

/** Total des pages sur les 7 derniers jours (aujourd'hui inclus). */
export const getLast7Total = (logs) => {
  let total = 0
  for (let i = 0; i < 7; i++) total += sumPagesForDate(logs, getLocalDateStr(i))
  return total
}

/** Nombre de jours consécutifs de lecture, en remontant depuis aujourd'hui. */
export const getStreak = (logs) => {
  let streak = 0
  while (sumPagesForDate(logs, getLocalDateStr(streak)) > 0) streak++
  return streak
}

/**
 * Dernière date de lecture et ancienneté en jours.
 * `daysSince` vaut Infinity si l'utilisateur n'a jamais lu, et `neverRead`
 * permet de distinguer ce cas d'un lecteur réellement en retard.
 */
export const getLastReadInfo = (logs) => {
  const readDates = [...new Set((logs || []).filter(l => l.pages_read > 0).map(l => l.date))]
  if (readDates.length === 0) return { lastDate: null, daysSince: Infinity, neverRead: true }

  const lastDateStr = readDates.reduce((max, d) => (d > max ? d : max), readDates[0])
  const diffMs = parseLocalDate(getLocalDateStr()) - parseLocalDate(lastDateStr)
  return { lastDate: lastDateStr, daysSince: Math.floor(diffMs / 86400000), neverRead: false }
}

/** Initiales (2 caractères max) pour les avatars. */
export const getInitials = (name) => {
  if (!name) return 'م'
  return name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2)
}
