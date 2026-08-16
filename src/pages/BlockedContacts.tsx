import { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, Ban, Plus, Trash2 } from 'lucide-react'
import { useEventContext } from '@/contexts/event-context'
import {
  getBlockedContacts,
  deleteBlockedContact,
  BlockedContactRecord,
} from '@/services/blocked-contacts'
import { useRealtime } from '@/hooks/use-realtime'
import { BlockedFormDialog } from '@/components/BlockedFormDialog'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'

const reasonColors: Record<string, string> = {
  Reclamação: 'bg-rose-50 text-rose-700',
  Descadastro: 'bg-indigo-50 text-indigo-700',
  Bounce: 'bg-amber-50 text-amber-700',
  Manual: 'bg-slate-100 text-slate-600',
}

export default function BlockedContacts() {
  const { events } = useEventContext()
  const { toast } = useToast()
  const [blocked, setBlocked] = useState<BlockedContactRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmUnblock, setConfirmUnblock] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const data = await getBlockedContacts()
      setBlocked(data)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])
  useRealtime('blocked_contacts', () => {
    loadData()
  })

  const filtered = useMemo(
    () =>
      blocked.filter((b) => {
        if (search) {
          const q = search.toLowerCase()
          if (!b.email?.toLowerCase().includes(q) && !b.name?.toLowerCase().includes(q))
            return false
        }
        if (reasonFilter !== 'all' && b.reason !== reasonFilter) return false
        if (eventFilter !== 'all' && b.event !== eventFilter) return false
        return true
      }),
    [blocked, search, reasonFilter, eventFilter],
  )

  const handleUnblock = async () => {
    if (!confirmUnblock) return
    try {
      await deleteBlockedContact(confirmUnblock)
      toast({ title: 'Contato desbloqueado.' })
    } catch {
      toast({ title: 'Erro ao desbloquear.' })
    } finally {
      setConfirmUnblock(null)
    }
  }

  const eventName = (id?: string) => events.find((e) => e.id === id)?.name || '-'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Lista de Bloqueados
          </h1>
          <p className="text-xs text-slate-500">{filtered.length} contatos bloqueados</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Adicionar bloqueado</span>
        </Button>
      </div>

      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Buscar nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
            <Select value={reasonFilter} onValueChange={setReasonFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos os motivos
                </SelectItem>
                <SelectItem value="Descadastro" className="text-xs">
                  Descadastro
                </SelectItem>
                <SelectItem value="Reclamação" className="text-xs">
                  Reclamação
                </SelectItem>
                <SelectItem value="Bounce" className="text-xs">
                  Bounce
                </SelectItem>
                <SelectItem value="Manual" className="text-xs">
                  Manual
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={eventFilter} onValueChange={setEventFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos os eventos
                </SelectItem>
                {events.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="text-xs">
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-xs hidden md:block overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-bold">Nome</TableHead>
              <TableHead className="text-xs font-bold">E-mail</TableHead>
              <TableHead className="text-xs font-bold">Evento</TableHead>
              <TableHead className="text-xs font-bold">Motivo</TableHead>
              <TableHead className="text-xs font-bold">Data de bloqueio</TableHead>
              <TableHead className="text-xs font-bold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                  <Ban className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  Nenhum contato bloqueado encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((b) => (
                <TableRow key={b.id} className="hover:bg-slate-50/80">
                  <TableCell className="text-xs font-medium text-slate-900">
                    {b.name || '-'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{b.email}</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {b.expand?.event?.name || eventName(b.event)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={`text-[10px] ${reasonColors[b.reason] || ''}`}
                    >
                      {b.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {b.blocked_at ? new Date(b.blocked_at).toLocaleString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setConfirmUnblock(b.id)}
                      className="h-7 w-7 text-slate-500 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : filtered.length === 0 ? (
          <Card className="p-6 text-center text-xs text-slate-500">Nenhum contato bloqueado.</Card>
        ) : (
          filtered.map((b) => (
            <Card key={b.id} className="p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-xs text-slate-900">{b.name || '-'}</p>
                  <p className="text-[11px] text-slate-500">{b.email}</p>
                </div>
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${reasonColors[b.reason] || ''}`}
                >
                  {b.reason}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">
                {b.expand?.event?.name || eventName(b.event)}
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmUnblock(b.id)}
                className="text-xs text-rose-600 hover:bg-rose-50 h-7 p-0"
              >
                Desbloquear
              </Button>
            </Card>
          ))
        )}
      </div>

      <BlockedFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        events={events}
        onCreated={loadData}
      />
      <ConfirmDialog
        open={!!confirmUnblock}
        onOpenChange={(v) => !v && setConfirmUnblock(null)}
        title="Desbloquear contato"
        description="Tem certeza? O contato poderá receber campanhas novamente."
        confirmText="Desbloquear"
        variant="destructive"
        onConfirm={handleUnblock}
      />
    </div>
  )
}
