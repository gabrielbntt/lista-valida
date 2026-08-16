// Cabecalhos de CORS para functions chamadas direto do navegador (via
// supabase.functions.invoke ou fetch cross-origin). Sem isso, o proprio
// navegador bloqueia a resposta do preflight OPTIONS antes da chamada
// real acontecer - nao aparece nem como erro no Supabase, so no console
// do navegador.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  return null
}
