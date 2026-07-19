# Audit du code — bugs, dette technique et pistes d'amélioration

Date : 2026-07-19 · Périmètre : `src/`, `public/`, configuration, schéma SQL
Légende de sévérité : **[C]** critique · **[H]** haute · **[M]** moyenne · **[B]** basse

---

## Statut des corrections

Corrigés dans le code (2026-07-19) :

| Point | Sujet | Fichiers |
|---|---|---|
| §1.4 | Élévation de privilège via `profiles.role` | `AdminDashboard.jsx`, `supabase_rls_roles.sql` |
| §1.5 | Écriture de `books` depuis une session membre | `PDFReader.jsx`, `supabase_rls_roles.sql` |
| §2.1 | `pages_read` stockait un numéro de page | `PDFReader.jsx` |
| §2.2 | Agrégation `.find()` au lieu d'une somme | `src/lib/stats.js` (nouveau) |
| §2.3 | `beforeunload` sans en-tête `Authorization` | `PDFReader.jsx` |
| §2.6 | Rappels OneSignal simulés | `AdminDashboard.jsx` |
| §2.7 | Auto-rétrogradation d'un admin | `AdminDashboard.jsx`, `supabase_rls_roles.sql` |
| §2.8 | Libellés de jours décalés selon le fuseau | `src/lib/stats.js` |
| §2.9 | Course à la création de compte | `supabase_rls_roles.sql` (upsert) |
| §3.1 | PDF rechargé à chaque re-rendu | `PDFReader.jsx` |
| §3.2 | Cache HTTP du PDF invalidé à chaque ouverture | `PDFReader.jsx` |
| §4.1 | Helpers dupliqués dans 3 fichiers | `src/lib/stats.js` |
| §5.2 | Index manquant sur `annotations` | `supabase_rls_roles.sql` |
| §6.5 | « Jamais commencé » confondu avec « absent » | `src/lib/stats.js`, `AdminDashboard.jsx` |

> **Action manuelle requise :** exécuter `supabase_rls_roles.sql` dans le SQL Editor
> Supabase. Tant que ce n'est pas fait, §1.4 reste ouvert **et** le changement de
> rôle ne fonctionne plus (le code appelle désormais `rpc('set_user_role')`).

> **Action manuelle requise :** `git rm --cached .env` + ajouter `.env` au
> `.gitignore` (§1.3), avant de renseigner la moindre clé secrète.

Tous les autres points de ce document restent ouverts.

---

## 1. Sécurité

### 1.1 [C] La clé `service_role` est destinée à finir dans le bundle navigateur
`src/lib/supabase.js:5-16`

Toute variable préfixée `VITE_` est inlinée par Vite dans le JavaScript public. `supabaseAdmin` est construit avec `VITE_SUPABASE_SERVICE_ROLE_KEY`, une clé qui **contourne intégralement RLS**. Dès qu'elle est renseignée, n'importe quel visiteur peut l'extraire du bundle (`view-source`, onglet Network) et obtenir un accès total en lecture/écriture/suppression sur toutes les tables et sur l'API `auth.admin` (lister, créer, supprimer des comptes, changer les mots de passe).

Aujourd'hui la valeur est encore un placeholder (`YOUR_SUPABASE_SERVICE_ROLE_KEY`), donc rien n'est exposé — mais l'application est *conçue* pour qu'on la remplisse, et l'UI de `AdminDashboard` affiche même une bannière invitant à le faire (`AdminDashboard.jsx:1106-1115`).

**Correctif :** déplacer les quatre appels `supabaseAdmin.auth.admin.*` (`createUser`, `updateUserById`, `deleteUser`, `listUsers`) dans une Supabase Edge Function qui vérifie côté serveur que l'appelant a `role = 'admin'`. Supprimer `supabaseAdmin` du client. La clé service ne doit jamais quitter le serveur.

### 1.2 [C] La clé REST OneSignal est également exposée au navigateur
`AdminDashboard.jsx:292`, `304-325`

`VITE_ONESIGNAL_REST_API_KEY` est bundlée puis envoyée en header `Authorization: Basic`. Un attaquant récupère la clé et peut envoyer des notifications push arbitraires à l'ensemble de vos utilisateurs (phishing). Même correctif : passer par une fonction serveur.

### 1.3 [H] `.env` est versionné dans Git
`.gitignore` ne contient pas `.env`, et `git ls-files` confirme que le fichier est suivi depuis le commit initial (`a93f69b`, puis modifié dans `6a97488` et `e7b35dc`).

Actuellement seuls l'URL Supabase et la clé `anon` (semi-publique par nature) sont réellement présents, donc **pas de fuite active**. Mais le fichier est l'emplacement désigné de la clé service : le jour où quelqu'un la renseigne, elle part dans l'historique Git.

