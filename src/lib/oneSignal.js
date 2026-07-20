const SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'

let loadPromise = null

/**
 * Charge le SDK OneSignal à la demande. Il était auparavant inclus dans
 * index.html, donc téléchargé même sur l'écran de login où il ne sert à rien.
 * Résout `null` si les notifications ne sont pas configurées ou si le CDN est
 * injoignable — l'appelant doit gérer ce cas plutôt que de planter.
 */
export const loadOneSignal = () => {
  if (loadPromise) return loadPromise

  const appId = import.meta.env.VITE_ONESIGNAL_APP_ID
  if (!appId || appId === 'your_onesignal_app_id_here') {
    loadPromise = Promise.resolve(null)
    return loadPromise
  }

  loadPromise = new Promise((resolve) => {
    if (window.OneSignal) {
      resolve(window.OneSignal)
      return
    }
    const script = document.createElement('script')
    script.src = SDK_URL
    script.async = true
    script.onload = () => resolve(window.OneSignal || null)
    script.onerror = () => {
      console.error('Chargement du SDK OneSignal impossible')
      resolve(null)
    }
    document.head.appendChild(script)
  })

  return loadPromise
}
