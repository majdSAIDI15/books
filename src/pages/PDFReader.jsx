import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Document, Page } from 'react-pdf'
import {
  ArrowRight, BookOpen, AlertTriangle, RefreshCw, FileText, Trash2, X,
  Bookmark, BookmarkPlus, ChevronUp, ChevronDown
} from 'lucide-react'
import { getLocalDateStr } from '../lib/stats'
import { applyAnnotation, clearAnnotations, occurrenceIndexOfSelection } from '../lib/pdfHighlight'
import { ANNOTATION_COLORS, colorLabel, cardClasses, dotClasses } from '../lib/annotations'

// Import text layer styles for text selection
import 'react-pdf/dist/Page/TextLayer.css'

// Worker pdf.js servi localement (voir src/lib/pdfWorker.js)
import '../lib/pdfWorker'

/**
 * Une page (rendue ou simple réservation d'espace).
 *
 * Mémoïsé : la liste complète était reconstruite à chaque changement de page au
 * défilement — 800 éléments React recréés par page franchie sur un gros livre
 * (§3.4). Ici seules les pages dont `isNear` bascule se re-rendent.
 *
 * `scale` a disparu au profit de `devicePixelRatio` : react-pdf multipliait
 * `width` par `scale`, donc chaque page était rasterisée deux fois — une fois à
 * l'échelle 1, puis à 1,5 après `onRenderSuccess`, soit 2,25× la surface utile,
 * que le navigateur recompressait ensuite via `max-width: 100%` (§3.3).
 */
