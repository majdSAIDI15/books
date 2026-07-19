import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BookOpen, Mail, Lock, User, AlertCircle, ArrowLeft } from 'lucide-react'

export const Login = () => {
  const { user, profile, loading, setUser, setProfile, setLoading } = useAuth()
  const navigate = useNavigate()

  const [isRegister, setIsRegister] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user && profile) {
      if (profile.role === 'admin') {
        navigate('/admin')
      } else {
        navigate('/member')
      }
    }
  }, [user, profile, loading, navigate])

  const handleAuth = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    setAuthLoading(true)

    try {
      if (isRegister) {
        // Sign Up flow
        if (!name.trim()) {
          throw new Error('يرجى إدخال الاسم')
        }
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              name: name.trim()
            }
          }
        })

        if (error) throw error

        if (data?.user) {
          // New user defaults to 'member', redirect to member dashboard
          navigate('/member')
        }
      } else {
        // Sign In flow
        setLoading(true)
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password
        })

        if (error) {
          let msg = error.message
          if (msg === 'Invalid login credentials') {
            msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
          } else if (msg.includes('rate limit')) {
            msg = 'لقد قمت بمحاولات كثيرة جداً. يرجى المحاولة لاحقاً.'
          }
          setErrorMessage(msg)
          setLoading(false)
          return
        }

        if (data?.user) {
          setUser(data.user)

          // Immediately fetch profile and redirect
          const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single()

          if (profileError) {
            setErrorMessage(profileError.message)
            setLoading(false)
            return
          }

          setProfile(profileData)
          navigate(profileData?.role === 'admin' ? '/admin' : '/member')
          setLoading(false)
        }
      }
    } catch (err) {
      console.error(err)
      // Arabic translated error messages
      let msg = err.message
      if (msg === 'Invalid login credentials') {
        msg = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.'
      } else if (msg === 'User already registered') {
        msg = 'هذا البريد الإلكتروني مسجل بالفعل.'
      } else if (msg === 'Password should be at least 6 characters') {
        msg = 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.'
      } else if (msg === 'Email address already registered') {
        msg = 'البريد الإلكتروني مسجل بالفعل.'
      } else if (msg.includes('rate limit')) {
        msg = 'لقد قمت بمحاولات كثيرة جداً. يرجى المحاولة لاحقاً.'
      }
      setErrorMessage(msg)
      setLoading(false)
    } finally {
      setAuthLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4 relative overflow-hidden">
      
      {/* Decorative ambient background blur lights */}
      <div className="absolute top-[-20%] left-[-10%] w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-96 h-96 bg-primary-light/40 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-md w-full z-10">
        
        {/* App Logo & Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-primary p-4 rounded-custom shadow-md shadow-primary/20 mb-4 animate-bounce">
            <BookOpen className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-textPrimary text-center">متابع القراءة</h1>
          <p className="text-textSecondary text-sm mt-1 text-center font-medium">سجل وتتبع تقدمك اليومي في القراءة بكل سهولة</p>
        </div>

        {/* Auth Box with glassmorphism */}
        <div className="glass-panel rounded-custom shadow-xl p-8 border border-cardBorder/60">
          
          <h2 className="text-xl font-bold text-textPrimary mb-6 border-b border-cardBorder pb-2 text-right">
            {isRegister ? 'إنشاء حساب جديد' : 'تسجيل الدخول'}
          </h2>

          {errorMessage && (
            <div className="mb-4 bg-red-50 text-danger text-xs font-semibold px-4 py-3 rounded-custom border border-danger/20 flex items-center space-x-2 space-x-reverse text-right">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4 text-right">
            
            {isRegister && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-textPrimary block mb-1">الاسم الكامل</label>
                <div className="relative">
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-textSecondary">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="مثال: أحمد علي"
                    className="w-full pr-10 pl-4 py-2.5 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-right"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-textPrimary block mb-1">البريد الإلكتروني</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-textSecondary">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pr-10 pl-4 py-2.5 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-right"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-textPrimary block mb-1">كلمة المرور</label>
              <div className="relative">
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-textSecondary">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10 pl-4 py-2.5 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-right"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-4 py-3 bg-primary hover:bg-primary/95 text-white font-bold rounded-custom transition-all duration-200 shadow-md shadow-primary/20 flex items-center justify-center space-x-2 space-x-reverse disabled:opacity-50"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>{isRegister ? 'إنشاء حساب جديد' : 'دخول'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Form Toggle */}
          <div className="mt-6 text-center border-t border-cardBorder pt-4">
            <button
              onClick={() => {
                setIsRegister(!isRegister)
                setErrorMessage('')
              }}
              className="text-sm font-semibold text-primary hover:underline hover:text-primary/80 transition-colors"
            >
              {isRegister 
                ? 'لديك حساب بالفعل؟ تسجيل الدخول' 
                : 'ليس لديك حساب؟ إنشاء حساب جديد'}
            </button>
          </div>

        </div>

      </div>
    </div>
  )
}
