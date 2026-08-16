// Testes de src/services/contacts.ts: mapRow e toPatch.
//
// ESTADO: RED por ausência de export. Hoje mapRow e toPatch são privados
// ao módulo (sem `export`). Este arquivo assume a mesma mudança mínima
// proposta para campaigns.ts: adicionar `export` a essas duas declarações
// em src/services/contacts.ts, sem alterar comportamento. Até lá, os
// imports nomeados abaixo resolvem para `undefined` e os testes falham.
//
// O client do Supabase é mockado pelo mesmo motivo de campaigns.test.ts:
// evitar que o import do módulo dispare createClient(...) com env vars
// reais/ausentes.

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ default: {} }))
vi.mock('@/lib/supabase/current-user', () => ({ getCurrentUserId: vi.fn() }))

import { mapRow, toPatch, type ContactRecord } from './contacts'

describe('mapRow', () => {
  const baseRow = {
    id: 'ct1',
    event_id: 'e1',
    name: 'Fulano',
    email: 'fulano@example.com',
    phone: null,
    company: null,
    raw_role: null,
    cnpj: null,
    city: null,
    rsvp: null,
    has_degree: null,
    classification_status: null,
    role_category: null,
    priority: null,
    interests: null,
    demands: null,
    profile_summary: null,
    suggested_message: null,
    notes: null,
    last_classified_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
  }

  it('dado_row_com_todos_os_campos_opcionais_nulos_quando_mapeia_entao_converte_todos_para_undefined', () => {
    const result = mapRow(baseRow)

    expect(result.phone).toBeUndefined()
    expect(result.company).toBeUndefined()
    expect(result.raw_role).toBeUndefined()
    expect(result.cnpj).toBeUndefined()
    expect(result.city).toBeUndefined()
    expect(result.rsvp).toBeUndefined()
    expect(result.has_degree).toBeUndefined()
    expect(result.classification_status).toBeUndefined()
    expect(result.role_category).toBeUndefined()
    expect(result.priority).toBeUndefined()
    expect(result.interests).toBeUndefined()
    expect(result.demands).toBeUndefined()
    expect(result.profile_summary).toBeUndefined()
    expect(result.suggested_message).toBeUndefined()
    expect(result.notes).toBeUndefined()
    expect(result.last_classified_at).toBeUndefined()
  })

  it('dado_row_com_campos_preenchidos_quando_mapeia_entao_preserva_os_valores', () => {
    const result = mapRow({
      ...baseRow,
      phone: '11999998888',
      company: 'Acme',
      cnpj: '12345678000199',
      city: 'São Paulo',
      interests: ['tech', 'design'],
      demands: ['orcamento'],
    })

    expect(result.phone).toBe('11999998888')
    expect(result.company).toBe('Acme')
    expect(result.cnpj).toBe('12345678000199')
    expect(result.city).toBe('São Paulo')
    expect(result.interests).toEqual(['tech', 'design'])
    expect(result.demands).toEqual(['orcamento'])
  })

  it('dado_row_sem_relacao_event_embutida_quando_mapeia_entao_expand_fica_indefinido', () => {
    expect(mapRow({ ...baseRow, event: undefined }).expand).toBeUndefined()
    expect(mapRow({ ...baseRow, event: null }).expand).toBeUndefined()
    expect(mapRow({ ...baseRow, event: [] }).expand).toBeUndefined()
  })

  it('dado_row_com_relacao_event_embutida_como_array_do_postgrest_quando_mapeia_entao_expand_recebe_o_primeiro_item', () => {
    const result = mapRow({ ...baseRow, event: [{ name: 'Evento Anual' }] })

    expect(result.expand).toEqual({ event: { name: 'Evento Anual' } })
    expect(result.event).toBe('e1') // event (id) vem de event_id, não da relação embutida
  })

  it('dado_row_quando_mapeia_entao_preserva_id_email_e_datas', () => {
    const result = mapRow(baseRow)

    expect(result.id).toBe('ct1')
    expect(result.email).toBe('fulano@example.com')
    expect(result.created).toBe('2026-01-01T00:00:00Z')
    expect(result.updated).toBe('2026-01-02T00:00:00Z')
  })
})

describe('toPatch', () => {
  it('dado_dados_parciais_quando_converte_entao_remove_id_created_updated_e_expand', () => {
    const data: Partial<ContactRecord> = {
      id: 'ct1',
      name: 'Novo nome',
      created: '2026-01-01',
      updated: '2026-01-02',
      expand: { event: { name: 'Evento' } },
    }

    const patch = toPatch(data)

    expect(patch).not.toHaveProperty('id')
    expect(patch).not.toHaveProperty('created')
    expect(patch).not.toHaveProperty('updated')
    expect(patch).not.toHaveProperty('expand')
    expect(patch.name).toBe('Novo nome')
  })

  it('dado_event_quando_converte_entao_renomeia_para_event_id', () => {
    const patch = toPatch({ event: 'evt-1' })

    expect(patch.event_id).toBe('evt-1')
    expect(patch).not.toHaveProperty('event')
  })

  it('dado_event_ausente_quando_converte_entao_nao_inclui_event_id', () => {
    const patch = toPatch({ name: 'Sem evento' })

    expect(patch).not.toHaveProperty('event_id')
  })

  it('dado_objeto_vazio_quando_converte_entao_retorna_objeto_vazio', () => {
    expect(toPatch({})).toEqual({})
  })
})
