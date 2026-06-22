import React from 'react'
import { LogOut, Bell, BookOpen } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export const Navbar = ({ title, showNotificationBell = false, onBellClick = null, hasUnreadNotification = false }) => {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const getInitials = (name) => {
    if (!name) return 'م'
    return name.trim().split(' ').map(n => n[0]).join('').slice(0, 2)
  }

  return (
    <nav className="sticky top-0 z-40 bg-white border-b border-cardBorder shadow-sm px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        
        {/* Right side: Logo & Title */}
        <div className="flex items-center space-x-3 space-x-reverse">
          <div className="bg-primary-light p-2 rounded-custom">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-textPrimary leading-tight">{title || 'متابع القراءة'}</h1>
            {profile?.role === 'admin' && (
              <span className="inline-block bg-primary text-white text-[10px] px-2 py-0.5 rounded-full mt-0.5">
                مدير النظام
              </span>
            )}
          </div>
        </div>

        {/* Left side: Navigation / Actions */}
        <div className="flex items-center space-x-4 space-x-reverse">
          
          {/* Notification Bell (Member only) */}
          {showNotificationBell && (
            <button 
              onClick={onBellClick}
              className="relative p-2 text-textSecondary hover:text-primary hover:bg-primary-light rounded-custom transition-all duration-200"
              title="تنبيهات القراءة"
            >
              <Bell className="w-5 h-5" />
              {hasUnreadNotification && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-danger rounded-full ring-2 ring-white"></span>
              )}
            </button>
          )}

          {/* User Avatar */}
          {profile && (
            <div className="flex items-center space-x-3 space-x-reverse border-r border-cardBorder pr-4">
              <div className="hidden sm:flex flex-col text-right">
                <span className="text-sm font-semibold text-textPrimary">{profile.name || profile.email}</span>
                <span className="text-xs text-textSecondary">{profile.role === 'admin' ? 'مسؤول' : 'قارئ'}</span>
              </div>
              <div 
                className="w-10 h-10 rounded-custom bg-primary text-white flex items-center justify-center font-bold text-sm shadow-sm"
                title={profile.name || profile.email}
              >
                {getInitials(profile.name)}
              </div>
            </div>
          )}

          {/* Logout Button */}
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 space-x-reverse p-2 text-textSecondary hover:text-danger hover:bg-red-50 rounded-custom transition-all duration-200"
            title="تسجيل الخروج"
          >
            {/* Flip LogOut icon for RTL using scale-x-[-1] */}
            <LogOut className="w-5 h-5 transform scale-x-[-1]" />
            <span className="hidden sm:inline text-sm font-medium">خروج</span>
          </button>

        </div>
      </div>
    </nav>
  )
}
