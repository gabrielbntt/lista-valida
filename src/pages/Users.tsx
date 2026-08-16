import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Search, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getUsers, createUser, updateUserRole, UserRecord } from '@/services/users'
import { useRealtime } from '@/hooks/use-realtime'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useToast } from '@/hooks/use-toast'

export default function Users() {
  const { user: currentUser, isAdmin } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [roleChange, setRoleChange] = useState<{ user: UserRecord; newRole: string } | null>(null)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [creating, setCreating] = useState(false)
  const [changingRole, setChangingRole] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const data = await getUsers()
      setUsers(data)
    } catch {
      toast({ title: 'Erro ao carregar usuários' })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/dashboard')
      return
    }
    loadData()
  }, [isAdmin, navigate, loadData])

  useRealtime('profiles', () => loadData(), isAdmin)

  const filteredUsers = useMemo(() => {
    if (!search) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) => (u.name || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    )
  }, [users, search])

  const adminCount = users.filter((u) => u.role === 'admin').length

  const handleCreate = async () => {
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 8) {
      toast({ title: 'Preencha todos os campos. Senha mínima: 8 caracteres.' })
      return
    }
    setCreating(true)
    try {
      await createUser({
        name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        role: newRole,
      })
      toast({ title: 'Usuário criado com sucesso!' })
      setNewName('')
      setNewEmail('')
      setNewPassword('')
      setNewRole('user')
      setCreateOpen(false)
      loadData()
    } catch {
      toast({ title: 'Erro ao criar usuário. E-mail já cadastrado?' })
    } finally {
      setCreating(false)
    }
  }

  const handleRoleChange = async () => {
    if (!roleChange) return
    if (
      roleChange.user.id === currentUser?.id &&
      roleChange.newRole === 'user' &&
      adminCount <= 1
    ) {
      toast({
        title: 'Operação bloqueada',
        description: 'Você é o último administrador e não pode remover seu próprio acesso.',
      })
      setRoleChange(null)
      return
    }
    setChangingRole(true)
    try {
      await updateUserRole(roleChange.user.id, roleChange.newRole as 'admin' | 'user')
      toast({ title: 'Perfil atualizado com sucesso!' })
      setRoleChange(null)
      loadData()
    } catch {
      toast({ title: 'Erro ao atualizar perfil.' })
    } finally {
      setChangingRole(false)
    }
  }

  if (!isAdmin) return null

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Usuários</h1>
          <p className="text-xs text-slate-500">
            {users.length} usuários cadastrados • {adminCount} administrador(es)
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          size="sm"
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Novo Usuário</span>
        </Button>
      </div>

      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-xs overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-xs font-bold">Nome</TableHead>
              <TableHead className="text-xs font-bold">E-mail</TableHead>
              <TableHead className="text-xs font-bold">Perfil</TableHead>
              <TableHead className="text-xs font-bold">Criado em</TableHead>
              <TableHead className="text-xs font-bold text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-xs text-slate-500">
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50/80">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px] flex items-center justify-center">
                        {(u.name || u.email).substring(0, 2).toUpperCase()}
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        {u.name || 'Sem nome'}
                        {u.id === currentUser?.id && (
                          <span className="ml-1.5 text-[10px] text-indigo-500">(você)</span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{u.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        u.role === 'admin'
                          ? 'bg-indigo-50 text-indigo-700 text-[10px]'
                          : 'bg-slate-100 text-slate-600 text-[10px]'
                      }
                    >
                      {u.role === 'admin' ? (
                        <>
                          <ShieldCheck className="w-3 h-3 mr-1" /> Admin
                        </>
                      ) : (
                        <>
                          <UserIcon className="w-3 h-3 mr-1" /> Usuário
                        </>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {u.created ? new Date(u.created).toLocaleDateString('pt-BR') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Select
                      value={u.role}
                      onValueChange={(val) => setRoleChange({ user: u, newRole: val })}
                      disabled={changingRole}
                    >
                      <SelectTrigger className="h-7 text-[10px] w-28 ml-auto">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" className="text-xs">
                          Administrador
                        </SelectItem>
                        <SelectItem value="user" className="text-xs">
                          Usuário
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Criar Novo Usuário</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Nome *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome completo"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">E-mail *</Label>
              <Input
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Senha * (mín. 8 caracteres)</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Perfil</Label>
              <Select value={newRole} onValueChange={(val) => setNewRole(val as 'admin' | 'user')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user" className="text-xs">
                    Usuário
                  </SelectItem>
                  <SelectItem value="admin" className="text-xs">
                    Administrador
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateOpen(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
            >
              {creating ? 'Criando...' : 'Criar Usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!roleChange}
        onOpenChange={(v) => !v && setRoleChange(null)}
        title="Alterar perfil do usuário"
        description={
          roleChange
            ? `Deseja alterar o perfil de ${roleChange.user.name || roleChange.user.email} para ${
                roleChange.newRole === 'admin' ? 'Administrador' : 'Usuário'
              }?`
            : ''
        }
        confirmText="Confirmar alteração"
        onConfirm={handleRoleChange}
      />
    </div>
  )
}
