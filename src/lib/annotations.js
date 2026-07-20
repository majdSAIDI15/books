// Les marque-pages vivaient ici, distingués par un `selected_text` vide, faute
// de pouvoir créer une table. Depuis la migration 2 ils ont la leur
// (`public.bookmarks`) et `annotations` ne contient plus que des surlignages.

export const ANNOTATION_COLORS = [
  { key: 'yellow', emoji: '🟡', bg: 'bg-amber-400', label: 'أصفر' },
  { key: 'blue', emoji: '🔵', bg: 'bg-blue-400', label: 'أزرق' },
  { key: 'red', emoji: '🔴', bg: 'bg-red-400', label: 'أحمر' },
  { key: 'green', emoji: '🟢', bg: 'bg-emerald-400', label: 'أخضر' }
]

export const colorLabel = (color) =>
  ANNOTATION_COLORS.find(c => c.key === color)?.label || 'أصفر'

/** Classes Tailwind des cartes du panneau latéral, par couleur. */
export const cardClasses = (color) => {
  switch (color) {
    case 'blue':
      return 'bg-blue-50/70 border-blue-400 hover:bg-blue-50'
    case 'red':
      return 'bg-red-50/70 border-red-400 hover:bg-red-50'
    case 'green':
      return 'bg-emerald-50/70 border-emerald-400 hover:bg-emerald-50'
    default:
      return 'bg-amber-50/70 border-amber-400 hover:bg-amber-50'
  }
}

export const dotClasses = (color) => {
  switch (color) {
    case 'blue': return 'bg-blue-500'
    case 'red': return 'bg-red-500'
    case 'green': return 'bg-emerald-500'
    default: return 'bg-amber-400'
  }
}
