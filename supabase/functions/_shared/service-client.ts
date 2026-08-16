// Cliente com service_role — bypassa RLS. So para uso server-side dentro
// de Edge Functions (nunca no frontend). Hoje usado por create-user, que
// precisa de auth.admin.createUser.

import { createClient } from 'jsr:@supabase/supabase-js@2'

export function createServiceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}
