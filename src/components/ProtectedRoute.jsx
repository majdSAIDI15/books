import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, profile, loading } = useAuth()

  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) window.location.reload()
    }, 3000)
    return () => clearTimeout(timer)
  }, [loading])

  if (loading) {
    return (
      <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4">
        <div className="flex flex-col items-center space-y-4">
          {/* Animated Spinner with primary theme purple */}
          <div className="w-16 h-16 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
          <p className="text-textPrimary text-lg font-medium animate-pulse">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requiredRole && profile?.role !== requiredRole) {
    // If authenticated user is trying to access wrong role page
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