**Correctif :**
```bash
echo ".env" >> .gitignore
git rm --cached .env
# créer un .env.example avec les noms de variables et des valeurs vides
```
Si la clé service a déjà été commitée sur une machine quelconque, la régénérer depuis le dashboard Supabase (réécrire l'historique ne suffit pas).

### 1.4 [C] ✅ CORRIGÉ — Le changement de rôle passe par le client anonyme — élévation de privilège probable

> **Correction appliquée.** `handleToggleRole` et `handleCreateAccount` appellent
> désormais `supabase.rpc('set_user_role', …)`. Le correctif serveur est dans
> `supabase_rls_roles.sql` : `revoke update (role)` sur `profiles` + fonction
> `SECURITY DEFINER` qui revérifie `auth.uid()` côté base.
> **⚠ Reste ouvert tant que le SQL n'est pas exécuté dans Supabase.**

`AdminDashboard.jsx:443-460`

```js
await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
```

C'est le client `anon` : la seule chose qui autorise cette écriture est la politique RLS sur `profiles`. Si cette politique est la formulation courante « un utilisateur peut modifier son propre profil » (`for update using (auth.uid() = id)`), alors **n'importe quel membre peut se promouvoir administrateur** en exécutant depuis sa console :

```js
supabase.from('profiles').update({ role: 'admin' }).eq('id', <son propre id>)
```

`ProtectedRoute` ne protège que l'affichage — il n'existe aucune barrière côté serveur.

**À vérifier immédiatement** dans le SQL Editor Supabase : la politique UPDATE sur `profiles` doit interdire l'écriture de la colonne `role`. Deux approches :
- révoquer la colonne : `revoke update (role) on public.profiles from authenticated;`
- ou déporter `role` dans une table séparée écrite uniquement par une fonction `security definer`.

### 1.5 [H] ✅ CORRIGÉ — Un membre peut écrire dans la table `books`

> **Correction appliquée.** L'écriture `books.total_pages` a été retirée de
> `onDocumentLoadSuccess` (correctif local en mémoire uniquement). Politique RLS
> admin-only sur `books` ajoutée dans `supabase_rls_roles.sql`.

`PDFReader.jsx:641-652`

À l'ouverture d'un PDF, le lecteur synchronise le nombre de pages :
```js
supabase.from('books').update({ total_pages: numPages }).eq('id', book.id)
```
Exécuté avec la session du **membre**. Deux cas, tous deux problématiques :
- RLS bloque → une erreur console silencieuse à chaque ouverture de livre, et `total_pages` ne se synchronise jamais ;
- RLS autorise → tout membre peut modifier n'importe quelle ligne de `books`.

**Correctif :** calculer `total_pages` une seule fois côté admin à l'upload (c'est déjà fait, `AdminDashboard.jsx:667`) et retirer cette écriture du lecteur.

### 1.6 [H] Aucune politique RLS documentée pour les 4 tables les plus sensibles
`supabase_schema.sql` ne couvre que `annotations` et `book_notes`. Les tables `profiles`, `books`, `reading_sessions` et `daily_logs` — qui portent les rôles, les contenus et les statistiques — n'ont aucune politique versionnée. Le modèle de sécurité réel n'est nulle part dans le dépôt et n'est donc ni revu ni reproductible.

**Correctif :** exporter les politiques existantes et les committer, idéalement dans un dossier `supabase/migrations/`.

### 1.7 [M] Injection HTML via le texte du PDF dans le surlignage
`PDFReader.jsx:185-188`

```js
span.innerHTML = spanText.replace(regex, `<mark ...>$1</mark>`)
```

`spanText` est le contenu textuel brut de la couche texte pdf.js. L'affectation `innerHTML` **re-parse la totalité du span comme du HTML**. Un PDF dont le texte contient `<img src=x onerror=alert(1)>` exécutera ce code au moment du surlignage. L'échappement regex ligne 177 protège l'expression régulière, pas le HTML injecté.

Portée limitée (seuls les admins uploadent des PDF), mais le correctif est simple : construire les nœuds via `document.createTextNode` + `createElement`, ou utiliser l'API `CSS Custom Highlight` / un overlay absolu plutôt que de réécrire le DOM.

### 1.8 [B] Absence d'en-têtes de sécurité
`vercel.json` ne définit que des rewrites. Aucun `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`. Une CSP serait par ailleurs un garde-fou utile contre 1.7.

---

## 2. Bugs de correction

### 2.1 [C] `daily_logs.pages_read` stocke un numéro de page, pas un nombre de pages
`PDFReader.jsx:492`, `585`, `522`

```js
const pagesReadToday = Math.max(alreadyReadTodayRef.current, maxPageReached)
```

`maxPageReached` est **l'index de la page atteinte**, pas la quantité lue. Un utilisateur qui reprend à la page 300 et lit une seule page enregistre `pages_read = 301`.

Conséquence : toutes les statistiques de l'application sont fausses — le graphique « نشاطي القرائي », le total « صفحة في آخر 7 أيام », les pastilles admin, la détection d'assiduité. Un lecteur régulier d'un gros livre affiche des centaines de pages par jour ; un lecteur qui recommence un livre affiche une chute.

