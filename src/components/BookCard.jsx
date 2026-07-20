import { Book, Play, ArrowLeft } from 'lucide-react'
import { ProgressBar } from './ProgressBar'
import { useBookCover } from '../lib/useBookCover'

export const BookCard = ({ book, progress = 0, onStartRead }) => {
  const { title, author, category, cover_color, pdf_url, cover_url } = book

  const isStarted = progress > 0
  // Couverture stockée si elle existe, sinon rendu local du PDF. Vaut null tant
  // qu'aucune des deux n'a abouti : on affiche alors le visuel coloré d'origine.
  const { src: showCover, onError: onCoverError } = useBookCover(pdf_url, cover_url)

  return (
    <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md hover:border-primary/30 transition-all duration-300 group">

      {/* Première page du PDF si disponible, sinon maquette colorée.
          Hauteur réduite sur mobile : à deux colonnes sur un écran de 375 px,
          une carte fait environ 165 px de large, et une couverture de 176 px de
          haut y paraîtrait disproportionnée. */}
      <div
        className="h-36 sm:h-44 relative flex items-center justify-center p-3 sm:p-6 select-none transition-transform duration-300"
        style={{ backgroundColor: cover_color || '#EEEDFE' }}
      >
        {showCover ? (
          <>
            <img
              src={showCover}
              alt={title}
              loading="lazy"
              onError={onCoverError}
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Voile bas pour garder le titre lisible sur une page claire */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent"></div>
            <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3 text-right">
              <span className="text-[9px] sm:text-[10px] font-semibold px-1.5 sm:px-2 py-0.5 bg-white/25 text-white rounded-full backdrop-blur-sm">
                {category || 'عام'}
              </span>
              <h3 className="text-xs sm:text-sm font-bold text-white leading-tight line-clamp-2 mt-1 sm:mt-1.5 drop-shadow">
                {title}
              </h3>
            </div>
          </>
        ) : (
          <>
            {/* Subtle spine gradient for 3D book effect */}
            <div className="absolute top-0 right-0 bottom-0 w-3 bg-black/10 shadow-[inset_-1px_0_2px_rgba(0,0,0,0.1)]"></div>
            <div className="absolute top-0 right-3 bottom-0 w-1 bg-white/10"></div>

            {/* Content on the cover */}
            <div className="text-center flex flex-col items-center max-w-full">
              <div className="bg-white/20 p-2 sm:p-2.5 rounded-full mb-2 sm:mb-3 backdrop-blur-sm border border-white/30 text-textPrimary">
                <Book className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 bg-black/15 text-textPrimary rounded-full mb-1.5 sm:mb-2 uppercase tracking-wide backdrop-blur-sm">
                {category || 'عام'}
              </span>
              <h3 className="text-xs sm:text-base font-bold text-textPrimary leading-tight line-clamp-2 px-1 sm:px-2 text-center drop-shadow-sm">
                {title}
              </h3>
            </div>
          </>
        )}
      </div>

      {/* Book details & Progress */}
      <div className="p-3 sm:p-5 flex-grow flex flex-col justify-between space-y-2.5 sm:space-y-4">
        <div>
          {/* Libellé « المؤلف » masqué sur mobile : à cette largeur il consomme
              une ligne entière pour une information déjà évidente. */}
          <span className="hidden sm:block text-xs text-textSecondary mb-1">المؤلف</span>
          <h4 className="text-xs sm:text-sm font-semibold text-textPrimary line-clamp-1">
            {author || 'مؤلف غير معروف'}
          </h4>
        </div>

        {/* Reading progress */}
        <div className="pt-1 sm:pt-2">
          <ProgressBar progress={progress} showLabel={true} size="sm" />
        </div>

        {/* Action Button */}
        <button
          onClick={() => onStartRead(book.id)}
          className={`w-full py-2 sm:py-2.5 px-2 sm:px-4 rounded-custom text-[11px] sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all duration-200 ${
            isStarted
              ? 'bg-primary text-white hover:bg-primary/90 shadow-sm shadow-primary/20'
              : 'bg-primary-light text-primary hover:bg-primary hover:text-white border border-primary/20'
          }`}
        >
          {isStarted ? (
            <>
              <span className="truncate">أكمل القراءة</span>
              <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </>
          ) : (
            <>
              <span className="truncate">ابدأ القراءة</span>
              <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current shrink-0" />
            </>
          )}
        </button>
      </div>

    </div>
  )
}
