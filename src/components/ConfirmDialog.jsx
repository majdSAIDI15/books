import { AlertTriangle, X } from 'lucide-react'

/**
 * Remplace `window.confirm` (§4.5). Les dialogues natifs bloquent le fil
 * principal, ne sont pas stylables, s'affichent en anglais selon le navigateur
 * et jurent avec une interface arabe.
 *
 * Piloté par un état `{ title, message, confirmLabel, danger, onConfirm }` :
 * `null` ferme le dialogue.
 */
export const ConfirmDialog = ({ request, onClose }) => {
  if (!request) return null

  const { title, message, confirmLabel = 'تأكيد', danger = false, onConfirm } = request

  return (
    <>
      <div
        className="fixed inset-0 bg-[#2C2C2A]/40 z-50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-sm bg-white border border-cardBorder rounded-custom shadow-2xl p-6 font-arabic text-right"
        style={{ direction: 'rtl' }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {danger && <AlertTriangle className="w-5 h-5 text-danger shrink-0" />}
            <h3 id="confirm-title" className="text-base font-bold text-textPrimary">{title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="p-1 text-textSecondary hover:text-textPrimary rounded transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-textSecondary leading-relaxed mb-6">{message}</p>

        <div className="flex gap-2">
          <button
            onClick={() => { onConfirm(); onClose() }}
            className={`flex-1 py-2.5 text-white text-sm font-bold rounded-custom transition-colors ${
              danger ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-cardBorder text-textSecondary text-sm font-bold rounded-custom hover:bg-bgMain transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </>
  )
}
