// Fase 2: admin-only. Preserva a UX atual de Users.tsx (admin define
// nome, e-mail, senha e papel num unico formulario) — por isso usa
// auth.admin.createUser com service_role em vez do fluxo de convite por
// e-mail. handle_new_user() (migration 0002) ja cria o profile com
// role = 'user'; se o papel pedido for 'admin', promovemos em seguida.

import { getUser, isAdmin } from '../_shared/auth.ts'
import { createServiceClient } from '../_shared/service-client.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface CreateUserBody {
  name: string
  email: string
  password: string
  role: 'admin' | 'user'
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const { supabase, user } = await getUser(req)
    if (!(await isAdmin(supabase, user.id))) {
      return jsonResponse({ error: 'acesso negado' }, 403)
    }

    const body = (await req.json()) as CreateUserBody
    const validationError = validateBody(body)
    if (validationError) return jsonResponse({ error: validationError }, 400)

    const admin = createServiceClient()
    const { data: created, error } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { name: body.name },
    })
    if (error || !created.user) {
      return jsonResponse({ error: error?.message || 'erro ao criar usuário' }, 400)
    }

    if (body.role === 'admin') {
      await admin.from('profiles').update({ role: 'admin' }).eq('id', created.user.id)
    }

    return jsonResponse({ id: created.user.id, email: created.user.email })
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 401)
  }
})

function validateBody(body: CreateUserBody): string | null {
  if (!body?.name?.trim()) return 'Nome é obrigatório'
  if (!body?.email?.trim()) return 'E-mail é obrigatório'
  if (!body?.password || body.password.length < 8) return 'Senha mínima: 8 caracteres'
  return null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
