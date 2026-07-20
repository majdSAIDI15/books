import { useState } from 'react'
import { supabase, supabaseAdmin } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { KeyRound, Trash2, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { authErrorMessage } from '../lib/authErrors'

const MIN_PASSWORD_LENGTH = 6

/**
 * Gestion de compte par le membre lui-même : changement de mot de passe et
 * suppression du compte. Jusqu'ici ces deux actions n'existaient que dans le
 * tableau de bord admin.
 *
 * Le changement de mot de passe passe par `supabase.auth.updateUser`, qui agit
 * sur la session courante et ne demande aucun privilège particulier.
 *
 * La suppression est différente : l'API navigateur ne permet pas à un
 * utilisateur d'effacer son propre compte d'authentification. Elle exige
 * `auth.admin.deleteUser`, donc `supabaseAdmin`. Quand la clé service n'est pas
 * configurée, on désactive le bouton et on l'explique, plutôt que d'échouer en
 * silence.
 */
export const AccountSettings = () => {
  const { user, signOut } = useAuth()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const canDelete = Boolean(supabaseAdmin)
  const CONFIRM_WORD = 'حذف'

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`يجب أن تتكون كلمة المرور من ${MIN_PASSWORD_LENGTH} أحرف على الأقل.`)
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('كلمتا المرور غير متطابقتين.')
      return
    }

    setPasswordBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPasswordSuccess('تم تغيير كلمة المرور بنجاح ✓')
      setPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(authErrorMessage(err))
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (deleteInput.trim() !== CONFIRM_WORD) {
      setDeleteError(`اكتب كلمة "${CONFIRM_WORD}" للتأكيد.`)
      return
    }

    setDeleteBusy(true)
    try {
      // Les données liées (sessions, journaux, annotations, notes) partent avec
      // le compte : les clés étrangères sont déclarées `on delete cascade`.
      const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id)
      if (error) throw error
      await signOut()
      window.location.href = '/login'
    } catch (err) {
      setDeleteError(authErrorMessage(err, 'تعذر حذف الحساب. يرجى المحاولة لاحقاً.'))
      setDeleteBusy(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Changement de mot de passe */}
      <form onSubmit={handleChangePassword} className="space-y-3">
        <h4 className="text-sm font-bold text-textPrimary flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-primary" />
          <span>تغيير كلمة المرور</span>
        </h4>

        {passwordError && (
          <div role="alert" className="bg-red-50 text-danger text-xs font-semibold px-3 py-2 rounded-custom border border-danger/20">
            {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div role="status" className="bg-green-50 text-success text-xs font-semibold px-3 py-2 rounded-custom border border-success/20 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{passwordSuccess}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="new-password" className="text-xs font-bold text-textPrimary block mb-1">
              كلمة المرور الجديدة
            </label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-right"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="text-xs font-bold text-textPrimary block mb-1">
              تأكيد كلمة المرور
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 bg-white border border-cardBorder rounded-custom text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all text-right"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={passwordBusy || !password || !confirmPassword}
          className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {passwordBusy ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
        </button>
      </form>

      <hr className="border-cardBorder/60" />

      {/* Suppression du compte */}
      <div className="space-y-3">
        <h4 className="text-sm font-bold text-danger flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>حذف الحساب</span>
        </h4>
        <p className="text-xs text-textSecondary leading-relaxed">
          سيؤدي حذف حسابك إلى إزالة تقدمك في القراءة وملاحظاتك وتظليلاتك نهائياً. لا يمكن التراجع عن هذا الإجراء.
        </p>

        {!canDelete && (
          <p className="text-xs text-warning bg-warning/10 border border-warning/20 rounded-custom px-3 py-2 leading-relaxed">
            حذف الحساب غير متاح حالياً في هذا الإعداد. يرجى التواصل مع المشرف لحذف حسابك.
          </p>
        )}

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!canDelete}
            className="flex items-center gap-2 px-4 py-2 bg-danger/10 text-danger text-xs font-bold rounded-custom hover:bg-danger hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-danger/10 disabled:hover:text-danger"
          >
            <Trash2 className="w-4 h-4" />
            <span>حذف حسابي نهائياً</span>
          </button>
        ) : (
          <div className="border border-danger/30 bg-red-50/50 rounded-custom p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-textPrimary leading-relaxed">
                للتأكيد، اكتب كلمة <span className="font-bold text-danger">{CONFIRM_WORD}</span> في الحقل أدناه.
              </p>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); setDeleteError('') }}
                aria-label="إلغاء"
                className="p-1 text-textSecondary hover:text-textPrimary rounded transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {deleteError && (
              <div role="alert" className="bg-red-50 text-danger text-xs font-semibold px-3 py-2 rounded-custom border border-danger/20">
                {deleteError}
              </div>
            )}

            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={CONFIRM_WORD}
              aria-label="تأكيد الحذف"
              className="w-full px-3 py-2 bg-white border border-danger/30 rounded-custom text-sm focus:outline-none focus:border-danger focus:ring-2 focus:ring-danger/10 transition-all text-right"
            />

            <button
              onClick={handleDeleteAccount}
              disabled={deleteBusy}
              className="w-full py-2 bg-danger text-white text-xs font-bold rounded-custom hover:bg-danger/90 transition-colors disabled:opacity-50"
            >
              {deleteBusy ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
