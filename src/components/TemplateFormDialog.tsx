import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus } from 'lucide-react'
import {
  createTemplate,
  updateTemplate,
  TEMPLATE_CATEGORIES,
  type TemplateRecord,
  type TemplateCategory,
} from '@/services/templates'
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
import { Badge } from '@/components/ui/badge'
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

const VARIABLE_TOKENS = ['{nome}', '{empresa}', '{cargo}', '{link_evento}']

const UNSUBSCRIBE_BLOCK = `\n\n---\nCancelamento de recebimento de e-mails\n\nVocê está recebendo este e-mail porque se cadastrou ou participou de um evento nosso. Caso não deseje mais receber nossas comunicações, você pode cancelar o recebimento a qualquer momento, de forma simples e gratuita.\n\nCancelar meu recebimento: {link_descadastro}`

const SAMPLE_VALUES: Record<string, string> = {
  '{nome}': 'Maria Silva',
  '{empresa}': 'Exemplo Ltda',
  '{cargo}': 'Diretora',
  '{link_evento}': 'https://exemplo.com/evento',
}

const CATEGORY_COLORS: Record<string, string> = {
  RSVP: 'bg-rose-50 text-rose-700 border-rose-200',
  'Envio de Certificado': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Convite: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Pitch: 'bg-amber-50 text-amber-700 border-amber-200',
  'Convite para Comunidade Exclusiva': 'bg-purple-50 text-purple-700 border-purple-200',
}

interface TemplateFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editTemplate?: TemplateRecord | null
  onSaved: () => void
}

function renderPreview(text: string): string {
  let result = text
  for (const [token, value] of Object.entries(SAMPLE_VALUES)) {
    result = result.replaceAll(token, value)
  }
  return result
}

function isValidEmail(email: string): boolean {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  editTemplate,
  onSaved,
}: TemplateFormDialogProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('Convite')
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const resetForm = useCallback(() => {
    setName('')
    setCategory('Convite')
    setSenderName('')
    setSenderEmail('')
    setSubject('')
    setBody('')
    setFieldErrors({})
  }, [])

  useEffect(() => {
    if (open) {
      if (editTemplate) {
        setName(editTemplate.name)
        setCategory(editTemplate.category)
        setSenderName(editTemplate.sender_name || '')
        setSenderEmail(editTemplate.sender_email || '')
        setSubject(editTemplate.subject)
        setBody(editTemplate.body_template)
      } else {
        resetForm()
      }
      setFieldErrors({})
    }
  }, [open, editTemplate, resetForm])

  const insertToken = (token: string) => {
    setBody((prev) => prev + token)
  }

  const validate = (): boolean => {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Campo obrigatório'
    if (!subject.trim()) errors.subject = 'Campo obrigatório'
    if (!body.trim()) errors.body_template = 'Campo obrigatório'
    if (senderEmail && !isValidEmail(senderEmail)) errors.sender_email = 'E-mail inválido'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        category,
        sender_name: senderName.trim(),
        sender_email: senderEmail.trim(),
        subject: subject.trim(),
        body_template: body.trim(),
      }
      if (editTemplate) {
        await updateTemplate(editTemplate.id, payload)
        toast({ title: 'Modelo atualizado com sucesso!' })
      } else {
        await createTemplate(payload)
        toast({ title: 'Modelo criado com sucesso!' })
      }
      onOpenChange(false)
      onSaved()
    } catch (err) {
      setFieldErrors(extractFieldErrors(err))
      toast({ title: 'Erro ao salvar modelo.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            {editTemplate ? 'Editar Modelo' : 'Novo Modelo de E-mail'}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 py-2">
          {/* Form */}
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Convite Padrão"
                className="text-xs h-9"
              />
              {fieldErrors.name && <p className="text-[10px] text-red-500">{fieldErrors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Categoria *</Label>
              <Select
                value={category}
                onValueChange={(val) => setCategory(val as TemplateCategory)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">Categorias</SelectLabel>
                    {TEMPLATE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-xs">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Nome do Remetente</Label>
                <Input
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder="Equipe Evento"
                  className="text-xs h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">E-mail do Remetente</Label>
                <SenderEmailInput value={senderEmail} onChange={setSenderEmail} />
                {fieldErrors.sender_email && (
                  <p className="text-[10px] text-red-500">{fieldErrors.sender_email}</p>
                )}
              </div>
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
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Corpo do E-mail *</Label>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="text-xs h-40"
              />
              {fieldErrors.body_template && (
                <p className="text-[10px] text-red-500">{fieldErrors.body_template}</p>
              )}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-slate-400 self-center mr-1">Inserir:</span>
                {VARIABLE_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertToken(token)}
                    className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-mono border border-indigo-200 hover:bg-indigo-100 transition-colors"
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setBody((prev) => prev + UNSUBSCRIBE_BLOCK)}
                className="px-2 py-1 rounded bg-purple-50 text-purple-700 text-[10px] font-medium border border-purple-200 hover:bg-purple-100 transition-colors"
              >
                + Inserir bloco de descadastro (LGPD)
              </button>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-slate-600">Pré-visualização</Label>
              <Badge variant="outline" className={`text-[10px] ${CATEGORY_COLORS[category] || ''}`}>
                {category}
              </Badge>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2 min-h-[200px]">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Assunto
                </p>
                <p className="text-xs font-semibold text-slate-800 mt-0.5">
                  {renderPreview(subject) || '-'}
                </p>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Corpo
                </p>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans mt-0.5">
                  {renderPreview(body) || '-'}
                </pre>
              </div>
              {senderName || senderEmail ? (
                <div className="border-t border-slate-200 pt-2">
                  <p className="text-[10px] text-slate-400">
                    De: {senderName || '-'} {senderEmail ? `<${senderEmail}>` : ''}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : editTemplate ? 'Salvar Alterações' : 'Salvar Modelo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