const PdfPageSlot = memo(function PdfPageSlot({ pageNum, isNear, pageWidth, bookmark, onRenderSuccess }) {
  const estimatedHeight = pageWidth * 1.414

  return (
    <div
      data-page-number={pageNum}
      className="page-wrapper flex justify-center w-full my-3 relative"
      style={{ minHeight: isNear ? 'auto' : `${estimatedHeight}px` }}
    >
      {bookmark && (
        <div
          className="absolute top-0 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-b-custom shadow-sm text-white text-[10px] font-bold pointer-events-none"
          style={{ backgroundColor: 'rgba(83, 74, 183, 0.9)' }}
          title={bookmark.label || `صفحة ${pageNum}`}
        >
          <Bookmark className="w-3 h-3 fill-current" />
          {bookmark.label && <span className="max-w-[140px] truncate">{bookmark.label}</span>}
        </div>
      )}

      {isNear ? (
        <Page
          pageNumber={pageNum}
          width={pageWidth}
          devicePixelRatio={typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1}
          renderTextLayer={true}
          renderAnnotationLayer={false}
          onRenderSuccess={() => onRenderSuccess(pageNum)}
          loading={
            <div
              className="flex flex-col items-center justify-center bg-white border border-cardBorder rounded-custom animate-pulse shadow-sm"
              style={{ width: `${pageWidth}px`, height: `${estimatedHeight}px` }}
            >
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
})


export const PDFReader = () => {
  const { bookId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [book, setBook] = useState(null)
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  // Champ « aller à la page » : `null` hors édition, auquel cas il affiche la
  // page courante. Valeur dérivée plutôt que synchronisée par un effet, ce qui
  // éviterait un setState en cascade à chaque page franchie au défilement.
  const [pageInput, setPageInput] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [error, setError] = useState('')


  // ── Comptabilisation de la progression ──────────────────────────────────────
  // initialPageRef      : page de reprise (pour le scroll automatique)
  // sessionStartPageRef : page à laquelle la fenêtre de comptage a démarré
  // baselineTodayRef    : pages déjà enregistrées aujourd'hui en base
  // logDateRef          : date de cette fenêtre (pour gérer le passage à minuit)
  //
  // pages_read = baseline + (maxPageReached - sessionStartPage)
  // Cette formule est idempotente : réécrire plusieurs fois ne double pas le
  // total, contrairement à l'ancien Math.max(alreadyRead, maxPageReached) qui
  // enregistrait un NUMÉRO DE PAGE à la place d'un NOMBRE DE PAGES LUES.
  const initialPageRef = useRef(1)
  const maxPageReachedRef = useRef(1)
  const sessionStartPageRef = useRef(1)
  const baselineTodayRef = useRef(0)
  const logDateRef = useRef(null)
  const currentPageRef = useRef(1)
  const hasScrolledRef = useRef(false)
  const observerRef = useRef(null)
  const saveTimeoutRef = useRef(null)
  const pendingSaveRef = useRef(false)
  const accessTokenRef = useRef(null)

  // Responsive page width state
  const [pageWidth, setPageWidth] = useState(window.innerWidth > 768 ? 650 : window.innerWidth - 32)
  
  // Toast notifications state
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('تم الحفظ ✓')

  // Annotations state
  const [annotations, setAnnotations] = useState([])
  const [bookmarks, setBookmarks] = useState([])
  // Miroir en ref, lu par les callbacks à identité stable (voir onPageRenderSuccess).
  const annotationsRef = useRef([])
  useEffect(() => { annotationsRef.current = annotations }, [annotations])
  const [selectionState, setSelectionState] = useState({
    text: '',
    pageNum: null,
    matchIndex: 0,
    rect: null,
    showToolbar: false,
    color: 'yellow',
    commentText: ''
  })
  
  // Sidebar and personal notes state
  const [showPanel, setShowPanel] = useState(false)
  const [activeTab, setActiveTab] = useState('annotations') // 'annotations' or 'notes'
  const [notesContent, setNotesContent] = useState('')
  const [saveStatus, setSaveStatus] = useState('') // '', 'saving', 'saved', 'error'
  const notesRef = useRef('')
  const notesTimeoutRef = useRef(null)
  const latestNotesContentRef = useRef('')


  /**
   * Nombre de pages réellement lues aujourd'hui, tous appels confondus.
   * Gère le passage de minuit en pleine session : on repart d'une base à zéro
   * et on redémarre la fenêtre de comptage à la page courante.
   */
  const computePagesReadToday = useCallback((todayStr) => {
    // La session n'est pas encore chargée : on ne connaît pas la base du jour,
    // écrire maintenant écraserait le compteur réel par 0.
    if (logDateRef.current === null) return null

    if (logDateRef.current !== todayStr) {
      logDateRef.current = todayStr
      baselineTodayRef.current = 0
      sessionStartPageRef.current = maxPageReachedRef.current
    }
    const delta = Math.max(0, maxPageReachedRef.current - sessionStartPageRef.current)
    return baselineTodayRef.current + delta
  }, [])

  // Handle responsive width adjustment.
  // Debounce : chaque changement de `pageWidth` invalide le rendu de toutes les
  // pages montées. Sans cela, un redimensionnement de fenêtre en déclenche des
  // dizaines à la suite.
  useEffect(() => {
    let timer = null
    const handleResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        setPageWidth(window.innerWidth > 768 ? 650 : window.innerWidth - 32)
      }, 150)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const scrollToPage = useCallback((pageNum) => {
    const el = document.querySelector(`.page-wrapper[data-page-number="${pageNum}"]`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // Navigation au clavier (§6.2) : le seul moyen de se déplacer dans un livre
  // de 800 pages était le défilement.
  useEffect(() => {
    const onKeyDown = (e) => {
      // Ne pas détourner les touches quand l'utilisateur écrit (notes, saut de
      // page, commentaire d'annotation).
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case 'ArrowRight':
        case 'PageUp':
          e.preventDefault()
          scrollToPage(Math.max(1, currentPageRef.current - 1))
          break
        case 'ArrowLeft':
        case 'PageDown':
          e.preventDefault()
          scrollToPage(Math.min(numPages || 1, currentPageRef.current + 1))
          break
        case 'Home':
          e.preventDefault()
          scrollToPage(1)
          break
        case 'End':
          e.preventDefault()
          if (numPages) scrollToPage(numPages)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [numPages, scrollToPage])

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
          .select('last_page, max_page')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .maybeSingle()

        let startPage = 1
        let maxPage = 1
        if (!sessionErr && dbSession) {
          startPage = dbSession.last_page || 1
          // Sans cette reprise, revenir en arrière puis fermer le livre
          // écraserait la progression maximale par la position courante.
          maxPage = Math.max(dbSession.max_page || 1, startPage)
        }

        setCurrentPage(startPage)
        currentPageRef.current = startPage
        initialPageRef.current = startPage
        maxPageReachedRef.current = maxPage
        sessionStartPageRef.current = maxPage

        // 3. Fetch user's daily log read count for today
        const todayStr = getLocalDateStr()
        logDateRef.current = todayStr
        const { data: dbLog, error: logErr } = await supabase
          .from('daily_logs')
          .select('pages_read')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .eq('date', todayStr)
          .maybeSingle()

        baselineTodayRef.current = (!logErr && dbLog) ? (dbLog.pages_read || 0) : 0

      } catch (err) {
        console.error('Error loading book/session:', err)
        setError('فشل تحميل تفاصيل الكتاب. الرجاء التحقق من الرابط والمحاولة مجدداً.')
      } finally {
        setLoading(false)
      }
    }

    loadBookAndSession()
  }, [user, bookId])

  const pageElement = (pageNum) =>
    document.querySelector(`.page-wrapper[data-page-number="${pageNum}"]`)

  // Rejoue les surlignages sur toutes les pages actuellement montées.
  // Les marque-pages n'ont pas de texte associé et ne touchent pas la couche texte.
  const highlightMountedPages = useCallback((list) => {
    if (!list || list.length === 0) return
    document.querySelectorAll('.page-wrapper[data-page-number]').forEach(pageEl => {
      const pageNum = parseInt(pageEl.getAttribute('data-page-number'), 10)
      list
        .filter(ann => ann.page_number === pageNum)
        .forEach(ann => applyAnnotation(pageEl, ann))
    })
  }, [])

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

        const { data: bmData, error: bmError } = await supabase
          .from('bookmarks')
          .select('*')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .order('page_number', { ascending: true })

        if (bmError) throw bmError
        setBookmarks(bmData || [])

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
        highlightMountedPages(annotations)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [pdfLoading, annotations, highlightMountedPages])

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

      // Rang de l'occurrence, calculé MAINTENANT : la sélection du navigateur
      // n'existera plus au moment de l'enregistrement (§2.11).
      const matchIndex = occurrenceIndexOfSelection(pageElement(pageNum), range, text)

      setSelectionState({
        text,
        pageNum,
        matchIndex,
        rect: {
          clientY: rect.top,
          clientX: rect.left,
          width: rect.width,
          height: rect.height
        },
        showToolbar: true,
        color: 'yellow',
        commentText: ''
      })
    }

    const onMouseUp = (e) => {
      setTimeout(() => {
        const sel = window.getSelection()
        const text = sel ? sel.toString().trim() : ''
        
        if (text) {
          const container = document.querySelector('.pdf-container')
          if (container && container.contains(sel.anchorNode)) {
            handleSelection()
            return
          }
        }

        // Hide toolbar if click is outside the toolbar
        const isClickInsideToolbar = e.target.closest('.selection-toolbar')
        if (!isClickInsideToolbar) {
          setSelectionState(prev => ({
            ...prev,
            showToolbar: false
          }))
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
          match_index: selectionState.matchIndex || 0,
          color: color,
          comment: comment || null
        })
        .select()

      if (error) throw error

      if (data && data[0]) {
        const newAnn = data[0]
        setAnnotations(prev => [...prev, newAnn])
        setTimeout(() => {
          const pageEl = pageElement(newAnn.page_number)
          if (pageEl) applyAnnotation(pageEl, newAnn)
        }, 100)
      }

      setSelectionState({
        text: '',
        pageNum: null,
        matchIndex: 0,
        rect: null,
        showToolbar: false,
        color: 'yellow',
        commentText: ''
      })
      window.getSelection().removeAllRanges()

      // Show Arabic toast "تم حفظ التعليق ✓"
      setToastMessage('تم حفظ التعليق ✓')
      setShowToast(true)

    } catch (err) {
      console.error('Error saving annotation:', err.message)
    }
  }

  // ── Marque-pages manuels ───────────────────────────────────────────────────
  // Table dédiée `bookmarks` depuis la migration 2. Le repérage automatique
  // (`reading_sessions.last_page`) reste indépendant : ces marque-pages sont des
  // points de retour choisis, multiples et nommables.

  const highlights = annotations

  const bookmarksByPage = useMemo(() => {
    const map = new Map()
    bookmarks.forEach(b => { if (!map.has(b.page_number)) map.set(b.page_number, b) })
    return map
  }, [bookmarks])

  const currentBookmark = bookmarksByPage.get(currentPage)

  const addBookmark = async (label = '') => {
    if (!user || !bookId || currentBookmark) return
    try {
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({
          user_id: user.id,
          book_id: bookId,
          page_number: currentPage,
          label: label.trim() || null
        })
        .select()
      if (error) throw error
      if (data?.[0]) {
        setBookmarks(prev => [...prev, data[0]].sort((a, b) => a.page_number - b.page_number))
      }
      setToastMessage('تمت إضافة الإشارة المرجعية ✓')
      setShowToast(true)
    } catch (err) {
      console.error('Erreur lors de l\'ajout du marque-page:', err.message)
    }
  }

  const removeBookmark = async (bookmark) => {
    if (!bookmark) return
    try {
      const { error } = await supabase.from('bookmarks').delete().eq('id', bookmark.id)
      if (error) throw error
      setBookmarks(prev => prev.filter(b => b.id !== bookmark.id))
      setToastMessage('تم حذف الإشارة المرجعية ✓')
      setShowToast(true)
    } catch (err) {
      console.error('Erreur lors de la suppression du marque-page:', err.message)
    }
  }

  const renameBookmark = async (bookmark, label) => {
    try {
      const { error } = await supabase
        .from('bookmarks')
        .update({ label: label.trim() || null })
        .eq('id', bookmark.id)
      if (error) throw error
      setBookmarks(prev =>
        prev.map(b => (b.id === bookmark.id ? { ...b, label: label.trim() || null } : b))
      )
    } catch (err) {
      console.error('Erreur lors du renommage du marque-page:', err.message)
    }
  }

  /** Marque-page précédent / suivant par rapport à la page courante. */
  const jumpToAdjacentBookmark = (direction) => {
    const target = direction === 'next'
      ? bookmarks.find(b => b.page_number > currentPage)
      : [...bookmarks].reverse().find(b => b.page_number < currentPage)
    if (target) scrollToPage(target.page_number)
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

      // Retrait ciblé : les autres surlignages de la page restent en place,
      // plus besoin de tout effacer puis tout reposer.
      const pageEl = pageElement(ann.page_number)
      if (pageEl) clearAnnotations(pageEl, ann.id)

      setAnnotations(prev => prev.filter(item => item.id !== ann.id))

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
      // `updated_at` est renseigné par un trigger côté base (§5.5) : l'écrire
      // depuis le navigateur exposait le tri à une horloge cliente décalée.
      const { error } = await supabase
        .from('book_notes')
        .upsert({
          user_id: user.id,
          book_id: bookId,
          content: content
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
          content: finalVal
        }, { onConflict: 'user_id,book_id' }).then(({ error }) => {
          if (error) console.error('Error saving notes on unmount:', error.message)
        })
      }
    }
  }, [user, bookId])


  // Jeton d'accès tenu à jour pour le handler beforeunload, qui ne peut pas
  // attendre une promesse. Sans en-tête Authorization, PostgREST exécute la
  // requête en rôle `anon` : auth.uid() vaut null et RLS la rejette en silence.
  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) accessTokenRef.current = data.session?.access_token || null
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token || null
    })
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  /** Écriture asynchrone (debounce, démontage). Retourne true si tout a réussi. */
  const flushProgress = useCallback(async () => {
    if (!user || !bookId) return false

    const todayStr = getLocalDateStr()
    // Deux notions distinctes depuis la migration 2 (§2.10) :
    //   last_page → position réelle, pour rouvrir au bon endroit
    //   max_page  → le plus loin atteint, pour le pourcentage de progression
    // Relire un chapitre antérieur ne fait donc plus reculer la barre.
    // `updated_at` n'est plus envoyé : un trigger le renseigne côté base, ce qui
    // évite qu'une horloge cliente décalée fausse le tri du « livre en cours » (§5.5).
    const currentPos = currentPageRef.current
    const maxReached = maxPageReachedRef.current
    const pagesReadToday = computePagesReadToday(todayStr)
    if (pagesReadToday === null) return false

    try {
      const { error: sessionErr } = await supabase
        .from('reading_sessions')
        .upsert(
          {
            user_id: user.id,
            book_id: bookId,
            last_page: currentPos,
            max_page: maxReached
          },
          { onConflict: 'user_id,book_id' }
        )
      if (sessionErr) throw sessionErr

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

      pendingSaveRef.current = false
      return true
    } catch (err) {
      console.error('Error saving reading progress:', err.message)
      return false
    }
  }, [user, bookId, computePagesReadToday])

  /**
   * Écriture synchrone pour beforeunload : `keepalive` survit à la fermeture de
   * l'onglet, mais interdit await. On envoie donc le jeton mémorisé.
   */
  const flushProgressOnUnload = useCallback(() => {
    if (!user || !bookId) return

    const token = accessTokenRef.current
    if (!token) return

    const todayStr = getLocalDateStr()
    const currentPos = currentPageRef.current
    const maxReached = maxPageReachedRef.current
    const pagesReadToday = computePagesReadToday(todayStr)
    if (pagesReadToday === null) return

    const headers = {
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    }
    const base = import.meta.env.VITE_SUPABASE_URL

    // `on_conflict` est obligatoire pour que merge-duplicates cible la bonne
    // contrainte unique ; sans lui PostgREST renvoie 409.
    fetch(`${base}/rest/v1/reading_sessions?on_conflict=user_id,book_id`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: user.id,
        book_id: bookId,
        last_page: currentPos,
        max_page: maxReached
      }),
      keepalive: true
    }).catch(() => {})

    fetch(`${base}/rest/v1/daily_logs?on_conflict=user_id,book_id,date`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: user.id,
        book_id: bookId,
        pages_read: pagesReadToday,
        date: todayStr
      }),
      keepalive: true
    }).catch(() => {})
  }, [user, bookId, computePagesReadToday])

  // Sauvegarde au démontage du composant
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      if (pendingSaveRef.current) flushProgress()
    }
  }, [flushProgress])

  // Sauvegarde à la fermeture / rechargement de l'onglet
  useEffect(() => {
    const handler = () => {
      if (pendingSaveRef.current) flushProgressOnUnload()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [flushProgressOnUnload])

  const saveProgressToDatabase = async () => {
    const ok = await flushProgress()
    if (ok) {
      setToastMessage('تم الحفظ ✓')
      setShowToast(true)
    }
  }

  // Track page change and save progress to Supabase after 3 seconds stay
  const handlePageChange = useCallback((newPage) => {
    if (!user || !bookId || newPage < 1 || (numPages && newPage > numPages)) return

    setCurrentPage(newPage)
    currentPageRef.current = newPage

    // La progression maximale ne sert plus qu'au calcul des pages lues du jour.
    if (newPage > maxPageReachedRef.current) {
      maxPageReachedRef.current = newPage
    }

    // Tout déplacement est désormais sauvegardé, y compris vers l'arrière :
    // c'est la condition pour que la position de reprise soit fidèle (§2.10).
    // L'ancienne garde `newPage > maxPageReached` ne persistait jamais un retour
    // en arrière.
    pendingSaveRef.current = true

    // Debounce database write for 3 seconds
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveProgressToDatabase()
    }, 3000)
    // `saveProgressToDatabase` est volontairement hors dépendances : elle est
    // appelée de façon différée et lit tout son état via des refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, bookId, numPages])

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages)
    setPdfLoading(false)

    // total_pages est calculé une seule fois par l'admin au moment de l'upload.
    // Écrire dans `books` depuis une session membre supposait que les membres
    // aient le droit de modifier n'importe quel livre (cf. bugs.md §1.5).
    // On se contente d'un correctif local en mémoire si la valeur diverge.
    if (book && book.total_pages !== numPages) {
      setBook(prev => (prev ? { ...prev, total_pages: numPages } : null))
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
  }, [pdfLoading, numPages, handlePageChange])

  // Scroll to Resume reading page.
  // `useCallback` avec une référence stable : cette fonction est passée à chaque
  // <PdfPageSlot> mémoïsé, une nouvelle identité à chaque rendu annulerait tout
  // le bénéfice de React.memo. D'où la lecture des annotations via une ref.
  const onPageRenderSuccess = useCallback((pageNum) => {
    // Hide pdfLoading spinner as soon as page 1 or initial page is ready
    if (pageNum === 1 || pageNum === initialPageRef.current) {
      setPdfLoading(false)
    }

    if (pageNum === initialPageRef.current && !hasScrolledRef.current) {
      hasScrolledRef.current = true
      setTimeout(() => {
        const el = pageElement(pageNum)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }

    // Apply highlighting for this page when it renders
    setTimeout(() => {
      const pageEl = pageElement(pageNum)
      if (!pageEl) return
      annotationsRef.current
        .filter(ann => ann.page_number === pageNum)
        .forEach(ann => applyAnnotation(pageEl, ann))
    }, 100)
  }, [])


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

  /**
   * react-pdf compare la prop `file` par IDENTITÉ. Un objet littéral recréé à
   * chaque rendu était interprété comme un nouveau document et déclenchait un
   * re-téléchargement complet du PDF — à chaque scroll, toast ou sélection.
   * Le useMemo est indispensable ici, pas une optimisation cosmétique.
   */
  const pdfUrl = book?.pdf_url
  const documentFile = useMemo(() => {
    if (!pdfUrl) return null
    return {
      url: pdfUrl,
      rangeChunkSize: 65536,
      disableAutoFetch: false,
      disableStream: false,
    }
  }, [pdfUrl])

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
              className="flex items-center space-x-1.5 space-x-reverse px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-custom font-bold text-xs transition-all relative"
            >
              <FileText className="w-4 h-4" />
              <span>ملاحظاتي</span>
              {annotations.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center shadow-sm">
                  {annotations.length}
                </span>
              )}
            </button>
          </div>

        </div>
      </nav>

      {/* Main PDF View Area with Stacked Pages */}
      <main className="flex-grow flex items-center justify-center p-4 overflow-y-visible relative">
        <div className="max-w-3xl w-full flex flex-col items-center">
          
          {pdfLoading && (
            <div className="absolute inset-0 bg-bgMain z-30 flex flex-col justify-center items-center p-4 min-h-[400px]">
              <RefreshCw className="w-10 h-10 text-primary animate-spin mb-3" />
              <p className="text-sm text-textSecondary font-semibold animate-pulse mb-3">
                جاري تحميل الكتاب... {loadProgress > 0 ? `${loadProgress}%` : ''}
              </p>
              {loadProgress > 0 && (
                <div className="w-48 bg-primary-light rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-1.5 transition-all duration-300" style={{ width: `${loadProgress}%` }}></div>
                </div>
              )}
            </div>
          )}

          <div className="pdf-container flex flex-col w-full space-y-6 pb-24">
            <Document
              file={documentFile}
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
              {Array.from({ length: numPages || 0 }, (el, index) => {
                const pageNum = index + 1
                return (
                  <PdfPageSlot
                    key={pageNum}
                    pageNum={pageNum}
                    isNear={Math.abs(pageNum - currentPage) <= 3}
                    pageWidth={pageWidth}
                    bookmark={bookmarksByPage.get(pageNum)}
                    onRenderSuccess={onPageRenderSuccess}
                  />
                )
              })}
            </Document>
          </div>

        </div>
      </main>

      {/* Barre flottante : navigation par page, marque-pages, saut direct */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-[#2C2C2A]/90 text-white py-2 px-3 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm flex items-center gap-2 border border-[#E0DED6]/20">

        {/* Marque-page précédent */}
        <button
          onClick={() => jumpToAdjacentBookmark('prev')}
          disabled={!bookmarks.some(b => b.page_number < currentPage)}
          aria-label="الإشارة المرجعية السابقة"
          title="الإشارة المرجعية السابقة"
          className="p-1 rounded-full hover:bg-white/15 disabled:opacity-25 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* Ajouter / retirer un marque-page sur la page courante */}
        <button
          onClick={() => (currentBookmark ? removeBookmark(currentBookmark) : addBookmark())}
          aria-label={currentBookmark ? 'حذف الإشارة المرجعية' : 'إضافة إشارة مرجعية'}
          title={currentBookmark ? 'حذف الإشارة المرجعية' : 'إضافة إشارة مرجعية لهذه الصفحة'}
          className={`p-1.5 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
            currentBookmark ? 'text-amber-300 hover:bg-white/15' : 'hover:bg-white/15'
          }`}
        >
          {currentBookmark
            ? <Bookmark className="w-4 h-4 fill-current" />
            : <BookmarkPlus className="w-4 h-4" />}
        </button>

        {/* Marque-page suivant */}
        <button
          onClick={() => jumpToAdjacentBookmark('next')}
          disabled={!bookmarks.some(b => b.page_number > currentPage)}
          aria-label="الإشارة المرجعية التالية"
          title="الإشارة المرجعية التالية"
          className="p-1 rounded-full hover:bg-white/15 disabled:opacity-25 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        <span className="w-px h-4 bg-white/20"></span>

        {/* Saut direct à une page (§6.2) */}
        <span>صفحة</span>
        <input
          type="number"
          min="1"
          max={numPages || 1}
          value={pageInput ?? currentPage}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const target = parseInt(pageInput, 10)
              if (target >= 1 && target <= (numPages || 1)) scrollToPage(target)
              e.currentTarget.blur()
            }
          }}
          onBlur={() => setPageInput(null)}
          aria-label="الانتقال إلى صفحة"
          className="w-12 bg-white/10 border border-white/20 rounded text-center text-[#EEEDFE] py-0.5 focus:outline-none focus:ring-1 focus:ring-white/70 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="opacity-60">/</span>
        <span className="opacity-80">{numPages || '...'}</span>
      </div>

      {/* Floating Arabic Toast */}
      <div 
        className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 z-50 bg-[#1D9E75] text-white py-2 px-5 rounded-custom text-xs font-semibold shadow-md flex items-center space-x-1 space-x-reverse transition-all duration-300 ${
          showToast ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}
      >
        <span>{toastMessage}</span>
      </div>

      {/* Fixed Button on the Right Side of Reader */}
      <button
        onClick={() => setShowPanel(true)}
        className="fixed right-0 top-1/2 transform -translate-y-1/2 z-40 bg-primary hover:bg-primary/95 text-white py-4 px-2.5 rounded-l-custom shadow-xl transition-all flex flex-col items-center justify-center space-y-1 font-bold text-xs select-none cursor-pointer border border-r-0 border-white/20"
      >
        <span className="flex items-center gap-1 [writing-mode:vertical-rl] tracking-wide text-[11px] font-arabic">
          <span>📝</span>
          <span>ملاحظاتي</span>
        </span>
        {annotations.length > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-4 h-4 flex items-center justify-center mt-1">
            {annotations.length}
          </span>
        )}
      </button>

      {/* Floating Selection Toolbar */}
      {selectionState.showToolbar && selectionState.rect && (
        <div
          className="fixed z-50 bg-[#2C2C2A] text-white shadow-xl rounded-custom p-3 flex flex-col space-y-2 border border-[#E0DED6]/20 backdrop-blur-md animate-fade-in selection-toolbar w-72"
          style={{
            top: `${
              selectionState.rect.clientY > 130
                ? selectionState.rect.clientY - 95
                : selectionState.rect.clientY + selectionState.rect.height + 15
            }px`,
            left: `${selectionState.rect.clientX + selectionState.rect.width / 2}px`,
            transform: 'translateX(-50%)',
            direction: 'rtl'
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
        >
          {/* Colors Selection */}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-white/70 font-bold">لون التظليل:</span>
            <div className="flex items-center space-x-2 space-x-reverse">
              {ANNOTATION_COLORS.map((colorOpt) => (
                <button
                  key={colorOpt.key}
                  type="button"
                  onClick={() => setSelectionState(prev => ({ ...prev, color: colorOpt.key }))}
                  className={`w-6 h-6 rounded-full ${colorOpt.bg} hover:scale-110 transition-transform flex items-center justify-center text-[11px] relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                    selectionState.color === colorOpt.key ? 'ring-2 ring-white ring-offset-2 ring-offset-[#2C2C2A] scale-110' : ''
                  }`}
                  aria-label={`تظليل بلون ${colorOpt.label}`}
                  title={colorOpt.label}
                >
                  {colorOpt.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Comment input & save */}
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={selectionState.commentText || ''}
              onChange={(e) => setSelectionState(prev => ({ ...prev, commentText: e.target.value }))}
              placeholder="اكتب تعليقاً اختيارياً..."
              className="flex-1 px-2.5 py-1.5 text-xs bg-[#1E1E1C] text-white border border-white/10 rounded focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-arabic"
            />
            <button
              onClick={() => saveAnnotation(selectionState.color || 'yellow', selectionState.commentText)}
              className="px-2.5 py-1.5 bg-primary hover:bg-primary/95 text-white font-bold rounded text-xs transition-colors flex items-center justify-center cursor-pointer"
              aria-label="تأكيد وحفظ التظليل"
              title="تأكيد وحفظ"
            >
              ✓
            </button>
          </div>
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
          {/* Slide-in panel (slides from Right since RTL layout, overlays layout) */}
          <div 
            className="fixed inset-y-0 right-0 w-80 max-w-full bg-white dark:bg-[#2C2C2A] shadow-2xl border-l border-cardBorder dark:border-white/10 z-50 flex flex-col h-full animate-slide-in-right font-arabic"
            onMouseDown={(e) => e.stopPropagation()}
            style={{ direction: 'rtl' }}
          >
            {/* Header */}
            <div className="p-4 border-b border-cardBorder dark:border-white/10 flex items-center justify-between bg-bgMain dark:bg-[#1E1E1C]">
              <h2 className="font-bold text-textPrimary dark:text-white text-sm flex items-center space-x-2 space-x-reverse">
                <FileText className="w-4 h-4 text-primary" />
                <span>ملاحظاتي وتعليقاتي</span>
              </h2>
              <button 
                onClick={() => setShowPanel(false)}
                className="p-1 hover:bg-cardBorder/50 dark:hover:bg-white/10 rounded-full transition-colors text-textSecondary hover:text-textPrimary dark:text-white/60 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab switchers */}
            <div className="flex border-b border-cardBorder dark:border-white/10 bg-white dark:bg-[#2C2C2A]">
              <button
                onClick={() => setActiveTab('annotations')}
                className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
                  activeTab === 'annotations'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-textSecondary dark:text-white/60 hover:text-textPrimary dark:hover:text-white'
                }`}
              >
                التعليقات ({highlights.length})
              </button>
              <button
                onClick={() => setActiveTab('bookmarks')}
                className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
                  activeTab === 'bookmarks'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-textSecondary dark:text-white/60 hover:text-textPrimary dark:hover:text-white'
                }`}
              >
                الإشارات ({bookmarks.length})
              </button>
              <button
                onClick={() => setActiveTab('notes')}
                className={`flex-1 py-3 text-center text-xs font-bold transition-all border-b-2 ${
                  activeTab === 'notes'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-textSecondary dark:text-white/60 hover:text-textPrimary dark:hover:text-white'
                }`}
              >
                ملاحظات
              </button>
            </div>
            
            {/* Scrollable content area */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-white dark:bg-[#2C2C2A]">
              {activeTab === 'annotations' ? (
                /* Tab 1: Annotations */
                <div className="space-y-3">
                  {highlights.length === 0 ? (
                    <p className="text-xs text-textSecondary dark:text-white/40 text-center py-8 leading-relaxed">
                      لا توجد مقاطع محددة بعد. حدد أي نص في الكتاب لتظليله أو إضافة تعليق عليه.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(
                        highlights.reduce((acc, ann) => {
                          const page = ann.page_number
                          if (!acc[page]) acc[page] = []
                          acc[page].push(ann)
                          return acc
                        }, {})
                      )
                      .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
                      .map(([pageNum, pageAnns]) => (
                        <div key={pageNum} className="space-y-2">
                          <div className="text-[10px] font-bold text-primary bg-primary/10 dark:bg-primary/20 px-2 py-0.5 rounded inline-block">
                            صفحة {pageNum}
                          </div>
                          <div className="space-y-2">
                            {pageAnns.map(ann => (
                              <div 
                                key={ann.id} 
                                onClick={() => scrollToPage(ann.page_number)}
                                className={`p-3 rounded-custom border-l-4 text-xs relative group transition-all cursor-pointer hover:shadow-md ${cardClasses(ann.color)}`}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation() // prevent scroll event
                                    deleteAnnotation(ann)
                                  }}
                                  className="absolute top-2 left-2 p-1 text-textSecondary hover:text-danger rounded hover:bg-black/5 transition-colors"
                                  aria-label={`حذف التعليق في صفحة ${ann.page_number}`}
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>

                                {/* Badge & page label inside card */}
                                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-textSecondary">
                                  <span className={`w-2 h-2 rounded-full ${dotClasses(ann.color)}`} />
                                  <span>{colorLabel(ann.color)}</span>
                                  <span>•</span>
                                  <span>ص {ann.page_number}</span>
                                </div>
                                
                                <p className="font-medium text-textPrimary dark:text-white leading-relaxed pl-6 break-words font-arabic line-clamp-2">
                                  "{ann.selected_text}"
                                </p>
                                
                                {ann.comment && (
                                  <div className="mt-2 pt-2 border-t border-cardBorder/30 dark:border-white/10 text-textSecondary dark:text-white/60 flex items-start space-x-1 space-x-reverse">
                                    <span className="font-bold text-primary shrink-0">تعليق:</span>
                                    <span className="flex-1 break-words leading-normal">{ann.comment}</span>
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
              ) : activeTab === 'bookmarks' ? (
                /* Tab 2 : marque-pages manuels */
                <div className="space-y-3">
                  <button
                    onClick={() => (currentBookmark ? removeBookmark(currentBookmark) : addBookmark())}
                    className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-custom text-xs font-bold transition-colors ${
                      currentBookmark
                        ? 'bg-danger/10 text-danger hover:bg-danger hover:text-white'
                        : 'bg-primary-light text-primary hover:bg-primary hover:text-white'
                    }`}
                  >
                    {currentBookmark ? <Trash2 className="w-4 h-4" /> : <BookmarkPlus className="w-4 h-4" />}
                    <span>
                      {currentBookmark
                        ? `حذف إشارة الصفحة ${currentPage}`
                        : `إضافة إشارة للصفحة ${currentPage}`}
                    </span>
                  </button>

                  {bookmarks.length === 0 ? (
                    <p className="text-xs text-textSecondary dark:text-white/40 text-center py-8 leading-relaxed">
                      لا توجد إشارات مرجعية بعد. أضف إشارة لأي صفحة للعودة إليها بسرعة.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {bookmarks.map(bm => (
                        <div
                          key={bm.id}
                          className="p-3 rounded-custom border-r-4 border-primary bg-primary/5 dark:bg-primary/10 text-xs relative group transition-all"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <button
                              onClick={() => scrollToPage(bm.page_number)}
                              className="flex items-center gap-1.5 font-bold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                            >
                              <Bookmark className="w-3.5 h-3.5 fill-current" />
                              <span>صفحة {bm.page_number}</span>
                            </button>
                            <button
                              onClick={() => removeBookmark(bm)}
                              aria-label={`حذف إشارة الصفحة ${bm.page_number}`}
                              title="حذف"
                              className="p-1 text-textSecondary hover:text-danger rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {/* Libellé modifiable : un marque-page nommé « بداية الفصل
                              الثالث » est bien plus utile qu'un simple numéro. */}
                          <input
                            type="text"
                            defaultValue={bm.label || ''}
                            placeholder="أضف عنواناً لهذه الإشارة..."
                            onBlur={(e) => {
                              if ((e.target.value || '') !== (bm.label || '')) {
                                renameBookmark(bm, e.target.value)
                              }
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                            className="w-full bg-transparent border-b border-dashed border-cardBorder dark:border-white/20 text-textPrimary dark:text-white text-[11px] py-1 focus:outline-none focus:border-primary font-arabic"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Tab 3: Free Notes */
                <div className="flex flex-col space-y-2 h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-textSecondary dark:text-white/60 font-bold">اكتب ملاحظاتك بحرية</span>
                    <span className="text-[10px] text-[#1D9E75] font-semibold">
                      {saveStatus === 'saving' && 'جاري حفظ التغييرات...'}
                      {saveStatus === 'saved' && 'تم الحفظ ✓'}
                      {saveStatus === 'error' && 'فشل الحفظ تلقائياً!'}
                    </span>
                  </div>
                  <textarea
                    value={notesContent}
                    onChange={handleNotesChange}
                    placeholder="اكتب ملاحظاتك هنا..."
                    className="w-full h-80 p-3 text-xs bg-bgMain dark:bg-[#1E1E1C] border border-cardBorder dark:border-white/10 dark:text-white rounded-custom focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-none font-arabic leading-relaxed"
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
