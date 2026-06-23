import React, { useState, useEffect } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Navbar } from '../components/Navbar'
import { ProgressBar } from '../components/ProgressBar'
import {
  Users, BookOpen, UserCheck, Plus, FileText, Check, AlertCircle, RefreshCw, Trash2,
  ChevronDown, ChevronUp, CheckCircle2, XCircle, Flame, TrendingUp,
  Shield, UserPlus, ShieldAlert, KeyRound
} from 'lucide-react'
import { pdfjs } from 'react-pdf'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'

// Set PDF.js worker from CDN to avoid packaging issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '3.11.174'}/build/pdf.worker.min.mjs`

const PASTEL_COVERS = ['#EEEDFE', '#E2F1E8', '#FCEEE3', '#E3F2FD', '#F3E5F5', '#FFF9C4', '#FFE0B2', '#D1C4E9']
const ARABIC_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

const getLocalDateStr = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().split('T')[0]
}

const getInitials = (name) => {
  if (!name) return 'م'
  return name.trim().split(' ').map(n => n[0]).join('').slice(0, 2)
}

const getLastReadInfo = (logs) => {
  const readLogs = (logs || []).filter(l => l.pages_read > 0)
  if (readLogs.length === 0) {
    return { lastDate: null, daysSince: Infinity }
  }
  const lastLog = readLogs[readLogs.length - 1]
  const lastDateStr = lastLog.date
  
  const today = new Date(getLocalDateStr(0))
  const lastReadDate = new Date(lastDateStr)
  const diffTime = today - lastReadDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  return { lastDate: lastDateStr, daysSince: diffDays }
}

const getFlameIndicator = (logs, readToday) => {
  if (readToday) {
    return { colorClass: 'text-success fill-success', tooltip: 'قرأ اليوم' }
  }
  const { daysSince } = getLastReadInfo(logs)
  if (daysSince === 1) {
    return { colorClass: 'text-orange-500 fill-orange-500', tooltip: 'فات يوم واحد' }
  }
  return { colorClass: 'text-danger fill-danger', tooltip: 'لم يقرأ منذ يومين أو أكثر' }
}


/** Build chart data array for N days (or all), from a user's logs array */
const buildChartData = (logs, days = 7) => {
  const result = []
  const end = days === 'all' ? null : days
  const total = end || Math.max(
    7,
    logs.length > 0
      ? Math.ceil((new Date(getLocalDateStr()) - new Date(logs[0].date)) / 86400000) + 1
      : 7
  )
  for (let i = total - 1; i >= 0; i--) {
    const dateStr = getLocalDateStr(i)
    const dayName = ARABIC_DAYS[new Date(dateStr).getDay()]
    const log = logs.find(l => l.date === dateStr)
    result.push({ date: dateStr, day: dayName, pages: log ? log.pages_read : 0 })
  }
  return result
}

/** Last-7-days total pages */
const getLast7Total = (logs) => {
  let total = 0
  for (let i = 0; i < 7; i++) {
    const dateStr = getLocalDateStr(i)
    const log = logs.find(l => l.date === dateStr)
    if (log) total += log.pages_read
  }
  return total
}

/** Streak: consecutive days from today with pages_read > 0 */
const getStreak = (logs) => {
  let streak = 0
  let i = 0
  while (true) {
    const dateStr = getLocalDateStr(i)
    const log = logs.find(l => l.date === dateStr)
    if (log && log.pages_read > 0) {
      streak++
      i++
    } else {
      break
    }
  }
  return streak
}

// Custom compact tooltip for admin line charts
const CompactTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-cardBorder rounded-custom px-3 py-1.5 text-xs shadow-md">
        <p className="font-bold text-textPrimary">{label}</p>
        <p className="text-primary font-semibold">{payload[0].value} صفحة</p>
      </div>
    )
  }
  return null
}

