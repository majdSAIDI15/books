import { pdfjs } from './pdfWorker'

// Vignette générée dans le navigateur à partir de la première page du PDF.
// Aucune écriture en base ni dans le storage : rien à migrer, aucun rôle admin
// requis. Le coût (télécharger le début du PDF) n'est payé qu'une fois par
// livre et par appareil, grâce au cache localStorage.

const COVER_WIDTH = 300
const COVER_QUALITY = 0.7
const CACHE_PREFIX = 'bookcover:'

// Évite de refaire le rendu quand plusieurs cartes du même livre coexistent
// ou quand on navigue entre les pages sans recharger l'app.
const memoryCache = new Map()

const cacheKey = (pdfUrl) => `${CACHE_PREFIX}${pdfUrl}`

export const readCachedCover = (pdfUrl) => {
  if (!pdfUrl) return null
  if (memoryCache.has(pdfUrl)) return memoryCache.get(pdfUrl)
  try {
    const stored = localStorage.getItem(cacheKey(pdfUrl))
    if (stored) memoryCache.set(pdfUrl, stored)
    return stored
  } catch {
    return null
  }
}

const writeCachedCover = (pdfUrl, dataUrl) => {
  memoryCache.set(pdfUrl, dataUrl)
  try {
    localStorage.setItem(cacheKey(pdfUrl), dataUrl)
  } catch {
    // Quota dépassé : on purge les vignettes et on retente une fois. Si ça
    // échoue encore, tant pis — le cache mémoire tient le temps de la session.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k))
      localStorage.setItem(cacheKey(pdfUrl), dataUrl)
    } catch {
      /* ignoré volontairement */
    }
  }
}

// Les rendus sont mis en file : ouvrir tous les PDF de la bibliothèque en
// parallèle saturerait le réseau et figerait l'interface au chargement.
let queue = Promise.resolve()
const enqueue = (task) => {
  const result = queue.then(task, task)
  queue = result.catch(() => {})
  return result
}

const renderFirstPage = async (pdfUrl) => {
  const pdf = await pdfjs.getDocument({ url: pdfUrl }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    const context = canvas.getContext('2d')
    // Une page PDF n'a pas de fond opaque : sans ce remplissage, le JPEG rend
    // le blanc du papier en noir.
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvasContext: context, viewport }).promise
    return canvas.toDataURL('image/jpeg', COVER_QUALITY)
  } finally {
    pdf.destroy()
  }
}

/**
 * Redimensionne une image fournie par l'admin au même gabarit que les
 * couvertures générées, et la réencode en JPEG.
 *
 * Sans cette étape, une photo de téléphone de 4 Mo serait stockée telle quelle
 * et téléchargée par chaque membre à l'ouverture de la bibliothèque — soit
 * exactement le problème que `cover_url` est censé résoudre.
 */
export const normalizeImageToCoverBlob = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      // On ne fait que réduire : agrandir une petite image la rendrait floue
      // sans rien apporter.
      const scale = Math.min(1, COVER_WIDTH / img.naturalWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))

      const context = canvas.getContext('2d')
      // Fond blanc : un PNG transparent réencodé en JPEG donnerait du noir.
      context.fillStyle = '#FFFFFF'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(img, 0, 0, canvas.width, canvas.height)

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Conversion de l\'image impossible'))),
        'image/jpeg',
        COVER_QUALITY
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Fichier image illisible'))
    }

    img.src = objectUrl
  })

/**
 * Rend la première page d'un PDF distant en Blob JPEG, pour l'envoyer au
 * stockage. Utilisé côté admin (upload et rattrapage) ; les membres, eux,
 * consomment `books.cover_url`.
 */
export const renderCoverBlobFromUrl = async (pdfUrl) => {
  const dataUrl = await enqueue(() => renderFirstPage(pdfUrl))
  const response = await fetch(dataUrl)
  return response.blob()
}

/** Idem à partir d'un fichier local (upload en cours). */
export const renderCoverBlobFromFile = async (file) => {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)

    const context = canvas.getContext('2d')
    context.fillStyle = '#FFFFFF'
    context.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: context, viewport }).promise

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Conversion du canvas impossible'))),
        'image/jpeg',
        COVER_QUALITY
      )
    })
  } finally {
    pdf.destroy()
  }
}

/** Renvoie la vignette en data URL, depuis le cache ou par rendu. */
export const getCover = async (pdfUrl) => {
  if (!pdfUrl) return null

  const cached = readCachedCover(pdfUrl)
  if (cached) return cached

  const dataUrl = await enqueue(() => renderFirstPage(pdfUrl))
  writeCachedCover(pdfUrl, dataUrl)
  return dataUrl
}
