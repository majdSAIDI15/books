import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Navbar } from '../components/Navbar'
import { MemberRow } from '../components/MemberRow'
import { ProgressBar } from '../components/ProgressBar'
import { 
  Users, BookOpen, UserCheck, Plus, FileText, Check, AlertCircle, RefreshCw, Trash2
} from 'lucide-react'
import { pdfjs } from 'react-pdf'

// Set PDF.js worker from CDN to avoid packaging issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '3.11.174'}/build/pdf.worker.min.mjs`

const CATEGORIES = ['تاريخ', 'تطوير ذات', 'استراتيجية', 'علوم', 'أدب', 'دين']
const PASTEL_COVERS = ['#EEEDFE', '#E2F1E8', '#FCEEE3', '#E3F2FD', '#F3E5F5', '#FFF9C4', '#FFE0B2', '#D1C4E9']

export const AdminDashboard = () => {
  const [stats, setStats] = useState({ booksCount: 0, membersCount: 0, activeTodayCount: 0 })
  const [members, setMembers] = useState([])
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

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

  const getLocalDateStr = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - (offset * 60 * 1000))
    return localDate.toISOString().split('T')[0]
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const todayStr = getLocalDateStr()

      // 1. Fetch Stats & Listings
      // Fetch books
      const { data: dbBooks, error: booksErr } = await supabase
        .from('books')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (booksErr) throw booksErr

      // Fetch members (profiles table)
      const { data: dbProfiles, error: profilesErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'member')
        .order('created_at', { ascending: false })

      if (profilesErr) throw profilesErr

      // Fetch reading sessions and books info
      const { data: dbSessions, error: sessionsErr } = await supabase
        .from('reading_sessions')
        .select('*, books(title, total_pages)')

      if (sessionsErr) throw sessionsErr

      // Fetch daily logs for today
      const { data: dbTodayLogs, error: logsErr } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('date', todayStr)

      if (logsErr) throw logsErr

      // 2. Compute statistics
      const booksCount = dbBooks?.length || 0
      const membersCount = dbProfiles?.length || 0
      const activeMembersSet = new Set(dbTodayLogs?.map(log => log.user_id))
      const activeTodayCount = activeMembersSet.size

      setStats({ booksCount, membersCount, activeTodayCount })

      // 3. Map members data
      const mappedMembers = dbProfiles.map(profile => {
        // Find latest updated reading session for this member
        const userSessions = dbSessions
          .filter(s => s.user_id === profile.id)
          .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        
        const activeSession = userSessions[0] || null
        const readToday = activeMembersSet.has(profile.id)

        return {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          current_book_title: activeSession?.books?.title || null,
          last_page: activeSession?.last_page || 0,
          total_pages: activeSession?.books?.total_pages || 0,
          read_today: readToday
        }
      })

      setMembers(mappedMembers)

      // 4. Map books with reading counts
      const mappedBooks = dbBooks.map(book => {
        const readerCount = dbSessions.filter(s => s.book_id === book.id).length
        return {
          ...book,
          readerCount
        }
      })

      setBooks(mappedBooks)

    } catch (err) {
      console.error('Error fetching admin dashboard data:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

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

  // Read total pages from PDF file in browser
  const getPdfPageCount = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target.result)
          const loadingTask = pdfjs.getDocument({ data: typedarray })
          const pdf = await loadingTask.promise
          resolve(pdf.numPages)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = (err) => reject(err)
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
      // 1. Get PDF total pages in client side
      let totalPages = 0
      try {
        setUploadProgress(20)
        totalPages = await getPdfPageCount(pdfFile)
      } catch (pdfErr) {
        console.error('Error parsing PDF page count:', pdfErr)
        throw new Error('فشل قراءة ملف PDF وتحديد عدد الصفحات. تأكد من أن الملف غير تالف.')
      }

      setUploadProgress(40)

      // 2. Upload PDF file to Supabase Storage
      const fileExt = pdfFile.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      const filePath = `pdfs/${fileName}`

      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from('books')
        .upload(filePath, pdfFile, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadErr) throw uploadErr

      setUploadProgress(80)

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('books')
        .getPublicUrl(filePath)

      // 4. Select a pastel cover color
      const randomCoverColor = PASTEL_COVERS[Math.floor(Math.random() * PASTEL_COVERS.length)]

      // 5. Insert Book metadata to DB
      const { error: insertErr } = await supabase
        .from('books')
        .insert([
          {
            title: title.trim(),
            author: author.trim(),
            category: category,
            pdf_url: publicUrl,
            total_pages: totalPages,
            cover_color: randomCoverColor
          }
        ])

      if (insertErr) throw insertErr

      setUploadProgress(100)
      setFormSuccess('تمت إضافة الكتاب بنجاح!')
      
      // Clear form
      setTitle('')
      setAuthor('')
      setCategory('')
      setPdfFile(null)
      // Reset input element
      document.getElementById('pdf-upload-input').value = ''
      
      // Reload lists
      fetchData()

      // Close form after delay
      setTimeout(() => {
        setShowAddForm(false)
        setFormSuccess('')
      }, 2000)

    } catch (err) {
      console.error(err)
      setFormError(err.message || 'حدث خطأ أثناء إضافة الكتاب')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteBook = async (bookId, pdfUrl) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في حذف هذا الكتاب بشكل نهائي؟')) return

    try {
      setLoading(true)

      // Extract storage path from url if possible
      // publicUrl format: .../storage/v1/object/public/books/pdfs/filename.pdf
      if (pdfUrl && pdfUrl.includes('/books/')) {
        const pathParts = pdfUrl.split('/books/')
        if (pathParts.length > 1) {
          const storagePath = decodeURIComponent(pathParts[1])
          // Delete from storage
          await supabase.storage.from('books').remove([storagePath])
        }
      }

      // Delete from DB
      const { error } = await supabase.from('books').delete().eq('id', bookId)
      if (error) throw error

      fetchData()
    } catch (err) {
      console.error('Error deleting book:', err.message)
      alert('حدث خطأ أثناء حذف الكتاب')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bgMain">
      <Navbar title="متابعة القراءة" />

      <main className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 space-y-4 sm:space-y-0">
          <div className="text-right">
            <h2 className="text-2xl font-bold text-textPrimary">لوحة التحكم والمتابعة</h2>
            <p className="text-sm text-textSecondary font-medium">متابعة إحصائيات القراءة والتحكم بالكتب والقرّاء</p>
          </div>
          
          <div className="flex items-center space-x-3 space-x-reverse">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2.5 bg-white border border-cardBorder text-textSecondary hover:text-primary rounded-custom shadow-sm transition-all duration-200"
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="py-2.5 px-4 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 transition-all duration-200 flex items-center space-x-2 space-x-reverse shadow-md shadow-primary/20"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة كتاب جديد</span>
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-right">
          
          {/* Card 1: Books Count */}
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-sm flex items-center justify-between">
            <div className="bg-primary-light p-3.5 rounded-custom">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-3xl font-bold text-textPrimary">
                {loading ? '...' : stats.booksCount}
              </div>
              <div className="text-sm font-semibold text-textSecondary mt-1">إجمالي الكتب</div>
            </div>
          </div>

          {/* Card 2: Members Count */}
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-sm flex items-center justify-between">
            <div className="bg-blue-50 p-3.5 rounded-custom">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <div className="text-3xl font-bold text-textPrimary">
                {loading ? '...' : stats.membersCount}
              </div>
              <div className="text-sm font-semibold text-textSecondary mt-1">الأعضاء المسجلين</div>
            </div>
          </div>

          {/* Card 3: Active Today */}
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-sm flex items-center justify-between">
            <div className="bg-green-50 p-3.5 rounded-custom">
              <UserCheck className="w-6 h-6 text-success" />
            </div>
            <div>
              <div className="text-3xl font-bold text-success">
                {loading ? '...' : stats.activeTodayCount}
              </div>
              <div className="text-sm font-semibold text-textSecondary mt-1">قرّاء اليوم النشطين</div>
            </div>
          </div>

        </div>

        {/* Add Book Inline Form */}
        {showAddForm && (
          <div className="bg-white border border-cardBorder rounded-custom p-6 shadow-md mb-8 text-right animate-fadeIn">
            <h3 className="text-lg font-bold text-textPrimary mb-4">إضافة كتاب جديد للمكتبة</h3>
            
            {formError && (
              <div className="mb-4 bg-red-50 text-danger text-xs font-semibold px-4 py-3 rounded-custom border border-danger/20 flex items-center space-x-2 space-x-reverse">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 bg-green-50 text-success text-xs font-semibold px-4 py-3 rounded-custom border border-success/20 flex items-center space-x-2 space-x-reverse">
                <Check className="w-4 h-4 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddBook} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">عنوان الكتاب</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: مقدمة ابن خلدون"
                    className="w-full px-4 py-2.5 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">المؤلف</label>
                  <input
                    type="text"
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="مثال: ابن خلدون"
                    className="w-full px-4 py-2.5 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">تصنيف الكتاب</label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="مثال: تطوير ذات، تاريخ، دين"
                    className="w-full px-4 py-2.5 bg-[#F8F7F4]/50 border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary text-right"
                  />
                </div>
                
                <div>
                  <label className="text-xs font-bold text-textPrimary block mb-1">ملف الكتاب (PDF)</label>
                  <div className="relative">
                    <input
                      id="pdf-upload-input"
                      type="file"
                      required
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="pdf-upload-input"
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-[#F8F7F4]/50 border border-dashed border-cardBorder hover:border-primary rounded-custom text-sm cursor-pointer transition-colors"
                    >
                      <span className="text-textSecondary truncate">
                        {pdfFile ? pdfFile.name : 'اختر ملف PDF لتسجيله...'}
                      </span>
                      <FileText className="w-5 h-5 text-primary shrink-0 mr-2" />
                    </label>
                  </div>
                </div>
              </div>

              {/* Progress and Action Button */}
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
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="py-2.5 px-5 border border-cardBorder text-textSecondary font-semibold rounded-custom hover:bg-red-50 hover:text-danger hover:border-danger/30 transition-colors text-sm"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="py-2.5 px-6 bg-primary hover:bg-primary/90 text-white font-bold rounded-custom transition-all duration-200 shadow-md shadow-primary/20 text-sm flex items-center space-x-1.5 space-x-reverse disabled:opacity-50"
                  >
                    {uploading ? 'جاري الحفظ...' : 'تأكيد إضافة الكتاب'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Content sections */}
        <div className="space-y-8">
          
          {/* Members Tracking Table Section */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden text-right">
            <div className="px-6 py-5 border-b border-cardBorder">
              <h3 className="text-lg font-bold text-textPrimary">متابعة تقدم القرّاء</h3>
              <p className="text-xs text-textSecondary mt-0.5">جدول يوضح إنجاز الأعضاء الحالي والكتب النشطة</p>
            </div>
            
            <div className="overflow-x-auto">
              {loading ? (
                <div className="py-12 flex justify-center items-center">
                  <div className="w-8 h-8 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
                </div>
              ) : members.length === 0 ? (
                <div className="py-12 text-center text-textSecondary text-sm font-semibold">
                  لا يوجد أعضاء مسجلين بعد.
                </div>
              ) : (
                <table className="w-full text-right divide-y divide-cardBorder">
                  <thead className="bg-[#F8F7F4]/40 text-xs font-bold text-textSecondary uppercase tracking-wider">
                    <tr>
                      <th scope="col" className="px-6 py-4">القارئ</th>
                      <th scope="col" className="px-6 py-4">الكتاب الحالي</th>
                      <th scope="col" className="px-6 py-4">نسبة الإنجاز</th>
                      <th scope="col" className="px-6 py-4">نشاط اليوم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cardBorder bg-white">
                    {members.map(member => (
                      <MemberRow key={member.id} member={member} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Books Management Section */}
          <div className="bg-white border border-cardBorder rounded-custom shadow-sm p-6 text-right">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-textPrimary font-arabic">إدارة الكتب المتوفرة</h3>
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
                        <button
                          onClick={() => handleDeleteBook(book.id, book.pdf_url)}
                          className="p-1.5 text-textSecondary hover:text-danger hover:bg-red-50 rounded-custom transition-colors"
                          title="حذف الكتاب"
                        >
                          <Trash2 className="w-4.5 h-4.5" />
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
                      <span className="bg-primary/5 text-primary px-2 py-0.5 rounded-full">
                        {book.readerCount} يقرؤونه الآن
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </main>
    </div>
  )
}