const MemberChartPanel = ({ member }) => {
  const [expanded, setExpanded] = useState(false)
  const logs = member.logs || []
  const chartData7 = buildChartData(logs, 7)
  const chartDataAll = buildChartData(logs, 'all')
  const last7Total = getLast7Total(logs)
  const streak = getStreak(logs)
  const displayData = expanded ? chartDataAll : chartData7

  return (
    <div className="border border-cardBorder rounded-custom bg-white overflow-hidden hover:border-primary/20 transition-all duration-200">
      {/* Member summary row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4">
        {/* Avatar + Name */}
        <div className="flex items-center space-x-3 space-x-reverse min-w-[180px]">
          <div className="w-10 h-10 rounded-custom bg-primary-light text-primary flex items-center justify-center font-bold text-sm shadow-sm border border-primary/10 shrink-0">
            {getInitials(member.name)}
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-1.5 space-x-reverse justify-start">
              <div className="text-sm font-semibold text-textPrimary">{member.name || 'قارئ مجهول'}</div>
              {(() => {
                const { colorClass, tooltip } = getFlameIndicator(logs, member.read_today)
                return <Flame className={`w-4 h-4 ${colorClass}`} title={tooltip} />
              })()}
            </div>
            <div className="text-xs text-textSecondary truncate max-w-[140px]">{member.email}</div>
          </div>
        </div>

        {/* Current Book */}
        <div className="flex-grow text-right">
          {member.current_book_title ? (
            <div className="flex items-center space-x-2 space-x-reverse justify-end">
              <span className="text-xs text-textSecondary">يقرأ:</span>
              <span className="text-xs font-semibold text-textPrimary line-clamp-1 max-w-[160px]">{member.current_book_title}</span>
            </div>
          ) : (
            <span className="text-xs text-textSecondary italic">لم يبدأ بعد</span>
          )}
          {member.current_book_title && member.total_pages > 0 && (
            <div className="mt-1.5 max-w-[200px] mr-auto">
              <ProgressBar progress={Math.min(100, (member.last_page / member.total_pages) * 100)} showLabel={false} size="sm" />
              <span className="text-[10px] text-textSecondary">{Math.min(100, Math.round((member.last_page / member.total_pages) * 100))}%</span>
            </div>
          )}
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className="flex items-center space-x-1 space-x-reverse bg-primary-light text-primary px-2.5 py-1 rounded-full text-xs font-semibold">
            <TrendingUp className="w-3 h-3" />
            <span>{last7Total} صفحة</span>
            <span className="opacity-60 text-[10px]">/ 7 أيام</span>
          </span>
          {streak > 0 && (
            <span className="flex items-center space-x-1 space-x-reverse bg-orange-50 text-orange-600 px-2.5 py-1 rounded-full text-xs font-semibold border border-orange-200">
              <Flame className="w-3 h-3" />
              <span>{streak} أيام متتالية</span>
            </span>
          )}
          {member.read_today ? (
            <span className="flex items-center space-x-1 space-x-reverse bg-green-50 text-success px-2.5 py-1 rounded-full text-xs font-semibold border border-success/20">
              <CheckCircle2 className="w-3 h-3" />
              <span>قرأ اليوم</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 space-x-reverse bg-red-50 text-danger px-2.5 py-1 rounded-full text-xs font-semibold border border-danger/20">
              <XCircle className="w-3 h-3" />
              <span>لم يقرأ</span>
            </span>
          )}
        </div>
      </div>

      {/* Chart section */}
      <div className="border-t border-cardBorder/60 px-4 pb-4 pt-3 bg-[#F8F7F4]/30">
        <div className="flex justify-between items-center mb-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center space-x-1 space-x-reverse text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5" /><span>عرض آخر 7 أيام</span></>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /><span>عرض الكل</span></>
            )}
          </button>
          <span className="text-[10px] font-semibold text-textSecondary">
            {expanded ? 'كل التاريخ' : 'نشاط القراءة - آخر 7 أيام'}
          </span>
        </div>

        {logs.length === 0 ? (
          <div className="h-[80px] flex items-center justify-center text-xs text-textSecondary italic">
            لا يوجد سجل قراءة بعد
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={displayData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0DED6" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 9, fill: '#888780', fontFamily: 'Noto Naskh Arabic' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: '#888780' }}
                axisLine={false}
                tickLine={false}
                width={24}
                allowDecimals={false}
              />
              <Tooltip content={<CompactTooltip />} />
              <Line
                type="monotone"
                dataKey="pages"
                stroke="#534AB7"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#534AB7', strokeWidth: 0 }}
                activeDot={{ r: 4, fill: '#534AB7' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export const AdminDashboard = () => {
  const { user: currentUser } = useAuth()
  const [stats, setStats] = useState({ booksCount: 0, membersCount: 0, activeTodayCount: 0 })
  const [members, setMembers] = useState([])
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [absentMembers, setAbsentMembers] = useState([])
  const [sendingNotif, setSendingNotif] = useState({})

  // Account Management state
  const [allAccounts, setAllAccounts] = useState([])
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccName, setNewAccName] = useState('')
  const [newAccEmail, setNewAccEmail] = useState('')
  const [newAccPassword, setNewAccPassword] = useState('')
  const [newAccRole, setNewAccRole] = useState('member')
  const [accountError, setAccountError] = useState('')
  const [accountSuccess, setAccountSuccess] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  
  const [editingPasswordUserId, setEditingPasswordUserId] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [updatingPassword, setUpdatingPassword] = useState(false)

  // Add Book Form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [category, setCategory] = useState('')
  const [pdfFile, setPdfFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const sendOneSignalNotification = async (memberId, name) => {
    const appId = import.meta.env.VITE_ONESIGNAL_APP_ID
    const restApiKey = import.meta.env.VITE_ONESIGNAL_REST_API_KEY
    
    if (!appId || appId === 'your_onesignal_app_id_here') {
      throw new Error('لم يتم إعداد App ID الخاص بـ OneSignal')
    }
    
    if (!restApiKey || restApiKey === 'YOUR_ONESIGNAL_REST_API_KEY') {
      console.warn('OneSignal REST API key is missing. Simulating successful reminder.')
      await new Promise(resolve => setTimeout(resolve, 800))
      return true
    }
    
    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${restApiKey}`
      },
      body: JSON.stringify({
        app_id: appId,
        contents: {
          ar: `مرحباً ${name}، نود تذكيرك بالعودة للقراءة اليومية لمواصلة تقدمك! 📚`,
          en: `Hello ${name}, we'd love to remind you to return to your daily reading and continue your progress! 📚`
        },
        headings: {
          ar: 'تذكير بالقراءة 🌟',
          en: 'Reading Reminder 🌟'
        },
        include_aliases: {
          external_id: [memberId]
        },
        target_channel: 'push'
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.errors?.[0] || 'فشل إرسال التنبيه')
    }
    
    return true
  }

  const handleSendReminder = async (memberId, memberName) => {
    setSendingNotif(prev => ({ ...prev, [memberId]: 'sending' }))
    try {
      await sendOneSignalNotification(memberId, memberName)
      setSendingNotif(prev => ({ ...prev, [memberId]: 'success' }))
      setTimeout(() => {
        setSendingNotif(prev => ({ ...prev, [memberId]: null }))
      }, 3000)
    } catch (err) {
      console.error(err)
      setSendingNotif(prev => ({ ...prev, [memberId]: 'error' }))
      setTimeout(() => {
        setSendingNotif(prev => ({ ...prev, [memberId]: null }))
      }, 3000)
    }
  }

  const handleCreateAccount = async (e) => {
    e.preventDefault()
    setAccountError('')
    setAccountSuccess('')
    
    if (!newAccName.trim() || !newAccEmail.trim() || !newAccPassword.trim()) {
      setAccountError('الرجاء تعبئة جميع الحقول')
      return
    }
    
    if (!supabaseAdmin) {
      setAccountError('مفتاح الخدمة (Service Role Key) غير مهيأ. لا يمكن إنشاء الحساب.')
      return
    }
    
    setCreatingAccount(true)
    try {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: newAccEmail.trim(),
        password: newAccPassword.trim(),
        email_confirm: true,
        user_metadata: { name: newAccName.trim() }
      })
      
      if (error) throw error
      
      if (data?.user) {
        // Update role in profiles
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ role: newAccRole })
          .eq('id', data.user.id)
          
        if (profileError) throw profileError
        
        setAccountSuccess('تم إنشاء الحساب بنجاح!')
        setNewAccName('')
        setNewAccEmail('')
        setNewAccPassword('')
        setNewAccRole('member')
        setShowAddAccount(false)
        fetchData()
        setTimeout(() => setAccountSuccess(''), 3000)
      }
    } catch (err) {
      console.error(err)
      setAccountError(err.message || 'حدث خطأ أثناء إنشاء الحساب')
    } finally {
      setCreatingAccount(false)
    }
  }

  const handleUpdatePassword = async (userId) => {
    setAccountError('')
    setAccountSuccess('')
    
    if (!newPassword.trim()) {
      alert('الرجاء إدخال كلمة المرور الجديدة')
      return
    }
    
    if (newPassword.trim().length < 6) {
      alert('يجب أن تتكون كلمة المرور من 6 أحرف على الأقل')
      return
    }
    
    if (!supabaseAdmin) {
      alert('مفتاح الخدمة (Service Role Key) غير مهيأ. لا يمكن تغيير كلمة المرور.')
      return
    }
    
    setUpdatingPassword(true)
    try {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: newPassword.trim()
      })
      
      if (error) throw error
      
      alert('تم تغيير كلمة المرور بنجاح!')
      setEditingPasswordUserId(null)
      setNewPassword('')
      fetchData()
    } catch (err) {
      console.error(err)
      alert(err.message || 'حدث خطأ أثناء تحديث كلمة المرور')
    } finally {
      setUpdatingPassword(false)
    }
  }

  const handleToggleRole = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'member' : 'admin'
    if (!window.confirm(`هل أنت متأكد من رغبتك في تغيير دور هذا المستخدم إلى ${newRole === 'admin' ? 'مدير' : 'عضو'}؟`)) return
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)
        
      if (error) throw error
      
      fetchData()
    } catch (err) {
      console.error(err)
      alert('حدث خطأ أثناء تغيير دور المستخدم')
    }
  }

  const handleDeleteAccount = async (userId) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا الحساب بشكل نهائي؟ لا يمكن التراجع عن هذا الإجراء.')) return
    
    if (!supabaseAdmin) {
      alert('مفتاح الخدمة (Service Role Key) غير مهيأ. لا يمكن حذف الحساب.')
      return
    }
    
    try {
      // 1. Delete from Auth Users
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authErr) throw authErr
      
      // 2. Delete from Profiles (in case cascade is not set)
      await supabase.from('profiles').delete().eq('id', userId)
      
      fetchData()
    } catch (err) {
      console.error(err)
      alert(err.message || 'حدث خطأ أثناء حذف الحساب')
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const todayStr = getLocalDateStr()

      // Fetch books
      const { data: dbBooks, error: booksErr } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false })
      if (booksErr) throw booksErr

      // Fetch all profiles (both admins and members)
      const { data: dbProfiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (profilesErr) throw profilesErr

      // Fetch reading sessions
      const { data: dbSessions, error: sessionsErr } = await supabase
        .from('reading_sessions')
        .select('*, books(title, total_pages)')
      if (sessionsErr) throw sessionsErr

      // Fetch ALL daily_logs (no date filter) — sorted by date asc for streak/chart logic
      const { data: dbAllLogs, error: logsErr } = await supabase
        .from('daily_logs')
        .select('*')
        .order('date', { ascending: true })
      if (logsErr) throw logsErr

      // Compute stats
      const booksCount = dbBooks?.length || 0
      const membersCount = (dbProfiles || []).filter(p => p.role === 'member').length
      const activeMembersSet = new Set(
        (dbAllLogs || []).filter(l => l.date === todayStr).map(l => l.user_id)
      )
      const activeTodayCount = activeMembersSet.size
      setStats({ booksCount, membersCount, activeTodayCount })

      // Map members (only role = member) with their logs
      const memberProfiles = (dbProfiles || []).filter(p => p.role === 'member')
      const mappedMembers = memberProfiles.map(profile => {
        const userSessions = (dbSessions || [])
          .filter(s => s.user_id === profile.id)
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        const activeSession = userSessions[0] || null
        const readToday = activeMembersSet.has(profile.id)
        const userLogs = (dbAllLogs || []).filter(l => l.user_id === profile.id)

        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          current_book_title: activeSession?.books?.title || null,
          last_page: activeSession?.last_page || 0,
          total_pages: activeSession?.books?.total_pages || 0,
          read_today: readToday,
          logs: userLogs
        }
      })
      setMembers(mappedMembers)

      // Calculate absent members (no entry for both yesterday and today, i.e., daysSince >= 2)
      const absent = mappedMembers.filter(member => {
        const { daysSince } = getLastReadInfo(member.logs)
        return daysSince >= 2
      })
      setAbsentMembers(absent)

      // Map books
      const mappedBooks = dbBooks.map(book => ({
        ...book,
        readerCount: (dbSessions || []).filter(s => s.book_id === book.id).length
      }))
      setBooks(mappedBooks)

      // Load all accounts with Auth details if supabaseAdmin is configured
      let mergedAccounts = []
      if (supabaseAdmin) {
        try {
          const { data: authData, error: authUsersErr } = await supabaseAdmin.auth.admin.listUsers()
          if (authUsersErr) throw authUsersErr
          
          const authUsers = authData?.users || []
          mergedAccounts = authUsers.map(authUser => {
            const profile = (dbProfiles || []).find(p => p.id === authUser.id)
            return {
              id: authUser.id,
              name: profile?.name || authUser.user_metadata?.name || 'مجهول',
              email: authUser.email,
              role: profile?.role || 'member',
              created_at: authUser.created_at || profile?.created_at,
              last_sign_in_at: authUser.last_sign_in_at
            }
          })
          mergedAccounts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        } catch (adminErr) {
          console.error('Error listing auth users via admin API:', adminErr)
          // Fallback to profiles table if admin API fails
          mergedAccounts = (dbProfiles || []).map(profile => ({
            id: profile.id,
            name: profile.name || 'مجهول',
            email: profile.email,
            role: profile.role || 'member',
            created_at: profile.created_at,
            last_sign_in_at: null
          }))
        }
      } else {
        // Fallback to profiles table if supabaseAdmin is not initialized
        mergedAccounts = (dbProfiles || []).map(profile => ({
          id: profile.id,
          name: profile.name || 'مجهول',
          email: profile.email,
          role: profile.role || 'member',
          created_at: profile.created_at,
          last_sign_in_at: null
        }))
      }
      setAllAccounts(mergedAccounts)

    } catch (err) {
      console.error('Error fetching admin dashboard data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type === 'application/pdf') {
      setPdfFile(file)
      setFormError('')
    } else {
      setPdfFile(null)
      setFormError('الرجاء اختيار ملف PDF صالح')
    }
  }

  const getPdfPageCount = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target.result)
          const loadingTask = pdfjs.getDocument({ data: typedarray })
          const pdf = await loadingTask.promise
          resolve(pdf.numPages)
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  const handleAddBook = async (e) => {
    e.preventDefault()
    setFormError('')
    setFormSuccess('')

    if (!title.trim() || !author.trim() || !pdfFile) {
      setFormError('الرجاء تعبئة جميع الحقول واختيار ملف PDF')
      return
    }

    setUploading(true)
    setUploadProgress(10)

    try {
      setUploadProgress(20)
      let totalPages = 0
      try {
        totalPages = await getPdfPageCount(pdfFile)
      } catch {
        throw new Error('فشل قراءة ملف PDF وتحديد عدد الصفحات.')
      }

      setUploadProgress(40)

      const fileExt = pdfFile.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      const filePath = `pdfs/${fileName}`

      const { error: uploadErr } = await supabase.storage
        .from('books')
        .upload(filePath, pdfFile, { cacheControl: '3600', upsert: true })
      if (uploadErr) throw uploadErr

      setUploadProgress(80)

      const { data: { publicUrl } } = supabase.storage.from('books').getPublicUrl(filePath)
      const randomCoverColor = PASTEL_COVERS[Math.floor(Math.random() * PASTEL_COVERS.length)]

      const { error: insertErr } = await supabase.from('books').insert([{
        title: title.trim(), author: author.trim(), category,
        pdf_url: publicUrl, total_pages: totalPages, cover_color: randomCoverColor
      }])
      if (insertErr) throw insertErr

      setUploadProgress(100)
      setFormSuccess('تمت إضافة الكتاب بنجاح!')
      setTitle('')
      setAuthor('')
      setCategory('')
      setPdfFile(null)
      document.getElementById('pdf-upload-input').value = ''
      fetchData()
      setTimeout(() => { setShowAddForm(false); setFormSuccess('') }, 2000)

    } catch (err) {
      setFormError(err.message || 'حدث خطأ أثناء إضافة الكتاب')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteBook = async (bookId, pdfUrl) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا الكتاب بشكل نهائي؟')) return
    try {
      setLoading(true)
      if (pdfUrl && pdfUrl.includes('/books/')) {
        const storagePath = decodeURIComponent(pdfUrl.split('/books/')[1])
        await supabase.storage.from('books').remove([storagePath])
      }
      const { error } = await supabase.from('books').delete().eq('id', bookId)
      if (error) throw error
      fetchData()
    } catch {
      alert('حدث خطأ أثناء حذف الكتاب')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bgMain">
      <Navbar title="متابعة القراءة" />

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div className="text-right">
            <h2 className="text-2xl font-bold text-textPrimary">لوحة التحكم والمتابعة</h2>
            <p className="text-sm text-textSecondary font-medium">متابعة إحصائيات القراءة والتحكم بالكتب والقرّاء</p>
          </div>
          <div className="flex items-center space-x-3 space-x-reverse">
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-2.5 bg-white border border-cardBorder text-textSecondary hover:text-primary rounded-custom shadow-sm transition-all"
              title="تحديث البيانات">
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setShowAddForm(!showAddForm)}
              className="py-2.5 px-4 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 flex items-center space-x-2 space-x-reverse shadow-md shadow-primary/20">
              <Plus className="w-5 h-5" />
              <span>إضافة كتاب جديد</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-right">
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-sm flex items-center justify-between">
            <div className="bg-primary-light p-3.5 rounded-custom"><BookOpen className="w-6 h-6 text-primary" /></div>
            <div>
              <div className="text-3xl font-bold text-textPrimary">{loading ? '...' : stats.booksCount}</div>
              <div className="text-sm font-semibold text-textSecondary mt-1">إجمالي الكتب</div>
            </div>
          </div>
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-sm flex items-center justify-between">
            <div className="bg-blue-50 p-3.5 rounded-custom"><Users className="w-6 h-6 text-blue-600" /></div>
            <div>
              <div className="text-3xl font-bold text-textPrimary">{loading ? '...' : stats.membersCount}</div>
              <div className="text-sm font-semibold text-textSecondary mt-1">الأعضاء المسجلين</div>
            </div>
          </div>
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-sm flex items-center justify-between">
            <div className="bg-green-50 p-3.5 rounded-custom"><UserCheck className="w-6 h-6 text-success" /></div>
            <div>
              <div className="text-3xl font-bold text-success">{loading ? '...' : stats.activeTodayCount}</div>
              <div className="text-sm font-semibold text-textSecondary mt-1">قرّاء اليوم النشطين</div>
            </div>
          </div>
        </div>

        {/* Add Book Form */}
        {showAddForm && (
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-md mb-8 text-right">
            <h3 className="text-lg font-bold text-textPrimary mb-4">إضافة كتاب جديد للمكتبة</h3>
            {formError && (
              <div className="mb-4 bg-red-50 text-danger text-xs font-semibold px-4 py-3 rounded-custom border border-danger/20 flex items-center space-x-2 space-x-reverse">
                <AlertCircle className="w-4 h-4 shrink-0" /><span>{formError}</span>
              </div>
            )}
            {formSuccess && (
              <div className="mb-4 bg-green-50 text-success text-xs font-semibold px-4 py-3 rounded-custom border border-success/20 flex items-center space-x-2 space-x-reverse">
                <Check className="w-4 h-4 shrink-0" /><span>{formSuccess}</span>
              </div>
            )}
            <form onSubmit={handleAddBook} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">عنوان الكتاب</label>
                  <input type="text" required value={title} onChange={e => setTitle(e.target.value)}
                    placeholder="مثال: مقدمة ابن خلدون"
                    className="w-full px-4 py-2.5 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
                </div>
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">المؤلف</label>
                  <input type="text" required value={author} onChange={e => setAuthor(e.target.value)}
                    placeholder="مثال: ابن خلدون"
                    className="w-full px-4 py-2.5 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">تصنيف الكتاب</label>
                  <input type="text" required value={category} onChange={e => setCategory(e.target.value)}
                    placeholder="مثال: تطوير ذات، تاريخ، دين"
                    className="w-full px-4 py-2.5 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right" />
                </div>
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">ملف الكتاب (PDF)</label>
                  <div className="relative">
                    <input id="pdf-upload-input" type="file" required accept="application/pdf"
                      onChange={handleFileChange} className="hidden" />
                    <label htmlFor="pdf-upload-input"
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F8F7F4]/50 border border-dashed border-cardBorder hover:border-primary rounded-custom text-sm cursor-pointer transition-colors">
                      <span className="text-textSecondary truncate">{pdfFile ? pdfFile.name : 'اختر ملف PDF لتسجيله...'}</span>
                      <FileText className="w-5 h-5 text-primary shrink-0 mr-2" />
                    </label>
                  </div>
                </div>
              </div>
              <div className="md:col-span-2 border-t border-cardBorder pt-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="w-full sm:w-1/2">
                  {uploading && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-textSecondary">جاري رفع الملف وتجهيز الصفحات...</div>
                      <ProgressBar progress={uploadProgress} showLabel={true} size="sm" />
                    </div>
                  )}
                </div>
                <div className="flex space-x-2 space-x-reverse self-end">
                  <button type="button" onClick={() => setShowAddForm(false)}
                    className="py-2.5 px-5 border border-cardBorder text-textSecondary font-semibold rounded-custom hover:bg-red-50 hover:text-danger hover:border-danger/30 transition-colors text-sm">
                    إلغاء
                  </button>
                  <button type="submit" disabled={uploading}
                    className="py-2.5 px-6 bg-primary hover:bg-primary/90 text-white font-bold rounded-custom text-sm flex items-center space-x-1.5 space-x-reverse disabled:opacity-50 shadow-md shadow-primary/20">
                    {uploading ? 'جاري الحفظ...' : 'تأكيد إضافة الكتاب'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-8">
          {/* Absence Alerts Section */}
          <div className="bg-white border border-red-200 rounded-custom shadow-sm overflow-hidden text-right">
            <div className="px-6 py-5 border-b border-red-100 bg-red-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-red-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  تنبيهات الغياب
                </h3>
                <p className="text-xs text-red-700 mt-0.5 font-medium">الأعضاء الذين لم يقرؤوا ليومين متتاليين أو أكثر</p>
              </div>
              <span className="bg-red-100 text-red-800 text-xs font-bold px-2.5 py-1 rounded-full self-start sm:self-center">
                {absentMembers.length} أعضاء
              </span>
            </div>
            <div className="p-6">
              {loading ? (
                <div className="py-6 flex justify-center items-center">
                  <div className="w-6 h-6 border-4 border-red-100 border-t-red-600 rounded-full animate-spin"></div>
                </div>
              ) : absentMembers.length === 0 ? (
                <div className="py-4 text-center text-success text-sm font-semibold">
                  لا توجد غيابات حالياً. جميع الأعضاء ملتزمون بالقراءة! 🌟
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {absentMembers.map(member => {
                    const { lastDate, daysSince } = getLastReadInfo(member.logs)
                    const status = sendingNotif[member.id]
                    
                    return (
                      <div key={member.id} className="border border-red-100/70 rounded-custom p-4 bg-red-50/10 hover:bg-red-50/20 transition-all duration-200 flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <div className="flex items-center space-x-3 space-x-reverse min-w-0">
                            <div className="w-10 h-10 rounded-custom bg-red-100 text-red-700 flex items-center justify-center font-bold text-sm shadow-sm border border-red-200/50 shrink-0">
                              {getInitials(member.name)}
                            </div>
                            <div className="text-right min-w-0">
                              <div className="text-sm font-semibold text-red-950 truncate">{member.name || 'قارئ مجهول'}</div>
                              <div className="text-xs text-red-700/70 truncate max-w-[160px]">{member.email}</div>
                            </div>
                          </div>
                          <span className="flex items-center gap-1 bg-red-100/80 text-red-800 px-2.5 py-1 rounded-full text-[11px] font-bold border border-red-200/60 shrink-0">
                            <Flame className="w-3.5 h-3.5 fill-red-500 text-red-500" />
                            <span>منذ {daysSince === Infinity ? 'أبدًا' : `${daysSince} يوم`}</span>
                          </span>
                        </div>
                        
                        <div className="border-t border-red-100/50 pt-3 mt-1 flex justify-between items-center text-xs text-red-800/80 gap-2">
                          <span className="truncate">آخر قراءة: {lastDate || 'لم يقرأ بعد'}</span>
                          <button
                            onClick={() => handleSendReminder(member.id, member.name)}
                            disabled={status === 'sending'}
                            className={`py-1.5 px-3.5 font-bold rounded-custom text-xs transition-all flex items-center space-x-1 space-x-reverse shrink-0 ${
                              status === 'sending'
                                ? 'bg-red-100 text-red-400 cursor-not-allowed border border-red-200'
                                : status === 'success'
                                ? 'bg-green-600 text-white shadow-sm hover:bg-green-700'
                                : status === 'error'
                                ? 'bg-red-700 text-white shadow-sm hover:bg-red-800'
                                : 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/10'
                            }`}
                          >
                            {status === 'sending' ? (
                              <>
                                <div className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"></div>
                                <span>جاري الإرسال...</span>
                              </>
                            ) : status === 'success' ? (
                              <span>تم الإرسال ✓</span>
                            ) : status === 'error' ? (
                              <span>فشل الإرسال ⚠</span>
                            ) : (
                              <span>إرسال تذكير</span>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Members Tracking Section */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden text-right">
            <div className="px-6 py-5 border-b border-cardBorder">
              <h3 className="text-lg font-bold text-textPrimary">متابعة تقدم القرّاء</h3>
              <p className="text-xs text-textSecondary mt-0.5">إنجاز الأعضاء الحالي مع مخطط نشاط القراءة اليومي</p>
            </div>

            <div className="p-6">
              {loading ? (
                <div className="py-12 flex justify-center items-center">
                  <div className="w-8 h-8 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
                </div>
              ) : members.length === 0 ? (
                <div className="py-12 text-center text-textSecondary text-sm font-semibold">
                  لا يوجد أعضاء مسجلين بعد.
                </div>
              ) : (
                <div className="space-y-4">
                  {members.map(member => (
                    <MemberChartPanel key={member.id} member={member} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Books Management Section */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm p-6 text-right">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-textPrimary">إدارة الكتب المتوفرة</h3>
              <p className="text-xs text-textSecondary mt-0.5 font-medium">قائمة الكتب المتاحة للقراءة وعدد القراء الحاليين لكل منها</p>
            </div>
            {loading ? (
              <div className="py-12 flex justify-center items-center">
                <div className="w-8 h-8 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
              </div>
            ) : books.length === 0 ? (
              <div className="py-12 text-center text-textSecondary text-sm font-semibold italic border border-dashed border-cardBorder rounded-custom">
                لا توجد كتب مضافة بعد. أضف كتابك الأول بالضغط على زر "إضافة كتاب جديد".
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {books.map(book => (
                  <div key={book.id} className="border border-cardBorder rounded-custom p-4 flex flex-col justify-between hover:border-primary/20 transition-all">
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <button onClick={() => handleDeleteBook(book.id, book.pdf_url)}
                          className="p-1.5 text-textSecondary hover:text-danger hover:bg-red-50 rounded-custom transition-colors" title="حذف الكتاب">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span className="inline-block px-2.5 py-0.5 bg-primary-light text-primary text-xs font-semibold rounded-full">
                          {book.category}
                        </span>
                      </div>
                      <h4 className="font-bold text-textPrimary text-base line-clamp-1 mb-1">{book.title}</h4>
                      <p className="text-xs text-textSecondary font-semibold mb-2">المؤلف: {book.author}</p>
                    </div>
                    <div className="border-t border-cardBorder/60 pt-3 mt-3 flex justify-between items-center text-xs text-textSecondary font-semibold">
                      <span>عدد الصفحات: {book.total_pages}</span>
                      <span className="bg-primary/5 text-primary px-2 py-0.5 rounded-full">{book.readerCount} يقرؤونه الآن</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account Management Section */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm p-6 text-right">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div>
                <h3 className="text-lg font-bold text-textPrimary flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  إدارة الحسابات
                </h3>
                <p className="text-xs text-textSecondary mt-0.5 font-medium">إنشاء وإدارة حسابات الأعضاء والمدراء وتعديل كلمات المرور</p>
              </div>
              <button 
                onClick={() => {
                  setShowAddAccount(!showAddAccount)
                  setAccountError('')
                  setAccountSuccess('')
                }}
                className="py-2 px-4 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 flex items-center space-x-1.5 space-x-reverse shadow-md shadow-primary/10 shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                <span>إنشاء حساب جديد</span>
              </button>
            </div>

            {/* Error & Success Messages */}
            {accountError && (
              <div className="mb-4 bg-red-50 text-danger text-xs font-semibold px-4 py-3 rounded-custom border border-danger/20 flex items-center space-x-2 space-x-reverse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{accountError}</span>
              </div>
            )}
            {accountSuccess && (
              <div className="mb-4 bg-green-50 text-success text-xs font-semibold px-4 py-3 rounded-custom border border-success/20 flex items-center space-x-2 space-x-reverse">
                <Check className="w-4 h-4 shrink-0" />
                <span>{accountSuccess}</span>
              </div>
            )}

            {/* Create Account Form */}
            {showAddAccount && (
              <div className="bg-[#F8F7F4]/50 border border-cardBorder rounded-custom p-4 mb-6 text-right">
                <h4 className="text-sm font-bold text-textPrimary mb-3 flex items-center gap-1.5">
                  <UserPlus className="w-4 h-4 text-primary" />
                  إنشاء حساب مستخدم جديد
                </h4>
                <form onSubmit={handleCreateAccount} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="text-[11px] font-bold text-textPrimary block mb-1">الاسم الكامل</label>
                    <input 
                      type="text" 
                      required 
                      value={newAccName} 
                      onChange={e => setNewAccName(e.target.value)}
                      placeholder="مثال: محمد أحمد"
                      className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-xs focus:outline-none focus:border-primary text-right" 
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-textPrimary block mb-1">البريد الإلكتروني</label>
                    <input 
                      type="email" 
                      required 
                      value={newAccEmail} 
                      onChange={e => setNewAccEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-xs focus:outline-none focus:border-primary text-right" 
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-textPrimary block mb-1">كلمة المرور</label>
                    <input 
                      type="password" 
                      required 
                      value={newAccPassword} 
                      onChange={e => setNewAccPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-xs focus:outline-none focus:border-primary text-right" 
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-grow">
                      <label className="text-[11px] font-bold text-textPrimary block mb-1">الصلاحية</label>
                      <select 
                        value={newAccRole} 
                        onChange={e => setNewAccRole(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-xs focus:outline-none focus:border-primary text-right appearance-none"
                      >
                        <option value="member">عضو (قارئ)</option>
                        <option value="admin">مدير (مسؤول)</option>
                      </select>
                    </div>
                    <button 
                      type="submit" 
                      disabled={creatingAccount}
                      className="py-2 px-4 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/95 transition-all flex items-center justify-center shrink-0 h-[34px] shadow-sm disabled:opacity-50"
                    >
                      {creatingAccount ? 'جاري الإنشاء...' : 'تأكيد'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Warning Banner if supabaseAdmin is not set */}
            {!supabaseAdmin && (
              <div className="mb-4 bg-orange-50 text-warning text-xs font-semibold px-4 py-3 rounded-custom border border-warning/20 flex items-start space-x-2 space-x-reverse">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-right">
                  <p className="font-bold">مفتاح الخدمة (Service Role Key) غير مهيأ</p>
                  <p className="opacity-90 mt-0.5">يرجى إضافة `VITE_SUPABASE_SERVICE_ROLE_KEY` في ملف `.env` لتفعيل عمليات الحسابات (تغيير كلمات المرور، حذف الحسابات، إنشاء مستخدمين مؤكدين).</p>
                </div>
              </div>
            )}

            {/* Accounts Table */}
            <div className="overflow-x-auto border border-cardBorder rounded-custom">
              <table className="min-w-full divide-y divide-cardBorder text-right">
                <thead className="bg-[#F8F7F4]/80">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold text-textSecondary">الاسم</th>
                    <th className="px-4 py-3 text-xs font-bold text-textSecondary">البريد الإلكتروني</th>
                    <th className="px-4 py-3 text-xs font-bold text-textSecondary text-center">الصلاحية</th>
                    <th className="px-4 py-3 text-xs font-bold text-textSecondary">تاريخ الإنشاء</th>
                    <th className="px-4 py-3 text-xs font-bold text-textSecondary">آخر دخول</th>
                    <th className="px-4 py-3 text-xs font-bold text-textSecondary text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-cardBorder/60 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-textSecondary italic">
                        جاري تحميل قائمة الحسابات...
                      </td>
                    </tr>
                  ) : allAccounts.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-textSecondary italic">
                        لا توجد حسابات مسجلة حالياً.
                      </td>
                    </tr>
                  ) : (
                    allAccounts.map(acc => {
                      const isSelf = acc.id === currentUser?.id
                      
                      return (
                        <tr key={acc.id} className="hover:bg-[#F8F7F4]/20 transition-colors">
                          <td className="px-4 py-3 font-semibold text-textPrimary">{acc.name}</td>
                          <td className="px-4 py-3 text-textSecondary">{acc.email}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              acc.role === 'admin' 
                                ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                                : 'bg-blue-50 text-blue-600 border border-blue-100'
                            }`}>
                              {acc.role === 'admin' ? 'مدير' : 'عضو'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-textSecondary">
                            {acc.created_at ? new Date(acc.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                          </td>
                          <td className="px-4 py-3 text-textSecondary">
                            {acc.last_sign_in_at ? new Date(acc.last_sign_in_at).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'لم يسجل دخول'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2 flex-wrap">
                              
                              {/* Password inline editor trigger */}
                              {editingPasswordUserId === acc.id ? (
                                <div className="flex items-center gap-1 bg-[#F8F7F4] p-1.5 rounded-custom border border-cardBorder">
                                  <input 
                                    type="password" 
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="كلمة مرور جديدة"
                                    className="px-2 py-1 bg-white border border-cardBorder rounded-custom text-[11px] focus:outline-none w-28 text-right"
                                  />
                                  <button 
                                    onClick={() => handleUpdatePassword(acc.id)}
                                    disabled={updatingPassword}
                                    className="px-2 py-1 bg-green-600 text-white rounded-custom hover:bg-green-700 text-[10px] font-bold"
                                  >
                                    حفظ
                                  </button>
                                  <button 
                                    onClick={() => { setEditingPasswordUserId(null); setNewPassword('') }}
                                    className="px-2 py-1 bg-gray-200 text-textSecondary rounded-custom hover:bg-gray-300 text-[10px] font-bold"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => { setEditingPasswordUserId(acc.id); setNewPassword('') }}
                                  disabled={!supabaseAdmin}
                                  className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary-light rounded-custom transition-colors disabled:opacity-30"
                                  title="تغيير كلمة المرور"
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>
                              )}

                              {/* Toggle Role Button */}
                              <button 
                                onClick={() => handleToggleRole(acc.id, acc.role)}
                                className="p-1.5 text-textSecondary hover:text-primary hover:bg-primary-light rounded-custom transition-colors"
                                title="تغيير الدور"
                              >
                                <Shield className="w-4 h-4" />
                              </button>

                              {/* Delete User Button */}
                              <button 
                                onClick={() => handleDeleteAccount(acc.id)}
                                disabled={!supabaseAdmin || isSelf}
                                className="p-1.5 text-textSecondary hover:text-danger hover:bg-red-50 rounded-custom transition-colors disabled:opacity-30"
                                title="حذف الحساب"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>

                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
