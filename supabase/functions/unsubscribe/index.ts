// Projeto Lista Valida (captacao MBA) - descadastro por link clicado no
// e-mail. Publica (deploy com --no-verify-jwt), porque quem acessa e o
// destinatario, sem sessao autenticada no Supabase. Opera na tabela
// "contacts" - independente de mailing_contacts/blocked_contacts, que
// pertencem ao app de eventos.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  const email = new URL(req.url).searchParams.get('email')?.trim().toLowerCase()
  if (!email) return htmlResponse('Link inválido: e-mail não informado.', 400)

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const outcome = await processUnsubscribe(supabase, email)

  return htmlResponse(outcome.message, outcome.status)
})

async function processUnsubscribe(
  supabase: SupabaseClient,
  email: string,
): Promise<{ message: string; status: number }> {
  const contact = await findContact(supabase, email)
  if (!contact) return { message: 'Não encontramos este e-mail em nossa base.', status: 404 }
  if (contact.status === 'optout') {
    return { message: 'Você já estava descadastrado. Nada mais a fazer.', status: 200 }
  }

  const { error } = await supabase
    .from('contacts')
    .update({
      status: 'optout',
      email: 'optout@opt.out',
      email_original: contact.email_original ?? contact.email,
      atualizado_em: new Date().toISOString(),
    })
    .eq('id', contact.id)

  if (error) return { message: 'Erro ao processar seu descadastro. Tente novamente mais tarde.', status: 500 }
  return { message: 'Descadastro confirmado. Você não receberá mais e-mails nossos.', status: 200 }
}

// Busca por e-mail atual OU por email_original (cobre o caso de clicar no
// link de novo depois que o e-mail ja foi trocado para optout@opt.out).
async function findContact(supabase: SupabaseClient, email: string) {
  const { data: byEmail } = await supabase
    .from('contacts')
    .select('id, email, email_original, status')
    .eq('email', email)
    .maybeSingle()
  if (byEmail) return byEmail

  const { data: byOriginal } = await supabase
    .from('contacts')
    .select('id, email, email_original, status')
    .eq('email_original', email)
    .maybeSingle()
  return byOriginal
}

function htmlResponse(message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Descadastro</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center;">
  <p>${message}</p>
</body>
</html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
