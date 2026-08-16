import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search,
  Sparkles,
  Filter,
  CheckSquare,
  Download,
  RefreshCw,
  X,
  ChevronRight,
  Eye,
  Send,
} from 'lucide-react'
import { useEventContext } from '@/contexts/event-context'
import {
  getContacts,
  classifyContact,
  updateContact,
  searchContacts,
  ContactRecord,
  RoleCategory,
  RSVPStatus,
  ClassificationStatus,
  PriorityLevel,
  SearchHit,
} from '@/services/contacts'
import { getTemplates, TemplateRecord } from '@/services/templates'
import { sendBulkEmail } from '@/services/campaigns'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'

export default function Contacts() {
  const { selectedEvent } = useEventContext()
  const [searchParams] = useSearchParams()
  const [contacts, setContacts] = useState<ContactRecord[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  // Standard Filters
  const [textSearch, setTextSearch] = useState('')
  const [rsvpFilter, setRsvpFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')

  // Smart Semantic Search
  const [smartSearch, setSmartSearch] = useState('')
  const [smartHits, setSmartHits] = useState<SearchHit[] | null>(null)
  const [searchingSmart, setSearchingSmart] = useState(false)

  // Selection & Bulk Actions
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [classifyingBatch, setClassifyingBatch] = useState(false)

  // Bulk Email Send
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [sendingBulkEmail, setSendingBulkEmail] = useState(false)

  const loadData = useCallback(async () => {
    if (!selectedEvent?.id) {
      setContacts([])
      setLoading(false)
      return
    }
    try {
      const data = await getContacts(selectedEvent.id)
      setContacts(data)
    } catch (err) {
      console.error('Erro ao buscar contatos:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedEvent?.id])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtime('mailing_contacts', () => {
    loadData()
  })

  // Handle Smart Search Submit
  const handleSmartSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smartSearch.trim()) {
      setSmartHits(null)
      return
    }
    setSearchingSmart(true)
    try {
      const res = await searchContacts(smartSearch, selectedEvent?.id)
      setSmartHits(res.items || [])
    } catch (err) {
      toast({ title: 'Erro na busca semântica', description: 'Não foi possível buscar.' })
    } finally {
      setSearchingSmart(false)
    }
  }

  const handleClearSmartSearch = () => {
    setSmartSearch('')
    setSmartHits(null)
  }

  // Filter Logic
  const filteredContacts = useMemo(() => {
    if (smartHits !== null) {
      const hitIds = new Set(smartHits.map((h) => h.id))
      return contacts.filter((c) => hitIds.has(c.id))
    }

    return contacts.filter((c) => {
      if (textSearch) {
        const q = textSearch.toLowerCase()
        const matchName = c.name?.toLowerCase().includes(q)
        const matchEmail = c.email?.toLowerCase().includes(q)
        const matchCompany = c.company?.toLowerCase().includes(q)
        const matchRole = c.raw_role?.toLowerCase().includes(q)
        if (!matchName && !matchEmail && !matchCompany && !matchRole) return false
      }
      if (rsvpFilter !== 'all' && c.rsvp !== rsvpFilter) return false
      if (statusFilter !== 'all' && c.classification_status !== statusFilter) return false
      if (categoryFilter !== 'all' && c.role_category !== categoryFilter) return false
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false

      return true
    })
  }, [contacts, textSearch, rsvpFilter, statusFilter, categoryFilter, priorityFilter, smartHits])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredContacts.map((c) => c.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  // Bulk Classification
  const handleBulkClassify = async () => {
    if (selectedIds.length === 0) return
    setClassifyingBatch(true)
    let success = 0
    for (const id of selectedIds) {
      try {
        await classifyContact(id)
        success++
      } catch (err) {
        console.error('Erro na classificação em lote:', id, err)
      }
    }
    setClassifyingBatch(false)
    toast({ title: 'Classificação concluída', description: `${success} contatos qualificados!` })
    setSelectedIds([])
    loadData()
  }

  // Bulk Mark Reviewed
  const handleBulkMarkReviewed = async () => {
    for (const id of selectedIds) {
      await updateContact(id, { classification_status: 'Revisado' })
    }
    toast({
      title: 'Status atualizado',
      description: `${selectedIds.length} contatos marcados como Revisados.`,
    })
    setSelectedIds([])
    loadData()
  }

  // Bulk Email Send
  const openSendDialog = async () => {
    setSelectedTemplateId('')
    setSendDialogOpen(true)
    try {
      setTemplates(await getTemplates())
    } catch {
      toast({ title: 'Erro ao carregar modelos de e-mail' })
    }
  }

  const handleSendBulkEmail = async () => {
    if (!selectedEvent?.id || !selectedTemplateId || selectedIds.length === 0) return
    setSendingBulkEmail(true)
    try {
      const result = await sendBulkEmail(selectedIds, selectedTemplateId, selectedEvent.id)
      toast({
        title: 'Envio iniciado!',
        description: `${result.queued} e-mails na fila de envio${result.ignored_blocked ? ` (${result.ignored_blocked} bloqueados)` : ''}.`,
      })
      setSendDialogOpen(false)
      setSelectedIds([])
    } catch (err) {
      toast({ title: 'Erro ao enviar e-mails', description: (err as Error).message })
    } finally {
      setSendingBulkEmail(false)
    }
  }

  // Bulk Export CSV
  const handleExportCSV = () => {
    const listToExport =
      selectedIds.length > 0 ? contacts.filter((c) => selectedIds.includes(c.id)) : filteredContacts
    if (listToExport.length === 0) return

    const headers = [
      'Nome',
      'Email',
      'Telefone',
      'Empresa',
      'Cargo',
      'RSVP',
      'Diploma',
      'Categoria',
      'Prioridade',
      'Status',
    ]
    const rows = listToExport.map((c) => [
      `"${c.name || ''}"`,
      `"${c.email || ''}"`,
      `"${c.phone || ''}"`,
      `"${c.company || ''}"`,
      `"${c.raw_role || ''}"`,
      `"${c.rsvp || ''}"`,
      `"${c.has_degree || ''}"`,
      `"${c.role_category || ''}"`,
      `"${c.priority || ''}"`,
      `"${c.classification_status || ''}"`,
    ])

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(';'), ...rows.map((e) => e.join(';'))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `mailing_export_${new Date().toISOString().substring(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const clearAllFilters = () => {
    setTextSearch('')
    setRsvpFilter('all')
    setStatusFilter('all')
    setCategoryFilter('all')
    setPriorityFilter('all')
    setSmartSearch('')
    setSmartHits(null)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Base de Contatos do Mailing
          </h1>
          <p className="text-xs text-slate-500">
            {filteredContacts.length} de {contacts.length} participantes listados
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="text-xs gap-1.5 self-start">
          <Link to="/importar">
            <span>Importar novos</span>
          </Link>
        </Button>
      </div>

      {/* Smart Semantic Search Card */}
      <Card className="border-indigo-100 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/50 shadow-xs">
        <CardContent className="p-4">
          <form
            onSubmit={handleSmartSearch}
            className="flex flex-col sm:flex-row items-center gap-3"
          >
            <div className="flex items-center gap-2 text-indigo-700 font-semibold text-xs shrink-0">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Busca IA Semântica:</span>
            </div>
            <div className="relative flex-1 w-full">
              <Input
                placeholder='Ex: "gerentes de RH interessados em liderança e clima"'
                value={smartSearch}
                onChange={(e) => setSmartSearch(e.target.value)}
                className="text-xs h-9 bg-white border-indigo-200 focus:ring-indigo-500 pr-8"
              />
              {smartSearch && (
                <button
                  type="button"
                  onClick={handleClearSmartSearch}
                  className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={searchingSmart}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4 shrink-0 w-full sm:w-auto"
            >
              {searchingSmart ? 'Buscando...' : 'Buscar IA'}
            </Button>
          </form>
          {smartHits !== null && (
            <div className="mt-2 text-xs text-indigo-800 flex items-center justify-between bg-indigo-100/60 p-2 rounded-md">
              <span>
                Resultado semântico: {smartHits.length} contatos com maior relevância encontrados
              </span>
              <button onClick={handleClearSmartSearch} className="font-semibold underline">
                Limpar busca semântica
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Standard Filter Bar */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Text Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <Input
                placeholder="Buscar nome, e-mail, cargo..."
                value={textSearch}
                onChange={(e) => setTextSearch(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>

            {/* RSVP */}
            <Select value={rsvpFilter} onValueChange={setRsvpFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="RSVP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos RSVP
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

            {/* Status */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Status IA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todos Status
                </SelectItem>
                <SelectItem value="Pendente" className="text-xs">
                  Pendente
                </SelectItem>
                <SelectItem value="Classificado" className="text-xs">
                  Classificado
                </SelectItem>
                <SelectItem value="Revisado" className="text-xs">
                  Revisado
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Seniority Category */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Categoria Cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todas Categorias
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
              </SelectContent>
            </Select>

            {/* Priority */}
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  Todas Prioridades
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

          {(textSearch ||
            rsvpFilter !== 'all' ||
            statusFilter !== 'all' ||
            categoryFilter !== 'all' ||
            priorityFilter !== 'all') && (
            <div className="flex justify-end pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Limpar todos os filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Action Bar */}
      {selectedIds.length > 0 && (
        <div className="bg-slate-900 text-white p-3 px-5 rounded-lg flex flex-wrap items-center justify-between gap-3 shadow-md animate-slide-down">
          <span className="text-xs font-semibold">{selectedIds.length} contatos selecionados</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleBulkClassify}
              disabled={classifyingBatch}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{classifyingBatch ? 'Classificando...' : 'Classificar com IA'}</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkMarkReviewed}
              className="text-xs h-8 text-slate-200 border-slate-700 bg-slate-800 hover:bg-slate-700"
            >
              Marcar como revisado
            </Button>
            <Button
              size="sm"
              onClick={openSendDialog}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar e-mail para todos</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
              className="text-xs h-8 text-slate-200 border-slate-700 bg-slate-800 hover:bg-slate-700 gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedIds([])}
              className="text-xs h-8 text-slate-400 hover:text-white"
            >
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {/* Desktop Table View */}
      <Card className="border-slate-200 shadow-xs hidden md:block overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-10 text-center">
                <Checkbox
                  checked={selectedIds.length > 0 && selectedIds.length === filteredContacts.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="text-xs font-bold">Participante</TableHead>
              <TableHead className="text-xs font-bold">Empresa & Cargo</TableHead>
              <TableHead className="text-xs font-bold">Cidade</TableHead>
              <TableHead className="text-xs font-bold">Categoria</TableHead>
              <TableHead className="text-xs font-bold">RSVP</TableHead>
              <TableHead className="text-xs font-bold">Diploma</TableHead>
              <TableHead className="text-xs font-bold">Prioridade</TableHead>
              <TableHead className="text-xs font-bold">Status IA</TableHead>
              <TableHead className="text-xs font-bold text-right">Ação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-4" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-12" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-10 ml-auto" />
                  </TableCell>
                </TableRow>
              ))
            ) : filteredContacts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-xs text-slate-500">
                  Nenhum contato encontrado com os filtros selecionados.
                </TableCell>
              </TableRow>
            ) : (
              filteredContacts.map((contact) => (
                <TableRow key={contact.id} className="hover:bg-slate-50/80 transition-colors">
                  <TableCell className="text-center">
                    <Checkbox
                      checked={selectedIds.includes(contact.id)}
                      onCheckedChange={() => handleToggleSelect(contact.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center justify-center shrink-0">
                        {contact.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <Link
                          to={`/contatos/${contact.id}`}
                          className="font-bold text-xs text-slate-900 hover:text-indigo-600 block"
                        >
                          {contact.name}
                        </Link>
                        <span className="text-[11px] text-slate-400 block">{contact.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-xs font-medium text-slate-800">{contact.company || '-'}</p>
                    <span className="text-[11px] text-slate-500">{contact.raw_role || '-'}</span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{contact.city || '-'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] bg-slate-50">
                      {contact.role_category || 'Não definido'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        contact.rsvp === 'Confirmou'
                          ? 'bg-emerald-50 text-emerald-700 font-medium'
                          : contact.rsvp === 'Recusou'
                            ? 'bg-rose-50 text-rose-700 font-medium'
                            : 'bg-amber-50 text-amber-700 font-medium'
                      }
                    >
                      {contact.rsvp || 'Aguardando'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {contact.has_degree === 'Sim'
                      ? 'Sim'
                      : contact.has_degree === 'Não'
                        ? 'Não'
                        : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        contact.priority === 'Alta'
                          ? 'border-rose-200 text-rose-700 bg-rose-50/40'
                          : contact.priority === 'Média'
                            ? 'border-amber-200 text-amber-700 bg-amber-50/40'
                            : 'border-emerald-200 text-emerald-700 bg-emerald-50/40'
                      }
                    >
                      {contact.priority || 'Média'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        contact.classification_status === 'Classificado'
                          ? 'bg-indigo-50 text-indigo-700 font-semibold'
                          : contact.classification_status === 'Revisado'
                            ? 'bg-sky-50 text-sky-700 font-semibold'
                            : 'bg-slate-100 text-slate-600'
                      }
                    >
                      {contact.classification_status || 'Pendente'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-500 hover:text-indigo-600"
                    >
                      <Link to={`/contatos/${contact.id}`}>
                        <Eye className="w-4 h-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile Card List View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-16 w-full" />
            </Card>
          ))
        ) : filteredContacts.length === 0 ? (
          <Card className="p-6 text-center text-xs text-slate-500">Nenhum contato encontrado.</Card>
        ) : (
          filteredContacts.map((contact) => (
            <Card key={contact.id} className="p-4 space-y-3 border-slate-200 shadow-xs">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">
                    {contact.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <Link
                      to={`/contatos/${contact.id}`}
                      className="font-bold text-xs text-slate-900 block"
                    >
                      {contact.name}
                    </Link>
                    <span className="text-[11px] text-slate-500">
                      {contact.company || 'Sem empresa'}
                    </span>
                  </div>
                </div>
                <Button asChild size="icon" variant="ghost" className="h-7 w-7">
                  <Link to={`/contatos/${contact.id}`}>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <Badge variant="secondary">{contact.rsvp || 'Aguardando'}</Badge>
                <Badge variant="outline">{contact.role_category || 'Sem Categoria'}</Badge>
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">
                  {contact.classification_status || 'Pendente'}
                </Badge>
              </div>
            </Card>
          ))
        )}
      </div>

      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Enviar e-mail</DialogTitle>
            <DialogDescription className="text-xs">
              Escolha o modelo a ser enviado para os {selectedIds.length} contatos selecionados.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um modelo" />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <SelectItem value="none" disabled className="text-xs">
                    Nenhum modelo cadastrado
                  </SelectItem>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSendDialogOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSendBulkEmail}
              disabled={!selectedTemplateId || sendingBulkEmail}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              {sendingBulkEmail ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
