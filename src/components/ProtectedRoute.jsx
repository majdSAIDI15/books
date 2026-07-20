import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { AlertTriangle } from 'lucide-react'

const Centered = ({ children }) => (
  <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4 text-center font-arabic">
    {children}
  </div>
)

export const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, profile, loading, signOut, refreshProfile } = useAuth()
  const [stalled, setStalled] = useState(false)
  const [retrying, setRetrying] = useState(false)

  // L'ancien garde-fou rechargeait la page au bout de 3 s si `loading` n'était
  // pas résolu. Quand l'initialisation échouait durablement (réseau, Supabase
  // indisponible, session corrompue), chaque rechargement relançait le même
  // minuteur : boucle infinie, application inutilisable, quota API consommé à
  // chaque tour (§2.4). On affiche désormais un écran de récupération.
  useEffect(() => {
    if (!loading) return undefined
    const timer = setTimeout(() => setStalled(true), 5000)
    // Réinitialisation au nettoyage plutôt que dans le corps de l'effet : un
    // setState synchrone ici provoquerait un rendu en cascade.
    return () => {
      clearTimeout(timer)
      setStalled(false)
    }
  }, [loading])

  if (loading && stalled) {
    return (
      <Centered>
        <div className="bg-white border border-cardBorder rounded-custom p-8 shadow-sm max-w-md w-full">
          <AlertTriangle className="w-14 h-14 text-warning mx-auto mb-4" />
          <h2 className="text-lg font-bold text-textPrimary mb-2">تعذر تحميل بياناتك</h2>
          <p className="text-sm text-textSecondary mb-6 font-medium leading-relaxed">
            يبدو أن الاتصال بطيء أو منقطع. يمكنك إعادة المحاولة أو تسجيل الخروج والدخول من جديد.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 transition-colors"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={signOut}
              className="w-full py-2.5 bg-primary-light text-primary font-bold rounded-custom hover:bg-primary hover:text-white transition-colors"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </Centered>
    )
  }

  if (loading) {
    return (
      <Centered>
        <div className="flex flex-col items-center space-y-4">
          {/* Animated Spinner with primary theme purple */}
          <div className="w-16 h-16 border-4 border-primary-light border-t-primary rounded-full animate-spin"></div>
          <p className="text-textPrimary text-lg font-medium animate-pulse">جاري التحميل...</p>
        </div>
      </Centered>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Utilisateur authentifié mais sans ligne `profiles` : c'est le cas juste
  // après une inscription, le temps que le trigger crée la ligne. L'ancien code
  // comparait `undefined !== 'member'` et renvoyait vers /unauthorized, ce qui
  // faisait échouer tout parcours d'inscription (§2.5).
  if (!profile) {
    return (
      <Centered>
        <div className="bg-white border border-cardBorder rounded-custom p-8 shadow-sm max-w-md w-full">
          <div className="w-14 h-14 border-4 border-primary-light border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <h2 className="text-lg font-bold text-textPrimary mb-2">جاري تجهيز حسابك</h2>
          <p className="text-sm text-textSecondary mb-6 font-medium leading-relaxed">
            لم يكتمل إعداد ملفك الشخصي بعد. قد يستغرق ذلك لحظات قليلة بعد إنشاء الحساب.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={async () => {
                setRetrying(true)
                await refreshProfile()
                setRetrying(false)
              }}
              disabled={retrying}
              className="w-full py-2.5 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {retrying ? 'جاري التحقق...' : 'تحديث'}
            </button>
            <button
              onClick={signOut}
              className="w-full py-2.5 bg-primary-light text-primary font-bold rounded-custom hover:bg-primary hover:text-white transition-colors"
            >
              تسجيل الخروج
            </button>
          </div>
        </div>
      </Centered>
    )
  }

  if (requiredRole && profile.role !== requiredRole) {
    // If authenticated user is trying to access wrong role page
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
