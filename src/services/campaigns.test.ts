// Testes de src/services/campaigns.ts: tabelas de tradução de status e as
// funções de mapeamento DB<->domínio (mapCampaign, mapLog, toPatch).
//
// ESTADO: RED por ausência de export. Hoje STATUS_DB_TO_PT, STATUS_PT_TO_DB,
// LOG_STATUS_DB_TO_PT, mapCampaign, mapLog e toPatch são privados ao módulo
// (sem a palavra `export`). Este arquivo já assume a mudança mínima proposta
// pelo agente de testes: adicionar `export` a essas seis declarações em
// src/services/campaigns.ts, sem alterar nenhum comportamento. Até essa
// mudança ser feita, os testes abaixo falham porque os imports nomeados
// resolvem para `undefined`.
//
// O client do Supabase é mockado (não falamos com rede nem lemos env vars
// reais) porque o import de campaigns.ts executa `createClient(...)` no
// module scope de src/lib/supabase/client.ts.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ default: {} }))
vi.mock('@/lib/supabase/current-user', () => ({ getCurrentUserId: vi.fn() }))

import {
  LOG_STATUS_DB_TO_PT,
  STATUS_DB_TO_PT,
  STATUS_PT_TO_DB,
  mapCampaign,
  mapLog,
  toPatch,
  type CampaignRecord,
} from './campaigns'

describe('STATUS_DB_TO_PT / STATUS_PT_TO_DB', () => {
  it('dado_os_quatro_status_do_banco_quando_traduz_entao_retorna_o_rotulo_em_portugues_esperado', () => {
    expect(STATUS_DB_TO_PT.draft).toBe('rascunho')
    expect(STATUS_DB_TO_PT.sending).toBe('enviando')
    expect(STATUS_DB_TO_PT.sent).toBe('enviado')
    expect(STATUS_DB_TO_PT.partially_failed).toBe('parcialmente_falhou')
  })

  it('dado_as_duas_tabelas_de_traducao_quando_compara_entao_sao_inversas_uma_da_outra', () => {
    for (const [db, pt] of Object.entries(STATUS_DB_TO_PT)) {
      expect(STATUS_PT_TO_DB[pt]).toBe(db)
    }
    expect(Object.keys(STATUS_DB_TO_PT)).toHaveLength(Object.keys(STATUS_PT_TO_DB).length)
  })
})

describe('LOG_STATUS_DB_TO_PT', () => {
  it('dado_os_tres_status_de_log_do_banco_quando_traduz_entao_retorna_o_rotulo_em_portugues_esperado', () => {
    expect(LOG_STATUS_DB_TO_PT.queued).toBe('enviando')
    expect(LOG_STATUS_DB_TO_PT.sent).toBe('enviado')
    expect(LOG_STATUS_DB_TO_PT.failed).toBe('falhou')
  })
})

describe('mapCampaign', () => {
  const baseRow = {
    id: 'c1',
    name: 'Campanha X',
    event_id: 'e1',
    subject: 'Assunto',
    body: 'Corpo {nome}',
    sender_name: null,
    sender_email: null,
    status: 'draft' as const,
    filter_rsvp: null,
    filter_priority: null,
    filter_category: null,
    total_sent: 0,
    total_failed: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  }

  it('dado_row_com_campos_nulos_quando_mapeia_entao_converte_null_para_undefined', () => {
    const result = mapCampaign(baseRow)

    expect(result.sender_name).toBeUndefined()
    expect(result.sender_email).toBeUndefined()
    expect(result.filter_rsvp).toBeUndefined()
    expect(result.filter_priority).toBeUndefined()
    expect(result.filter_category).toBeUndefined()
  })

  it('dado_row_com_status_do_banco_quando_mapeia_entao_traduz_para_portugues', () => {
    expect(mapCampaign({ ...baseRow, status: 'sending' }).status).toBe('enviando')
    expect(mapCampaign({ ...baseRow, status: 'partially_failed' }).status).toBe('parcialmente_falhou')
  })

  it('dado_row_sem_relacao_event_embutida_quando_mapeia_entao_expand_fica_indefinido', () => {
    expect(mapCampaign({ ...baseRow, event: undefined }).expand).toBeUndefined()
    expect(mapCampaign({ ...baseRow, event: null }).expand).toBeUndefined()
    expect(mapCampaign({ ...baseRow, event: [] }).expand).toBeUndefined()
  })

  it('dado_row_com_relacao_event_embutida_como_array_do_postgrest_quando_mapeia_entao_expand_recebe_o_primeiro_item', () => {
    const result = mapCampaign({ ...baseRow, event: [{ name: 'Evento Anual' }] })

    expect(result.expand).toEqual({ event: { name: 'Evento Anual' } })
    expect(result.event).toBe('e1') // event (id) continua vindo de event_id, não da relação
  })

  it('dado_row_completo_quando_mapeia_entao_preserva_id_e_datas_de_created_updated', () => {
    const result = mapCampaign(baseRow)

    expect(result.id).toBe('c1')
    expect(result.created).toBe('2026-01-01T00:00:00Z')
    expect(result.updated).toBe('2026-01-02T00:00:00Z')
  })
})

