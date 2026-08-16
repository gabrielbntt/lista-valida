import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Sparkles,
  Trash2,
  Save,
  Building2,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Target,
  MessageSquare,
  Star,
} from 'lucide-react'
import {
  getContact,
  updateContact,
  classifyContact,
  deleteContact,
  ContactRecord,
} from '@/services/contacts'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [contact, setContact] = useState<ContactRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [classifying, setClassifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notes, setNotes] = useState('')

  const loadData = useCallback(async () => {
    if (!id) return
    try {
      const data = await getContact(id)
      setContact(data)
      setNotes(data.notes || '')
    } catch {
      toast({ title: 'Erro ao carregar contato' })
      navigate('/contatos')
    } finally {
      setLoading(false)
    }
  }, [id, navigate, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  useRealtime('mailing_contacts', () => {
    if (id) loadData()
  })

  const handleClassify = async () => {
    if (!id) return
    setClassifying(true)
    try {
      await classifyContact(id)
      toast({ title: 'Contato classificado com IA!' })
      loadData()
    } catch {
      toast({ title: 'Erro na classificação' })
    } finally {
      setClassifying(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!id) return
    setSaving(true)
    try {
      await updateContact(id, { notes })
      toast({ title: 'Notas salvas!' })
      loadData()
    } catch {
      toast({ title: 'Erro ao salvar' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!id) return
    try {
      await deleteContact(id)
      toast({ title: 'Contato excluído.' })
      navigate('/contatos')
    } catch {
      toast({ title: 'Erro ao excluir.' })
    }
  }

  if (loading || !contact) {
    return <div className="p-8 text-center text-slate-500 text-xs">Carregando contato...</div>
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto pb-12">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="h-8 w-8">
            <Link to="/contatos">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{contact.name}</h1>
            <p className="text-xs text-slate-500">
              {contact.expand?.event?.name || 'Mailing (lista)'}
            </p>
          </div>
        </div>
        <Button
          variant="destructive"
          size="icon"
          onClick={() => setConfirmDelete(true)}
          className="h-8 w-8"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold">Informações do Contato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center gap-2">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-700">{contact.email}</span>
            </div>
            {contact.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-700">{contact.phone}</span>
              </div>
            )}
            {contact.company && (
              <div className="flex items-center gap-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-700">{contact.company}</span>
              </div>
            )}
            {contact.city && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-700">{contact.city}</span>
              </div>
            )}
            {contact.raw_role && (
              <div className="flex items-center gap-2">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-700">{contact.raw_role}</span>
              </div>
            )}
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="secondary"
                className={
                  contact.rsvp === 'Confirmou'
                    ? 'bg-emerald-50 text-emerald-700'
                    : contact.rsvp === 'Recusou'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-amber-50 text-amber-700'
                }
              >
                {contact.rsvp || 'Aguardando'}
              </Badge>
              <Badge variant="outline">
                {contact.has_degree === 'Sim' ? 'Com diploma' : 'Sem diploma'}
              </Badge>
              <Badge variant="outline" className="bg-slate-50">
                {contact.role_category || 'Sem categoria'}
              </Badge>
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
            </div>
          </CardContent>
        </Card>

        <Card className="border-indigo-100 shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold text-indigo-900">Classificação IA</CardTitle>
            <Button
              size="sm"
              onClick={handleClassify}
              disabled={classifying}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-7 gap-1.5"
            >
              <Sparkles className="w-3 h-3" />
              {classifying ? 'Classificando...' : 'Classificar'}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {contact.profile_summary && (
              <div>
                <p className="font-semibold text-slate-600 mb-1">Resumo do Perfil</p>
                <p className="text-slate-700 leading-relaxed">{contact.profile_summary}</p>
              </div>
            )}
            {contact.interests && contact.interests.length > 0 && (
              <div>
                <p className="font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Target className="w-3 h-3" /> Interesses
                </p>
                <div className="flex flex-wrap gap-1">
                  {contact.interests.map((item, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="bg-indigo-50 text-indigo-700 text-[10px]"
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {contact.demands && contact.demands.length > 0 && (
              <div>
                <p className="font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <Star className="w-3 h-3" /> Demandas
                </p>
                <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                  {contact.demands.map((d, idx) => (
                    <li key={idx}>{d}</li>
                  ))}
                </ul>
              </div>
            )}
            {contact.suggested_message && (
              <div>
                <p className="font-semibold text-slate-600 mb-1 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Mensagem Sugerida
                </p>
                <p className="text-slate-700 italic bg-slate-50 p-2 rounded">
                  {contact.suggested_message}
                </p>
              </div>
            )}
            {!contact.profile_summary &&
              !contact.interests?.length &&
              !contact.demands?.length &&
              !contact.suggested_message && (
                <p className="text-slate-400 text-center py-4">
                  Nenhuma classificação gerada ainda. Clique em "Classificar" para iniciar.
                </p>
              )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Notas Internas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione observações sobre este contato..."
            className="text-xs h-24"
          />
          <Button
            size="sm"
            onClick={handleSaveNotes}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Salvando...' : 'Salvar Notas'}
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir contato"
        description="Tem certeza? Esta ação não pode ser desfeita."
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  )
}
