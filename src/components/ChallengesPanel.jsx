import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Trophy, Calendar, Target, Flame, X, Medal, LogIn, LogOut, Loader2 } from 'lucide-react'
import {
  goalSummary, scopeSummary, challengeStatus, STATUS_LABELS, daysRemaining,
  computeChallengeProgress, RANK_LABELS,
} from '../lib/challenges'
import { getLocalDateStr } from '../lib/stats'

/**
 * Défis côté membre : parcourir, s'inscrire, suivre sa progression, voir le
 * classement. La progression personnelle est calculée à partir des données déjà
 * chargées par MemberDashboard (books/sessions/allLogs), passées en props.
 */
export const ChallengesPanel = ({ books = [], sessions = [], allLogs = [] }) => {
  const { user } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [bookIdsByChallenge, setBookIdsByChallenge] = useState(new Map())
  const [busyId, setBusyId] = useState(null)
  const [leaderboardFor, setLeaderboardFor] = useState(null)

  const todayStr = getLocalDateStr()

  const load = useCallback(async () => {
    if (!user) return
    const [{ data: ch }, { data: enr }, { data: cb }] = await Promise.all([
      supabase.from('challenges').select('*').eq('is_published', true).order('start_date', { ascending: false }),
      supabase.from('challenge_enrollments').select('*').eq('user_id', user.id),
      supabase.from('challenge_books').select('challenge_id, book_id'),
    ])
    setChallenges(ch || [])
    setEnrollments(enr || [])
    const map = new Map()
    ;(cb || []).forEach(r => {
      if (!map.has(r.challenge_id)) map.set(r.challenge_id, [])
      map.get(r.challenge_id).push(r.book_id)
    })
    setBookIdsByChallenge(map)
  }, [user])

  useEffect(() => {
    // load() est async : ses setState surviennent après await, pas en synchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  const enrolledIds = useMemo(() => new Set(enrollments.map(e => e.challenge_id)), [enrollments])
  const ctx = useMemo(() => ({ books, sessions, allLogs, bookIdsByChallenge }), [books, sessions, allLogs, bookIdsByChallenge])

  const myChallenges = useMemo(
    () => challenges.filter(c => enrolledIds.has(c.id)),
    [challenges, enrolledIds]
  )
  const available = useMemo(
    () => challenges.filter(c => !enrolledIds.has(c.id) && challengeStatus(c, todayStr) !== 'ended'),
    [challenges, enrolledIds, todayStr]
  )

  const enroll = async (ch) => {
    setBusyId(ch.id)
    try {
      const { data, error } = await supabase
        .from('challenge_enrollments')
        .insert({ challenge_id: ch.id, user_id: user.id })
        .select().single()
      if (error) throw error
      setEnrollments(prev => [...prev, data])
    } catch (err) { console.error(err) } finally { setBusyId(null) }
  }

  const unenroll = async (ch) => {
    if (!window.confirm(`الانسحاب من «${ch.title}»؟`)) return
    setBusyId(ch.id)
    try {
      const { error } = await supabase
        .from('challenge_enrollments')
        .delete()
        .eq('challenge_id', ch.id)
        .eq('user_id', user.id)
      if (error) throw error
      setEnrollments(prev => prev.filter(e => e.challenge_id !== ch.id))
    } catch (err) { console.error(err) } finally { setBusyId(null) }
  }

  if (challenges.length === 0) return null

  return (
    <div className="bg-white border border-cardBorder rounded-custom shadow-sm p-6 mb-8 text-right">
      <h3 className="text-lg font-bold text-textPrimary mb-1 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-primary" />
        التحديات والبرامج
      </h3>
      <p className="text-xs text-textSecondary mb-4">انضمّ إلى برنامج قراءة وتابع تقدّمك وترتيبك</p>

      {/* Mes défis */}
      {myChallenges.length > 0 && (
        <div className="space-y-3 mb-6">
          <h4 className="text-sm font-bold text-textPrimary">تحدياتي</h4>
          {myChallenges.map(ch => {
            const p = computeChallengeProgress(ch, ctx, todayStr)
            const status = challengeStatus(ch, todayStr)
            return (
              <div key={ch.id} className="border border-primary/20 bg-primary/5 rounded-custom p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-bold text-textPrimary text-sm">{ch.title}</h5>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        status === 'active' ? 'bg-green-50 text-success' :
                        status === 'upcoming' ? 'bg-blue-50 text-blue-600' : 'bg-cardBorder/40 text-textSecondary'
                      }`}>{STATUS_LABELS[status]}</span>
                      {p.metToday && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-success">✓ هدف اليوم</span>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-textSecondary">
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" />{goalSummary(ch)}</span>
                      <span>· {scopeSummary(ch)}</span>
                      {status === 'active' && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />باقٍ {daysRemaining(ch, todayStr)} يوم</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setLeaderboardFor(ch)} title="الترتيب"
                      className="p-1.5 text-primary hover:bg-primary/10 rounded transition-colors">
                      <Medal className="w-4 h-4" />
                    </button>
                    <button onClick={() => unenroll(ch)} disabled={busyId === ch.id} title="انسحاب"
                      className="p-1.5 text-textSecondary hover:text-danger hover:bg-red-50 rounded transition-colors">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Barre de progression */}
                <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-cardBorder/50">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${p.percent}%` }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[11px]">
                  <span className="font-bold text-primary">{p.primaryLabel}</span>
                  <div className="flex items-center gap-2 text-textSecondary">
                    {p.streak > 0 && <span className="flex items-center gap-0.5 text-orange-500 font-semibold"><Flame className="w-3 h-3" />{p.streak}</span>}
                    {p.secondaryLabel && <span>{p.secondaryLabel}</span>}
                    <span>{p.percent}%</span>
                  </div>
                </div>
                {ch.prize && <p className="text-[11px] text-primary mt-2">🏆 {ch.prize}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* Défis disponibles */}
      {available.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-textPrimary">تحديات متاحة</h4>
          {available.map(ch => {
            const status = challengeStatus(ch, todayStr)
            return (
              <div key={ch.id} className="border border-cardBorder rounded-custom p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h5 className="font-bold text-textPrimary text-sm">{ch.title}</h5>
                      {status === 'upcoming' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">{STATUS_LABELS.upcoming}</span>}
                    </div>
                    {ch.description && <p className="text-[11px] text-textSecondary mt-1 leading-relaxed">{ch.description}</p>}
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px] text-textSecondary">
                      <span className="flex items-center gap-1"><Target className="w-3 h-3" />{goalSummary(ch)}</span>
                      <span>· {scopeSummary(ch)}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{ch.start_date} ← {ch.end_date}</span>
                    </div>
                    {ch.prize && <p className="text-[11px] text-primary mt-1">🏆 {ch.prize}</p>}
                  </div>
                  <button onClick={() => enroll(ch)} disabled={busyId === ch.id}
                    className="shrink-0 py-1.5 px-3 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 text-xs flex items-center gap-1.5 disabled:opacity-50">
                    {busyId === ch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogIn className="w-3.5 h-3.5" />}
                    <span>انضمام</span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {leaderboardFor && (
        <LeaderboardModal challenge={leaderboardFor} currentUserId={user.id} onClose={() => setLeaderboardFor(null)} />
      )}
    </div>
  )
}

// ── Classement (modale) ───────────────────────────────────────────────────────

const MEDALS = ['🥇', '🥈', '🥉']

const LeaderboardModal = ({ challenge, currentUserId, onClose }) => {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase.rpc('challenge_leaderboard', { p_challenge_id: challenge.id }).then(({ data, error }) => {
      if (!active) return
      if (error) { setError('تعذّر تحميل الترتيب.'); return }
      const metric = challenge.rank_metric === 'pages_in_scope' ? 'pages_in_scope' : 'books_finished'
      const other = metric === 'pages_in_scope' ? 'books_finished' : 'pages_in_scope'
      const sorted = [...(data || [])].sort((a, b) => (Number(b[metric]) - Number(a[metric])) || (Number(b[other]) - Number(a[other])))
      setRows(sorted)
    })
    return () => { active = false }
  }, [challenge])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ direction: 'rtl' }}>
      <div className="absolute inset-0 bg-[#2C2C2A]/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-custom shadow-2xl border border-cardBorder p-5 font-arabic max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-textPrimary text-sm flex items-center gap-2">
            <Medal className="w-4 h-4 text-primary" /> ترتيب «{challenge.title}»
          </h3>
          <button onClick={onClose} className="p-1 text-textSecondary hover:text-textPrimary rounded-full"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[11px] text-textSecondary mb-3">{RANK_LABELS[challenge.rank_metric]}</p>

        <div className="overflow-y-auto">
          {error && <p className="text-xs text-danger text-center py-6">{error}</p>}
          {!rows && !error && <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>}
          {rows && rows.length === 0 && <p className="text-xs text-textSecondary text-center py-6">لا مشاركين بعد.</p>}
          {rows && rows.length > 0 && (
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={r.user_id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-custom text-xs ${
                    r.user_id === currentUserId ? 'bg-primary/10 border border-primary/20' : 'bg-[#F8F7F4]/60'
                  }`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 text-center font-bold">{MEDALS[i] || (i + 1)}</span>
                    <span className="font-semibold text-textPrimary truncate">{r.name || 'قارئ'}{r.user_id === currentUserId ? ' (أنت)' : ''}</span>
                  </div>
                  <div className="flex items-center gap-3 text-textSecondary shrink-0">
                    <span>{Number(r.books_finished)} كتاب</span>
                    <span>{Number(r.pages_in_scope)} صفحة</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
