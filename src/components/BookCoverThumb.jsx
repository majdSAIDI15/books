import { BookOpen } from 'lucide-react'
import { useBookCover } from '../lib/useBookCover'

/**
 * Petite vignette de couverture (listes « en cours de lecture »).
 * Composant à part car un hook ne peut pas être appelé dans un `map`.
 */
export const BookCoverThumb = ({ book }) => {
  const { src: cover, onError } = useBookCover(book.pdf_url, book.cover_url)

  return (
    <div
      className="w-10 h-12 rounded-sm shrink-0 shadow-sm border border-black/10 relative overflow-hidden flex items-center justify-center"
      style={{ backgroundColor: book.cover_color || '#EEEDFE' }}
    >
      {cover ? (
        <img src={cover} alt={book.title} loading="lazy" onError={onError}
          className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <>
          <div className="absolute top-0 right-0 bottom-0 w-1 bg-black/10"></div>
          <BookOpen className="w-5 h-5 text-primary/70" />
        </>
      )}
    </div>
  )
}
