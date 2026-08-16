import { useState, useEffect, useCallback } from 'react'
import { Mail, FileText } from 'lucide-react'
import { createCampaign } from '@/services/campaigns'
import { getTemplates, TEMPLATE_CATEGORIES, type TemplateRecord } from '@/services/templates'
import { extractFieldErrors, type FieldErrors } from '@/lib/errors'
import { SenderEmailInput } from '@/components/SenderEmailInput'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

interface CampaignFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: string
  onCreated: () => void
}

function isValidEmail(email: string): boolean {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function CampaignFormDialog({
  open,
  onOpenChange,
  eventId,
  onCreated,
}: CampaignFormDialogProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [filterRsvp, setFilterRsvp] = useState('todos')
  const [filterPriority, setFilterPriority] = useState('todas')
  const [filterCategory, setFilterCategory] = useState('todas')
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [selectedTemplate, setSelectedTemplate] = useState<string>('none')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const loadTemplates = useCallback(async () => {
    try {
      const data = await getTemplates()
      setTemplates(data)
    } catch {
      /* noop */
    }
  }, [])

  useEffect(() => {
    if (open) loadTemplates()
  }, [open, loadTemplates])

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId)
    if (templateId === 'none') return
    const tmpl = templates.find((t) => t.id === templateId)
    if (!tmpl) return
    if (tmpl.sender_name) setSenderName(tmpl.sender_name)
    if (tmpl.sender_email) setSenderEmail(tmpl.sender_email)
    if (tmpl.subject) setSubject(tmpl.subject)
    if (tmpl.body_template) setBody(tmpl.body_template)
  }

  const handleCreate = async () => {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Campo obrigatório'
    if (!subject.trim()) errors.subject = 'Campo obrigatório'
    if (!body.trim()) errors.body_template = 'Campo obrigatório'
    if (senderEmail && !isValidEmail(senderEmail)) errors.sender_email = 'E-mail inválido'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    try {
      await createCampaign({
        name: name.trim(),
        event: eventId,
        subject: subject.trim(),
        body_template: body.trim(),
        sender_name: senderName.trim(),
        sender_email: senderEmail.trim(),
        status: 'rascunho',
        filter_rsvp: filterRsvp,
        filter_priority: filterPriority,
        filter_category: filterCategory,
        total_sent: 0,
        total_failed: 0,
      })
      toast({ title: 'Campanha criada com sucesso!' })
      setName('')
      setSubject('Convite especial: {nome}, sua presença no nosso evento')
      setBody(
        'Olá {nome},\n\n{mensagem_ia}\n\nConfirme sua presença!\n\nAbraços\n\n---\nCancelamento de recebimento de e-mails\n\nVocê está recebendo este e-mail porque se cadastrou ou participou de um evento nosso. Caso não deseje mais receber nossas comunicações, você pode cancelar o recebimento a qualquer momento, de forma simples e gratuita.\n\nCancelar meu recebimento: {link_descadastro}',
      )
      setSenderName('')
      setSenderEmail('')
      setSelectedTemplate('none')
      setFieldErrors({})
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setFieldErrors(extractFieldErrors(err))
      toast({ title: 'Erro ao criar campanha.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Mail className="w-4 h-4 text-indigo-600" />
            Nova Campanha de E-mail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {/* Template Selector */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <FileText className="w-3 h-3 text-indigo-500" />
              Modelo de E-mail
            </Label>
            <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um modelo (opcional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  - Sem modelo -
                </SelectItem>
                {TEMPLATE_CATEGORIES.map((cat) => {
                  const catTemplates = templates.filter((t) => t.category === cat)
                  if (catTemplates.length === 0) return null
                  return (
                    <SelectGroup key={cat}>
                      <SelectLabel className="text-[10px] font-bold uppercase">{cat}</SelectLabel>
                      {catTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id} className="text-xs">
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )
                })}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-slate-400">
              Selecione um modelo para preencher automaticamente os campos abaixo.
            </p>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome da Campanha *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Convite Lote 1"
              className="text-xs h-9"
            />
            {fieldErrors.name && <p className="text-[10px] text-red-500">{fieldErrors.name}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Assunto *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="text-xs h-9"
            />
            {fieldErrors.subject && (
              <p className="text-[10px] text-red-500">{fieldErrors.subject}</p>
            )}
            <p className="text-[10px] text-slate-400">
              Variáveis: {'{nome}'}, {'{empresa}'}, {'{cargo}'}
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Corpo do E-mail *</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="text-xs h-32"
            />
            {fieldErrors.body_template && (
              <p className="text-[10px] text-red-500">{fieldErrors.body_template}</p>
            )}
            <p className="text-[10px] text-slate-400">
              Variáveis: {'{nome}'}, {'{empresa}'}, {'{cargo}'}, {'{mensagem_ia}'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Remetente (Nome)</Label>
              <Input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="Equipe Evento"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Remetente (E-mail)</Label>
              <SenderEmailInput value={senderEmail} onChange={setSenderEmail} />
              {fieldErrors.sender_email && (
                <p className="text-[10px] text-red-500">{fieldErrors.sender_email}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Filtro RSVP</Label>
              <Select value={filterRsvp} onValueChange={setFilterRsvp}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs">
                    Todos
                  </SelectItem>
                  <SelectItem value="Confirmou" className="text-xs">
                    Confirmou
                  </SelectItem>
                  <SelectItem value="Aguardando" className="text-xs">
                    Aguardando
                  </SelectItem>
                  <SelectItem value="Recusou" className="text-xs">
                    Recusou
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Prioridade</Label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas" className="text-xs">
                    Todas
                  </SelectItem>
                  <SelectItem value="Alta" className="text-xs">
                    Alta
                  </SelectItem>
                  <SelectItem value="Média" className="text-xs">
                    Média
                  </SelectItem>
                  <SelectItem value="Baixa" className="text-xs">
                    Baixa
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Categoria</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas" className="text-xs">
                    Todas
                  </SelectItem>
                  <SelectItem value="C-Level" className="text-xs">
                    C-Level
                  </SelectItem>
                  <SelectItem value="Diretoria" className="text-xs">
                    Diretoria
                  </SelectItem>
                  <SelectItem value="Gerência" className="text-xs">
                    Gerência
                  </SelectItem>
                  <SelectItem value="Coordenação" className="text-xs">
                    Coordenação
                  </SelectItem>
                  <SelectItem value="Analista" className="text-xs">
                    Analista
                  </SelectItem>
                  <SelectItem value="Assistente/Auxiliar" className="text-xs">
                    Assistente/Auxiliar
                  </SelectItem>
                  <SelectItem value="Estagiário" className="text-xs">
                    Estagiário
                  </SelectItem>
                  <SelectItem value="Consultor/Autônomo" className="text-xs">
                    Consultor/Autônomo
                  </SelectItem>
                  <SelectItem value="Outro" className="text-xs">
                    Outro
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            {saving ? 'Criando...' : 'Criar Campanha'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
