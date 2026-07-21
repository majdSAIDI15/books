import { useState } from 'react'
import { Download, Share, CheckCircle2 } from 'lucide-react'
import { useInstallPrompt } from '../lib/useInstallPrompt'

/**
 * Point d'entrée PERMANENT pour installer l'application, à placer dans une page
 * (ici le tableau de bord membre). Contrairement à la popup `InstallPrompt`, il
 * ne se masque pas : tant que l'installation est possible, il reste disponible —
 * utile si le membre a fermé la popup et veut installer plus tard.
 *
 * Partage l'état d'installation avec la popup via `useInstallPrompt`, donc capte
 * le même `beforeinstallprompt` même s'il est monté tardivement.
 */
export const InstallButton = () => {
  const { installed, ios, canInstall, promptInstall } = useInstallPrompt()
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  // Déjà installée : on le confirme plutôt que de laisser un bouton inerte.
  if (installed) {
    return (
      <div className="bg-white border border-cardBorder rounded-custom shadow-sm mt-4 p-5 text-right font-arabic">
        <div className="flex items-center gap-2 text-success">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-bold">التطبيق مثبّت على جهازك ✓</span>
        </div>
      </div>
    )
  }

  // Navigateur/plateforme sans voie d'installation proposable : on n'affiche rien
  // plutôt qu'un bouton qui ne ferait rien.
  if (!canInstall) return null

  return (
    <div className="bg-white border border-cardBorder rounded-custom shadow-sm mt-4 p-5 text-right font-arabic">
      <div className="flex items-center gap-2 mb-1">
        <div className="bg-primary-light p-2 rounded-custom shrink-0">
          <Download className="w-4 h-4 text-primary" />
        </div>
        <h4 className="text-sm font-bold text-textPrimary">تثبيت التطبيق</h4>
      </div>
      <p className="text-xs text-textSecondary leading-relaxed mb-3">
        ثبّت التطبيق على جهازك لفتح الكتب بسرعة من الشاشة الرئيسية، بدون شريط عنوان.
      </p>

      {ios ? (
        showIOSHelp ? (
          <ol className="text-xs text-textSecondary leading-relaxed space-y-2">
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
          <button
            onClick={() => setShowIOSHelp(true)}
            className="w-full py-2 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors"
          >
            كيف أثبّته؟
          </button>
        )
      ) : (
        <button
          onClick={promptInstall}
          className="w-full py-2 bg-primary text-white text-xs font-bold rounded-custom hover:bg-primary/90 transition-colors flex items-center justify-center gap-1.5"
        >
          <Download className="w-4 h-4" />
          <span>تثبيت الآن</span>
        </button>
      )}
    </div>
  )
}
