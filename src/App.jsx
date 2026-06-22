import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { AdminDashboard } from './pages/AdminDashboard'
import { MemberDashboard } from './pages/MemberDashboard'
import { PDFReader } from './pages/PDFReader'
import { AlertCircle } from 'lucide-react'

// Simple styled Unauthorized page
const Unauthorized = () => {
  return (
    <div className="min-h-screen bg-[#F8F7F4] flex flex-col justify-center items-center p-4 text-center font-arabic">
      <div className="bg-white border border-[#E0DED6] rounded-[10px] p-8 shadow-sm max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-[#E24B4A] mx-auto mb-4" />
        <h2 className="text-lg font-bold text-[#2C2C2A] mb-2">غير مصرح بالدخول</h2>
        <p className="text-sm text-[#888780] mb-6">ليست لديك الصلاحيات الكافية للوصول إلى هذه الصفحة.</p>
        <button
          onClick={() => window.location.href = '/login'}
          className="w-full py-2.5 bg-[#534AB7] text-white font-bold rounded-[10px] hover:bg-[#534AB7]/90 transition-colors"
        >
          العودة لتسجيل الدخول
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Login Route */}
          <Route path="/login" element={<Login />} />

          {/* Admin Protected Routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Member Protected Routes */}
          <Route
            path="/member"
            element={
              <ProtectedRoute requiredRole="member">
                <MemberDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/member/read/:bookId"
            element={
              <ProtectedRoute requiredRole="member">
                <PDFReader />
              </ProtectedRoute>
            }
          />

          {/* Unauthorized route */}
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Catch-all redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App

