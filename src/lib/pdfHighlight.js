// Restauration des surlignages sur la couche texte de pdf.js.
//
// L'implémentation précédente cherchait le texte annoté à l'intérieur d'UN SEUL
// span (`spanText.includes(...)`). Or pdf.js découpe la couche texte en un span
// par fragment de ligne : toute sélection dépassant une fin de ligne — donc la
// plupart — n'était jamais retrouvée au rechargement (§2.11).
//
// Ici on indexe le texte de la page entière, on y cherche le passage, puis on
// enveloppe la portion correspondante de chaque nœud texte traversé. Trois
// bénéfices : les sélections multi-lignes fonctionnent, on n'écrit plus jamais
// dans `innerHTML` (§1.7 — un PDF contenant `<img onerror=...>` exécutait ce
// code), et on parcourt la page une fois par annotation au lieu de croiser
// toutes les annotations avec tous les spans (§3.6).

const HIGHLIGHT_CLASS = 'custom-pdf-highlight'

const COLORS = {
  yellow: 'rgba(253, 224, 71, 0.45)',
  blue: 'rgba(147, 197, 253, 0.45)',
  red: 'rgba(252, 165, 165, 0.45)',
  green: 'rgba(110, 231, 183, 0.45)'
}

export const highlightColor = (color) => COLORS[color] || COLORS.yellow

// Version opaque, pour l'icône du marqueur (une couleur à 45 % d'opacité sur
// fond sombre serait à peine visible).
const SOLID = {
  yellow: '#FACC15',
  blue: '#60A5FA',
  red: '#F87171',
  green: '#34D399'
}

export const solidColor = (color) => SOLID[color] || SOLID.yellow

/**
 * Espaces normalisés (les retours à la ligne de pdf.js deviennent des espaces
 * simples), avec la correspondance index normalisé → index brut pour pouvoir
 * revenir aux nœuds du DOM.
 */
const normalize = (raw) => {
  let text = ''
  const map = []
  let prevSpace = false

  for (let i = 0; i < raw.length; i++) {
    const isSpace = /\s/.test(raw[i])
    if (isSpace) {
      if (prevSpace) continue
      text += ' '
    } else {
      text += raw[i]
    }
    map.push(i)
    prevSpace = isSpace
  }

  return { text, map }
}

/** Nœuds texte de la couche, avec leur position dans le texte concaténé. */
const buildIndex = (textLayer) => {
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT)
  const entries = []
  let raw = ''

  let node = walker.nextNode()
  while (node) {
    const len = node.textContent.length
    if (len > 0) {
      entries.push({ node, start: raw.length, len })
      raw += node.textContent
    }
    node = walker.nextNode()
  }

  return { entries, raw }
}

/**
 * Enveloppe [rawStart, rawEnd) dans des <mark>, un par nœud texte traversé.
 * On ne peut pas envelopper la plage d'un coup : elle chevauche plusieurs spans
 * frères, et `surroundContents` refuse une plage qui coupe des éléments.
 */
const wrapRange = (entries, rawStart, rawEnd, annotation) => {
  const touched = entries.filter(e => e.start < rawEnd && e.start + e.len > rawStart)
  if (touched.length === 0) return false

  // De la fin vers le début : envelopper découpe le nœud texte courant, ce qui
  // décalerait les offsets des nœuds suivants s'ils étaient traités après.
  for (let i = touched.length - 1; i >= 0; i--) {
    const entry = touched[i]
    const from = Math.max(0, rawStart - entry.start)
    const to = Math.min(entry.len, rawEnd - entry.start)
    if (to <= from) continue

    const range = document.createRange()
    range.setStart(entry.node, from)
    range.setEnd(entry.node, to)

    const mark = document.createElement('mark')
    mark.className = HIGHLIGHT_CLASS
    mark.dataset.annotationId = annotation.id
    mark.style.backgroundColor = highlightColor(annotation.color)
    mark.style.color = 'inherit'
    mark.style.padding = '1px 0'
    mark.style.borderRadius = '2px'

    try {
      range.surroundContents(mark)
    } catch {
      // Plage invalide (DOM modifié entre-temps) : on abandonne ce fragment
      // plutôt que de corrompre la couche texte.
      return false
    }
  }

  return true
}

/**
 * Position de la n-ième occurrence, ou -1. `match_index` est enregistré au
 * moment de la sélection (voir `occurrenceIndexOfSelection`) : sans lui, un
 * passage répété plusieurs fois sur la même page verrait toujours sa PREMIÈRE
 * occurrence surlignée, quelle que soit celle réellement choisie (§2.11).
 */
const nthIndexOf = (haystack, needle, n) => {
  let at = haystack.indexOf(needle)
  for (let i = 0; i < n && at !== -1; i++) {
    at = haystack.indexOf(needle, at + 1)
  }
  return at
}

/** Applique une annotation sur l'élément de page donné. */
export const applyAnnotation = (pageEl, annotation) => {
  if (!pageEl || !annotation?.selected_text) return false

  const textLayer = pageEl.querySelector('.react-pdf__Page__textContent')
  if (!textLayer) return false

  // Déjà posée : évite de dupliquer au re-rendu.
  if (textLayer.querySelector(`[data-annotation-id="${annotation.id}"]`)) return true

  const { entries, raw } = buildIndex(textLayer)
  if (entries.length === 0) return false

  const haystack = normalize(raw)
  const needle = normalize(annotation.selected_text).text.trim()
  if (!needle) return false

  let at = nthIndexOf(haystack.text, needle, annotation.match_index || 0)
  // Repli sur la première occurrence : le texte a pu bouger depuis
  // l'enregistrement, mieux vaut un surlignage approximatif que rien.
  if (at === -1) at = haystack.text.indexOf(needle)
  if (at === -1) return false

  const rawStart = haystack.map[at]
  const rawEnd = haystack.map[at + needle.length - 1] + 1

  return wrapRange(entries, rawStart, rawEnd, annotation)
}

/**
 * Rang de l'occurrence sélectionnée dans la page (0 = la première).
 * Mesuré en comparant le texte qui PRÉCÈDE la sélection : on compte combien de
 * fois le passage y apparaît déjà.
 */
export const occurrenceIndexOfSelection = (pageEl, range, selectedText) => {
  if (!pageEl || !range) return 0

  const textLayer = pageEl.querySelector('.react-pdf__Page__textContent')
  if (!textLayer) return 0

  try {
    const before = document.createRange()
    before.selectNodeContents(textLayer)
    before.setEnd(range.startContainer, range.startOffset)

    const needle = normalize(selectedText).text.trim()
    if (!needle) return 0

    const prefix = normalize(before.toString()).text
    let count = 0
    let at = prefix.indexOf(needle)
    while (at !== -1) {
      count++
      at = prefix.indexOf(needle, at + 1)
    }
    return count
  } catch {
    return 0
  }
}

/** Retire les surlignages d'une page (tous, ou ceux d'une annotation). */
export const clearAnnotations = (pageEl, annotationId = null) => {
  if (!pageEl) return
  const selector = annotationId
    ? `.${HIGHLIGHT_CLASS}[data-annotation-id="${annotationId}"]`
    : `.${HIGHLIGHT_CLASS}`

  pageEl.querySelectorAll(selector).forEach(mark => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}
