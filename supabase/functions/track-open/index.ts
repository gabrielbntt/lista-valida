// Fase 3: porta pocketbase/hooks/track_open.js. Pixel 1x1 GIF. Publica
// (--no-verify-jwt). Mesmo GIF hexadecimal do hook original.

import { createClient, SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const GIF_HEX =
  '47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b'
const PIXEL_GIF = hexToBytes(GIF_HEX)

Deno.serve(async (req: Request) => {
  const logId = new URL(req.url).searchParams.get('log')
  if (logId) {
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    await registerOpen(supabase, logId)
  }

  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  })
})

async function registerOpen(supabase: SupabaseClient, logId: string) {
  const { data: log } = await supabase.from('email_logs').select('opened_at').eq('id', logId).maybeSingle()
  if (!log || log.opened_at) return

  await supabase.from('email_logs').update({ opened_at: new Date().toISOString() }).eq('id', logId)
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}
