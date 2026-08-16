import supabase from '@/lib/supabase/client'

export interface ForgotPasswordResponse {
  message: string
}

// Fase 5 (reconciliacao): substitui pocketbase/hooks/forgot_password.js
// (gerava senha aleatoria e mandava em texto puro por e-mail). O padrao
// do Supabase e por link - o e-mail leva para /redefinir-senha
// (src/pages/ResetPassword.tsx), onde a pessoa escolhe a propria senha.
// window.location.origin garante que o link aponta pro dominio certo em
// qualquer ambiente (dev local ou producao), sem precisar de env var.
export const forgotPassword = async (email: string): Promise<ForgotPasswordResponse> => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  })
  if (error) throw error

  return {
    message: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.',
  }
}
