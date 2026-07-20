import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Navbar } from '../components/Navbar'
import { BookCard } from '../components/BookCard'
import { ProgressBar } from '../components/ProgressBar'
import { BookCoverThumb } from '../components/BookCoverThumb'
import { AccountSettings } from '../components/AccountSettings'
import {
  BookOpen, Clock, Settings, Bell, BellOff, CheckCircle2, ChevronDown, ChevronUp,
  AlertCircle, Flame, TrendingUp, UserCog
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'
import { getLocalDateStr, buildChartData, getLast7Total, getStreak, sumPagesForDate } from '../lib/stats'
import { loadOneSignal } from '../lib/oneSignal'

// ─── Custom BarChart Tooltip ──────────────────────────────────────────────────

const BarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-cardBorder rounded-custom px-3 py-2 text-xs shadow-lg text-right">
        <p className="font-bold text-textPrimary mb-0.5">{label}</p>
        <p className="text-primary font-semibold">{payload[0].value} صفحة</p>
      </div>
    )
  }
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const MemberDashboard = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [books, setBooks] = useState([])
  const [sessions, setSessions] = useState([])
  const [allLogs, setAllLogs] = useState([])
  const [hasReadToday, setHasReadToday] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('الكل')

  // Chart range: '7' | '30' | 'all'
  const [chartRange, setChartRange] = useState('7')

  // Notification states
  const [showSettings, setShowSettings] = useState(false)
  const [showAccount, setShowAccount] = useState(false)
  const [notifTime, setNotifTime] = useState('21:00')
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')

  // ── Fetch ────────────────────────────────────────────────────────────────────

  // Chargement défini dans l'effet plutôt qu'à l'extérieur : `loading` vaut
  // déjà true à l'initialisation, aucun setState n'a donc lieu avant le premier
  // await, et le garde `active` évite d'écrire dans un composant démonté.
  useEffect(() => {
    if (!user) return undefined

    let active = true

    const load = async () => {
      try {
        const todayStr = getLocalDateStr()

        // All books
        const { data: dbBooks, error: booksErr } = await supabase.from('books').select('*')
        if (booksErr) throw booksErr
        if (!active) return
        setBooks(dbBooks || [])

        // Reading sessions for current user
        const { data: dbSessions, error: sessionsErr } = await supabase
          .from('reading_sessions').select('*').eq('user_id', user.id)
        if (sessionsErr) throw sessionsErr
        if (!active) return
        setSessions(dbSessions || [])

        // ALL daily_logs for current user (no date filter)
        const { data: dbLogs, error: logsErr } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('date', { ascending: true })
        if (logsErr) throw logsErr
        if (!active) return
        setAllLogs(dbLogs || [])

        // Check if read today (tous livres confondus)
        setHasReadToday(sumPagesForDate(dbLogs, todayStr) > 0)

      } catch (err) {
        console.error('Error fetching member dashboard data:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [user])

  // ── OneSignal ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    let active = true

    const initOneSignal = async () => {
      const OneSignal = await loadOneSignal()
      if (!OneSignal || !active) return
      try {
        await OneSignal.init({
          appId: import.meta.env.VITE_ONESIGNAL_APP_ID,
          allowLocalhostAsSecureOrigin: true
        })
        if (user) {
          await OneSignal.login(user.id)
          if (user.email) await OneSignal.User.addTag('email', user.email)
        }
        if (!active) return
        if (user?.user_metadata?.notification_time) setNotifTime(user.user_metadata.notification_time)
        setNotifEnabled(OneSignal.Notifications.permission === 'granted')
      } catch (e) { console.error('OneSignal init failed:', e) }
    }

    initOneSignal()
    return () => { active = false }
  }, [user])

  // Les retours passent par `settingsMessage`, déjà rendu en arabe dans l'UI,
  // plutôt que par des `alert()` natifs bloquants (§4.5).
  const handleToggleNotifications = async () => {
    setSettingsMessage('')
    const OneSignal = await loadOneSignal()
    if (!OneSignal) {
      setSettingsMessage('خدمة التنبيهات غير متوفرة حالياً.')
      return
    }
    try {
      if (OneSignal.Notifications.permission !== 'granted') {
        await OneSignal.Notifications.requestPermission()
        setNotifEnabled(OneSignal.Notifications.permission === 'granted')
      } else {
        setSettingsMessage('يمكنك تعطيل التنبيهات من إعدادات المتصفح الخاص بك.')
      }
    } catch (e) { console.error(e) }
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSettingsLoading(true)
    setSettingsMessage('')
    try {
      const { error: authErr } = await supabase.auth.updateUser({ data: { notification_time: notifTime } })
      if (authErr) throw authErr
      if (window.OneSignal?.User) await window.OneSignal.User.addTag('notification_time', notifTime)
      setSettingsMessage('تم حفظ إعدادات التنبيهات بنجاح!')
      setTimeout(() => setSettingsMessage(''), 3000)
    } catch {
      setSettingsMessage('حدث خطأ أثناء حفظ الإعدادات.')
    } finally {
      setSettingsLoading(false)
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const handleStartRead = (bookId) => navigate(`/member/read/${bookId}`)

  const getBookProgress = (bookId) => {
    const session = sessions.find(s => s.book_id === bookId)
    const book = books.find(b => b.id === bookId)
    if (!session || !book || book.total_pages === 0) return 0
    // Sur `max_page` et non `last_page` : la progression mesure le plus loin
    // atteint, elle ne doit pas reculer quand on relit un chapitre (§2.10).
    const reached = Math.max(session.max_page || 0, session.last_page || 0)
    return (reached / book.total_pages) * 100
  }

  const dynamicCategories = ['الكل', ...new Set(books.map(b => b.category).filter(Boolean))]
  const filteredBooks = selectedCategory === 'الكل' ? books : books.filter(b => b.category === selectedCategory)
  const activeBooks = books.filter(book => {
    const s = sessions.find(s => s.book_id === book.id)
    return s && s.last_page > 0
  })

  // Chart derived
  const chartData = buildChartData(allLogs, chartRange)
  const last7Total = getLast7Total(allLogs)
  const streak = getStreak(allLogs)

  const RANGE_LABELS = { '7': 'آخر 7 أيام', '30': 'آخر 30 يوم', 'all': 'كل التاريخ' }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-bgMain text-right">
      <Navbar
        title="مكتبتي"
        showNotificationBell={true}
        onBellClick={handleToggleNotifications}
        hasUnreadNotification={!notifEnabled}
      />

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Daily Banner */}
        {!hasReadToday && (
          <div className="bg-gradient-to-r from-primary to-indigo-600 text-white rounded-custom p-6 shadow-md mb-8 flex flex-col md:flex-row justify-between items-center gap-4 border border-primary/20">
            <div>
              <h3 className="text-lg font-bold">حان وقت القراءة اليومية!</h3>
              <p className="text-sm text-primary-light/90 mt-1 font-medium">اجعل القراءة عادة يومية واقرأ 15 صفحة اليوم لتنمية معرفتك.</p>
            </div>
            <button
              onClick={() => {
                if (activeBooks.length > 0) navigate(`/member/read/${activeBooks[0].id}`)
                else document.getElementById('library-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="py-2.5 px-6 bg-white text-primary font-bold rounded-custom hover:bg-primary-light hover:scale-105 transition-all text-sm shrink-0"
            >
              ابدأ القراءة الآن
            </button>
          </div>
        )}

        {/* Welcome + Notification Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 items-start">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-textPrimary">أهلاً بك، {profile?.name || user?.email}</h2>
            <p className="text-sm text-textSecondary font-semibold mt-1">تتبع تقدمك، أكمل كتبك، وحقق أهدافك القرائية اليومية.</p>
          </div>

          <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full px-5 py-4 flex items-center justify-between text-textPrimary hover:bg-[#F8F7F4]/30"
            >
              <div className="flex items-center space-x-2 space-x-reverse">
                <Settings className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold">إعدادات التنبيهات اليومية</span>
              </div>
              {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showSettings && (
              <div className="px-5 pb-5 border-t border-cardBorder/60 pt-4">
                {settingsMessage && (
                  <div className={`mb-3 text-xs font-semibold px-3 py-2 rounded-custom border flex items-center space-x-2 space-x-reverse ${settingsMessage.includes('بنجاح') ? 'bg-green-50 text-success border-success/20' : 'bg-red-50 text-danger border-danger/20'}`}>
                    {settingsMessage.includes('بنجاح') ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{settingsMessage}</span>
                  </div>
                )}
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-textSecondary">
                    <span>حالة الاشتراك:</span>
                    {notifEnabled ? (
                      <span className="text-success flex items-center space-x-1 space-x-reverse"><Bell className="w-3.5 h-3.5" /><span>نشط</span></span>
                    ) : (
                      <button type="button" onClick={handleToggleNotifications} className="text-primary hover:underline flex items-center space-x-1 space-x-reverse">
                        <BellOff className="w-3.5 h-3.5" /><span>تفعيل التنبيهات</span>
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-bold text-textPrimary block mb-1">وقت التنبيه اليومي</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-textSecondary pointer-events-none"><Clock className="w-4 h-4" /></span>
                      <input type="time" value={notifTime} onChange={e => setNotifTime(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
                    </div>
                    <span className="text-[10px] text-textSecondary mt-1 block">تنبيه يومي يذكرك بالقراءة لمتابعة وردك اليومي</span>
                  </div>
                  <button type="submit" disabled={settingsLoading}
                    className="w-full py-2 bg-primary hover:bg-primary/95 text-white font-bold rounded-custom text-xs shadow-sm shadow-primary/20 disabled:opacity-50">
                    {settingsLoading ? 'جاري الحفظ...' : 'حفظ التفضيلات'}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Gestion du compte : mot de passe et suppression */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden mt-4">
            <button
              onClick={() => setShowAccount(!showAccount)}
              aria-expanded={showAccount}
              className="w-full px-5 py-4 flex items-center justify-between text-textPrimary hover:bg-[#F8F7F4]/30"
            >
              <div className="flex items-center space-x-2 space-x-reverse">
                <UserCog className="w-5 h-5 text-primary" />
                <span className="text-sm font-bold">إعدادات الحساب</span>
              </div>
              {showAccount ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showAccount && (
              <div className="px-5 pb-5 border-t border-cardBorder/60 pt-4">
                <AccountSettings />
              </div>
            )}
          </div>
        </div>

        {/* Active Books Progress */}
        {activeBooks.length > 0 && (
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm p-6 mb-8 text-right">
            <h3 className="text-lg font-bold text-textPrimary mb-4">كتبي النشطة</h3>
            <div className="space-y-4">
              {activeBooks.map(book => {
                const session = sessions.find(s => s.book_id === book.id)
                const pct = getBookProgress(book.id)
                return (
                  <div key={book.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border border-cardBorder/60 rounded-custom hover:border-primary/20 transition-colors gap-4">
                    <div className="flex items-center space-x-3 space-x-reverse max-w-md">
                      <BookCoverThumb book={book} />
                      <div>
                        <h4 className="text-sm font-semibold text-textPrimary leading-tight line-clamp-1">{book.title}</h4>
                        <span className="text-xs text-textSecondary mt-1 block font-medium">الصفحة {session?.last_page} من {book.total_pages}</span>
                      </div>
                    </div>
                    <div className="w-full sm:w-60 flex items-center space-x-4 space-x-reverse">
                      <div className="flex-grow"><ProgressBar progress={pct} showLabel={false} size="sm" /></div>
                      <span className="text-xs font-bold text-primary shrink-0">{Math.round(pct)}%</span>
                      <button onClick={() => handleStartRead(book.id)}
                        className="py-1.5 px-4 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors shrink-0 shadow-sm">
                        متابعة
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Reading Activity Chart Card ────────────────────────────────────── */}
        <div className="bg-white border border-cardBorder rounded-custom shadow-sm p-6 mb-8">

          {/* Card header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4">
            <div className="text-right">
              <h3 className="text-lg font-bold text-textPrimary">نشاطي القرائي</h3>
              <p className="text-xs text-textSecondary mt-0.5 font-medium">عدد الصفحات المقروءة يومياً عبر الزمن</p>
            </div>

            {/* Range selector tabs */}
            <div className="flex items-center gap-2">
              {Object.entries(RANGE_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => setChartRange(key)}
                  className={`px-3 py-1.5 rounded-custom text-xs font-bold transition-all border ${
                    chartRange === key
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-textSecondary border-cardBorder hover:text-primary hover:border-primary/30'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary pills */}
          <div className="flex flex-wrap gap-3 mb-5">
            <div className="flex items-center space-x-2 space-x-reverse bg-primary-light px-4 py-2 rounded-custom border border-primary/10">
              <TrendingUp className="w-4 h-4 text-primary" />
              <div className="text-right">
                <div className="text-lg font-bold text-primary leading-none">{last7Total}</div>
                <div className="text-[10px] text-textSecondary font-semibold mt-0.5">صفحة في آخر 7 أيام</div>
              </div>
            </div>
            <div className="flex items-center space-x-2 space-x-reverse bg-orange-50 px-4 py-2 rounded-custom border border-orange-200">
              <Flame className="w-4 h-4 text-orange-500" />
              <div className="text-right">
                <div className="text-lg font-bold text-orange-600 leading-none">{streak}</div>
                <div className="text-[10px] text-textSecondary font-semibold mt-0.5">
                  {streak === 1 ? 'يوم متتالي' : 'أيام متتالية'}
                </div>
              </div>
            </div>
            {hasReadToday && (
              <div className="flex items-center space-x-2 space-x-reverse bg-green-50 px-4 py-2 rounded-custom border border-success/20">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-xs font-bold text-success">قرأت اليوم ✓</span>
              </div>
            )}
          </div>

          {/* Bar Chart */}
          {loading ? (
            <div className="h-[200px] flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : chartData.length === 0 || chartData.every(d => d.pages === 0) ? (
            <div className="h-[200px] flex flex-col items-center justify-center text-textSecondary">
              <BookOpen className="w-12 h-12 text-primary/20 mb-3" />
              <p className="text-sm font-semibold">لا يوجد سجل قراءة بعد</p>
              <p className="text-xs mt-1 opacity-70">ابدأ القراءة لترى نشاطك هنا</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#E0DED6" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: '#888780', fontFamily: 'Noto Naskh Arabic' }}
                  axisLine={false}
                  tickLine={false}
                  interval={chartRange === 'all' && chartData.length > 30 ? Math.floor(chartData.length / 10) : 0}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#888780' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                  allowDecimals={false}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(83,74,183,0.06)' }} />
                <Bar dataKey="pages" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={entry.pages > 0 ? '#534AB7' : '#E0DED6'}
                      fillOpacity={entry.pages > 0 ? 1 : 0.5}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Library Section ───────────────────────────────────────────────── */}
        <div id="library-section" className="text-right">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h3 className="text-xl font-bold text-textPrimary">مكتبة الكتب المتوفرة</h3>
              <p className="text-xs text-textSecondary mt-0.5 font-semibold">تصفح الكتب واختر كتاباً لبدء رحلة قراءتك اليوم</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {dynamicCategories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-custom text-xs font-bold transition-all border ${
                    selectedCategory === cat
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10'
                      : 'bg-white text-textSecondary border-cardBorder hover:text-primary hover:border-primary/30'
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex justify-center items-center">
              <div className="w-8 h-8 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="py-16 text-center text-textSecondary text-sm font-semibold border border-dashed border-cardBorder rounded-custom bg-white">
              لا توجد كتب متاحة في هذا التصنيف حالياً.
            </div>
          ) : (
            // Deux colonnes dès le plus petit écran : une carte pleine largeur
            // ne laissait voir qu'un seul livre à la fois, ce qui donne
            // l'impression d'une bibliothèque vide. Gouttière resserrée en
            // dessous de 640 px pour compenser la place perdue.
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
              {filteredBooks.map(book => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={getBookProgress(book.id)}
                  onStartRead={handleStartRead}
                />
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  )
}
