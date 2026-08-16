import { useState } from 'react'
import { CheckCircle2, XCircle, Download, FileSpreadsheet } from 'lucide-react'
import { CampaignRecord, EmailLogRecord } from '@/services/campaigns'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { downloadCsv, downloadXlsx, sanitizeFilename } from '@/lib/export-utils'
import { useToast } from '@/hooks/use-toast'

interface ReportDetailDialogProps {
  campaign: CampaignRecord | null
  logs: EmailLogRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReportDetailDialog({
  campaign,
  logs,
  open,
  onOpenChange,
}: ReportDetailDialogProps) {
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)
  const { toast } = useToast()

  if (!campaign) return null

  const handleExport = async (format: 'csv' | 'xlsx') => {
    if (logs.length === 0) {
      toast({ title: 'Nenhum dado encontrado para exportar.' })
      return
    }
    setExporting(format)
    await new Promise((r) => setTimeout(r, 50))
    try {
      const headers = [
        'Nome',
        'E-mail',
        'Status',
        'Data/Hora de Abertura',
        'Data/Hora de Clique',
        'N\u00ba de Cliques',
        'Mensagem de Erro',
      ]
      const rows = logs.map((log) => [
        log.recipient_name || '',
        log.recipient_email,
        log.status === 'enviado' ? 'Enviado' : 'Falhou',
        log.opened_at ? new Date(log.opened_at).toLocaleString('pt-BR') : '',
        log.clicked_at ? new Date(log.clicked_at).toLocaleString('pt-BR') : '',
        log.click_count || 0,
        log.error_message || '',
      ])
      const filename = `relatorio-entregas-${sanitizeFilename(campaign.name)}`
      if (format === 'csv') downloadCsv(filename, headers, rows)
      else downloadXlsx(filename, headers, rows)
      toast({ title: 'Arquivo exportado com sucesso!' })
    } catch {
      toast({ title: 'Erro ao exportar arquivo.' })
    } finally {
      setExporting(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="text-base font-bold">{campaign.name}</DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={exporting !== null}
                onClick={() => handleExport('csv')}
              >
                {exporting === 'csv' ? (
                  <span className="animate-pulse">Gerando...</span>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>CSV</span>
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={exporting !== null}
                onClick={() => handleExport('xlsx')}
              >
                {exporting === 'xlsx' ? (
                  <span className="animate-pulse">Gerando...</span>
                ) : (
                  <>
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">
          {logs.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">
              Nenhum envio registrado para esta campanha.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nome</TableHead>
                  <TableHead className="text-xs">E-mail</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Aberto em</TableHead>
                  <TableHead className="text-xs">Clicado em</TableHead>
                  <TableHead className="text-xs">Nº de Cliques</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs font-medium text-slate-900">
                      {log.recipient_name || '-'}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{log.recipient_email}</TableCell>
                    <TableCell>
                      {log.status === 'enviado' ? (
                        <Badge className="bg-emerald-50 text-emerald-700 text-[10px]">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Enviado
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-50 text-rose-700 text-[10px]">
                          <XCircle className="w-3 h-3 mr-1" />
                          Falhou
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-500">
                      {log.opened_at ? new Date(log.opened_at).toLocaleString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell className="text-[11px] text-slate-500">
                      {log.clicked_at ? new Date(log.clicked_at).toLocaleString('pt-BR') : '-'}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{log.click_count || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
