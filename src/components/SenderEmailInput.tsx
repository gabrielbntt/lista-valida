import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Dominio verificado no Resend. So e possivel enviar de um dominio cujo
// DNS foi validado la - por isso o campo aceita apenas o que vem antes do
// @, evitando que alguem configure um remetente que falha no envio.
// Quando outro dominio for verificado, basta definir VITE_SENDER_DOMAIN.
export const SENDER_DOMAIN = import.meta.env.VITE_SENDER_DOMAIN || 'listavalida.com.br'

export function localPartOf(email: string | undefined): string {
  if (!email) return ''
  const at = email.indexOf('@')
  return at === -1 ? email : email.slice(0, at)
}

export function domainOf(email: string | undefined): string {
  if (!email) return ''
  const at = email.indexOf('@')
  return at === -1 ? '' : email.slice(at + 1)
}

// Remove o @ e tudo depois dele: se a pessoa digitar ou colar um endereco
// completo, fica so o prefixo. E o que impede o usuario de escolher um
// dominio que nao esta verificado.
export function stripDomain(input: string): string {
  return input.replace(/@.*$/, '').trim()
}

export function buildSenderEmail(localPart: string): string {
  const clean = stripDomain(localPart)
  return clean ? `${clean}@${SENDER_DOMAIN}` : ''
}

interface SenderEmailInputProps {
  value: string
  onChange: (fullEmail: string) => void
  id?: string
  placeholder?: string
  className?: string
}

export function SenderEmailInput({
  value,
  onChange,
  id,
  placeholder = 'contato',
  className,
}: SenderEmailInputProps) {
  const localPart = localPartOf(value)
  const currentDomain = domainOf(value)
  const dominioDivergente = currentDomain !== '' && currentDomain !== SENDER_DOMAIN

  return (
    <div className={cn('space-y-1.5', className)}>
      <Input
        id={id}
        value={localPart}
        onChange={(e) => onChange(buildSenderEmail(e.target.value))}
        placeholder={placeholder}
        className="text-xs h-9"
      />

      <p className="text-[11px] text-slate-600">
        O <strong>@ padrão é @{SENDER_DOMAIN}</strong> — é o único domínio com envio verificado.
        Digite apenas o nome que vem antes do @.
      </p>

      {/* Previa do remetente final: antes de digitar, mostra {nome} como
          espaco reservado para deixar claro o formato do endereco. */}
      <div className="rounded-md bg-slate-50 border border-slate-200 px-2.5 py-1.5 text-xs">
        <span className="text-slate-500">De - </span>
        {localPart ? (
          <span className="font-medium text-slate-900">{localPart}</span>
        ) : (
          <span className="italic text-slate-400">{'{nome}'}</span>
        )}
        <span className="font-medium text-slate-900">@{SENDER_DOMAIN}</span>
      </div>

      {dominioDivergente && (
        <p className="text-[10px] text-amber-600">
          Este remetente usa @{currentDomain}, que não está verificado — o envio vai falhar. Salve
          para corrigir para @{SENDER_DOMAIN}.
        </p>
      )}
    </div>
  )
}
