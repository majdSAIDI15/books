import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Document, Page, pdfjs } from 'react-pdf'
import { ArrowRight, BookOpen, AlertTriangle, RefreshCw, FileText, Trash2, X } from 'lucide-react'

// Import text layer styles for text selection
import 'react-pdf/dist/Page/TextLayer.css'

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
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState('')


  // State to track session progress
  const initialPageRef = useRef(1)
  const maxPageReachedRef = useRef(1)
  const alreadyReadTodayRef = useRef(0)
  const currentPageRef = useRef(1)
  const hasScrolledRef = useRef(false)
  const observerRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const pendingSaveRef = useRef(false)

  // Responsive page width state
  const [pageWidth, setPageWidth] = useState(window.innerWidth > 768 ? 650 : window.innerWidth - 32)
  
  // Toast notifications state
  const [showToast, setShowToast] = useState(false)

  // Annotations state
  const [annotations, setAnnotations] = useState([])
  const [selectionState, setSelectionState] = useState({
    text: '',
    pageNum: null,
    rect: null,
    showToolbar: false,
    showCommentInput: false,
    commentText: ''
  })
  
  // Sidebar and personal notes state
  const [showPanel, setShowPanel] = useState(false)
  const [notesContent, setNotesContent] = useState('')
  const [saveStatus, setSaveStatus] = useState('') // '', 'saving', 'saved', 'error'
  const notesRef = useRef('')
  const notesTimeoutRef = useRef(null)
  const latestNotesContentRef = useRef('')


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

  }, [user, bookId])

  // Helper to highlight annotations on a specific page
  const highlightSavedAnnotationsOnPage = (pageNum, pageAnnotations) => {
    const pageEl = document.querySelector(`[data-page-number="${pageNum}"]`)
    if (!pageEl || !pageAnnotations || pageAnnotations.length === 0) return

    const textLayer = pageEl.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    const spans = Array.from(textLayer.querySelectorAll('span'))
    if (spans.length === 0) return

    pageAnnotations.forEach(ann => {
      const textToFind = ann.selected_text.trim()
      if (!textToFind) return

      spans.forEach(span => {
        const spanText = span.textContent
        if (spanText.includes(textToFind) && !span.querySelector('.custom-pdf-highlight')) {
          const escapedText = textToFind.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
          const regex = new RegExp(`(${escapedText})`, 'gi')
          
          let bgStyle = 'rgba(253, 224, 71, 0.45)' // yellow
          if (ann.color === 'blue') bgStyle = 'rgba(147, 197, 253, 0.45)'
          else if (ann.color === 'red') bgStyle = 'rgba(252, 165, 165, 0.45)'

          span.innerHTML = spanText.replace(
            regex,
            `<mark class="custom-pdf-highlight rounded-[2px]" style="background-color: ${bgStyle}; color: inherit; padding: 1px 0;">$1</mark>`
          )
        }
      })
    })
  }

  const clearHighlightsOnPage = (pageNum) => {
    const pageEl = document.querySelector(`[data-page-number="${pageNum}"]`)
    if (!pageEl) return
    const textLayer = pageEl.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    const highlights = textLayer.querySelectorAll('.custom-pdf-highlight')
    highlights.forEach(hl => {
      const parent = hl.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(hl.textContent), hl)
        parent.normalize()
      }
    })
  }

  const highlightSavedAnnotations = (list = annotations) => {
    if (!list || list.length === 0) return
    
    const pageElements = document.querySelectorAll('.page-wrapper')
    pageElements.forEach(pageEl => {
      const pageNumAttr = pageEl.getAttribute('data-page-number')
      if (!pageNumAttr) return
      const pageNum = parseInt(pageNumAttr, 10)
      
      const pageAnnotations = list.filter(ann => ann.page_number === pageNum)
      if (pageAnnotations.length > 0) {
        highlightSavedAnnotationsOnPage(pageNum, pageAnnotations)
      }
    })
  }

  // Load annotations and notes
  useEffect(() => {
    const loadAnnotationsAndNotes = async () => {
      if (!user || !bookId) return
      try {
        const { data: annData, error: annError } = await supabase
          .from('annotations')
          .select('*')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .order('page_number', { ascending: true })

        if (annError) throw annError
        setAnnotations(annData || [])

        const { data: noteData, error: noteError } = await supabase
          .from('book_notes')
          .select('content')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .maybeSingle()

        if (noteError) throw noteError
        if (noteData) {
          setNotesContent(noteData.content || '')
          notesRef.current = noteData.content || ''
          latestNotesContentRef.current = noteData.content || ''
        }
      } catch (err) {
        console.error('Error fetching annotations/notes:', err.message)
      }
    }

    loadAnnotationsAndNotes()
  }, [user, bookId])

  // Run highlighting when annotations load or PDF is ready
  useEffect(() => {
    if (!pdfLoading && annotations.length > 0) {
      const timer = setTimeout(() => {
        highlightSavedAnnotations(annotations)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [pdfLoading, annotations])

  // Selection detection
  useEffect(() => {
    const handleSelection = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) return

      const text = selection.toString().trim()
      if (!text) return

      const container = document.querySelector('.pdf-container')
      if (!container || !container.contains(selection.anchorNode)) return

      let node = selection.anchorNode
      let pageNum = null
      while (node && node !== document.body) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const dataPage = node.getAttribute('data-page-number')
          if (dataPage) {
            pageNum = parseInt(dataPage, 10)
            break
          }
        }
        node = node.parentNode
      }

      if (!pageNum) return

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      setSelectionState({
        text,
        pageNum,
        rect: {
          clientY: rect.top,
          clientX: rect.left,
          width: rect.width,
          height: rect.height
        },
        showToolbar: true,
        showCommentInput: false,
        commentText: ''
      })
    }

    const onMouseUp = () => {
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) {
          const activeEl = document.activeElement
          const isToolbarFocused = activeEl && activeEl.closest('.selection-toolbar')
          
          if (!isToolbarFocused) {
            setSelectionState(prev => {
              if (prev.showCommentInput) return prev
              return { ...prev, showToolbar: false }
            })
          }
        } else {
          handleSelection()
        }
      }, 80)
    }

    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchend', onMouseUp)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchend', onMouseUp)
    }
  }, [])

  // Save annotation to Supabase
  const saveAnnotation = async (color, comment = null) => {
    if (!user || !bookId || !selectionState.text) return

    try {
      const { data, error } = await supabase
        .from('annotations')
        .insert({
          user_id: user.id,
          book_id: bookId,
          page_number: selectionState.pageNum,
          selected_text: selectionState.text,
          color: color,
          comment: comment || null
        })
        .select()

      if (error) throw error

      if (data && data[0]) {
        const newAnn = data[0]
        setAnnotations(prev => {
          const updated = [...prev, newAnn]
          setTimeout(() => {
            highlightSavedAnnotationsOnPage(newAnn.page_number, [newAnn])
          }, 100)
          return updated
        })
      }

      setSelectionState({
        text: '',
        pageNum: null,
        rect: null,
        showToolbar: false,
        showCommentInput: false,
        commentText: ''
      })
      window.getSelection().removeAllRanges()

    } catch (err) {
      console.error('Error saving annotation:', err.message)
    }
  }

  // Delete annotation from Supabase
  const deleteAnnotation = async (ann) => {
    if (!user) return

    try {
      const { error } = await supabase
        .from('annotations')
        .delete()
        .eq('id', ann.id)

      if (error) throw error

      setAnnotations(prev => {
        const updated = prev.filter(item => item.id !== ann.id)
        clearHighlightsOnPage(ann.page_number)
        const pageAnnotations = updated.filter(item => item.page_number === ann.page_number)
        if (pageAnnotations.length > 0) {
          highlightSavedAnnotationsOnPage(ann.page_number, pageAnnotations)
        }
        return updated
      })

    } catch (err) {
      console.error('Error deleting annotation:', err.message)
    }
  }

  // Notes area handlers
  const handleNotesChange = (e) => {
    const val = e.target.value
    setNotesContent(val)
    latestNotesContentRef.current = val
    
    if (notesTimeoutRef.current) {
      clearTimeout(notesTimeoutRef.current)
    }
    
    setSaveStatus('saving')
    notesTimeoutRef.current = setTimeout(() => {
      saveNotesToDatabase(val)
    }, 3000)
  }

  const saveNotesToDatabase = async (content) => {
    if (!user || !bookId) return
    try {
      const { error } = await supabase
        .from('book_notes')
        .upsert({
          user_id: user.id,
          book_id: bookId,
          content: content,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,book_id' })

      if (error) throw error
      setSaveStatus('saved')
      notesRef.current = content
    } catch (err) {
      console.error('Error saving notes:', err.message)
      setSaveStatus('error')
    }
  }

  // Save notes on unmount if dirty
  useEffect(() => {
    return () => {
      if (notesTimeoutRef.current) {
        clearTimeout(notesTimeoutRef.current)
      }
      const finalVal = latestNotesContentRef.current
      if (finalVal !== notesRef.current && user && bookId) {
        supabase.from('book_notes').upsert({
          user_id: user.id,
          book_id: bookId,
          content: finalVal,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,book_id' }).then(({ error }) => {
          if (error) console.error('Error saving notes on unmount:', error.message)
        })
      }
    }
  }, [user, bookId])


  // Save on unmount / component cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (pendingSaveRef.current) {
        const maxReached = maxPageReachedRef.current
        const todayStr = getLocalDateStr()
        const pagesReadToday = Math.max(alreadyReadTodayRef.current, maxReached)

        supabase.from('reading_sessions').upsert({
          user_id: user.id,
          book_id: bookId,
          last_page: maxReached,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,book_id' }).then(({ error }) => {
          if (error) console.error('Error saving reading session on unmount:', error.message)
        })

        supabase.from('daily_logs').upsert({
          user_id: user.id,
          book_id: bookId,
          pages_read: pagesReadToday,
          date: todayStr
        }, { onConflict: 'user_id,book_id,date' }).then(({ error }) => {
          if (error) console.error('Error saving daily log on unmount:', error.message)
        })
      }
    }
  }, [user, bookId])

  // Save on tab close / reload (unload keepalive)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!user || !bookId) return
      
      const todayStr = getLocalDateStr()
      const maxReached = maxPageReachedRef.current
      const pagesReadToday = Math.max(alreadyReadTodayRef.current, maxReached)

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
          last_page: maxReached,
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

  const saveProgressToDatabase = async () => {
    if (!user || !bookId) return
    const maxReached = maxPageReachedRef.current
    const todayStr = getLocalDateStr()

    try {
      // 1. Save Reading Session (last read page)
      const { error: sessionErr } = await supabase
        .from('reading_sessions')
        .upsert(
          {
            user_id: user.id,
            book_id: bookId,
            last_page: maxReached,
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id,book_id' }
        )
      
      if (sessionErr) throw sessionErr

      // 2. Save Daily Log progress (set pages_read = max(pages_read, maxReached))
      const pagesReadToday = Math.max(alreadyReadTodayRef.current, maxReached)
      
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
      pendingSaveRef.current = false

      // Show Arabic Save success toast briefly
      setShowToast(true)

    } catch (err) {
      console.error('Error saving reading progress:', err.message)
    }
  }

  // Track page change and save progress to Supabase after 3 seconds stay
  const handlePageChange = async (newPage) => {
    if (!user || !bookId || newPage < 1 || (numPages && newPage > numPages)) return

    setCurrentPage(newPage)
    currentPageRef.current = newPage
    
    // Only update maxPageReachedRef and set pending save if it's a new high page
    if (newPage > maxPageReachedRef.current) {
      maxPageReachedRef.current = newPage
      pendingSaveRef.current = true
      
      // Debounce database write for 3 seconds
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        saveProgressToDatabase()
      }, 3000)
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
          else {
            setBook(prev => prev ? { ...prev, total_pages: numPages } : null)
          }
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

    // Apply highlighting for this page when it renders
    const pageAnnotations = annotations.filter(ann => ann.page_number === pageNum)
    if (pageAnnotations.length > 0) {
      setTimeout(() => {
        highlightSavedAnnotationsOnPage(pageNum, pageAnnotations)
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

          <div className="flex items-center space-x-2 space-x-reverse">
            <button
              onClick={() => setShowPanel(true)}
              className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-custom font-bold text-xs transition-all"
            >
              <FileText className="w-4 h-4" />
              <span>ملاحظاتي</span>
            </button>
          </div>

        </div>
      </nav>

      {/* Main PDF View Area with Stacked Pages */}
      <main className="flex-grow flex items-center justify-center p-4 overflow-y-visible">
        <div className="max-w-3xl w-full flex flex-col items-center">
          
          {pdfLoading && (
            <div className="flex flex-col items-center space-y-3 py-20">
              <RefreshCw className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm text-textSecondary font-semibold animate-pulse">
                جاري تحميل الكتاب... {loadProgress > 0 ? `${loadProgress}%` : ''}
              </p>
              {loadProgress > 0 && (
                <div className="w-48 bg-primary-light rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-1.5 transition-all duration-300" style={{ width: `${loadProgress}%` }}></div>
                </div>
              )}
            </div>
          )}

          <div className={`pdf-container ${pdfLoading ? 'hidden' : 'flex'} flex-col w-full space-y-6 pb-24`}>
            <Document
              file={book.pdf_url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadProgress={({ loaded, total }) => {
                if (total > 0) {
                  setLoadProgress(Math.round((loaded / total) * 100))
                }
              }}
              loading=""
              error={
                <div className="text-center py-8 text-danger font-semibold bg-white border border-cardBorder rounded-custom p-6">
                  عذراً، فشل تحميل ملف PDF. يرجى التأكد من اتصال الإنترنت أو صحة رابط الكتاب.
                </div>
              }
            >
              {Array.from(new Array(numPages), (el, index) => {
                const pageNum = index + 1
                const isNear = Math.abs(pageNum - currentPage) <= 2
                const estimatedHeight = pageWidth * 1.414

                return (
                  <div 
                    key={index} 
                    data-page-number={pageNum} 
                    className="page-wrapper flex justify-center w-full my-3"
                    style={{ minHeight: isNear ? 'auto' : `${estimatedHeight}px` }}
                  >
                    {isNear ? (
                      <Page 
                        pageNumber={pageNum} 
                        width={pageWidth} 
                        renderTextLayer={true} 
                        renderAnnotationLayer={false}
                        onRenderSuccess={() => onPageRenderSuccess(pageNum)}

                        loading={
                          <div className="flex flex-col items-center justify-center bg-white border border-cardBorder rounded-custom animate-pulse shadow-sm" style={{ width: `${pageWidth}px`, height: `${estimatedHeight}px` }}>
                            <div className="w-8 h-8 border-2 border-primary-light border-t-primary rounded-full animate-spin"></div>
                          </div>
                        }
                      />
                    ) : (
                      <div 
                        className="flex flex-col items-center justify-center bg-[#F8F7F4]/40 border border-dashed border-cardBorder/30 rounded-custom transition-all duration-200" 
                        style={{ width: `${pageWidth}px`, height: `${estimatedHeight}px` }}
                      >
                        <span className="text-xs text-textSecondary/40 font-semibold">صفحة {pageNum}</span>
                      </div>
                    )}
                  </div>
                )
              })}
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

      {/* Floating Selection Toolbar */}
      {selectionState.showToolbar && selectionState.rect && (
        <div
          className="fixed z-50 bg-[#2C2C2A] text-white shadow-xl rounded-custom px-3 py-2 flex flex-col space-y-2 border border-[#E0DED6]/20 backdrop-blur-md animate-fade-in selection-toolbar"
          style={{
            top: `${
              selectionState.rect.clientY > 110
                ? selectionState.rect.clientY - 60
                : selectionState.rect.clientY + selectionState.rect.height + 15
            }px`,
            left: `${selectionState.rect.clientX + selectionState.rect.width / 2}px`,
            transform: 'translateX(-50%)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          {!selectionState.showCommentInput ? (
            <div className="flex items-center space-x-2 space-x-reverse">
              <button
                onClick={() => saveAnnotation('yellow')}
                className="w-6 h-6 rounded-full bg-amber-400 hover:scale-110 transition-transform flex items-center justify-center text-[10px]"
                title="تظليل أصفر"
              >
                🟡
              </button>
              <button
                onClick={() => saveAnnotation('blue')}
                className="w-6 h-6 rounded-full bg-blue-400 hover:scale-110 transition-transform flex items-center justify-center text-[10px]"
                title="تظليل أزرق"
              >
                🔵
              </button>
              <button
                onClick={() => saveAnnotation('red')}
                className="w-6 h-6 rounded-full bg-red-400 hover:scale-110 transition-transform flex items-center justify-center text-[10px]"
                title="تظليل أحمر"
              >
                🔴
              </button>
              <div className="w-[1px] h-4 bg-white/20" />
              <button
                onClick={() => setSelectionState(prev => ({ ...prev, showCommentInput: true }))}
                className="p-1 hover:bg-white/10 rounded transition-colors flex items-center justify-center text-xs font-bold text-white/90"
                title="إضافة تعليق"
              >
                💬 <span className="mr-1 text-[10px]">تعليق</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col space-y-1.5 w-60 p-1">
              <textarea
                value={selectionState.commentText}
                onChange={(e) => setSelectionState(prev => ({ ...prev, commentText: e.target.value }))}
                placeholder="اكتب تعليقك هنا..."
                className="w-full p-2 text-xs bg-[#1E1E1C] text-white border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none h-16 font-arabic"
                autoFocus
              />
              <div className="flex items-center justify-end space-x-1.5 space-x-reverse">
                <button
                  onClick={() => setSelectionState(prev => ({ ...prev, showCommentInput: false }))}
                  className="px-2.5 py-1 text-[10px] text-white/60 hover:text-white transition-colors"
                >
                  إلغاء
                </button>
                <button
                  onClick={() => saveAnnotation('yellow', selectionState.commentText)}
                  className="px-2.5 py-1 text-[10px] bg-primary text-white font-bold rounded hover:bg-primary/95 transition-colors"
                >
                  حفظ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sliding Annotations & Notes Panel */}
      {showPanel && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-[#2C2C2A]/30 z-40 backdrop-blur-[2px] transition-opacity duration-300"
            onClick={() => setShowPanel(false)}
          />
          {/* Slide-in panel (slides from Left since RTL layout) */}
          <div 
            className="fixed inset-y-0 left-0 w-80 max-w-full bg-white shadow-2xl border-r border-cardBorder z-50 flex flex-col h-full animate-slide-in font-arabic selection-toolbar"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-cardBorder flex items-center justify-between bg-bgMain">
              <h2 className="font-bold text-textPrimary text-sm flex items-center space-x-2 space-x-reverse">
                <FileText className="w-4 h-4 text-primary" />
                <span>ملاحظاتي وتعليقاتي</span>
              </h2>
              <button 
                onClick={() => setShowPanel(false)}
                className="p-1 hover:bg-cardBorder/50 rounded-full transition-colors text-textSecondary hover:text-textPrimary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* Scrollable content area */}
            <div className="flex-grow overflow-y-auto p-4 space-y-5">
              {/* Annotations Section */}
              <div className="space-y-3">
                <h3 className="font-bold text-textPrimary text-xs border-b border-cardBorder pb-2">التعليقات والمقاطع المحددة</h3>
                {annotations.length === 0 ? (
                  <p className="text-xs text-textSecondary text-center py-8 leading-relaxed">
                    لا توجد مقاطع محددة بعد. حدد أي نص في الكتاب لتظليله أو إضافة تعليق عليه.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(
                      annotations.reduce((acc, ann) => {
                        const page = ann.page_number
                        if (!acc[page]) acc[page] = []
                        acc[page].push(ann)
                        return acc
                      }, {})
                    ).map(([pageNum, pageAnns]) => (
                      <div key={pageNum} className="space-y-2">
                        <div className="text-[10px] font-bold text-primary bg-primary-light px-2 py-0.5 rounded inline-block">
                          صفحة {pageNum}
                        </div>
                        <div className="space-y-2">
                          {pageAnns.map(ann => (
                            <div 
                              key={ann.id} 
                              className={`p-3 rounded-custom border-r-4 text-xs relative group transition-all ${
                                ann.color === 'blue' 
                                  ? 'bg-blue-50/70 border-blue-400' 
                                  : ann.color === 'red' 
                                  ? 'bg-red-50/70 border-red-400' 
                                  : 'bg-amber-50/70 border-amber-400'
                              }`}
                            >
                              <button
                                onClick={() => deleteAnnotation(ann)}
                                className="absolute top-2 left-2 p-1 text-textSecondary hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-black/5"
                                title="حذف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              
                              <p className="font-medium text-textPrimary leading-relaxed pl-5 break-words font-arabic">
                                "{ann.selected_text}"
                              </p>
                              
                              {ann.comment && (
                                <div className="mt-2 pt-2 border-t border-cardBorder/30 text-textSecondary flex items-start space-x-1 space-x-reverse">
                                  <span className="font-bold text-primary shrink-0">تعليق:</span>
                                  <span className="flex-1 break-words">{ann.comment}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <hr className="border-cardBorder" />
              
              {/* Personal Free-Text Notes Section */}
              <div className="flex flex-col space-y-2 pb-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-textPrimary text-xs">ملاحظات حرة</h3>
                  <span className="text-[10px] text-textSecondary font-semibold">
                    {saveStatus === 'saving' && 'جاري حفظ التغييرات...'}
                    {saveStatus === 'saved' && 'تم الحفظ تلقائياً ✓'}
                    {saveStatus === 'error' && 'فشل الحفظ تلقائياً!'}
                  </span>
                </div>
                <textarea
                  value={notesContent}
                  onChange={handleNotesChange}
                  placeholder="اكتب ملاحظاتك الحرة هنا عن هذا الكتاب..."
                  className="w-full h-44 p-3 text-xs bg-bgMain border border-cardBorder rounded-custom focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y font-arabic leading-relaxed"
                />
              </div>
            </div>
          </div>
        </>
      )}


    </div>
  )
}
