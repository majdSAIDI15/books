import React from 'react'
import { ProgressBar } from './ProgressBar'
import { CheckCircle2, XCircle, BookOpen, Flame } from 'lucide-react'

const getLocalDateStr = (offsetDays = 0) => {
  const d = new Date()
  d.setDate(d.getDate() - offsetDays)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60000)
  return local.toISOString().split('T')[0]
}

const getLastReadInfo = (logs) => {
  const readLogs = (logs || []).filter(l => l.pages_read > 0)
  if (readLogs.length === 0) {
    return { lastDate: null, daysSince: Infinity }
  }
  const lastLog = readLogs[readLogs.length - 1]
  const lastDateStr = lastLog.date
  
  const today = new Date(getLocalDateStr(0))
  const lastReadDate = new Date(lastDateStr)
  const diffTime = today - lastReadDate
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  return { lastDate: lastDateStr, daysSince: diffDays }
}

const getFlameIndicator = (logs, readToday) => {
  if (readToday) {
    return { colorClass: 'text-success fill-success', tooltip: 'قرأ اليوم' }
  }
  const { daysSince } = getLastReadInfo(logs)
  if (daysSince === 1) {
    return { colorClass: 'text-orange-500 fill-orange-500', tooltip: 'فات يوم واحد' }
  }
  return { colorClass: 'text-danger fill-danger', tooltip: 'لم يقرأ منذ يومين أو أكثر' }
}

export const MemberRow = ({ member }) => {
  const { name, email, current_book_title, last_page, total_pages, read_today } = member

  // Calculate percentage progress safely
  const progressPercent = total_pages > 0 ? Math.min(100, (last_page / total_pages) * 100) : 0


  const getInitials = (name) => {
    if (!name) return 'م'
    return name.trim().split(' ').map(n => n[0]).join('').slice(0, 2)
  }

  return (
    <tr className="hover:bg-[#F8F7F4]/50 border-b border-cardBorder transition-colors duration-150">
      
      {/* Avatar + Name */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="w-10 h-10 rounded-custom bg-primary-light text-primary flex items-center justify-center font-bold text-sm shadow-sm border border-primary/10">
            {getInitials(name)}
          </div>
          <div className="text-right">
            <div className="flex items-center space-x-1.5 space-x-reverse justify-start">
              <div className="text-sm font-semibold text-textPrimary">{name || 'قارئ مجهول'}</div>
              {(() => {
                const { colorClass, tooltip } = getFlameIndicator(member.logs, read_today)
                return <Flame className={`w-4 h-4 ${colorClass}`} title={tooltip} />
              })()}
            </div>
            <div className="text-xs text-textSecondary">{email}</div>
          </div>
        </div>
      </td>

      {/* Current Book */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-right max-w-xs truncate">
          {current_book_title ? (
            <div className="flex items-center space-x-2 space-x-reverse text-sm text-textPrimary font-medium">
              <BookOpen className="w-4 h-4 text-primary shrink-0" />
              <span className="truncate">{current_book_title}</span>
            </div>
          ) : (
            <span className="text-xs text-textSecondary italic">لم يبدأ أي كتاب بعد</span>
          )}
        </div>
      </td>

      {/* Progress Bar + % */}
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="w-48 text-right">
          {current_book_title ? (
            <div>
              <ProgressBar progress={progressPercent} showLabel={false} size="sm" />
              <div className="flex justify-between items-center text-[10px] text-textSecondary mt-1 font-semibold">
                <span>{last_page} من {total_pages} صفحة</span>
                <span>{Math.round(progressPercent)}%</span>
              </div>
            </div>
          ) : (
            <span className="text-xs text-textSecondary">-</span>
          )}
        </div>
      </td>

      {/* Read Today Status Badge */}
      <td className="px-6 py-4 whitespace-nowrap text-right">
        {read_today ? (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-success border border-success/20">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>قرأ اليوم</span>
          </span>
        ) : (
          <span className="inline-flex items-center space-x-1.5 space-x-reverse px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-danger border border-danger/20">
            <XCircle className="w-3.5 h-3.5" />
            <span>لم يقرأ</span>
          </span>
        )}
      </td>

    </tr>
  )
}
