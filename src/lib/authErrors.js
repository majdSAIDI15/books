// Traduction des erreurs Supabase Auth.
//
// L'ancien code comparait `error.message` à des libellés anglais
// ("Invalid login credentials"…). Ces libellés changent d'une version de
// Supabase à l'autre, et l'utilisateur recevait alors un message brut en
// anglais au milieu d'une interface arabe (§4.7). On s'appuie d'abord sur
// `error.code`, stable, avec repli sur le texte pour les versions anciennes.

const BY_CODE = {
  invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
  email_not_confirmed: 'يرجى تأكيد بريدك الإلكتروني أولاً عبر الرابط المرسل إليك.',
  user_already_exists: 'هذا البريد الإلكتروني مسجل بالفعل.',
  email_exists: 'هذا البريد الإلكتروني مسجل بالفعل.',
  weak_password: 'كلمة المرور ضعيفة جداً. استخدم 6 أحرف على الأقل.',
  over_request_rate_limit: 'لقد قمت بمحاولات كثيرة جداً. يرجى المحاولة لاحقاً.',
  over_email_send_rate_limit: 'تم إرسال عدد كبير من الرسائل. يرجى المحاولة لاحقاً.',
  same_password: 'كلمة المرور الجديدة مطابقة للحالية.',
  session_not_found: 'انتهت الجلسة. يرجى تسجيل الدخول من جديد.'
}

const BY_TEXT = [
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/already registered|already exists/i, BY_CODE.user_already_exists],
  [/at least 6 characters|weak password/i, BY_CODE.weak_password],
  [/rate limit/i, BY_CODE.over_request_rate_limit]
]

export const authErrorMessage = (error, fallback = 'حدث خطأ غير متوقع. يرجى المحاولة مجدداً.') => {
  if (!error) return fallback

  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code]

  const text = error.message || ''
  const matched = BY_TEXT.find(([pattern]) => pattern.test(text))
  if (matched) return matched[1]

  // Un message anglais brut vaut mieux que rien, mais seulement en dernier
  // recours et seulement s'il existe.
  return text || fallback
}
