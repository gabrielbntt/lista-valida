// Fase 2: porta pocketbase/hooks/search_contacts.js sem a parte de IA
// ($vectors.search sobre embedding fica para a fase 2 de IA, fora de
// escopo aqui). Troca por ILIKE + pg_trgm (indices criados na migration
// 0001). RLS e a camada primaria de isolamento: admin ve tudo, usuario
// comum so os proprios contatos — sem filtro extra de owner_id aqui.

import { getUser } from '../_shared/auth.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface SearchBody {
  query: string
  event_id?: string
  k?: number
}

const MAX_RESULTS = 25

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  // Autenticacao fora do try da busca: uma sessao expirada precisa virar
  // 401, nunca ser confundida com "nenhum resultado".
  let supabase: Awaited<ReturnType<typeof getUser>>['supabase']
  try {
    supabase = (await getUser(req)).supabase
  } catch {
    return jsonResponse({ error: 'não autorizado' }, 401)
  }

  try {
    const body = (await req.json()) as SearchBody
    const query = (body.query || '').trim()
    if (!query) return jsonResponse({ error: 'Termo de busca é obrigatório' }, 400)

    const pattern = toIlikePattern(query)
    let request = supabase
      .from('mailing_contacts')
      .select('id, name, email, company, raw_role, role_category')
      .or(`email.ilike.${pattern},name.ilike.${pattern}`)
      .limit(Math.min(body.k || MAX_RESULTS, MAX_RESULTS))

    if (body.event_id) request = request.eq('event_id', body.event_id)

    const { data, error } = await request
    if (error) throw error

    return jsonResponse({ items: data ?? [] })
  } catch (error) {
    // Falha de banco nao pode virar lista vazia silenciosa - a tela
    // mostraria "nenhum resultado" para o que na verdade e um erro.
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})

// No PostgREST, valores dentro de or=(...) que contenham caracteres
// reservados (virgula, parenteses, ponto) precisam ser envolvidos em
// aspas duplas - escapar com barra invertida nao e o mecanismo correto e
// produz um filtro malformado. Dentro das aspas, " e \ sao escapados.
function toIlikePattern(value: string): string {
  const escaped = value.replace(/["\\]/g, (char) => '\\' + char)
  return `"%${escaped}%"`
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
