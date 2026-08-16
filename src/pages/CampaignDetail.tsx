import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  BarChart3,
  AlertTriangle,
  Settings,
  RotateCcw,
  Ban,
} from 'lucide-react'
import {
  getCampaign,
  getCampaignLogs,
  sendCampaign,
  retryCampaignFailures,
  deleteCampaign,
  CampaignRecord,
  EmailLogRecord,
} from '@/services/campaigns'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'
import { getErrorMessage } from '@/lib/errors'

export interface FailureDiagnostic {
  totalErrors: number
  uniqueErrors: Map<string, number>
  isConfigIssue: boolean
  isDomainIssue: boolean
  isApiKeyIssue: boolean
  guidance: string[]
}

function analyzeFailures(logs: EmailLogRecord[]): FailureDiagnostic {
  const failedLogs = logs.filter((l) => l.status === 'falhou')
  const uniqueErrors = new Map<string, number>()
  const guidance: string[] = []
  let isConfigIssue = false
  let isDomainIssue = false
  let isApiKeyIssue = false

  for (const log of failedLogs) {
    const msg = log.error_message || 'Erro desconhecido'
    uniqueErrors.set(msg, (uniqueErrors.get(msg) || 0) + 1)
    const lower = msg.toLowerCase()
    if (
      lower.includes('verify') ||
      lower.includes('domain') ||
      lower.includes('domínio') ||
      lower.includes('sender') ||
      lower.includes('remetente')
    ) {
      isDomainIssue = true
      isConfigIssue = true
    }
    if (
      lower.includes('api key') ||
      lower.includes('unauthorized') ||
      lower.includes('401') ||
      lower.includes('authentication')
    ) {
      isApiKeyIssue = true
      isConfigIssue = true
    }
  }

  if (isDomainIssue) {
    guidance.push(
      'O domínio do remetente (sender_email) não está verificado no Resend. Acesse Configurações de Domínio para verificar o domínio e o e-mail remetente.',
    )
  }
  if (isApiKeyIssue) {
    guidance.push(
      'A chave de API do Resend (RESEND_API_KEY) está ausente ou inválida. Verifique a configuração em Configurações de Domínio.',
    )
  }
  if (!isConfigIssue && failedLogs.length > 0) {
    guidance.push(
      'As falhas não parecem ser de configuração. Verifique as mensagens de erro individuais abaixo para mais detalhes.',
    )
  }

  return {
    totalErrors: failedLogs.length,
    uniqueErrors,
    isConfigIssue,
    isDomainIssue,
    isApiKeyIssue,
    guidance,
  }
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [campaign, setCampaign] = useState<CampaignRecord | null>(null)
  const [logs, setLogs] = useState<EmailLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [retryTotal, setRetryTotal] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const fetchData = useCallback(async () => {
    if (!id) return
    try {
      const [c, l] = await Promise.all([getCampaign(id), getCampaignLogs(id)])
      setCampaign(c)
      setLogs(l)
    } catch {
      toast({ title: 'Erro ao carregar campanha' })
      navigate('/campanhas')
    } finally {
      setLoading(false)
    }
  }, [id, navigate, toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useRealtime('email_logs', () => {
    if (id) fetchData()
  })
  useRealtime('email_campaigns', () => {
    if (id) fetchData()
  })

  const diagnostic = useMemo(() => analyzeFailures(logs), [logs])

  const handleSend = async () => {
    if (!id) return
    setSending(true)
    try {
      const result = await sendCampaign(id)
      if (result.queued === 0 && result.ignored_blocked) {
        toast({
          title: 'Nenhum e-mail enviado',
          description: `Todos os ${result.ignored_blocked} destinatários estão bloqueados.`,
        })
      } else {
        toast({
          title: 'Disparo iniciado!',
          description: `${result.queued} e-mails na fila de envio${result.ignored_blocked ? ` (${result.ignored_blocked} bloqueados)` : ''}. Acompanhe o progresso abaixo.`,
        })
      }
      fetchData()
    } catch (err) {
      toast({
        title: 'Erro ao disparar campanha',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const handleRetryFailures = async () => {
    if (!id) return
    setRetryTotal(failedCount)
    setRetrying(true)
    try {
      const result = await retryCampaignFailures(id)
      if (result.requeued === 0 && result.ignored_blocked) {
        toast({
          title: 'Nenhum reenvio necessário',
          description: `Todos os ${result.ignored_blocked} destinatários estão bloqueados.`,
        })
      } else {
        toast({
          title: 'Reenvio iniciado!',
          description: `${result.requeued} e-mails de volta na fila${result.ignored_blocked ? ` (${result.ignored_blocked} bloqueados)` : ''}. Acompanhe o progresso abaixo.`,
        })
      }
      fetchData()
    } catch (err) {
      toast({
        title: 'Erro ao reenviar falhas',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setRetrying(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await deleteCampaign(id)
      toast({ title: 'Campanha excluída.' })
      navigate('/campanhas')
    } catch {
      toast({ title: 'Erro ao excluir.' })
    }
  }

  if (loading || !campaign) {
    return <div className="p-8 text-center text-slate-500 text-xs">Carregando campanha...</div>
  }

  const failedCount = logs.filter((l) => l.status === 'falhou').length
  const sentCount = logs.filter((l) => l.status === 'enviado').length

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link to="/campanhas">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {campaign.name}
            </h1>
            <p className="text-xs text-slate-500">
              {campaign.expand?.event?.name || 'Mailing (lista)'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <Link to="/relatorio-entregas">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Relatório</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="text-xs gap-1.5 h-8">
            <Link to="/bloqueados">
              <Ban className="w-3.5 h-3.5" />
              <span>Bloqueados</span>
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            className="h-8 w-8"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {failedCount > 0 && (
        <Card className="border-rose-200 bg-rose-50/50 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Diagnóstico de Falhas ({failedCount} {failedCount === 1 ? 'falha' : 'falhas'})
            </CardTitle>
            <CardDescription className="text-xs text-rose-700">
              {sentCount === 0
                ? 'Nenhum e-mail foi entregue. Veja as causas abaixo.'
                : `${sentCount} e-mails entregues, ${failedCount} falharam.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {diagnostic.uniqueErrors.size > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">
                  Mensagens de erro encontradas:
                </p>
                {Array.from(diagnostic.uniqueErrors.entries()).map(([msg, count], idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 p-2 rounded-lg bg-white border border-rose-100"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-slate-800 break-words">{msg}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {count} {count === 1 ? 'ocorrência' : 'ocorrências'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {diagnostic.guidance.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-700">O que fazer:</p>
                <ul className="space-y-1">
                  {diagnostic.guidance.map((g, idx) => (
                    <li key={idx} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                      <span className="text-indigo-500 mt-0.5">→</span>
                      <span>{g}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {diagnostic.isConfigIssue && (
              <Button
                asChild
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 h-8"
              >
                <Link to="/configuracoes">
                  <Settings className="w-3.5 h-3.5" />
                  Ir para Configurações de Domínio
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Configuração do E-mail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-slate-600">Assunto:</span>
                <p className="mt-1 p-2 bg-slate-50 rounded text-slate-800">{campaign.subject}</p>
              </div>
              <div>
                <span className="font-semibold text-slate-600">Corpo:</span>
                <pre className="mt-1 p-2 bg-slate-50 rounded text-slate-800 whitespace-pre-wrap font-sans">
                  {campaign.body_template}
                </pre>
              </div>
              {campaign.sender_name && (
                <p>
                  <span className="font-semibold text-slate-600">Remetente:</span>{' '}
                  {campaign.sender_name} &lt;{campaign.sender_email}&gt;
                </p>
              )}
              {!campaign.sender_email && (
                <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-700">
                  <strong>Atenção:</strong> Nenhum remetente (sender_email) configurado. Defina um
                  e-mail remetente verificado no Resend antes de disparar.
                </div>
              )}
            </CardContent>
          </Card>

          {logs.length > 0 && (
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold">
                  Histórico de Envios ({logs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-xs font-bold">Destinatário</TableHead>
                        <TableHead className="text-xs font-bold">Status</TableHead>
                        <TableHead className="text-xs font-bold">Erro</TableHead>
                        <TableHead className="text-xs font-bold">Enviado em</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <p className="text-xs font-medium text-slate-900">
                              {log.recipient_name || '-'}
                            </p>
                            <p className="text-[11px] text-slate-400">{log.recipient_email}</p>
                          </TableCell>
                          <TableCell>
                            {log.status === 'enviado' ? (
                              <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Enviado
                              </Badge>
                            ) : log.status === 'enviando' ? (
                              <Badge className="bg-slate-100 text-slate-600 text-[10px]">
                                <Clock className="w-3 h-3 mr-1" />
                                Na fila
                              </Badge>
                            ) : (
                              <Badge className="bg-rose-50 text-rose-700 text-[10px]">
                                <XCircle className="w-3 h-3 mr-1" />
                                Falhou
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {log.error_message ? (
                              <p className="text-[10px] text-rose-600 break-words">
                                {log.error_message}
                              </p>
                            ) : (
                              <span className="text-[10px] text-slate-300">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[11px] text-slate-500">
                            {log.sent_at ? new Date(log.sent_at).toLocaleString('pt-BR') : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-white shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-indigo-900">Disparo</CardTitle>
              <CardDescription className="text-xs">
                Envie e-mails para os contatos filtrados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <p className="text-lg font-extrabold text-emerald-700">
                    {campaign.total_sent || 0}
                  </p>
                  <p className="text-[10px] text-emerald-600">Enviados</p>
                </div>
                <div className="p-2 rounded-lg bg-rose-50">
                  <p className="text-lg font-extrabold text-rose-700">
                    {campaign.total_failed || 0}
                  </p>
                  <p className="text-[10px] text-rose-600">Falhas</p>
                </div>
              </div>
              <div className="space-y-1 text-[11px] text-slate-600">
                <p>
                  Filtro RSVP: <strong>{campaign.filter_rsvp || 'todos'}</strong>
                </p>
                <p>
                  Prioridade: <strong>{campaign.filter_priority || 'todas'}</strong>
                </p>
                <p>
                  Categoria: <strong>{campaign.filter_category || 'todas'}</strong>
                </p>
              </div>
              {failedCount > 0 && (
                <p className="text-[10px] text-slate-500 italic">
                  Você pode re-disparar a campanha após corrigir as configurações. Apenas contatos
                  sem e-mail válido ou não filtrados serão ignorados.
                </p>
              )}
              <Button
                onClick={handleSend}
                disabled={sending || retrying || campaign.status === 'enviando'}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-10 gap-2"
              >
                {sending ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    Disparando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {failedCount > 0 ? 'Re-disparar E-mails' : 'Disparar E-mails'}
                  </>
                )}
              </Button>
              {failedCount > 0 && (
                <Button
                  onClick={handleRetryFailures}
                  disabled={retrying || sending || campaign.status === 'enviando'}
                  variant="outline"
                  className="w-full text-xs h-10 gap-2 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  {retrying ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      Reenviando... {Math.max(0, retryTotal - failedCount)} de {retryTotal}
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Reenviar falhas ({failedCount})
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir campanha"
        description="Tem certeza? Todos os logs de envio também serão removidos."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