**Correctif :** enregistrer le delta de la session :
```js
const pagesReadThisSession = Math.max(0, maxPageReachedRef.current - initialPageRef.current)
const pagesReadToday = alreadyReadTodayRef.current + pagesReadThisSession
```
en veillant à ne comptabiliser le delta qu'une fois (le remettre à zéro après écriture). Les données existantes devront être migrées ou purgées.

### 2.2 [H] Perte de données quand un utilisateur lit plusieurs livres le même jour
`MemberDashboard.jsx:40`, `55`, `69`, `80` — `AdminDashboard.jsx:76`, `87`, `99`

`daily_logs` a pour clé unique `(user_id, book_id, date)` : il y a donc **une ligne par livre et par jour**. Or toutes les fonctions d'agrégation font :

```js
const log = logs.find(l => l.date === dateStr)
```

`.find()` retourne la **première** ligne et ignore les autres. Lire deux livres dans la journée n'en comptabilise qu'un, arbitrairement.

**Correctif :** remplacer partout par une somme :
```js
const pages = logs.filter(l => l.date === dateStr).reduce((s, l) => s + l.pages_read, 0)
```
Cela concerne `buildChartData`, `getLast7Total`, `getStreak` et `getLastReadInfo` dans les trois fichiers.

### 2.3 [H] La sauvegarde à la fermeture d'onglet n'est jamais autorisée
`PDFReader.jsx:516-561`

Le handler `beforeunload` — la voie de sauvegarde la plus importante, celle qui rattrape la fermeture brutale — envoie :

```js
const headers = {
  'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates'
}
```

Il manque `Authorization: Bearer <access_token>`. Sans lui, PostgREST exécute la requête avec le rôle `anon` : `auth.uid()` vaut `null`, la politique `auth.uid() = user_id` échoue, et **l'écriture est rejetée silencieusement** (aucun `.catch`, aucune vérification de `response.ok`).

Second défaut : `Prefer: resolution=merge-duplicates` nécessite un paramètre `?on_conflict=user_id,book_id` dans l'URL pour cibler la bonne contrainte. Sans lui la requête renvoie 409 même authentifiée.

