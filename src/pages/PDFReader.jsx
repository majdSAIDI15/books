import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Document, Page, pdfjs } from 'react-pdf'
import { ArrowRight, BookOpen, AlertTriangle, RefreshCw } from 'lucide-react'

// Set PDF.js worker from CDN to avoid packaging issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version || '3.11.174'}/build/pdf.worker.min.mjs`

export const PDFReader = () => {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [book, setBook] = useState(null)
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [error, setError] = useState('')

  // State to track session progress
  const initialPageRef = useRef(1)
  const maxPageReachedRef = useRef(1)
  const alreadyReadTodayRef = useRef(0)
  const currentPageRef = useRef(1)
  const hasScrolledRef = useRef(false)
  const observerRef = useRef(null)

  // Responsive page width state
  const [pageWidth, setPageWidth] = useState(window.innerWidth > 768 ? 650 : window.innerWidth - 32)
  
  // Toast notifications state
  const [showToast, setShowToast] = useState(false)

  const getLocalDateStr = () => {
    const d = new Date()
    const offset = d.getTimezoneOffset()
    const localDate = new Date(d.getTime() - (offset * 60 * 1000))
    return localDate.toISOString().split('T')[0]
  }

  // Handle responsive width adjustment
  useEffect(() => {
    const handleResize = () => {
      setPageWidth(window.innerWidth > 768 ? 650 : window.innerWidth - 32)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Toast auto-hide
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => {
        setShowToast(false)
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [showToast])

  // Fetch book metadata and user's last read page
  useEffect(() => {
    const loadBookAndSession = async () => {
      if (!user || !bookId) return
      try {
        setLoading(true)
        setError('')

        // 1. Fetch book details
        const { data: dbBook, error: bookErr } = await supabase
          .from('books')
          .select('*')
          .eq('id', bookId)
          .single()

        if (bookErr) throw bookErr
        setBook(dbBook)

        // 2. Fetch user's reading session for this book
        const { data: dbSession, error: sessionErr } = await supabase
          .from('reading_sessions')
          .select('last_page')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .single()

        let startPage = 1
        if (!sessionErr && dbSession) {
          startPage = dbSession.last_page || 1
        }
        
        setCurrentPage(startPage)
        currentPageRef.current = startPage
        initialPageRef.current = startPage
        maxPageReachedRef.current = startPage

        // 3. Fetch user's daily log read count for today
        const todayStr = getLocalDateStr()
        const { data: dbLog, error: logErr } = await supabase
          .from('daily_logs')
          .select('pages_read')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .eq('date', todayStr)
          .single()

        if (!logErr && dbLog) {
          alreadyReadTodayRef.current = dbLog.pages_read || 0
        } else {
          alreadyReadTodayRef.current = 0
        }

      } catch (err) {
        console.error('Error loading book/session:', err)
        setError('فشل تحميل تفاصيل الكتاب. الرجاء التحقق من الرابط والمحاولة مجدداً.')
      } finally {
        setLoading(false)
      }
    }

    loadBookAndSession()
  }, [user, bookId])

  // Save on tab close / reload (unload keepalive)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!user || !bookId) return
      
      const todayStr = getLocalDateStr()
      const currentPageNum = currentPageRef.current
      const pagesReadToday = Math.max(alreadyReadTodayRef.current, currentPageNum)

      const headers = {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      }

      // Upsert Reading Session using keepalive: true
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/reading_sessions`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          user_id: user.id,
          book_id: bookId,
          last_page: currentPageNum,
          updated_at: new Date().toISOString()
        }),
        keepalive: true
      })

      // Upsert Daily Log using keepalive: true
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/daily_logs`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          user_id: user.id,
          book_id: bookId,
          pages_read: pagesReadToday,
          date: todayStr
        }),
        keepalive: true
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [user, bookId])

  // Track page change and save progress to Supabase
  const handlePageChange = async (newPage) => {
    if (!user || !bookId || newPage < 1 || (numPages && newPage > numPages)) return

    setCurrentPage(newPage)
    currentPageRef.current = newPage
    maxPageReachedRef.current = Math.max(maxPageReachedRef.current, newPage)

    try {
      const todayStr = getLocalDateStr()

      // 1. Save Reading Session (last read page)
      const { error: sessionErr } = await supabase
        .from('reading_sessions')
        .upsert(
          {
            user_id: user.id,
            book_id: bookId,
            last_page: newPage,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,book_id' }
        )
      
      if (sessionErr) throw sessionErr

      // 2. Save Daily Log progress (set pages_read = max(pages_read, currentPage))
      const pagesReadToday = Math.max(alreadyReadTodayRef.current, newPage)
      
      const { error: logErr } = await supabase
        .from('daily_logs')
        .upsert(
          {
            user_id: user.id,
            book_id: bookId,
            pages_read: pagesReadToday,
            date: todayStr
          },
          { onConflict: 'user_id,book_id,date' }
        )

      if (logErr) throw logErr
      
      alreadyReadTodayRef.current = pagesReadToday

      // Show Arabic Save success toast briefly
      setShowToast(true)

    } catch (err) {
      console.error('Error auto-saving reading progress:', err.message)
    }
  }

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setPdfLoading(false)

    // Update books total pages in the database if it doesn't match
    if (book && book.total_pages !== numPages) {
      supabase
        .from('books')
        .update({ total_pages: numPages })
        .eq('id', book.id)
        .then(({ error }) => {
          if (error) console.error('Failed to sync book total pages:', error.message)
        })
    }
  }

  // IntersectionObserver to watch page viewing activity
  useEffect(() => {
    if (pdfLoading || !numPages) return

    const observerOptions = {
      root: null, // relative to viewport
      rootMargin: '-35% 0px -45% 0px', // check center focus
      threshold: 0
    }

    const observerCallback = (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const pageNum = parseInt(entry.target.getAttribute('data-page-number'), 10)
          if (pageNum && pageNum !== currentPageRef.current) {
            handlePageChange(pageNum)
          }
        }
      })
    }

    const observer = new IntersectionObserver(observerCallback, observerOptions)
    observerRef.current = observer

    // Wait short window for DOM content mapping
    const timer = setTimeout(() => {
      const elements = document.querySelectorAll('.page-wrapper')
      elements.forEach(el => observer.observe(el))
    }, 500)

    return () => {
      clearTimeout(timer)
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [pdfLoading, numPages])

  // Scroll to Resume reading page
  const onPageRenderSuccess = (pageNum) => {
    if (pageNum === initialPageRef.current && !hasScrolledRef.current) {
      hasScrolledRef.current = true
      setTimeout(() => {
        const el = document.querySelector(`[data-page-number="${pageNum}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
    }
  }

  // Fallback Scroll to Resume if page rendering events trigger unevenly
  useEffect(() => {
    if (!pdfLoading && numPages && !hasScrolledRef.current) {
      const timer = setTimeout(() => {
        const el = document.querySelector(`[data-page-number="${initialPageRef.current}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'auto', block: 'start' })
          hasScrolledRef.current = true
        }
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [pdfLoading, numPages])

  if (loading) {
    return (
      <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
          <p className="text-textPrimary text-lg font-medium animate-pulse">جاري تحميل قارئ الكتب...</p>
        </div>
      </div>
    )
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4 text-center">
        <div className="bg-white border border-cardBorder rounded-custom p-8 shadow-sm max-w-md w-full">
          <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h2 className="text-lg font-bold text-textPrimary mb-2">عذراً، حدث خطأ</h2>
          <p className="text-sm text-textSecondary mb-6 font-medium">{error || 'الكتاب غير موجود.'}</p>
          <button
            onClick={() => navigate('/member')}
            className="w-full py-2.5 bg-primary text-white font-bold rounded-custom hover:bg-primary/95 transition-colors"
          >
            العودة إلى لوحة التحكم
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bgMain flex flex-col justify-between">
      
      {/* Reader Navbar */}
      <nav className="bg-white border-b border-cardBorder shadow-sm px-6 py-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/member')}
            className="flex items-center space-x-2 space-x-reverse text-textSecondary hover:text-primary transition-colors text-sm font-semibold"
          >
            <ArrowRight className="w-5 h-5" />
            <span>رجوع للمكتبة</span>
          </button>
          
          <div className="text-center flex items-center space-x-2 space-x-reverse">
            <BookOpen className="w-5 h-5 text-primary" />
            <h1 className="font-bold text-textPrimary text-base line-clamp-1 max-w-xs md:max-w-md">
              {book.title}
            </h1>
          </div>

          <div className="text-xs text-textSecondary font-bold">
            جاري التصفح...
          </div>
        </div>
      </nav>

      {/* Main PDF View Area with Stacked Pages */}
      <main className="flex-grow flex items-center justify-center p-4 overflow-y-visible">
        <div className="max-w-3xl w-full flex flex-col items-center">
          
          {pdfLoading && (
            <div className="flex flex-col items-center space-y-3 py-20">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-textSecondary font-semibold">جاري معالجة وعرض صفحات الكتاب...</p>
            </div>
          )}

          <div className={`pdf-container ${pdfLoading ? 'hidden' : 'flex'} flex-col w-full space-y-6 pb-24`}>
            <Document
              file={book.pdf_url}
              onLoadSuccess={onDocumentLoadSuccess}
              loading=""
              error={
                <div className="text-center py-8 text-danger font-semibold bg-white border border-cardBorder rounded-custom p-6">
                  عذراً، فشل تحميل ملف PDF. يرجى التأكد من اتصال الإنترنت أو صحة رابط الكتاب.
                </div>
              }
            >
              {Array.from(new Array(numPages), (el, index) => (
                <div 
                  key={index} 
                  data-page-number={index + 1} 
                  className="page-wrapper flex justify-center w-full my-3"
                >
                  <Page 
                    pageNumber={index + 1} 
                    width={pageWidth} 
                    renderTextLayer={false} 
                    renderAnnotationLayer={false}
                    onRenderSuccess={() => onPageRenderSuccess(index + 1)}
                  />
                </div>
              ))}
            </Document>
          </div>

        </div>
      </main>

      {/* Fixed Page Indicator (Floating Pill at Bottom Center) */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-[#2C2C2A]/90 text-white py-2 px-5 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm pointer-events-none flex items-center space-x-1.5 space-x-reverse border border-[#E0DED6]/20">
        <span>صفحة</span>
        <span className="text-[#EEEDFE]">{currentPage}</span>
        <span className="opacity-60">/</span>
        <span className="opacity-80">{numPages || '...'}</span>
      </div>

      {/* Floating Arabic Toast "تم الحفظ ✓" */}
      <div 
        className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 bg-[#1D9E75] text-white py-2 px-5 rounded-custom text-xs font-semibold shadow-md flex items-center space-x-1 space-x-reverse transition-all duration-300 ${
          showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}
      >
        <span>تم الحفظ</span>
        <span className="font-bold">✓</span>
      </div>

    </div>
  )
}
