// Envoi d'un rappel de lecture par EMAIL (gratuit via Brevo).
//
// Appelée par le tableau de bord admin (POST /api/send-reminder). La clé API
// Brevo reste ici, côté serveur — jamais dans le bundle navigateur, contrairement
// aux variables VITE_*.
//
// Sécurité : l'appelant doit être connecté ET avoir le rôle « admin ». On le
// vérifie avec SON jeton Supabase (lecture de son propre profil, autorisée par la
// RLS) — donc aucune clé de service n'est nécessaire.
//
// Variables d'environnement Netlify requises (NON préfixées VITE_) :
//   BREVO_API_KEY        clé API Brevo (Settings → SMTP & API → API Keys)
//   SUPABASE_URL         https://xxxx.supabase.co
//   SUPABASE_ANON_KEY    clé anon Supabase (publique)
//   REMINDER_FROM_EMAIL  expéditeur validé dans Brevo (Senders)
//   REMINDER_FROM_NAME   (optionnel) nom affiché de l'expéditeur
//   APP_URL              (optionnel) lien mis dans l'email, ex. https://majaliss-books.netlify.app

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const {
    BREVO_API_KEY,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    REMINDER_FROM_EMAIL,
    REMINDER_FROM_NAME = 'مكتبتي',
    APP_URL = 'https://majaliss-books.netlify.app',
  } = process.env

  if (!BREVO_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY || !REMINDER_FROM_EMAIL) {
    return json(500, { error: 'خدمة البريد غير مهيأة على الخادم.' })
  }

  // 1. Jeton de l'appelant.
  const authHeader = event.headers.authorization || event.headers.Authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return json(401, { error: 'يجب تسجيل الدخول.' })

  // 2. Identifier l'appelant.
  let callerId
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    })
    if (!r.ok) return json(401, { error: 'انتهت الجلسة، سجّل الدخول من جديد.' })
    const u = await r.json()
    callerId = u?.id
  } catch {
    return json(401, { error: 'تعذّر التحقق من الجلسة.' })
  }

  // 3. Vérifier le rôle admin (RLS autorise la lecture de son propre profil).
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerId}&select=role`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    )
    const rows = await r.json()
    if (!Array.isArray(rows) || rows[0]?.role !== 'admin') {
      return json(403, { error: 'هذا الإجراء مخصّص للمشرفين فقط.' })
    }
  } catch {
    return json(403, { error: 'تعذّر التحقق من الصلاحية.' })
  }

  // 4. Destinataire.
  let payload
  try { payload = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'طلب غير صالح.' }) }
  const toEmail = String(payload.email || '').trim()
  const toName = String(payload.name || '').trim() || 'قارئنا العزيز'
  if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
    return json(400, { error: 'بريد المستلم غير صالح.' })
  }

  // 5. Envoi via Brevo.
  const htmlContent = `
    <div dir="rtl" style="font-family: Arial, 'Segoe UI', sans-serif; font-size:16px; color:#2C2C2A; line-height:1.9;">
      <p>مرحباً ${toName}،</p>
      <p>نودّ تذكيرك بالعودة إلى قراءتك اليومية لمواصلة تقدّمك! 📚</p>
      <p style="margin:28px 0;">
        <a href="${APP_URL}" style="background:#534AB7;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:bold;display:inline-block;">افتح مكتبتي</a>
      </p>
      <p style="color:#888780;font-size:13px;">فريق مكتبتي</p>
    </div>`

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: REMINDER_FROM_EMAIL, name: REMINDER_FROM_NAME },
        to: [{ email: toEmail, name: toName }],
        subject: 'تذكير بالقراءة 🌟',
        htmlContent,
      }),
    })
    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('Brevo error:', r.status, detail)
      return json(502, { error: 'تعذّر إرسال البريد. تحقّق من إعداد Brevo.' })
    }
    return json(200, { ok: true })
  } catch (e) {
    console.error('Brevo request failed:', e)
    return json(502, { error: 'تعذّر إرسال البريد.' })
  }
}
