import { Fragment, useState, useRef } from 'react'
import { StickyNote } from 'lucide-react'
import { highlightColor } from '../lib/pdfHighlight'

// En deçà, c'est un clic maladroit plutôt qu'un tracé volontaire : on ignore.
const MIN_SIZE = 0.01

/**
 * Marqueur libre par-dessus une page.
 *
 * Le surlignage « texte » s'accroche aux mots de la couche pdf.js ; celui-ci
 * colore une ZONE, comme un surligneur sur du papier — il fonctionne donc aussi
 * sur un schéma, une image, ou un PDF scanné sans couche texte.
 *
 * Les coordonnées sont normalisées (fraction de la page) : le trait reste au bon
 * endroit quels que soient la taille de la fenêtre, le zoom ou l'appareil.
 *
 * `mix-blend-mode: multiply` donne le rendu d'un vrai marqueur : l'encre
 * assombrit le fond au lieu de le masquer, donc le texte reste lisible dessous.
 */
export const MarkerLayer = ({ zones, markerMode, markerColor, onCreate, onDelete, onOpenNote }) => {
  const containerRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const startRef = useRef(null)

  const pointFromEvent = (e) => {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
    }
  }

  const rectBetween = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y)
  })

  const handlePointerDown = (e) => {
    if (!markerMode || e.button !== 0) return
    // Empêche la sélection de texte de démarrer sous le tracé.
    e.preventDefault()
    startRef.current = pointFromEvent(e)
    setDraft({ ...startRef.current, w: 0, h: 0 })
    // Capture : le tracé survit si le pointeur sort de la page en cours de geste.
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e) => {
    if (!startRef.current) return
    setDraft(rectBetween(startRef.current, pointFromEvent(e)))
  }

  const handlePointerUp = (e) => {
    if (!startRef.current) return
    const rect = rectBetween(startRef.current, pointFromEvent(e))
    startRef.current = null
    setDraft(null)

    if (rect.w >= MIN_SIZE && rect.h >= MIN_SIZE) onCreate(rect)

    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* déjà relâché */ }
  }

  const asStyle = (zone) => ({
    left: `${zone.x * 100}%`,
    top: `${zone.y * 100}%`,
    width: `${zone.w * 100}%`,
    height: `${zone.h * 100}%`
  })

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="absolute inset-0 z-10"
      // Hors mode marqueur la couche est transparente aux clics, pour ne pas
      // gêner la sélection de texte ni le défilement.
      style={{
        pointerEvents: markerMode ? 'auto' : 'none',
        cursor: markerMode ? 'crosshair' : 'auto',
        touchAction: markerMode ? 'none' : 'auto'
      }}
    >
      {zones.map(zone => {
        const hasNote = Boolean(zone.note && zone.note.trim())
        // Zone encore optimiste (id « temp-… ») : pas d'écriture de note possible
        // avant que l'insertion ait renvoyé son vrai id. Le bouton réapparaît dès
        // que la zone est persistée (fenêtre de quelques centaines de ms).
        const persisted = !String(zone.id).startsWith('temp-')

        return (
          <Fragment key={zone.id}>
            <div
              role={markerMode ? 'button' : undefined}
              aria-label={markerMode ? `حذف التظليل في صفحة ${zone.page_number}` : undefined}
              title={markerMode ? 'انقر للحذف' : undefined}
              onPointerDown={(e) => {
                if (!markerMode) return
                // Sans cet arrêt, le clic démarrerait un nouveau tracé par-dessus.
                e.stopPropagation()
                onDelete(zone)
              }}
              className="absolute rounded-[2px] transition-opacity"
              style={{
                ...asStyle(zone),
                backgroundColor: highlightColor(zone.color),
                mixBlendMode: 'multiply',
                pointerEvents: markerMode ? 'auto' : 'none',
                cursor: markerMode ? 'pointer' : 'auto'
              }}
            />

            {/* Bouton « + ملاحظة » sous la zone. `pointerEvents: auto` explicite :
                hors mode marqueur la couche entière laisse passer les clics, mais
                ce bouton doit rester cliquable pour lire / éditer la note. */}
            {persisted && onOpenNote && (
              <button
                type="button"
                aria-label={hasNote
                  ? `تعديل الملاحظة في صفحة ${zone.page_number}`
                  : `إضافة ملاحظة في صفحة ${zone.page_number}`}
                title={hasNote ? 'الملاحظة — انقر للتعديل' : 'إضافة ملاحظة'}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenNote(zone)
                }}
                className={`absolute flex items-center gap-1 px-1.5 h-5 rounded-full shadow-md text-[10px] font-bold transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                  hasNote
                    ? 'bg-primary text-white'
                    : 'bg-[#2C2C2A]/85 text-white/90'
                }`}
                style={{
                  left: `${(zone.x + zone.w / 2) * 100}%`,
                  top: `${(zone.y + zone.h) * 100}%`,
                  transform: 'translate(-50%, 4px)',
                  pointerEvents: 'auto',
                  zIndex: 2
                }}
              >
                <StickyNote className="w-3 h-3" />
                <span>{hasNote ? 'ملاحظة' : '+ ملاحظة'}</span>
              </button>
            )}
          </Fragment>
        )
      })}

      {draft && (
        <div
          className="absolute rounded-[2px] border border-dashed border-black/30"
          style={{
            ...asStyle(draft),
            backgroundColor: highlightColor(markerColor),
            mixBlendMode: 'multiply'
          }}
        />
      )}
    </div>
  )
}
