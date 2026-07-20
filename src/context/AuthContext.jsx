/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({
  user: null,
  profile: null,
  loading: true,
  signOut: () => Promise.resolve(),
  refreshProfile: () => Promise.resolve(),
  setUser: () => {},
  setProfile: () => {},
  setLoading: () => {},
})

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Identifiant du profil déjà chargé : évite de le recharger sur les
  // événements d'authentification qui ne changent pas d'utilisateur (§3.5).
  const loadedProfileIdRef = useRef(null)

  const fetchProfile = async (userId) => {
    try {
      // `maybeSingle` et non `single` : juste après une inscription, la ligne
      // `profiles` est créée par un trigger, de façon asynchrone. `single`
      // remontait une erreur PGRST116 quand la ligne n'existait pas encore, et
      // l'utilisateur atterrissait sur /unauthorized (§2.5). Ici l'absence de
      // profil est un état légitime, distinct d'une erreur.
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Error fetching profile:', error.message)
        return null
      }
      return data
    } catch (err) {
      console.error('Unexpected error fetching profile:', err)
      return null
    }
  }

  const refreshProfile = async () => {
    if (!user) return
    const prof = await fetchProfile(user.id)
    if (prof) {
      setProfile(prof)
      loadedProfileIdRef.current = user.id
    }
  }

  useEffect(() => {
    let mounted = true

    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error

        if (session?.user) {
          if (mounted) setUser(session.user)
          const userProfile = await fetchProfile(session.user.id)
          if (mounted) {
            setProfile(userProfile)
            loadedProfileIdRef.current = session.user.id
            setLoading(false)
          }
        } else {
          if (mounted) {
            setUser(null)
            setProfile(null)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error('Auth initialization error:', err.message)
        if (mounted) setLoading(false)
      }
    }

    initializeAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Le garde `mounted` manquait ici : seul `initializeAuth` l'appliquait,
      // d'où des setState après démontage (§4.11).
      if (!mounted) return

      // Le rafraîchissement de jeton (toutes les heures) et le SIGNED_IN émis
      // au retour de focus sur l'onglet rechargeaient le profil et en
      // remplaçaient la référence, re-rendant tout l'arbre — ce qui pouvait
      // relancer le téléchargement du PDF en pleine lecture (§3.5).
      if (event === 'TOKEN_REFRESHED') return

      if (session?.user) {
        setUser(session.user)
        if (loadedProfileIdRef.current === session.user.id) {
          setLoading(false)
          return
        }
        const userProfile = await fetchProfile(session.user.id)
        if (!mounted) return
        setProfile(userProfile)
        loadedProfileIdRef.current = session.user.id
      } else {
        setUser(null)
        setProfile(null)
        loadedProfileIdRef.current = null
      }
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    setLoading(true)
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Error signing out:', err.message)
    } finally {
      setUser(null)
      setProfile(null)
      setLoading(false)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile, setUser, setProfile, setLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
