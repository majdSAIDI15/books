import { useState } from 'react'
import { Download, X, Share } from 'lucide-react'
import { useInstallPrompt } from '../lib/useInstallPrompt'

const DISMISSED_KEY = 'installPromptDismissed'

/**
 * Invite à installer l'application sur l'écran d'accueil.
 *
 * Popup ponctuelle et masquable (mémorisée dans localStorage) : une fois fermée,
 * elle ne réapparaît plus. Le point d'entrée PERMANENT vit ailleurs
 * (voir components/InstallButton.jsx) ; les deux partagent le même état via
 * `useInstallPrompt`.
 *
 * Deux chemins, car les plateformes diffèrent radicalement :
 *   - Android / Chrome / Edge : `beforeinstallprompt` permet de déclencher la
 *     boîte de dialogue native depuis un bouton.
 *   - iOS / Safari : aucune API équivalente. L'installation passe obligatoirement
 *     par « Partager → Sur l'écran d'accueil », donc on explique le geste.
 */
export const InstallPrompt = () => {
  const { ios, canInstall, promptInstall } = useInstallPrompt()
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISSED_KEY) === '1'
  )

  const close = () => {
    setDismissed(true)
    setShowIOSHelp(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (dismissed || !canInstall) return null

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-80 z-[60] bg-white border border-cardBorder rounded-custom shadow-2xl p-4 font-arabic text-right"
      style={{ direction: 'rtl', marginBottom: 'env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-label="تثبيت التطبيق"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="bg-primary-light p-2 rounded-custom shrink-0">
            <Download className="w-4 h-4 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-textPrimary">ثبّت التطبيق على هاتفك</h3>
        </div>
        <button
          onClick={close}
          aria-label="إغلاق"
          className="p-1 text-textSecondary hover:text-textPrimary rounded transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {ios ? (
        showIOSHelp ? (
          <ol className="text-xs text-textSecondary leading-relaxed space-y-2 mt-3">
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary shrink-0">١.</span>
              <span className="flex items-center gap-1 flex-wrap">
                اضغط على زر المشاركة
                <Share className="w-3.5 h-3.5 inline text-primary" />
                في شريط Safari بالأسفل
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary shrink-0">٢.</span>
              <span>اختر «إضافة إلى الشاشة الرئيسية»</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary shrink-0">٣.</span>
              <span>اضغط «إضافة» في الأعلى</span>
            </li>
          </ol>
        ) : (
          <>
            <p className="text-xs text-textSecondary leading-relaxed mb-3">
              افتح الكتب بسرعة من شاشتك الرئيسية، بدون شريط عنوان.
            </p>
            <button
              onClick={() => setShowIOSHelp(true)}
              className="w-full py-2 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors"
            >
              كيف أثبّته؟
            </button>
          </>
        )
      ) : (
        <>
          <p className="text-xs text-textSecondary leading-relaxed mb-3">
            افتح الكتب بسرعة من شاشتك الرئيسية، بدون شريط عنوان.
          </p>
          <button
            onClick={promptInstall}
            className="w-full py-2 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors"
          >
            تثبيت الآن
          </button>
        </>
      )}
    </div>
  )
}
