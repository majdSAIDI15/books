import { useEffect, useState } from 'react'

/**
 * État partagé d'installation PWA.
 *
 * `beforeinstallprompt` n'est émis QU'UNE FOIS, très tôt au chargement de la
 * page — souvent avant que le tableau de bord (chargé en lazy) ne soit monté. Un
 * composant qui s'abonnerait dans son `useEffect` raterait donc l'évènement.
 *
 * On le capte donc au niveau du MODULE, dès le premier import (App importe
 * InstallPrompt statiquement, donc ce fichier est évalué au démarrage). Le prompt
 * différé est mémorisé dans un singleton, et tous les hooks abonnés sont notifiés.
 * Ainsi la popup ET le bouton permanent partagent le même état, quel que soit
 * leur ordre de montage.
 */

let deferredPrompt = null
let installed = false
const listeners = new Set()

const notify = () => listeners.forEach(fn => fn())

const isStandalone = () =>
  typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS n'implémente pas display-mode et expose ce booléen non standard.
    window.navigator.standalone === true
  )

const isIOSDevice = () =>
  typeof window !== 'undefined' &&
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) &&
  !window.MSStream

if (typeof window !== 'undefined') {
  installed = isStandalone()

  window.addEventListener('beforeinstallprompt', (e) => {
    // Sans preventDefault, Chrome affiche sa propre mini-bannière et notre bouton
    // n'aurait plus rien à déclencher.
    e.preventDefault()
    deferredPrompt = e
    notify()
  })

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    notify()
  })
}

/**
 * @returns {{
 *   installed: boolean,   // l'app tourne déjà en mode application
 *   ios: boolean,         // iOS/Safari : installation manuelle uniquement
 *   canInstall: boolean,  // une voie d'installation est proposable maintenant
 *   promptInstall: () => Promise<void>  // déclenche la boîte native (Android/desktop)
 * }}
 */
export const useInstallPrompt = () => {
  // Re-render à chaque évolution du singleton (prompt capté, app installée…).
  const [, forceRender] = useState(0)

  useEffect(() => {
    const fn = () => forceRender(n => n + 1)
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  }, [])

  const ios = isIOSDevice()
  const isInstalled = installed || isStandalone()

  const promptInstall = async () => {
    if (!deferredPrompt) return
    const prompt = deferredPrompt
    prompt.prompt()
    await prompt.userChoice
    // Un prompt différé ne peut servir qu'une fois.
    deferredPrompt = null
    notify()
  }

  return {
    installed: isInstalled,
    ios,
    // Sur Android/desktop, rien à proposer tant que le navigateur n'a pas jugé
    // l'app installable (HTTPS, manifeste, service worker actif) et émis
    // l'évènement ; sur iOS, l'installation manuelle est toujours possible.
    canInstall: !isInstalled && (ios || Boolean(deferredPrompt)),
    promptInstall
  }
}