describe('mapLog', () => {
  const baseRow = {
    id: 'l1',
    campaign_id: 'c1',
    contact_id: null,
    recipient_email: 'a@b.com',
    recipient_name: null,
    subject: null,
    body: null,
    status: 'sent' as const,
    error_message: null,
    sent_at: null,
    opened_at: null,
    clicked_at: null,
    click_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('dado_contact_id_nulo_quando_mapeia_entao_converte_para_undefined', () => {
    expect(mapLog(baseRow).contact).toBeUndefined()
  })

  it('dado_contact_id_presente_quando_mapeia_entao_preserva_o_valor', () => {
    expect(mapLog({ ...baseRow, contact_id: 'contact-1' }).contact).toBe('contact-1')
  })

  it('dado_status_queued_sent_ou_failed_quando_mapeia_entao_traduz_para_o_rotulo_em_portugues', () => {
    expect(mapLog({ ...baseRow, status: 'queued' }).status).toBe('enviando')
    expect(mapLog({ ...baseRow, status: 'sent' }).status).toBe('enviado')
    expect(mapLog({ ...baseRow, status: 'failed' }).status).toBe('falhou')
  })
})

describe('toPatch', () => {
  it('dado_dados_parciais_de_campanha_quando_converte_entao_remove_campos_somente_leitura', () => {
    const data: Partial<CampaignRecord> = {
      id: 'c1',
      name: 'Nova campanha',
      created: '2026-01-01',
      updated: '2026-01-02',
      expand: { event: { name: 'Evento' } },
    }

    const patch = toPatch(data)

    expect(patch).not.toHaveProperty('id')
    expect(patch).not.toHaveProperty('created')
    expect(patch).not.toHaveProperty('updated')
    expect(patch).not.toHaveProperty('expand')
    expect(patch.name).toBe('Nova campanha')
  })

  it('dado_event_quando_converte_entao_renomeia_para_event_id', () => {
    const patch = toPatch({ event: 'evt-1' })

    expect(patch.event_id).toBe('evt-1')
    expect(patch).not.toHaveProperty('event')
  })

  it('dado_body_template_quando_converte_entao_renomeia_para_body', () => {
    const patch = toPatch({ body_template: 'Olá {nome}' })

    expect(patch.body).toBe('Olá {nome}')
    expect(patch).not.toHaveProperty('body_template')
  })

  it('dado_status_em_portugues_quando_converte_entao_traduz_para_o_valor_do_banco', () => {
    const patch = toPatch({ status: 'enviado' })

    expect(patch.status).toBe('sent')
  })

  it('dado_campos_ausentes_quando_converte_entao_nao_inclui_chaves_correspondentes', () => {
    const patch = toPatch({})

    expect(patch).not.toHaveProperty('event_id')
    expect(patch).not.toHaveProperty('body')
    expect(patch).not.toHaveProperty('status')
  })
})
