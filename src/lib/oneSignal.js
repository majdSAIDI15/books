/**
 * Le SDK OneSignal v16 est chargé ET initialisé depuis index.html (snippet
 * officiel `OneSignalDeferred`). Ce helper attend simplement que le SDK soit
 * prêt — c.-à-d. après son `init()` — puis résout l'instance, pour que les
 * composants puissent appeler `login()`, `User.addTag()`,
 * `Notifications.requestPermission()`… sans se soucier du chargement ni risquer
 * un second `init()`.
 *
 * Résout `null` si le SDK ne se charge pas (CDN bloqué, hors ligne) au bout du
 * délai : l'appelant gère ce cas au lieu de rester bloqué indéfiniment, la file
 * `OneSignalDeferred` n'étant jamais vidée quand le script n'arrive pas.
 */
export const withOneSignal = (timeoutMs = 8000) =>
  new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(null); return }

    let settled = false
    const done = (value) => { if (!settled) { settled = true; resolve(value) } }

    window.OneSignalDeferred = window.OneSignalDeferred || []
    // Empilé APRÈS le push d'init d'index.html : le SDK traite la file dans
    // l'ordre, donc ce callback s'exécute une fois l'initialisation terminée.
    window.OneSignalDeferred.push((OneSignal) => done(OneSignal))

    setTimeout(() => done(window.OneSignal || null), timeoutMs)
  })
