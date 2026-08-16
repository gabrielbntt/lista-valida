import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, Plus, Search, Upload, Trash2, Pencil, Users } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  type EventRecord,
} from '@/services/events'
import { useRealtime } from '@/hooks/use-realtime'
import { useEventContext } from '@/contexts/event-context'
import { extractFieldErrors, getErrorMessage, type FieldErrors } from '@/lib/errors'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

const fmtDate = (d?: string) => {
  if (!d) return null
  try {
    return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return null
  }
}

export default function Events() {
  const { refreshEvents } = useEventContext()
  const { toast } = useToast()
  const [events, setEvents] = useState<EventRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<EventRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EventRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  const loadData = useCallback(async () => {
    try {
      setEvents(await getEvents())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtime('events', () => {
    loadData()
  })

  const filtered = events.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.description || '').toLowerCase().includes(search.toLowerCase()),
  )

  const openCreate = () => {
    setEditTarget(null)
    setName('')
    setDate('')
    setDescription('')
    setFieldErrors({})
    setDialogOpen(true)
  }

  const openEdit = (evt: EventRecord) => {
    setEditTarget(evt)
    setName(evt.name)
    setDate(evt.event_date || '')
    setDescription(evt.description || '')
    setFieldErrors({})
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const errors: FieldErrors = {}
    if (!name.trim()) errors.name = 'Campo obrigatório'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        event_date: date || undefined,
        description: description.trim() || undefined,
      }
      if (editTarget) {
        await updateEvent(editTarget.id, payload)
        toast({ title: 'Mailing atualizado!' })
      } else {
        await createEvent(payload)
        toast({ title: 'Mailing criado com sucesso!' })
      }
      await loadData()
      await refreshEvents()
      setDialogOpen(false)
    } catch (err) {
      setFieldErrors(extractFieldErrors(err))
      toast({ title: 'Erro ao salvar mailing.', description: getErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteEvent(deleteTarget.id)
      await loadData()
      await refreshEvents()
      toast({ title: 'Mailing excluído.' })
    } catch {
      toast({ title: 'Erro ao excluir mailing.' })
    } finally {
      setDeleteTarget(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Mailing (listas)
          </h1>
          <p className="text-xs text-slate-500">{events.length} listas de mailing cadastradas</p>
        </div>
        <Button
          onClick={openCreate}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5 self-start"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Novo Mailing</span>
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar mailing..."
          className="pl-9 h-9 text-xs"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center p-12 border-dashed border-2 border-slate-200">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-slate-700">
            {search ? 'Nenhum mailing encontrado' : 'Nenhum mailing cadastrado'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {search ? 'Tente outra busca.' : 'Crie seu primeiro mailing ou importe contatos.'}
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button
              onClick={openCreate}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Novo Mailing
            </Button>
            <Button asChild variant="outline" size="sm" className="text-xs gap-1.5">
              <Link to="/importar">
                <Upload className="w-3.5 h-3.5" /> Importar contatos
              </Link>
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((evt) => (
            <Card
              key={evt.id}
              className="border-slate-200 shadow-xs hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(evt)}
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setDeleteTarget(evt)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-500" />
                    </Button>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{evt.name}</h3>
                  {fmtDate(evt.event_date) && (
                    <p className="text-xs text-slate-500 mt-0.5">{fmtDate(evt.event_date)}</p>
                  )}
                  {evt.description && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{evt.description}</p>
                  )}
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 h-8 flex-1"
                  >
                    <Link to={`/contatos?evento=${evt.id}`}>
                      <Users className="w-3.5 h-3.5" /> Contatos
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5 h-8 flex-1"
                  >
                    <Link to="/importar">
                      <Upload className="w-3.5 h-3.5" /> Importar
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editTarget ? 'Editar Mailing' : 'Criar Novo Mailing'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Convenção Anual 2026"
                className="text-xs h-9"
              />
              {fieldErrors.name && <p className="text-[10px] text-red-500">{fieldErrors.name}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Data do Evento</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição opcional..."
                className="text-xs h-20"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              {saving ? 'Salvando...' : editTarget ? 'Salvar' : 'Criar Mailing'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Excluir Mailing</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-600 py-2">
            Tem certeza que deseja excluir "<strong>{deleteTarget?.name}</strong>"? Todos os
            contatos e campanhas associados também serão removidos.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
