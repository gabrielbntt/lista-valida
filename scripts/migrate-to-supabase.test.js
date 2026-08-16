// Testes de scripts/migrate-to-supabase.js: deterministicUuid.
//
// BLOQUEADO (Red, não executável hoje) — dois motivos, não apenas falta de
// export:
//
// 1. deterministicUuid() é uma função privada do módulo (sem `export`).
// 2. O módulo tem efeito colateral no top-level: `requireEnv(...)` roda
//    imediatamente na importação e chama `process.exit(1)` se as env vars
//    (PB_URL, PB_ADMIN_EMAIL, ...) não estiverem definidas; e a última
//    linha do arquivo chama `main().catch(...)` incondicionalmente, o que
//    dispara autenticação real no PocketBase e escritas reais no Supabase
//    (via service_role key) assim que o módulo é importado. Não há como
//    importar este arquivo com segurança em um test runner sem, na melhor
//    das hipóteses, sair do processo, e na pior, migrar dados de verdade
//    contra um ambiente real. Por isso os testes abaixo estão com
//    `.skip`: o corpo do `it` nunca roda, então o `import()` dinâmico
//    dentro dele nunca é avaliado.
//
// MUDANÇA MÍNIMA PROPOSTA (não aplicada por este agente — só testes):
//   a) `export function deterministicUuid(oldId) { ... }`
//   b) Guardar a execução de `main()` (e idealmente os `requireEnv`
//      obrigatórios) atrás de um check de "é o entrypoint direto":
//        import { pathToFileURL } from 'node:url'
//        if (import.meta.url === pathToFileURL(process.argv[1]).href) {
//          main().catch((err) => { ... ; process.exit(1) })
//        }
//      Isso é o padrão Node/ESM para permitir `import` seguro em testes
//      sem mudar o comportamento do script quando rodado via
//      `node scripts/migrate-to-supabase.js`.
//
// Alternativa mais limpa: extrair deterministicUuid para um módulo
// pequeno e sem efeitos colaterais (ex.: scripts/lib/deterministic-uuid.js)
// e importar esse módulo tanto do script quanto do teste.
//
// Os vetores de referência abaixo foram calculados fora deste repo com
// crypto.createHash('md5'), replicando exatamente a lógica de
// deterministicUuid (mesmo slicing usado no código-fonte), e servem para
// travar a expectativa assim que o import for possível — não são um
// "oráculo" reimplementado dentro do teste.

import { describe, expect, it } from 'vitest'

describe('deterministicUuid', () => {
  it.skip('dado_o_mesmo_id_antigo_quando_gera_duas_vezes_entao_produz_o_mesmo_uuid', async () => {
    const { deterministicUuid } = await import('./migrate-to-supabase.js')

    expect(deterministicUuid('abc123')).toBe(deterministicUuid('abc123'))
  })

  it.skip('dado_um_id_antigo_conhecido_quando_gera_entao_bate_com_o_vetor_calculado_via_md5', async () => {
    const { deterministicUuid } = await import('./migrate-to-supabase.js')

    // md5('pb:abc123') fatiado em 8-4-4-4-12, replicando (md5('pb:' || old_id))::uuid.
    expect(deterministicUuid('abc123')).toBe('168ef61f-72f7-978c-56f9-cde1761ba7ba')
  })

  it.skip('dado_um_id_de_usuario_real_do_pocketbase_quando_gera_entao_bate_com_o_vetor_calculado_via_md5', async () => {
    const { deterministicUuid } = await import('./migrate-to-supabase.js')

    expect(deterministicUuid('0b1drjugldry28x')).toBe('57c64748-490f-f786-c394-f2592d933d6d')
  })

  it.skip('dado_ids_antigos_diferentes_quando_gera_entao_produz_uuids_diferentes', async () => {
    const { deterministicUuid } = await import('./migrate-to-supabase.js')

    expect(deterministicUuid('abc123')).not.toBe(deterministicUuid('abc124'))
  })

  it.skip('dado_o_uuid_gerado_quando_valida_o_formato_entao_tem_5_grupos_hexadecimais_no_padrao_8-4-4-4-12', async () => {
    const { deterministicUuid } = await import('./migrate-to-supabase.js')

    expect(deterministicUuid('qualquer-id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

// Registrado como lembrete explícito no relatório de execução do Vitest
// (aparece como pendente, não como sucesso silencioso).
it.todo(
  'reabilitar os testes de deterministicUuid acima assim que o script exportar a função e isolar main() do import (ver comentário no topo do arquivo)',
)
