// Testes de supabase/functions/send-email/render.ts (renderSubject,
// renderTrackedBody). Funções puras, sem import de Deno/rede -> rodam
// direto sob Vitest, mesmo sendo parte de uma Edge Function.

import { describe, expect, it } from 'vitest'
import { renderSubject, renderTrackedBody } from './render'

const contact = {
  name: 'Maria Silva',
  company: 'Acme Ltda',
  raw_role: 'Diretora',
  suggested_message: 'Que bom te ver por aqui!',
}

describe('renderSubject', () => {
  it('dado_template_com_todos_os_placeholders_quando_renderiza_entao_substitui_todos', () => {
    const subject = renderSubject(
      { subject: 'Olá {nome} da {empresa}, {cargo}: {mensagem_ia}', body: '' },
      contact,
    )

    expect(subject).toBe('Olá Maria Silva da Acme Ltda, Diretora: Que bom te ver por aqui!')
  })

  it('dado_contato_com_campos_opcionais_nulos_quando_renderiza_entao_substitui_por_string_vazia', () => {
    const subject = renderSubject(
      { subject: '{nome} - {empresa} - {cargo} - {mensagem_ia}', body: '' },
      { name: 'João', company: null, raw_role: null, suggested_message: null },
    )

    expect(subject).toBe('João -  -  - ')
  })

  it('dado_template_sem_placeholders_quando_renderiza_entao_retorna_texto_inalterado', () => {
    expect(renderSubject({ subject: 'Assunto fixo', body: '' }, contact)).toBe('Assunto fixo')
  })

  it('dado_placeholder_repetido_no_template_quando_renderiza_entao_substitui_todas_as_ocorrencias', () => {
    const subject = renderSubject({ subject: '{nome}, {nome}!', body: '' }, contact)

    expect(subject).toBe('Maria Silva, Maria Silva!')
  })
})

describe('renderTrackedBody', () => {
  const functionsUrl = 'https://proj.functions.supabase.co'
  const siteUrl = 'https://listavalida.com.br'
  const logId = 'log-123'

  it('dado_corpo_simples_quando_renderiza_entao_substitui_placeholders_e_converte_quebras_de_linha', () => {
    const html = renderTrackedBody(
      { subject: '', body: 'Olá {nome},\nTudo bem?' },
      contact,
      logId,
      functionsUrl,
      siteUrl,
    )

    expect(html).toContain('Olá Maria Silva,<br>\nTudo bem?')
  })

  it('dado_corpo_com_link_http_quando_renderiza_entao_reescreve_href_para_track_click', () => {
    const html = renderTrackedBody(
      { subject: '', body: '<a href="https://exemplo.com/pagina">clique aqui</a>' },
      contact,
      logId,
      functionsUrl,
      siteUrl,
    )

    const expectedHref = `${functionsUrl}/track-click?log=${logId}&url=${encodeURIComponent('https://exemplo.com/pagina')}`
    expect(html).toContain(`href="${expectedHref}"`)
  })

  it('dado_corpo_com_multiplos_links_quando_renderiza_entao_reescreve_todos_preservando_a_url_original_codificada', () => {
    const html = renderTrackedBody(
      { subject: '', body: '<a href="https://a.com/x">a</a> <a href="https://b.com/y?z=1">b</a>' },
      contact,
      logId,
      functionsUrl,
      siteUrl,
    )

    expect(html).toContain(encodeURIComponent('https://a.com/x'))
    expect(html).toContain(encodeURIComponent('https://b.com/y?z=1'))
  })

  it('dado_qualquer_corpo_quando_renderiza_entao_injeta_o_pixel_de_abertura_com_o_log_id', () => {
    const html = renderTrackedBody({ subject: '', body: 'oi' }, contact, logId, functionsUrl, siteUrl)

    expect(html).toContain(
      `<img src="${functionsUrl}/track-open?log=${logId}" width="1" height="1" alt="" style="display:none;" />`,
    )
  })

  it('dado_placeholder_link_descadastro_no_template_quando_renderiza_entao_substitui_pela_url_real', () => {
    const html = renderTrackedBody(
      { subject: '', body: 'Cancele em {link_descadastro}' },
      contact,
      logId,
      functionsUrl,
      siteUrl,
    )

    expect(html).toContain(`Cancele em ${siteUrl}/descadastrar/${logId}`)
    expect(html).not.toContain('{link_descadastro}')
  })

  it('dado_corpo_sem_rodape_de_descadastro_quando_renderiza_entao_acrescenta_o_rodape', () => {
    const html = renderTrackedBody({ subject: '', body: 'corpo simples' }, contact, logId, functionsUrl, siteUrl)

    expect(html).toContain('Cancelamento de recebimento de e-mails')
    expect(html).toContain(`href="${siteUrl}/descadastrar/${logId}"`)
  })

  it('dado_corpo_que_ja_contem_o_rodape_de_descadastro_quando_renderiza_entao_nao_duplica', () => {
    const bodyComRodape =
      'corpo <strong>Cancelamento de recebimento</strong> de e-mails já presente no template'
    const html = renderTrackedBody(
      { subject: '', body: bodyComRodape },
      contact,
      logId,
      functionsUrl,
      siteUrl,
    )

    const occurrences = html.split('Cancelamento de recebimento').length - 1
    expect(occurrences).toBe(1)
  })
})
