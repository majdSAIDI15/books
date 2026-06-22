import React from 'react'
import { Book, Play, ArrowLeft } from 'lucide-react'
import { ProgressBar } from './ProgressBar'

export const BookCard = ({ book, progress = 0, onStartRead }) => {
  const { title, author, category, cover_color } = book

  const isStarted = progress > 0

  return (
    <div className="bg-white border border-cardBorder rounded-custom shadow-sm overflow-hidden flex flex-col justify-between hover:shadow-md hover:border-primary/30 transition-all duration-300 group">
      
      {/* Premium Book Cover Mockup */}
      <div 
        className="h-44 relative flex items-center justify-center p-6 select-none transition-transform duration-300"
        style={{ backgroundColor: cover_color || '#EEEDFE' }}
      >
        {/* Subtle spine gradient for 3D book effect */}
        <div className="absolute top-0 right-0 bottom-0 w-3 bg-black/10 shadow-[inset_-1px_0_2px_rgba(0,0,0,0.1)]"></div>
        <div className="absolute top-0 right-3 bottom-0 w-1 bg-white/10"></div>

        {/* Content on the cover */}
        <div className="text-center flex flex-col items-center max-w-full">
          <div className="bg-white/20 p-2.5 rounded-full mb-3 backdrop-blur-sm border border-white/30 text-textPrimary">
            <Book className="w-8 h-8 text-primary" />
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 bg-black/15 text-textPrimary rounded-full mb-2 uppercase tracking-wide backdrop-blur-sm">
            {category || 'عام'}
          </span>
          <h3 className="text-base font-bold text-textPrimary leading-tight line-clamp-2 px-2 text-center drop-shadow-sm">
            {title}
          </h3>
        </div>
      </div>

      {/* Book details & Progress */}
      <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
        <div>
          <span className="text-xs text-textSecondary block mb-1">المؤلف</span>
          <h4 className="text-sm font-semibold text-textPrimary line-clamp-1">{author || 'مؤلف غير معروف'}</h4>
        </div>

        {/* Reading progress */}
        <div className="pt-2">
          <ProgressBar progress={progress} showLabel={true} size="sm" />
        </div>

        {/* Action Button */}
        <button
          onClick={() => onStartRead(book.id)}
          className={`w-full py-2.5 px-4 rounded-custom text-sm font-semibold flex items-center justify-center space-x-2 space-x-reverse transition-all duration-200 ${
            isStarted 
              ? 'bg-primary text-white hover:bg-primary/90 shadow-sm shadow-primary/20' 
              : 'bg-primary-light text-primary hover:bg-primary hover:text-white border border-primary/20'
          }`}
        >
          {isStarted ? (
            <>
              <span>أكمل القراءة</span>
              <ArrowLeft className="w-4 h-4" />
            </>
          ) : (
            <>
              <span>ابدأ القراءة</span>
              <Play className="w-4 h-4 fill-current" />
            </>
          )}
        </button>
      </div>

    </div>
  )
}
