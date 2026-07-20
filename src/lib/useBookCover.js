import { useState, useEffect } from 'react'
import { getCover, readCachedCover } from './pdfCover'

/**
 * Rend la première page du PDF dans le navigateur. `pdfUrl` à null désactive
 * complètement le rendu — c'est ainsi qu'on évite le travail inutile quand une
 * couverture est déjà stockée.
 */
const useRenderedCover = (pdfUrl) => {
  // Le cache est lu à l'initialisation : au retour sur la page, la vignette
  // est là dès le premier rendu, sans clignotement.
  const [cover, setCover] = useState(() => readCachedCover(pdfUrl))

  useEffect(() => {
    if (!pdfUrl) return undefined

    // Le composant peut disparaître pendant le rendu (navigation, filtre) :
    // sans ce garde, on écrirait dans un état démonté.
    let active = true

    // getCover court-circuite sur le cache ; l'état n'est mis à jour que dans
    // le callback, jamais de façon synchrone dans le corps de l'effet.
    getCover(pdfUrl)
      .then(dataUrl => { if (active) setCover(dataUrl) })
      .catch(err => console.error('Échec de la vignette du livre:', err))

    return () => { active = false }
  }, [pdfUrl])

  return cover
}

/**
 * Vignette de couverture d'un livre.
 *
 * Deux sources, par ordre de préférence :
 *   1. `books.cover_url` — image d'environ 30 Ko générée une fois par l'admin à
 *      l'upload. C'est le chemin normal depuis la migration 2.
 *   2. rendu dans le navigateur à partir du PDF — repli pour les livres importés
 *      avant, tant que l'admin n'a pas lancé le rattrapage. Sans lui, les
 *      anciens livres resteraient sans couverture.
 *
 * @returns {{ src: string|null, onError: () => void }} `onError` est à brancher
 *   sur l'`<img>` : si la couverture stockée a disparu du bucket, on bascule
 *   automatiquement sur le rendu local.
 */
export const useBookCover = (pdfUrl, coverUrl = null) => {
  const [storedFailed, setStoredFailed] = useState(false)

  const useStored = Boolean(coverUrl) && !storedFailed
  // Hook toujours appelé (règles des hooks), mais inerte quand `null` est passé.
  const rendered = useRenderedCover(useStored ? null : pdfUrl)

  return {
    src: useStored ? coverUrl : rendered,
    onError: () => setStoredFailed(true)
  }
}
