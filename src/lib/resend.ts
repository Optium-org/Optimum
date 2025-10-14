// Stubbed email sender: no external calls. Safe for dev/demo.
// Если потребуется реальная отправка писем — восстановите Resend интеграцию.

export type CreateEmailOptions = {
  from: string
  to: string[]
  subject: string
  html: string
}

export async function sendEmail(_options: CreateEmailOptions) {
  // no-op: имитируем успешную отправку, ничего не делаем
  if (process.env.NODE_ENV !== 'production') {
    console.log('[email:stub] sendEmail called (no-op)')
  }
}
