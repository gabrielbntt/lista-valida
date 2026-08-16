import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Mail, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { extractFieldErrors, type FieldErrors } from '@/lib/errors'
import { SenderEmailInput } from '@/components/SenderEmailInput'

export default function AccountSettings() {
  const { user, updateProfile } = useAuth()
  const { toast } = useToast()
  const [senderName, setSenderName] = useState('')
  const [senderEmail, setSenderEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  useEffect(() => {
    if (user) {
      setSenderName(user.sender_name || '')
      setSenderEmail(user.sender_email || '')
    }
  }, [user])

  const handleSave = async () => {
    setSaving(true)
    setFieldErrors({})
    try {
      const { error } = await updateProfile({
        sender_name: senderName.trim(),
        sender_email: senderEmail.trim(),
      })
      if (error) {
        setFieldErrors(extractFieldErrors(error))
        toast({ title: 'Erro ao salvar configurações.' })
      } else {
        toast({ title: 'Configurações salvas com sucesso!' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto pb-12">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Minha Conta</h1>
        <p className="text-xs text-slate-500">
          Configure suas informações de remetente para campanhas e modelos
        </p>
      </div>

      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Configurações de Envio</CardTitle>
          <CardDescription className="text-xs">
            Estes valores serão usados como padrão ao criar novas campanhas e modelos de e-mail
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <User className="w-3 h-3 text-indigo-500" /> Nome do Remetente
            </Label>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Ex: Equipe Evento"
              className="text-xs h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Mail className="w-3 h-3 text-indigo-500" /> E-mail do Remetente
            </Label>
            <SenderEmailInput value={senderEmail} onChange={setSenderEmail} />
            {fieldErrors.sender_email && (
              <p className="text-[10px] text-red-500">{fieldErrors.sender_email}</p>
            )}
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
          >
            {saving ? 'Salvando...' : 'Salvar Configurações'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold">Informações da Conta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Nome:</span>
            <span className="font-medium text-slate-800">{user?.name || '-'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">E-mail:</span>
            <span className="font-medium text-slate-800">{user?.email || '-'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Perfil:</span>
            <Badge
              variant="secondary"
              className={
                user?.role === 'admin'
                  ? 'bg-indigo-50 text-indigo-700 text-[10px]'
                  : 'bg-slate-100 text-slate-600 text-[10px]'
              }
            >
              {user?.role === 'admin' ? 'Administrador' : 'Usuário'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
