import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Mail, Send, CheckCircle2, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { forgotPassword } from '@/services/auth'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await forgotPassword(email)
      setSuccess(true)
    } catch (err: any) {
      const msg =
        err?.response?.message ||
        err?.message ||
        'Não foi possível processar sua solicitação. Tente novamente mais tarde.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg mx-auto mb-3">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Lista Válida</h2>
          <p className="text-xs text-slate-500 mt-1">Higienização e Qualificação de Mailings</p>
        </div>

        <Card className="border-slate-200 shadow-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">
              Esqueci minha senha
            </CardTitle>
            <CardDescription>
              {success
                ? 'Verifique seu e-mail para acessar o link de redefinição.'
                : 'Informe seu e-mail e enviaremos um link para redefinir sua senha.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {success ? (
              <div className="space-y-4 text-center py-4">
                <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
                <p className="text-sm text-slate-600">
                  Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha
                  em sua caixa de entrada. Não esqueça de verificá-lo também na pasta de spam ou
                  lixo eletrônico.
                </p>
                <Button
                  asChild
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  <Link to="/">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Voltar para o login
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                {error && (
                  <Alert variant="destructive" className="py-2 text-xs">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
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
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold shadow-sm text-sm h-10 gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Enviar link de redefinição
                      </>
                    )}
                  </Button>
                </form>

                <div className="text-center pt-2">
                  <Link
                    to="/"
                    className="text-xs text-slate-600 hover:text-indigo-600 font-medium underline inline-flex items-center gap-1"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Voltar para o login
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
