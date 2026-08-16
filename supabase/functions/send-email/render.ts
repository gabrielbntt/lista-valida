// Fase 3: renderizacao do e-mail. Substitui os placeholders do template
// da campanha pelos dados do contato, injeta os links de tracking
// (clique e abertura) e o rodape de descadastro - mesma logica que
// send_campaign.js montava no envio sincrono do PocketBase.

interface CampaignTemplate {
  subject: string
  body: string
}

interface ContactData {
  name: string
  company: string | null
  raw_role: string | null
  suggested_message: string | null
}

export function renderSubject(template: CampaignTemplate, contact: ContactData): string {
  return applyPlaceholders(template.subject, contact)
}

export function unsubscribeUrl(logId: string, siteUrl: string): string {
  return `${siteUrl}/descadastrar/${logId}`
}

// Versao em texto puro do e-mail. Enviar so HTML e um sinal de spam
// relevante: mensagem legitima costuma trazer as duas partes (multipart).
export function renderTextBody(
  template: CampaignTemplate,
  contact: ContactData,
  unsubUrl: string,
): string {
  const body = applyPlaceholders(template.body, contact).replace(/\{link_descadastro\}/g, unsubUrl)
  return `${body}\n\n---\nPara não receber mais nossos e-mails, acesse: ${unsubUrl}`
}

// Endereco base de cada endpoint de rastreamento. Usar o mesmo dominio do
// remetente (ex.: https://listavalida.com.br/r/c) em vez do dominio do
// Supabase melhora a entregabilidade: link apontando para um dominio sem
// relacao com o remetente e padrao classico de phishing e pesa contra na
// avaliacao de spam.
export interface TrackingEndpoints {
  click: string
  open: string
}

export function renderTrackedBody(
  template: CampaignTemplate,
  contact: ContactData,
  logId: string,
  tracking: TrackingEndpoints,
  siteUrl: string,
): string {
  const body = applyPlaceholders(template.body, contact)
  const htmlBody = body.replace(/\n/g, '<br>\n')
  const withClicks = trackClicks(htmlBody, logId, tracking.click)
  const pixelUrl = `${tracking.open}?log=${logId}`
  const withOpen = `${withClicks}<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />`
  const unsubUrl = `${siteUrl}/descadastrar/${logId}`
  const withUnsub = withOpen.replace(/\{link_descadastro\}/g, unsubUrl)
  return appendUnsubscribeFooter(withUnsub, unsubUrl)
}

function applyPlaceholders(text: string, contact: ContactData): string {
  return text
    .replace(/\{nome\}/g, contact.name)
    .replace(/\{empresa\}/g, contact.company || '')
    .replace(/\{cargo\}/g, contact.raw_role || '')
    .replace(/\{mensagem_ia\}/g, contact.suggested_message || '')
}

function trackClicks(html: string, logId: string, clickUrl: string): string {
  const base = `${clickUrl}?log=${logId}&url=`
  return html.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (_match, url) => `href="${base}${encodeURIComponent(url)}"`)
}

function appendUnsubscribeFooter(html: string, unsubUrl: string): string {
  if (html.includes('Cancelamento de recebimento')) return html
  return (
    html +
    '<hr><p style="font-size:12px;color:#666;margin-top:20px;padding-top:10px;">' +
    '<strong>Cancelamento de recebimento de e-mails</strong><br>' +
    'Você está recebendo este e-mail porque se cadastrou ou participou de um evento nosso. ' +
    'Caso não deseje mais receber nossas comunicações, você pode cancelar o recebimento a ' +
    'qualquer momento, de forma simples e gratuita.</p>' +
    `<p style="margin-top:10px;"><a href="${unsubUrl}" style="color:#4f46e5;font-weight:bold;">Cancelar meu recebimento</a></p>`
  )
}
