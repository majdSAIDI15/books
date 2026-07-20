import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Login } from './pages/Login'
import { AlertCircle } from 'lucide-react'

// Découpage par route : un membre ne télécharge plus le tableau de bord admin
// ni recharts, et l'écran de login n'embarque plus react-pdf. Login reste en
// import statique : c'est la première page affichée.
const AdminDashboard = lazy(() =>
  import('./pages/AdminDashboard').then(m => ({ default: m.AdminDashboard }))
)
const MemberDashboard = lazy(() =>
  import('./pages/MemberDashboard').then(m => ({ default: m.MemberDashboard }))
)
const PDFReader = lazy(() =>
  import('./pages/PDFReader').then(m => ({ default: m.PDFReader }))
)

const RouteFallback = () => (
  <div className="min-h-screen bg-bgMain flex justify-center items-center">
    <div className="w-12 h-12 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
  </div>
)

// Simple styled Unauthorized page
const Unauthorized = () => {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4 text-center font-arabic">
      <div className="bg-white border border-cardBorder rounded-custom p-8 shadow-sm max-w-md w-full">
        <AlertCircle className="w-16 h-16 text-danger mx-auto mb-4" />
        <h2 className="text-lg font-bold text-textPrimary mb-2">غير مصرح بالدخول</h2>
        <p className="text-sm text-textSecondary mb-6">ليست لديك الصلاحيات الكافية للوصول إلى هذه الصفحة.</p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="w-full py-2.5 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 transition-colors"
        >
          العودة لتسجيل الدخول
        </button>
      </div>
    </div>
  )
}

function App() {
  return (
    // Le routeur enveloppe le provider : AuthContext peut ainsi utiliser
    // useNavigate (redirection centralisée sur expiration de session).
    <BrowserRouter>
      <AuthProvider>
        <ErrorBoundary>
          <Suspense fallback={<RouteFallback />}>
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
          </Suspense>
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