**Correctif :**
```js
const { data: { session } } = await supabase.auth.getSession() // à garder en ref, pas dans le handler
// ...
headers: {
  apikey: ANON_KEY,
  Authorization: `Bearer ${session.access_token}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates'
}
fetch(`${URL}/rest/v1/reading_sessions?on_conflict=user_id,book_id`, { ... })
```
Envisager `navigator.sendBeacon` en complément.

### 2.4 [H] Boucle de rechargement infinie possible
`ProtectedRoute.jsx:8-13`

```js
useEffect(() => {
  const timer = setTimeout(() => { if (loading) window.location.reload() }, 3000)
  return () => clearTimeout(timer)
}, [loading])
```

Si l'initialisation d'auth échoue durablement (réseau lent, Supabase indisponible, session corrompue), chaque rechargement relance un timer de 3 s qui recharge à nouveau — **boucle infinie**, l'utilisateur ne peut plus rien faire, et chaque tour consomme du quota API.

C'est un pansement sur le vrai problème (`loading` qui ne se résout pas). **Correctif :** supprimer le rechargement ; afficher après 5 s un écran d'erreur avec un bouton « réessayer » et un lien de déconnexion.

### 2.5 [H] L'inscription d'un nouvel utilisateur mène à `/unauthorized`
`Login.jsx:41-56` + `AuthContext.jsx:21-38` + `ProtectedRoute.jsx:31-34`

Après `signUp`, le code navigue immédiatement vers `/member`. Or la ligne dans `profiles` est créée par un trigger base de données, de façon asynchrone. `fetchProfile` utilise `.single()`, qui **remonte une erreur PGRST116 quand aucune ligne n'existe** et retourne `null`. `ProtectedRoute` compare alors `profile?.role !== 'member'` → `undefined !== 'member'` → redirection vers `/unauthorized`.

Cas aggravant : si la confirmation d'email est activée dans Supabase, `signUp` renvoie un `user` **sans session**. L'utilisateur est renvoyé au login sans aucun message lui disant de consulter sa boîte mail.

**Correctif :** utiliser `.maybeSingle()`, gérer explicitement `profile === null` (écran « configuration du compte en cours » avec re-tentative), et afficher un message dédié quand `data.session === null` après `signUp`.

### 2.6 [H] Les rappels de lecture sont simulés, pas envoyés
`AdminDashboard.jsx:298-302`

```js
if (!restApiKey || restApiKey === 'YOUR_ONESIGNAL_REST_API_KEY') {
  console.warn('OneSignal REST API key is missing. Simulating successful reminder.')
  await new Promise(resolve => setTimeout(resolve, 800))
  return true
}
```

La fonction retourne `true`, l'UI affiche l'état « success ». Or `.env` contient précisément ce placeholder : **aujourd'hui, chaque rappel envoyé par un admin est un faux positif**. L'admin croit relancer ses lecteurs absents, rien ne part.

**Correctif :** lever une erreur explicite (« notifications non configurées ») et désactiver le bouton d'envoi quand la clé est absente. Ne jamais simuler un succès.

### 2.7 [M] Un admin peut se rétrograder lui-même et perdre l'accès
`AdminDashboard.jsx:443-460`, bouton `1205-1211`

Le bouton de suppression a une garde `isSelf` (`disabled={!supabaseAdmin || isSelf}`, ligne 1216), mais **le bouton de changement de rôle n'en a aucune**. Un admin peut se passer en `member` : la page suivante le renvoie vers `/unauthorized`, sans possibilité de revenir en arrière depuis l'UI. Rien n'empêche non plus de rétrograder le dernier admin du système.

**Correctif :** désactiver le toggle quand `isSelf`, et refuser côté serveur toute opération qui ramènerait le nombre d'admins à zéro.

### 2.8 [M] Les libellés de jours sont décalés dans les fuseaux négatifs
`MemberDashboard.jsx:39`, `58` — `AdminDashboard.jsx:75`

```js
ARABIC_DAYS[new Date(dateStr).getDay()]
```

`new Date('2026-07-19')` est interprété comme **minuit UTC**, mais `.getDay()` renvoie le jour de la semaine **local**. Pour un utilisateur en UTC-5, minuit UTC correspond à 19 h la veille : tous les libellés du graphique sont décalés d'un jour.

Même défaut dans la branche `'all'` de `buildChartData` (`MemberDashboard.jsx:36-47`), qui construit les dates avec `new Date(earliest)` puis les sérialise via `.toISOString()` — mélange de logique locale et UTC.

**Correctif :** parser explicitement en local, `new Date(y, m - 1, d)`, ou centraliser dans un helper unique (voir 4.1).

### 2.9 [M] Course lors de la création de compte par un admin
`AdminDashboard.jsx:369-395`

`createUser` puis, immédiatement, `update({ role }).eq('id', data.user.id)`. Si le trigger qui crée la ligne `profiles` n'a pas encore été exécuté, l'`update` ne touche aucune ligne. Supabase ne considère pas cela comme une erreur (0 ligne modifiée ≠ erreur), donc **le compte est créé avec le rôle par défaut et l'UI annonce un succès**. Un admin créé de cette façon sera en réalité un simple membre.

**Correctif :** faire un `upsert` sur `profiles` plutôt qu'un `update`, ou passer le rôle dans `user_metadata` et laisser le trigger le lire, ou vérifier le nombre de lignes affectées et réessayer.

### 2.10 [M] Le lecteur ramène toujours l'utilisateur à la page la plus avancée
`PDFReader.jsx:621-633`, `565`

`last_page` stocke `maxPageReachedRef`, jamais la position courante. Un utilisateur qui a atteint la page 300 puis souhaite relire le chapitre 2 sera **replacé à la page 300 à chaque réouverture**, sans moyen de sauvegarder une position antérieure. La sauvegarde ne se déclenche d'ailleurs que si `newPage > maxPageReached` (`pendingSaveRef`), donc toute lecture en arrière n'est jamais persistée.

**Correctif :** séparer les deux notions — `last_page` (position réelle, toujours sauvegardée) et `max_page` (progression maximale, pour le pourcentage).

### 2.11 [M] Le surlignage échoue sur toute sélection à cheval sur deux lignes
`PDFReader.jsx:159-192`

La restauration cherche `spanText.includes(textToFind)` **à l'intérieur d'un seul span**. Or pdf.js découpe la couche texte en un span par fragment de ligne. Toute sélection dépassant une fin de ligne — c'est-à-dire la majorité des sélections utiles — ne sera **jamais retrouvée** au rechargement. L'annotation reste dans le panneau latéral, mais le surlignage disparaît du texte.

Effets de bord additionnels : si le même texte apparaît plusieurs fois sur la page, **toutes** les occurrences sont surlignées ; et la réécriture `innerHTML` casse les offsets de sélection de pdf.js pour les sélections suivantes.

**Correctif structurel :** stocker les coordonnées de la sélection (index de span de début/fin + offsets caractère, ou rectangles normalisés) plutôt que le texte brut, et rendre les surlignages en overlay absolu positionné au-dessus de la page, sans toucher au DOM de pdf.js.

### 2.12 [M] Pagination Supabase : le dashboard admin se tronque à 1000 lignes
`AdminDashboard.jsx:491-515`

Quatre `select('*')` sans `.range()` ni `.limit()`. PostgREST applique une limite par défaut (1000 lignes chez Supabase). Passé ce seuil — atteint rapidement sur `daily_logs`, qui grossit d'une ligne par utilisateur × livre × jour — le dashboard affiche **silencieusement des statistiques fausses**, sans aucune erreur.

**Correctif :** faire l'agrégation côté base (vue SQL ou fonction RPC qui renvoie les totaux par jour) plutôt que de rapatrier l'intégralité des logs dans le navigateur.

### 2.13 [B] Classe Tailwind invalide sur le badge de compteur
`PDFReader.jsx:817` — `w-4.5 h-4.5` n'existe pas dans l'échelle d'espacement Tailwind par défaut. Les deux classes sont ignorées ; le badge n'a pas de dimension imposée. Utiliser `w-[18px] h-[18px]` ou étendre le thème.

### 2.14 [B] Variantes `dark:` sans configuration de mode sombre
`PDFReader.jsx:1010-1155` utilise abondamment `dark:bg-[#2C2C2A]`, `dark:text-white`… mais `tailwind.config.js` ne définit pas `darkMode`. Tailwind applique donc la stratégie `media` par défaut : **le panneau de notes passe en sombre selon les préférences OS alors que tout le reste de l'application reste clair**. Résultat visuellement incohérent. Soit assumer un thème sombre global, soit retirer ces variantes.

### 2.15 [B] Manipulation DOM directe fragile
`AdminDashboard.jsx:700` — `document.getElementById('pdf-upload-input').value = ''` lève une `TypeError` si l'élément est démonté entre-temps. Utiliser une `ref` React.

---

## 3. Performance

### 3.1 [C] Le PDF est rechargé intégralement à chaque re-rendu
`PDFReader.jsx:781-786`

```js
const loadingTask = {
  url: pdfUrl,
  rangeChunkSize: 65536,
  disableAutoFetch: false,
  disableStream: false,
}
// ...
<Document file={loadingTask} ... />
```

Cet objet est **recréé à chaque rendu du composant**. `react-pdf` compare la prop `file` par identité : une nouvelle référence signifie « nouveau document », donc démontage et **re-téléchargement complet du fichier**.

Or le composant se re-rend en permanence : à chaque changement de page détecté par l'IntersectionObserver (au scroll), à chaque `onRenderSuccess` (`setRenderedPages`), à chaque toast, à chaque sélection de texte, à chaque redimensionnement. C'est très probablement la cause principale des problèmes de performance du lecteur.

**Correctif :**
```js
const file = useMemo(() => ({
  url: pdfUrl, rangeChunkSize: 65536, disableAutoFetch: false, disableStream: false,
}), [pdfUrl])
```

### 3.2 [H] Le cache HTTP du PDF est délibérément invalidé à chaque ouverture
`PDFReader.jsx:28`, `776-779`

```js
const [versionKey] = useState(() => Date.now())
// ...
pdfUrl = `${pdfUrl}?v=${versionKey}`
```

Chaque ouverture d'un livre génère une URL unique, donc un **téléchargement complet depuis le stockage Supabase**, alors même que l'upload définit `cacheControl: '3600'` (`AdminDashboard.jsx:680`). Pour un PDF de 30 Mo relu quotidiennement, c'est 30 Mo de bande passante par session, à la charge du quota Supabase et de la connexion mobile de l'utilisateur.

**Correctif :** supprimer le cache-busting. Si l'objectif est d'invalider après remplacement d'un fichier, versionner sur `book.updated_at` — une valeur stable — et non sur `Date.now()`.

### 3.3 [H] Chaque page est rendue deux fois, à une résolution incohérente
`PDFReader.jsx:874-880`

```js
<Page pageNumber={pageNum} width={pageWidth} scale={renderedPages[pageNum] ? 1.5 : 1.0} ... />
```

`react-pdf` multiplie `width` par `scale`. Séquence réelle : rendu à `pageWidth` → `onRenderSuccess` → `setRenderedPages` → re-rendu à `pageWidth × 1.5` → le canvas déborde du conteneur → `max-width: 100%` (`index.css`) le recompresse visuellement.

Chaque page est donc **rasterisée deux fois**, la seconde fois à 2,25× la surface nécessaire, puis réduite par le navigateur. Coût CPU et mémoire doublé pour un résultat que la prop dédiée obtient directement.

**Correctif :** supprimer l'état `renderedPages` et utiliser `devicePixelRatio={window.devicePixelRatio || 1}`, prévu exactement pour la netteté sur écrans HiDPI.

### 3.4 [M] Toutes les pages sont re-mappées à chaque défilement
`PDFReader.jsx:861-898`

`Array.from(new Array(numPages))` reconstruit la liste complète à chaque changement de `currentPage`. Pour un livre de 800 pages, cela recrée 800 éléments React à chaque page franchie au scroll. Seules 7 pages sont réellement montées (fenêtre `±3`, bonne idée), mais les 793 placeholders sont recalculés.

**Correctif :** extraire un composant `<PdfPage>` mémoïsé via `React.memo`, ou passer à une virtualisation réelle (`react-window`).

### 3.5 [M] Le profil est rechargé à chaque événement d'authentification
`AuthContext.jsx:76-86`

`onAuthStateChange` déclenche un `fetchProfile` pour **tous** les événements, y compris `TOKEN_REFRESHED` (toutes les heures) et `SIGNED_IN` émis au retour de focus sur l'onglet. Chaque appel remplace l'objet `profile` par une nouvelle référence, ce qui re-rend l'arbre entier — donc, combiné à 3.1, **peut relancer le téléchargement du PDF en pleine lecture**.

**Correctif :** filtrer sur l'événement et sur le changement effectif d'`user.id` :
```js
if (event === 'TOKEN_REFRESHED') return
if (session?.user?.id === currentUserIdRef.current) return
```

### 3.6 [M] Surlignage en O(annotations × spans), déclenché par minuteries
`PDFReader.jsx:169-191`, appelé depuis `263-270`, `705-721`

Boucle imbriquée sur toutes les annotations × tous les spans de la page, avec écriture `innerHTML` (donc reparsing HTML) à chaque correspondance. Rejoué à chaque rendu de page et à chaque chargement d'annotations, via des `setTimeout` de 100/500/600 ms. Sur une page dense avec 20 annotations, cela représente des milliers d'itérations et de reflows.

### 3.7 [M] Aucun découpage du bundle, tout est chargé dès le login
`App.jsx:5-8` importe statiquement `Login`, `AdminDashboard`, `MemberDashboard` et `PDFReader`. Un membre télécharge donc `recharts` **et** l'intégralité du dashboard admin ; un visiteur non connecté télécharge `react-pdf` et `pdfjs`. Le bundle initial dépasse très probablement 1 Mo.

**Correctif :**
```js
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const PDFReader = lazy(() => import('./pages/PDFReader'))
```
avec un `<Suspense>` réutilisant le spinner existant. Ajouter au besoin `build.rollupOptions.output.manualChunks`.

### 3.8 [M] Lecture intégrale du PDF en mémoire à l'upload, sans limite de taille
`AdminDashboard.jsx:634-648`, `623-632`

`getPdfPageCount` charge le fichier entier en `ArrayBuffer` via `FileReader` pour ne lire que `numPages`. Aucune validation de taille en amont : un PDF de 300 Mo fait planter l'onglet. La validation de type se limite à `file.type === 'application/pdf'`, propriété fournie par le navigateur, absente sur certains systèmes et trivialement contournable.

**Correctif :** imposer une taille maximale explicite (message en arabe à l'appui), et utiliser `await file.arrayBuffer()` plutôt que `FileReader`.

### 3.9 [B] Redimensionnement non débounced
`PDFReader.jsx:77-83` — chaque événement `resize` met à jour `pageWidth`, ce qui invalide toutes les pages. Ajouter un debounce de ~150 ms.

### 3.10 [B] Barre de progression d'upload fictive
`AdminDashboard.jsx:661`, `664`, `672`, `683`, `694` — les valeurs 10/20/40/80/100 sont codées en dur et sans rapport avec l'avancement réel du transfert. Sur un gros fichier, la barre reste bloquée à 40 % pendant plusieurs minutes. Utiliser un vrai callback de progression ou afficher un indicateur indéterminé honnête.

### 3.11 [B] SDK OneSignal chargé sur toutes les pages
`index.html:13` — le script est chargé y compris sur l'écran de login, où il ne sert à rien. Le charger dynamiquement depuis `MemberDashboard`.

### 3.12 [B] Worker pdf.js servi par un CDN tiers
`PDFReader.jsx:12`, `AdminDashboard.jsx:17` — dépendance à `unpkg.com` : si le CDN est indisponible, le lecteur ne fonctionne plus du tout ; c'est aussi une surface d'attaque supply-chain. Le fallback `|| '3.11.174'` est de surcroît dangereux : `react-pdf` 10.x embarque pdf.js 4.x/5.x, donc si `pdfjs.version` était `undefined`, on chargerait un worker incompatible. Bundler le worker localement :
```js
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
```

---

## 4. Qualité et architecture

### 4.1 [H] Helpers dupliqués dans trois fichiers, déjà divergents
`getLocalDateStr`, `getInitials`, `getLastReadInfo`, `getFlameIndicator`, `buildChartData`, `getLast7Total`, `getStreak`, `ARABIC_DAYS` sont copiés-collés entre `AdminDashboard.jsx`, `MemberDashboard.jsx`, `MemberRow.jsx` et `Navbar.jsx`.

La divergence est déjà survenue : les deux implémentations de `buildChartData` (`MemberDashboard.jsx:28-63` et `AdminDashboard.jsx:64-80`) ont des signatures et des comportements différents pour le mode « tout l'historique ». C'est exactement pourquoi les bugs 2.2 et 2.8 devront être corrigés à six endroits au lieu d'un.

**Correctif :** créer `src/lib/dates.js` et `src/lib/stats.js` et n'y garder qu'une seule version de chaque fonction.

### 4.2 [M] `MemberRow.jsx` est du code mort
Le fichier (122 lignes) n'est importé nulle part — `AdminDashboard` utilise son composant interne `MemberChartPanel`. Il contient une copie supplémentaire des helpers de 4.1. À supprimer.

### 4.3 [M] `AdminDashboard.jsx` fait 1237 lignes
Le fichier mélange : appels d'API, gestion des comptes, upload de livres, envoi de notifications, calculs statistiques, un sous-composant graphique et environ 500 lignes de JSX. Il est difficile à relire et à tester.

**Découpage suggéré :** `hooks/useAdminData.js` (chargement + agrégation), `components/admin/AccountsTable.jsx`, `components/admin/AddBookForm.jsx`, `components/admin/MemberChartPanel.jsx`.

### 4.4 [M] Trois mécanismes de sauvegarde concurrents dans le lecteur
`PDFReader.jsx:463-480` (notes au démontage), `484-513` (progression au démontage), `516-561` (`beforeunload`), plus le debounce de 3 s (`626-632`). Ces chemins se recouvrent, n'ont pas la même gestion d'erreur (l'un utilise `.then()` sans `catch`, l'autre `keepalive`, le troisième ignore la réponse), et l'un d'eux ne fonctionne pas du tout (2.3).

**Correctif :** une seule fonction `flushProgress(reason)` appelée par les trois déclencheurs, avec une gestion d'erreur unique.

### 4.5 [M] Retours utilisateur incohérents
`AdminDashboard` dispose d'états `accountError` / `accountSuccess` rendus proprement dans l'UI en arabe… mais `handleUpdatePassword` (`404-441`), `handleToggleRole` et `handleDeleteAccount` les réinitialisent puis utilisent `alert()` et `window.confirm()` natifs. Ces états deviennent du code mort sur ces chemins, et les dialogues natifs bloquent le thread principal, ne sont pas stylables et jurent avec le reste de l'interface.

### 4.6 [M] Aucune `ErrorBoundary`
Une erreur de rendu dans `PDFReader` ou dans un graphique Recharts produit un écran blanc sans message ni possibilité de récupération. Ajouter une boundary autour des routes, avec un écran de repli en arabe.

### 4.7 [M] Traduction des erreurs par comparaison de chaînes anglaises
`Login.jsx:66-74`, `102-112` — le code compare `error.message === 'Invalid login credentials'`. Ces libellés changent d'une version de Supabase à l'autre, et l'utilisateur reçoit alors un message brut en anglais dans une interface arabe. Utiliser `error.code` / `error.status`, plus stables.

### 4.8 [M] Validation incohérente entre création et modification de mot de passe
`handleUpdatePassword` impose 6 caractères minimum (`AdminDashboard.jsx:413`), `handleCreateAccount` n'impose rien (`357-360`). Un admin peut créer un compte avec un mot de passe d'un caractère — Supabase le rejettera, mais l'erreur remontera en anglais.

### 4.9 [B] Deux stratégies de redirection concurrentes après login
`Login.jsx:19-27` utilise `navigate()` dans un effet, `Login.jsx:94` utilise `window.location.href` (rechargement complet, perte de l'état SPA). `App.jsx:20` fait de même dans la page `Unauthorized`. L'historique Git montre trois commits successifs sur ce sujet (`120b1e1`, `0459c76`, `12426ec`) : le mélange des deux approches est très probablement la cause de cette instabilité. Choisir une seule voie — `navigate()` — et supprimer l'autre.

### 4.10 [B] `AuthProvider` est placé à l'extérieur de `BrowserRouter`
`App.jsx:32-33` — le provider ne peut donc pas utiliser `useNavigate`, ce qui interdit toute redirection centralisée (par exemple sur expiration de session). La convention est d'avoir le routeur à l'extérieur.

### 4.11 [B] Fuite de `setState` après démontage
`AuthContext.jsx:76-86` — le garde `mounted` est appliqué dans `initializeAuth` mais **pas** dans le callback `onAuthStateChange`, qui appelle `setUser` / `setProfile` sans vérification.

### 4.12 [B] Variables et code inutilisés
- `MemberDashboard.jsx:240` — `maxPages` calculé, jamais utilisé.
- `MemberDashboard.jsx:123` — `getLocalDateStrFn` est un wrapper sans intérêt autour de `getLocalDateStr`.
- `index.css:60-70` — l'animation `.animate-slide-in` (slideInLeft) n'est jamais référencée ; seule `-right` sert.
- `import React from 'react'` inutile dans 6 fichiers (transformation JSX automatique de React 19).
- `PDFReader.jsx:210-224` — `highlightSavedAnnotations` (version globale) est appelée une seule fois et fait doublon avec la version par page.

### 4.13 [B] ESLint ne peut pas s'exécuter
`npx eslint .` échoue : `Cannot find package '@eslint/js'`. Les dépendances de développement ne sont pas installées dans cet environnement. Conséquence : aucune des règles `react-hooks/exhaustive-deps` n'a jamais tourné — or plusieurs effets ont des dépendances manquantes (`AdminDashboard.jsx:616` appelle `fetchData` avec `[]`, `MemberDashboard.jsx:164` avec `[user]` alors que `fetchData` n'est pas mémoïsée).

### 4.14 [B] Aucun test
Pas de runner, pas de fichier de test. Les fonctions les plus critiques et les plus faciles à tester — `buildChartData`, `getStreak`, `getLast7Total`, `getLocalDateStr` — sont précisément celles qui portent les bugs 2.1, 2.2 et 2.8. Un simple Vitest sur `src/lib/stats.js` (une fois l'extraction 4.1 faite) les aurait tous attrapés.

---

## 5. Base de données

### 5.1 [H] Schéma incomplet dans le dépôt
`supabase_schema.sql` ne décrit que 2 tables sur 6. `profiles`, `books`, `reading_sessions` et `daily_logs` n'existent que dans le projet Supabase distant. Impossible de recréer l'environnement, de relire le modèle de sécurité ou de suivre les changements. Adopter `supabase/migrations/`.

### 5.2 [M] Index manquants
Les requêtes filtrent systématiquement sur `(user_id, book_id)` et `(user_id, date)`. Aucun index n'est déclaré sur `annotations` ni `book_notes` (la contrainte `unique(user_id, book_id)` de `book_notes` en fournit un, `annotations` n'a rien). Ajouter :
```sql
create index if not exists annotations_user_book_idx on public.annotations (user_id, book_id, page_number);
```

### 5.3 [M] `daily_logs` : agrégation à déporter côté serveur
Voir 2.12. Une vue ou une fonction RPC renvoyant `(date, total_pages)` par utilisateur supprimerait d'un coup le problème de pagination, le problème de `.find()` (2.2) et le volume de données transféré.

### 5.4 [B] Politiques RLS sans `with check` explicite
`supabase_schema.sql:27-31` — `for all using (...)` réutilise l'expression `using` comme contrôle d'insertion, ce qui est correct, mais l'expliciter (`with check (auth.uid() = user_id)`) évite toute ambiguïté à la relecture.

### 5.5 [B] `updated_at` géré par le client
`reading_sessions.updated_at` et `book_notes.updated_at` sont écrits depuis le navigateur (`new Date().toISOString()`). Une horloge cliente décalée fausse le tri `sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))` d'`AdminDashboard.jsx:531`, qui sert à déterminer le « livre en cours ». Utiliser un trigger `before update` côté base.

---

## 6. UX et accessibilité

### 6.1 [M] Boutons icône sans nom accessible
Les boutons de `Navbar`, du panneau d'annotations et du tableau des comptes n'ont qu'un attribut `title`, qui n'est pas systématiquement exposé aux lecteurs d'écran. Ajouter `aria-label` sur chaque bouton sans texte visible.

### 6.2 [M] Le lecteur PDF n'est pas utilisable au clavier
Aucun raccourci de navigation entre pages, pas de champ « aller à la page », pas de contrôle de zoom. Le seul moyen de se déplacer dans un livre de 800 pages est le défilement. C'est aussi un point d'accessibilité : les `div.page-wrapper` ne sont pas focusables.

### 6.3 [B] Champs de mot de passe sans `autocomplete`
`Login.jsx:196-204` — sans `autocomplete="current-password"` / `"new-password"`, les gestionnaires de mots de passe se comportent mal. Le formulaire de login manque également `name` sur les champs.

### 6.4 [B] Pas d'état de focus visible
Plusieurs boutons utilisent `focus:outline-none` sans anneau de remplacement (`PDFReader.jsx:987`, `1154`), rendant la navigation au clavier invisible.

### 6.5 [B] Confusion entre « jamais commencé » et « absent »
`getLastReadInfo` retourne `daysSince: Infinity` pour un utilisateur qui n'a jamais lu, et `getFlameIndicator` l'affiche alors en rouge « n'a pas lu depuis 2 jours ou plus ». Un nouveau membre inscrit ce matin apparaît immédiatement comme défaillant, et se retrouve dans la liste des absents à relancer (`AdminDashboard.jsx:550-554`). Distinguer les deux états.

### 6.6 [B] Rechargement complet du dashboard à chaque rafraîchissement
`AdminDashboard.jsx:487` — `handleRefresh` déclenche `setLoading(true)`, ce qui remplace toute la page par des squelettes. Utiliser `refreshing` seul (l'état existe déjà, `260`) pour une mise à jour discrète en arrière-plan.

---

## 7. Ordre de traitement recommandé

**Immédiat — sécurité**
1. Vérifier la politique RLS `UPDATE` sur `profiles` (§1.4) — c'est potentiellement une élévation de privilège exploitable dès aujourd'hui.
2. Retirer `.env` du suivi Git et l'ajouter au `.gitignore` (§1.3).
3. Ne pas renseigner `VITE_SUPABASE_SERVICE_ROLE_KEY` ni `VITE_ONESIGNAL_REST_API_KEY` tant que §1.1/§1.2 ne sont pas déportés côté serveur.

**Court terme — données**
4. Corriger la sémantique de `pages_read` (§2.1) et l'agrégation multi-livres (§2.2) : toutes les statistiques de l'application en dépendent.
5. Ajouter l'en-tête `Authorization` au handler `beforeunload` (§2.3) — la sauvegarde à la fermeture ne fonctionne pas.
6. Supprimer la boucle de rechargement de `ProtectedRoute` (§2.4).
7. Rendre les rappels honnêtes (§2.6).

**Puis — performance du lecteur**
8. `useMemo` sur la prop `file` (§3.1) — probablement le gain le plus important pour un effort minime.
9. Supprimer le cache-busting (§3.2) et le double rendu (§3.3).

**Enfin — structure**
10. Extraire les helpers dans `src/lib/` (§4.1), supprimer `MemberRow.jsx` (§4.2), ajouter des tests Vitest sur les fonctions statistiques (§4.14).
