// Fase 2 — placeholder deliberado (ver Restrições no briefing): a fase de
// IA ($ai.chat/$ai.embed do PocketBase, sem equivalente nativo no
// Supabase) fica para depois. Por ora devolve o mesmo fallback
// deterministico que classify_contact.js ja usava quando a chamada de IA
// falhava, preservando o contrato de resposta do endpoint.

import { getUser } from '../_shared/auth.ts'
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

interface ClassifyBody {
  id: string
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    const { supabase } = await getUser(req)
    const { id } = (await req.json()) as ClassifyBody
    if (!id) return jsonResponse({ error: 'ID do contato é obrigatório' }, 400)

    const { data: contact, error: fetchError } = await supabase
      .from('mailing_contacts')
      .select('name, company, raw_role')
      .eq('id', id)
      .single()
    if (fetchError || !contact) return jsonResponse({ error: 'Contato não encontrado' }, 404)

    const classification = buildFallbackClassification(contact.name, contact.company, contact.raw_role)

    const { data: updated, error: updateError } = await supabase
      .from('mailing_contacts')
      .update({
        ...classification,
        classification_status: 'Classificado',
        last_classified_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    if (updateError) throw updateError

    return jsonResponse(updated)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 400)
  }
})

// TODO fase 2 de IA: trocar por classificacao real + geracao de embedding
// para popular mailing_contacts.embedding (coluna comentada no DDL,
// migration 0001_schema.sql).
function buildFallbackClassification(name: string, company: string | null, rawRole: string | null) {
  return {
    role_category: 'Outro',
    priority: 'Média',
    interests: ['Gestão de Pessoas', 'Desenvolvimento Organizacional'],
    demands: ['Networking e Troca de Experiências'],
    profile_summary: `Profissional atuando como ${rawRole || 'não informado'} na empresa ${company || 'não informada'}.`,
    suggested_message: `Olá ${name}! Gostaríamos de convidá-lo(a) para participar das discussões no evento.`,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
