import { useState, useRef } from 'react'
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
export const MarkerLayer = ({ zones, markerMode, markerColor, onCreate, onDelete }) => {
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
      {zones.map(zone => (
        <div
          key={zone.id}
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
      ))}

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
