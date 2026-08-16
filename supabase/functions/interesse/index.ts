// Projeto Lista Valida (captacao MBA) - registra interesse quando o
// destinatario clica num link de interesse no e-mail de convite. Publica
// (deploy com --no-verify-jwt). Opera na tabela "contacts".

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const TIPOS_VALIDOS = ['mba', 'comunidade', 'ambos']

Deno.serve(async (req: Request) => {
  const params = new URL(req.url).searchParams
  const email = params.get('email')?.trim().toLowerCase()
  const tipo = params.get('tipo')?.trim().toLowerCase()

  if (!email) return htmlResponse('Link inválido: e-mail não informado.', 400)
  if (!tipo || !TIPOS_VALIDOS.includes(tipo)) {
    return htmlResponse('Link inválido: tipo de interesse desconhecido.', 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { data, error } = await supabase
    .from('contacts')
    .update({ interessado: true, tipo_interesse: tipo, atualizado_em: new Date().toISOString() })
    .eq('email', email)
    .select('id')

  if (error) return htmlResponse('Erro ao registrar seu interesse. Tente novamente mais tarde.', 500)
  if (!data || data.length === 0) return htmlResponse('Não encontramos este e-mail em nossa base.', 404)
  return htmlResponse('Interesse registrado com sucesso. Em breve entraremos em contato.', 200)
})

function htmlResponse(message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Interesse registrado</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 60px auto; text-align: center;">
  <p>${message}</p>
</body>
</html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
