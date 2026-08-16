import { useState } from 'react'
import { Ban } from 'lucide-react'
import { createBlockedContact } from '@/services/blocked-contacts'
import { type EventRecord } from '@/services/events'
import { extractFieldErrors, type FieldErrors } from '@/lib/errors'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

interface BlockedFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  events: EventRecord[]
  onCreated: () => void
}

export function BlockedFormDialog({
  open,
  onOpenChange,
  events,
  onCreated,
}: BlockedFormDialogProps) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [eventId, setEventId] = useState('none')
  const [notes, setNotes] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const handleSave = async () => {
    const errors: FieldErrors = {}
    if (!email.trim()) errors.email = 'E-mail é obrigatório'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'E-mail inválido'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    try {
      await createBlockedContact({
        name: name.trim() || undefined,
        email: email.trim(),
        event: eventId !== 'none' ? eventId : undefined,
        notes: notes.trim() || undefined,
      })
      toast({ title: 'Contato bloqueado com sucesso!' })
      setName('')
      setEmail('')
      setEventId('none')
      setNotes('')
      setFieldErrors({})
      onOpenChange(false)
      onCreated()
    } catch (err) {
      const fe = extractFieldErrors(err)
      setFieldErrors(fe)
      if (fe.email) toast({ title: 'Erro', description: fe.email })
      else toast({ title: 'Erro ao bloquear contato.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <Ban className="w-4 h-4 text-indigo-600" /> Adicionar à lista de bloqueados
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do contato"
              className="text-xs h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">E-mail *</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="text-xs h-9"
            />
            {fieldErrors.email && <p className="text-[10px] text-red-500">{fieldErrors.email}</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Evento (opcional)</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">
                  - Nenhum -
                </SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo ou observações..."
              className="text-xs h-16"
            />
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
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            {saving ? 'Bloqueando...' : 'Bloquear contato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
