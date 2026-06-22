import React from 'react'

export const ProgressBar = ({ progress, showLabel = true, size = 'md' }) => {
  // Ensure progress is between 0 and 100
  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress || 0)))

  // Define sizes
  const heightClass = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  }[size] || 'h-2.5'

  // Dynamic progress color: Success green when complete, Primary purple when in progress
  const barColorClass = normalizedProgress === 100 ? 'bg-success' : 'bg-primary'

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between items-center mb-1 text-xs font-semibold">
          <span className="text-textSecondary">التقدم</span>
          <span className={normalizedProgress === 100 ? 'text-success' : 'text-primary'}>
            {normalizedProgress}%
          </span>
        </div>
      )}
      <div className={`w-full bg-primary-light rounded-full overflow-hidden ${heightClass} border border-primary-light/50`}>
        <div
          className={`h-full ${barColorClass} rounded-full transition-all duration-500 ease-out`}
          style={{ width: `${normalizedProgress}%` }}
        ></div>
      </div>
    </div>
  )
}
