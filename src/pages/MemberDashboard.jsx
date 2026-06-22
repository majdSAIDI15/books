import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Navbar } from '../components/Navbar'
import { BookCard } from '../components/BookCard'
import { ProgressBar } from '../components/ProgressBar'
import { 
  BookOpen, Clock, Settings, Bell, BellOff, CheckCircle2, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react'

export const MemberDashboard = () => {
  const { user, profile } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [books, setBooks] = useState([])
  const [sessions, setSessions] = useState([])
  const [hasReadToday, setHasReadToday] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('الكل')

  // Notification states
  const [showSettings, setShowSettings] = useState(false)
  const [notifTime, setNotifTime] = useState('21:00')
  const [notifEnabled, setNotifEnabled] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')

  const getLocalDateStr = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - (offset * 60 * 1000))
    return localDate.toISOString().split('T')[0]
  }

  // Fetch Member Dashboard Data
  const fetchData = async () => {
    if (!user) return
    try {
      setLoading(true)
      const todayStr = getLocalDateStr()

      // 1. Fetch all books
      const { data: dbBooks, error: booksErr } = await supabase
        .from('books')
        .select('*')
      if (booksErr) throw booksErr
      setBooks(dbBooks || [])

      // 2. Fetch active reading sessions for current user
      const { data: dbSessions, error: sessionsErr } = await supabase
        .from('reading_sessions')
        .select('*')
        .eq('user_id', user.id)
      if (sessionsErr) throw sessionsErr
      setSessions(dbSessions || [])

      // 3. Check if user read today (daily log exists)
      const { data: dbLogs, error: logsErr } = await supabase
        .from('daily_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', todayStr)
        .limit(1)
      
      if (logsErr) throw logsErr
      setHasReadToday(dbLogs && dbLogs.length > 0)

    } catch (err) {
      console.error('Error fetching member dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [user])

  // OneSignal initialization and permission query
  useEffect(() => {
    const initOneSignal = async () => {
      const appId = import.meta.env.VITE_ONESIGNAL_APP_ID
      if (!appId || appId === 'your_onesignal_app_id_here') {
        console.warn('OneSignal App ID is not set.')
        return
      }

      if (window.OneSignal) {
        try {
          await window.OneSignal.init({
            appId: appId,
            allowLocalhostAsSecureOrigin: true,
          })

          // Retrieve cached settings from metadata
          if (user?.user_metadata?.notification_time) {
            setNotifTime(user.user_metadata.notification_time)
          }

          // Check subscription status
          const permission = window.OneSignal.Notifications.permission
          setNotifEnabled(permission === 'granted')
        } catch (e) {
          console.error('Failed to initialize OneSignal:', e)
        }
      }
    }

    initOneSignal()
  }, [user])

  // Toggle notification preference / request permission
  const handleToggleNotifications = async () => {
    if (!window.OneSignal) {
      alert('خدمة التنبيهات غير متوفرة حالياً')
      return
    }

    try {
      const permission = window.OneSignal.Notifications.permission
      
      if (permission !== 'granted') {
        const isGranted = await window.OneSignal.Notifications.requestPermission()
        setNotifEnabled(isGranted === 'granted' || window.OneSignal.Notifications.permission === 'granted')
      } else {
        // OneSignal doesn't allow direct opt-out via API easily, so we tag or let them know
        alert('يمكنك تعطيل التنبيهات من إعدادات المتصفح الخاص بك.')
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Save Settings (Notification time preference)
  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSettingsLoading(true)
    setSettingsMessage('')

    try {
      // 1. Update user metadata in Supabase Auth
      const { error: authErr } = await supabase.auth.updateUser({
        data: { notification_time: notifTime }
      })
      if (authErr) throw authErr

      // 2. Tag user in OneSignal so scheduled backend push can target them
      if (window.OneSignal && window.OneSignal.User) {
        await window.OneSignal.User.addTag('notification_time', notifTime)
      }

      setSettingsMessage('تم حفظ إعدادات التنبيهات بنجاح!')
      setTimeout(() => setSettingsMessage(''), 3000)
    } catch (err) {
      console.error(err)
      setSettingsMessage('حدث خطأ أثناء حفظ الإعدادات.')
    } finally {
      setSettingsLoading(false)
    }
  }

  // Handle book reading start/resume
  const handleStartRead = (bookId) => {
    navigate(`/member/read/${bookId}`)
  }

  // Get reading session for a book
  const getBookProgress = (bookId) => {
    const session = sessions.find(s => s.book_id === bookId)
    const book = books.find(b => b.id === bookId)
    if (!session || !book || book.total_pages === 0) return 0
    return (session.last_page / book.total_pages) * 100
  }

  // Dynamic categories computed from active books
  const dynamicCategories = ['الكل', ...new Set(books.map(b => b.category).filter(Boolean))]

  // Filtered books list
  const filteredBooks = selectedCategory === 'الكل'
    ? books
    : books.filter(b => b.category === selectedCategory)

  // Active books (user started reading)
  const activeBooks = books.filter(book => {
    const session = sessions.find(s => s.book_id === book.id)
    return session && session.last_page > 0
  })

  return (
    <div className="min-h-screen bg-bgMain text-right">
      <Navbar 
        title="مكتبتي" 
        showNotificationBell={true} 
        onBellClick={handleToggleNotifications}
        hasUnreadNotification={!notifEnabled}
      />

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Daily Announcement Purple Banner */}
        {!hasReadToday && (
          <div className="bg-gradient-to-r from-primary to-indigo-600 text-white rounded-custom p-6 shadow-md mb-8 flex flex-col md:flex-row justify-between items-center gap-4 border border-primary/20">
            <div>
              <h3 className="text-lg font-bold">حان وقت القراءة اليومية!</h3>
              <p className="text-sm text-primary-light/90 mt-1 font-medium">اجعل القراءة عادة يومية واقرأ 15 صفحة اليوم لتنمية معرفتك.</p>
            </div>
            <button
              onClick={() => {
                // If they have any book, go to the first one, or scroll to Library
                if (activeBooks.length > 0) {
                  navigate(`/member/read/${activeBooks[0].id}`)
                } else {
                  document.getElementById('library-section')?.scrollIntoView({ behavior: 'smooth' })
                }
              }}
              className="py-2.5 px-6 bg-white text-primary font-bold rounded-custom hover:bg-primary-light hover:scale-105 transition-all text-sm shrink-0"
            >
              ابدأ القراءة الآن
            </button>
          </div>
        )}

        {/* Top Header Grid: Welcome + Notification Time Config */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8 items-start">
          
          {/* Welcome Text */}
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold text-textPrimary">أهلاً بك، {profile?.name || user?.email}</h2>
            <p className="text-sm text-textSecondary font-semibold mt-1">تتبع تقدمك، أكمل كتبك، وحقق أهدافك القرائية اليومية.</p>
          </div>

          {/* Quick Settings: Notification scheduling */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden transition-all duration-300">
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
              <div className="px-5 pb-5 border-t border-cardBorder/60 pt-4 animate-slideDown">
                {settingsMessage && (
                  <div className={`mb-3 text-xs font-semibold px-3 py-2 rounded-custom border flex items-center space-x-2 space-x-reverse ${
                    settingsMessage.includes('بنجاح') 
                      ? 'bg-green-50 text-success border-success/20' 
                      : 'bg-red-50 text-danger border-danger/20'
                  }`}>
                    {settingsMessage.includes('بنجاح') ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    <span>{settingsMessage}</span>
                  </div>
                )}
                
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-textSecondary">
                    <span>حالة الاشتراك:</span>
                    {notifEnabled ? (
                      <span className="text-success flex items-center space-x-1 space-x-reverse">
                        <Bell className="w-3.5 h-3.5" />
                        <span>نشط</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleToggleNotifications}
                        className="text-primary hover:underline flex items-center space-x-1 space-x-reverse"
                      >
                        <BellOff className="w-3.5 h-3.5" />
                        <span>تفعيل التنبيهات</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-textPrimary block mb-1">وقت التنبيه اليومي</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-textSecondary pointer-events-none">
                        <Clock className="w-4 h-4" />
                      </span>
                      <input
                        type="time"
                        value={notifTime}
                        onChange={(e) => setNotifTime(e.target.value)}
                        className="w-full pr-10 pl-4 py-2 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right"
                      />
                    </div>
                    <span className="text-[10px] text-textSecondary mt-1 block">تنبيه يومي يذكرك بالقراءة لمتابعة وردك اليومي</span>
                  </div>

                  <button
                    type="submit"
                    disabled={settingsLoading}
                    className="w-full py-2 bg-primary hover:bg-primary/95 text-white font-bold rounded-custom text-xs shadow-sm shadow-primary/20 disabled:opacity-50"
                  >
                    {settingsLoading ? 'جاري الحفظ...' : 'حفظ التفضيلات'}
                  </button>
                </form>
              </div>
            )}
          </div>

        </div>

        {/* My Progress Section (Horizontal active list) */}
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
                      <div 
                        className="w-10 h-12 rounded-sm shrink-0 shadow-sm border border-black/10 relative overflow-hidden flex items-center justify-center"
                        style={{ backgroundColor: book.cover_color || '#EEEDFE' }}
                      >
                        <div className="absolute top-0 right-0 bottom-0 w-1 bg-black/10"></div>
                        <BookOpen className="w-5 h-5 text-primary/70" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-textPrimary leading-tight line-clamp-1">{book.title}</h4>
                        <span className="text-xs text-textSecondary mt-1 block font-medium">الصفحة {session?.last_page} من {book.total_pages}</span>
                      </div>
                    </div>

                    <div className="w-full sm:w-60 flex items-center space-x-4 space-x-reverse">
                      <div className="flex-grow">
                        <ProgressBar progress={pct} showLabel={false} size="sm" />
                      </div>
                      <span className="text-xs font-bold text-primary shrink-0">{Math.round(pct)}%</span>
                      <button
                        onClick={() => handleStartRead(book.id)}
                        className="py-1.5 px-4 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors shrink-0 shadow-sm"
                      >
                        متابعة
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Library Section */}
        <div id="library-section" className="text-right">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h3 className="text-xl font-bold text-textPrimary font-arabic">مكتبة الكتب المتوفرة</h3>
              <p className="text-xs text-textSecondary mt-0.5 font-semibold">تصفح الكتب واختر كتاباً لبدء رحلة قراءتك اليوم</p>
            </div>
            
            {/* Category tabs */}
            <div className="flex flex-wrap gap-2">
              {dynamicCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-custom text-xs font-bold transition-all border ${
                    selectedCategory === cat
                      ? 'bg-primary text-white border-primary shadow-sm shadow-primary/10'
                      : 'bg-white text-textSecondary border-cardBorder hover:text-primary hover:border-primary/30'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Book Cards Grid */}
          {loading ? (
            <div className="py-20 flex justify-center items-center">
              <div className="w-8 h-8 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
            </div>
          ) : filteredBooks.length === 0 ? (
            <div className="py-16 text-center text-textSecondary text-sm font-semibold border border-dashed border-cardBorder rounded-custom bg-white">
              لا توجد كتب متاحة في هذا التصنيف حالياً.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredBooks.map(book => {
                const pct = getBookProgress(book.id)
                return (
                  <BookCard
                    key={book.id}
                    book={book}
                    progress={pct}
                    onStartRead={handleStartRead}
                  />
                )
              })}
            </div>
          )}

        </div>

      </main>
    </div>
  )
}
