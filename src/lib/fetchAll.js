// PostgREST plafonne les réponses à 1000 lignes chez Supabase. Les `select('*')`
// du tableau de bord admin n'avaient ni `.range()` ni `.limit()` : passé ce
// seuil — vite atteint sur `daily_logs`, qui grossit d'une ligne par
// utilisateur × livre × jour — la page affichait des statistiques fausses sans
// la moindre erreur (§2.12).
//
// Le correctif idéal serait d'agréger côté base (vue ou fonction RPC), mais cela
// suppose un accès au SQL Editor dont on ne dispose pas. À défaut, on pagine
// explicitement : les totaux restent justes, seul le volume transféré demeure
// perfectible.

const PAGE_SIZE = 1000

/**
 * @param {() => object} buildQuery fabrique une nouvelle requête à chaque appel
 *   (un PostgrestBuilder ne peut pas être réutilisé après exécution).
 */
export const fetchAllRows = async (buildQuery) => {
  const rows = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error

    rows.push(...(data || []))

    // Page incomplète : c'est la dernière.
    if (!data || data.length < PAGE_SIZE) break
  }

  return rows
}
