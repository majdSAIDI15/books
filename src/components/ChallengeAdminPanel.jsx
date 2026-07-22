import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Trophy, Plus, Trash2, Users, Calendar, AlertCircle, Check } from 'lucide-react'
import { SCOPE_LABELS, GOAL_LABELS, RANK_LABELS, goalSummary, scopeSummary, challengeStatus, STATUS_LABELS } from '../lib/challenges'
import { getLocalDateStr } from '../lib/stats'

const GOALS_NEEDING_VALUE = ['daily_pages', 'total_pages', 'finish_books']

const emptyForm = () => ({
  title: '',
  description: '',
  scope_type: 'general',
  category: '',
  book_ids: [],
  goal_type: 'daily_pages',
  goal_value: '',
  rank_metric: 'books_finished',
  start_date: getLocalDateStr(),
  end_date: '',
  prize: '',
  is_published: true,
})

/**
 * Panneau admin de gestion des défis. Autonome : il charge lui-même les défis et
 * la liste des livres (pour les catégories et le sélecteur de livres précis).
 */
export const ChallengeAdminPanel = () => {
  const { user } = useAuth()
  const [challenges, setChallenges] = useState([])
  const [books, setBooks] = useState([])
  const [counts, setCounts] = useState({}) // challenge_id -> nb inscrits
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const todayStr = getLocalDateStr()

  const categories = useMemo(
    () => [...new Set(books.map(b => b.category).filter(Boolean))].sort(),
    [books]
  )

  const load = async () => {
    const [{ data: ch }, { data: bk }, { data: enr }] = await Promise.all([
      supabase.from('challenges').select('*').order('created_at', { ascending: false }),
      supabase.from('books').select('id, title, category, total_pages').order('title'),
      supabase.from('challenge_enrollments').select('challenge_id'),
    ])
    setChallenges(ch || [])
    setBooks(bk || [])
    const tally = {}
    ;(enr || []).forEach(e => { tally[e.challenge_id] = (tally[e.challenge_id] || 0) + 1 })
    setCounts(tally)
  }

  useEffect(() => {
    // load() est async : ses setState surviennent après await, pas en synchrone.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [])

  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))

  const toggleBook = (id) => setForm(prev => ({
    ...prev,
    book_ids: prev.book_ids.includes(id)
      ? prev.book_ids.filter(x => x !== id)
      : [...prev.book_ids, id],
  }))

  const needsBooks = form.scope_type === 'books' || form.goal_type === 'finish_specific'

  const validate = () => {
    if (!form.title.trim()) return 'العنوان مطلوب.'
    if (!form.start_date || !form.end_date) return 'تاريخ البداية والنهاية مطلوبان.'
    if (form.end_date < form.start_date) return 'تاريخ النهاية يجب أن يكون بعد البداية.'
    if (form.scope_type === 'category' && !form.category) return 'اختر التصنيف.'
    if (needsBooks && form.book_ids.length === 0) return 'اختر كتاباً واحداً على الأقل.'
    if (GOALS_NEEDING_VALUE.includes(form.goal_type)) {
      const v = parseInt(form.goal_value, 10)
      if (!v || v < 1) return 'حدّد قيمة الهدف (رقم موجب).'
    }
    return null
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const invalid = validate()
    if (invalid) { setError(invalid); return }

    setSaving(true)
    try {
      // Si l'objectif porte sur des livres précis, la portée devient « books ».
      const scope_type = form.goal_type === 'finish_specific' ? 'books' : form.scope_type

      const { data, error: insErr } = await supabase
        .from('challenges')
        .insert({
          created_by: user.id,
          title: form.title.trim(),
          description: form.description.trim() || null,
          scope_type,
          category: scope_type === 'category' ? form.category : null,
          goal_type: form.goal_type,
          goal_value: GOALS_NEEDING_VALUE.includes(form.goal_type) ? parseInt(form.goal_value, 10) : null,
          rank_metric: form.rank_metric,
          start_date: form.start_date,
          end_date: form.end_date,
          prize: form.prize.trim() || null,
          is_published: form.is_published,
        })
        .select()
        .single()
      if (insErr) throw insErr

      if ((scope_type === 'books' || form.goal_type === 'finish_specific') && form.book_ids.length) {
        const rows = form.book_ids.map(book_id => ({ challenge_id: data.id, book_id }))
        const { error: cbErr } = await supabase.from('challenge_books').insert(rows)
        if (cbErr) throw cbErr
      }

      setSuccess('تم إنشاء التحدي بنجاح!')
      setForm(emptyForm())
      setShowForm(false)
      load()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error(err)
      setError(err.message || 'حدث خطأ أثناء إنشاء التحدي.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (ch) => {
    if (!window.confirm(`حذف التحدي «${ch.title}» نهائياً؟`)) return
    try {
      const { error: delErr } = await supabase.from('challenges').delete().eq('id', ch.id)
      if (delErr) throw delErr
      setChallenges(prev => prev.filter(c => c.id !== ch.id))
    } catch (err) {
      console.error(err)
      setError('تعذّر حذف التحدي.')
    }
  }

  return (
    <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden text-right">
      <div className="px-6 py-5 border-b border-cardBorder flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-textPrimary flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            التحديات والبرامج
          </h3>
          <p className="text-xs text-textSecondary mt-0.5">أنشئ برامج قراءة بأهداف ومدد وجوائز، وتابع المشاركين</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setError('') }}
          className="py-2 px-4 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 flex items-center gap-1.5 text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>تحدٍ جديد</span>
        </button>
      </div>

      <div className="p-6 space-y-4">
        {success && (
          <div className="bg-green-50 text-success text-xs font-semibold px-4 py-3 rounded-custom border border-success/20 flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" /><span>{success}</span>
          </div>
        )}
        {error && (
          <div className="bg-red-50 text-danger text-xs font-semibold px-4 py-3 rounded-custom border border-danger/20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Formulaire de création */}
        {showForm && (
          <form onSubmit={handleCreate} className="border border-cardBorder rounded-custom p-4 space-y-4 bg-[#F8F7F4]/40">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-textPrimary block mb-1">عنوان التحدي</label>
                <input type="text" value={form.title} onChange={e => set({ title: e.target.value })}
                  placeholder="مثال: برنامج إعلاء الهمة"
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-textPrimary block mb-1">وصف (اختياري)</label>
                <textarea value={form.description} onChange={e => set({ description: e.target.value })}
                  placeholder="اشرح فكرة البرنامج والجائزة…" rows={2}
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right resize-none" />
              </div>

              {/* Portée */}
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">النطاق (ماذا يُقرأ)</label>
                <select value={form.scope_type} onChange={e => set({ scope_type: e.target.value })}
                  disabled={form.goal_type === 'finish_specific'}
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right disabled:opacity-60">
                  {Object.entries(SCOPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {form.scope_type === 'category' && form.goal_type !== 'finish_specific' && (
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">التصنيف</label>
                  <select value={form.category} onChange={e => set({ category: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right">
                    <option value="">— اختر —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}

              {/* Objectif */}
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">نوع الهدف</label>
                <select value={form.goal_type} onChange={e => set({ goal_type: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right">
                  {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {GOALS_NEEDING_VALUE.includes(form.goal_type) && (
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">
                    {form.goal_type === 'finish_books' ? 'عدد الكتب' : 'عدد الصفحات'}
                  </label>
                  <input type="number" min="1" value={form.goal_value} onChange={e => set({ goal_value: e.target.value })}
                    placeholder={form.goal_type === 'daily_pages' ? 'مثال: 20' : 'مثال: 600'}
                    className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
                </div>
              )}

              {/* Dates */}
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">تاريخ البداية</label>
                <input type="date" value={form.start_date} onChange={e => set({ start_date: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
              </div>
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">تاريخ النهاية</label>
                <input type="date" value={form.end_date} min={form.start_date} onChange={e => set({ end_date: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
              </div>

              {/* Classement + prix */}
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">معيار الترتيب (الفائز)</label>
                <select value={form.rank_metric} onChange={e => set({ rank_metric: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right">
                  {Object.entries(RANK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">الجائزة (اختياري)</label>
                <input type="text" value={form.prize} onChange={e => set({ prize: e.target.value })}
                  placeholder="مثال: جائزة لمن ينهي أكبر عدد من الكتب"
                  className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
              </div>
            </div>

            {/* Sélecteur de livres précis */}
            {needsBooks && (
              <div>
                <label className="text-xs font-bold text-textPrimary block mb-1">
                  الكتب المحدّدة ({form.book_ids.length})
                </label>
                <div className="max-h-40 overflow-y-auto border border-cardBorder rounded-custom bg-white p-2 space-y-1">
                  {books.length === 0 && <p className="text-xs text-textSecondary p-2">لا توجد كتب.</p>}
                  {books.map(b => (
                    <label key={b.id} className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-primary/5 cursor-pointer">
                      <input type="checkbox" checked={form.book_ids.includes(b.id)} onChange={() => toggleBook(b.id)} />
                      <span className="text-textPrimary">{b.title}</span>
                      {b.category && <span className="text-textSecondary">· {b.category}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-semibold text-textPrimary">
              <input type="checkbox" checked={form.is_published} onChange={e => set({ is_published: e.target.checked })} />
              <span>منشور (مرئي للأعضاء فوراً)</span>
            </label>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)}
                className="py-2 px-4 border border-cardBorder text-textSecondary font-semibold rounded-custom hover:bg-red-50 hover:text-danger text-sm">
                إلغاء
              </button>
              <button type="submit" disabled={saving}
                className="py-2 px-5 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 text-sm disabled:opacity-50">
                {saving ? 'جاري الحفظ...' : 'إنشاء التحدي'}
              </button>
            </div>
          </form>
        )}

        {/* Liste des défis */}
        {challenges.length === 0 ? (
          <p className="text-sm text-textSecondary text-center py-6">لا توجد تحديات بعد. أنشئ أول برنامج قراءة!</p>
        ) : (
          <div className="space-y-3">
            {challenges.map(ch => {
              const status = challengeStatus(ch, todayStr)
              return (
                <div key={ch.id} className="border border-cardBorder rounded-custom p-4 hover:border-primary/20 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-textPrimary text-sm">{ch.title}</h4>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          status === 'active' ? 'bg-green-50 text-success' :
                          status === 'upcoming' ? 'bg-blue-50 text-blue-600' : 'bg-cardBorder/40 text-textSecondary'
                        }`}>{STATUS_LABELS[status]}</span>
                        {!ch.is_published && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-warning">مسودّة</span>}
                      </div>
                      <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px] text-textSecondary">
                        <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />{goalSummary(ch)}</span>
                        <span>· {scopeSummary(ch)}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{ch.start_date} ← {ch.end_date}</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{counts[ch.id] || 0} مشارك</span>
                      </div>
                      {ch.prize && <p className="text-[11px] text-primary mt-1">🏆 {ch.prize}</p>}
                    </div>
                    <button onClick={() => handleDelete(ch)} title="حذف"
                      className="p-1.5 text-textSecondary hover:text-danger rounded hover:bg-red-50 transition-colors shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
