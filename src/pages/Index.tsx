import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Sparkles, CheckCircle, Eye, EyeOff, Lock, Mail, User, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { getErrorMessage } from '@/lib/errors'

export default function Index() {
  const { isAuthenticated, signIn, signUp, loading } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      if (mode === 'signin') {
        const { error: err } = await signIn(email, password)
        if (err) setError('Credenciais inválidas. Verifique seu e-mail e senha.')
        else navigate('/dashboard')
      } else {
        const { error: err } = await signUp(email, password, name)
        if (err) setError(getErrorMessage(err))
        else navigate('/dashboard')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
      {/* Left Panel - Branding (Desktop) */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-slate-900 to-purple-950/70" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight">Lista Válida</span>
          </div>
        </div>

        <div className="relative z-10 max-w-lg my-auto py-12">
          <h1 className="text-4xl font-extrabold tracking-tight leading-tight text-white mb-4">
            Automação de higienização de mailing para mailings (listas)
          </h1>{' '}
          <p className="text-slate-300 text-base leading-relaxed mb-8">
            Classifique cargos, identifique interesses reais e crie abordagens personalizadas com
            Inteligência Artificial para elevar a conversão dos seus eventos.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm text-white">Classificação por IA</h4>
                <p className="text-xs text-slate-400">
                  Normalização automática de seniority, interesses e demandas do perfil.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm text-white">Perfis Personalizados</h4>
                <p className="text-xs text-slate-400">
                  Geração instantânea de mensagens customizadas para alcance direto.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm text-white">Importação Simples em CSV</h4>
                <p className="text-xs text-slate-400">
                  Mapeamento dinâmico de colunas e validação inteligente de duplicados.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-400 border-t border-slate-800 pt-6">
          © {new Date().getFullYear()} Lista Válida – Gestão Inteligente de Mailings (listas).
        </div>
      </div>

      {/* Right Panel - Auth Card */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center lg:hidden">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg mx-auto mb-3">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Lista Válida</h2>
            <p className="text-xs text-slate-500 mt-1">Higienização e Qualificação de Mailings</p>
          </div>

          <Card className="border-slate-200 shadow-md">
            <CardHeader className="space-y-1 text-center">
              <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
                {mode === 'signin' ? 'Acessar plataforma' : 'Criar nova conta'}
              </CardTitle>
              <CardDescription>
                {mode === 'signin'
                  ? 'Informe seu e-mail e senha para gerenciar seus mailings.'
                  : 'Preencha os dados abaixo para iniciar gratuitamente.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive" className="py-2 text-xs">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-xs font-semibold text-slate-700">
                      Nome completo
                    </Label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <Input
                        id="name"
                        type="text"
                        placeholder="Seu nome"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-9 text-sm"
                        required
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    E-mail corporativo
                  </Label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu.email@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-9 text-sm"
                      minLength={10}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {mode === 'signup' && (
                    <p className="text-xs text-slate-500">
                      A senha deve ter no mínimo 10 caracteres.
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold shadow-sm text-sm h-10 gap-2"
                >
                  {submitting
                    ? 'Processando...'
                    : mode === 'signin'
                      ? 'Entrar'
                      : 'Criar minha conta'}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
              <div className="space-y-3 pt-2 text-center">
                {mode === 'signin' && (
                  <Link
                    to="/esqueci-senha"
                    className="block text-xs text-slate-500 hover:text-indigo-600 font-medium transition-colors"
                  >
                    Esqueci minha senha
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'signin' ? 'signup' : 'signin')
                    setError(null)
                  }}
                  className="text-xs text-slate-600 hover:text-indigo-600 font-medium underline"
                >
                  {mode === 'signin'
                    ? 'Não tem uma conta? Cadastre-se'
                    : 'Já possui conta? Faça login'}
                </button>
              </div>{' '}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
