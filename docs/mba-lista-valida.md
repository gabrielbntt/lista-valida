# Projeto Lista Válida — captação de alunos de MBA

Automação separada do app de eventos/campanhas (`mailing_contacts`, `email_campaigns` etc.) que
está sendo migrado do PocketBase (ver `docs/migration-supabase.md`). Roda no **mesmo projeto
Supabase**, mas numa tabela própria (`contacts`) que já existe e não é tocada em estrutura por
nada deste documento — só leitura/escrita de linhas.

Orquestração: Power Automate Premium (HTTP para o PostgREST do Supabase) + Outlook (Office 365) +
Gemini (Google AI Studio) para gerar rascunhos de resposta.

Tabela `contacts` (já existente, fora do escopo de alteração): `id` (uuid, PK), `nome`, `email`,
`email_original`, `origem`, `status` (`ativo` | `email_invalido` | `optout`), `interessado`
(boolean), `tipo_interesse`, `rascunho_gerado` (boolean), `data_envio`, `criado_em`,
`atualizado_em`.

## 1. Carga inicial via CSV da Apollo (SQL Editor)

`ON CONFLICT (email)` exigiria uma constraint `UNIQUE(email)` que a tabela pode não ter — e criar
uma seria alterar a estrutura, proibido aqui. Por isso o merge usa `NOT EXISTS`: insere só quem
ainda não existe, nunca atualiza nem apaga quem já está lá.

```sql
-- 1. Tabela de staging para receber o CSV da Apollo. Ajuste as colunas
-- abaixo para bater com os cabecalhos reais do export (os nomes aqui sao
-- um chute do formato padrao da Apollo -- confira antes de importar).
create table if not exists public.contacts_staging (
  first_name text,
  last_name text,
  email text
);

-- 2. Importar o CSV para contacts_staging pela UI do Supabase:
-- Table Editor -> contacts_staging -> "Insert" -> "Import data from
-- spreadsheet". Nao precisa de SQL para este passo.

-- 3. Merge: insere so quem ainda nao existe em contacts (por e-mail,
-- comparacao case-insensitive), com dedupe dentro do proprio CSV.
with deduped as (
  select distinct on (lower(trim(s.email)))
    trim(coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) as nome,
    lower(trim(s.email)) as email
  from public.contacts_staging s
  where s.email is not null and trim(s.email) <> ''
  order by lower(trim(s.email))
)
insert into public.contacts (nome, email, email_original, origem, status, interessado, tipo_interesse, rascunho_gerado)
select d.nome, d.email, null, 'apollo', 'ativo', false, null, false
from deduped d
where not exists (
  select 1 from public.contacts c where lower(c.email) = d.email
);

-- 4. Limpeza: apaga so a staging, nao mexe em contacts.
drop table public.contacts_staging;
```

## 2. Edge Functions

Ambas públicas (deploy com `--no-verify-jwt` — quem acessa é o destinatário clicando num link no
e-mail, sem sessão Supabase) e usam `service_role` (`Deno.env.get`, já injetado pelo runtime, sem
secret manual) porque escrevem em `contacts` sem passar pelo client autenticado.

- `supabase/functions/unsubscribe/index.ts` — `GET ?email=` — marca `status='optout'`,
  troca `email` para `optout@opt.out`, preserva o original em `email_original` (só se ainda não
  estiver preenchido). Idempotente: clicar de novo no link não dá erro.
- `supabase/functions/interesse/index.ts` — `GET ?email=&tipo=` (`tipo` em `mba` | `comunidade` |
  `ambos`) — marca `interessado=true` e `tipo_interesse`.

Deploy:
```
supabase functions deploy unsubscribe --no-verify-jwt
supabase functions deploy interesse --no-verify-jwt
```

Link de descadastro a usar no e-mail de convite:
`https://bqjzyebbhboocytigacx.supabase.co/functions/v1/unsubscribe?email={EMAIL}`

## 3. Power Automate

### Fluxo A — Detecção de bounce

1. Trigger: Office 365 Outlook **"When a new email arrives (V3)"**, pasta Inbox.
2. **Condition** (modo avançado):
   ```
   or(
     contains(triggerOutputs()?['body/subject'], 'Delivery Status Notification (Failure)'),
     contains(triggerOutputs()?['body/subject'], 'Undeliverable')
   )
   ```
3. No ramo Sim, **Compose** `EmailExtraido`:
   ```
   trim(split(split(triggerOutputs()?['body/body'],'Final-Recipient: rfc822;')[1], char(10))[0])
   ```
   Se o corpo do NDR vier em HTML e a expressão não achar a linha, insira antes um passo
   **"HTML to text"** sobre `triggerOutputs()?['body/body']` e aponte a expressão para a saída dele.
4. **HTTP**:
   - `PATCH https://bqjzyebbhboocytigacx.supabase.co/rest/v1/contacts?email=eq.@{encodeURIComponent(outputs('EmailExtraido'))}`
   - Headers: `apikey`, `Authorization: Bearer <service_role>`, `Content-Type: application/json`,
     `Prefer: return=minimal`
   - Body: `{"status": "email_invalido", "atualizado_em": "@{utcNow()}"}`
5. Nas configurações (engrenagem) da ação HTTP, ligar **Secure Inputs** (e Secure Outputs).

### Fluxo B — Opt-out

Sem flow próprio — só incluir o link do item 2 no template do e-mail de convite (seja qual for o
fluxo que dispara o envio).

### Fluxo C + D — Detecção de interesse + rascunho com Gemini

Combinados num único flow: D só roda depois que C confirma interesse, e ambos usam os mesmos
dados do e-mail recebido (`from`/`subject`/`body`) — separar em dois flows exigiria um trigger
adicional só para repassar o mesmo dado.

1. Trigger: **"When a new email arrives (V3)"**, Inbox.
2. **Condition** (exclui NDR e o próprio remetente de opt-out):
   ```
   and(
     not(contains(triggerOutputs()?['body/subject'], 'Delivery Status Notification (Failure)')),
     not(contains(triggerOutputs()?['body/subject'], 'Undeliverable')),
     not(equals(toLower(triggerOutputs()?['body/from']), 'optout@opt.out'))
   )
   ```
3. Dentro do Sim, **Condition** (palavras-chave):
   ```
   or(
     contains(toLower(triggerOutputs()?['body/subject']), 'interessado'),
     contains(toLower(triggerOutputs()?['body/body']), 'interessado'),
     contains(toLower(triggerOutputs()?['body/subject']), 'quero saber mais'),
     contains(toLower(triggerOutputs()?['body/body']), 'quero saber mais'),
     contains(toLower(triggerOutputs()?['body/subject']), 'comunidade'),
     contains(toLower(triggerOutputs()?['body/body']), 'comunidade'),
     contains(toLower(triggerOutputs()?['body/subject']), 'mba'),
     contains(toLower(triggerOutputs()?['body/body']), 'mba'),
     contains(toLower(triggerOutputs()?['body/subject']), 'como faço para entrar'),
     contains(toLower(triggerOutputs()?['body/body']), 'como faço para entrar')
   )
   ```
4. **Compose** `TipoInteresse`:
   ```
   if(
     and(contains(toLower(triggerOutputs()?['body/subject']), 'comunidade'), not(contains(toLower(triggerOutputs()?['body/subject']), 'mba'))),
     'comunidade',
     if(
       and(contains(toLower(triggerOutputs()?['body/subject']), 'mba'), not(contains(toLower(triggerOutputs()?['body/subject']), 'comunidade'))),
       'mba',
       'ambos'
     )
   )
   ```
5. **HTTP** (`PATCH`, Fluxo C):
   - URI: `https://bqjzyebbhboocytigacx.supabase.co/rest/v1/contacts?email=eq.@{encodeURIComponent(triggerOutputs()?['body/from'])}`
   - Headers: iguais ao Fluxo A
   - Body: `{"interessado": true, "tipo_interesse": "@{outputs('TipoInteresse')}", "atualizado_em": "@{utcNow()}"}`
   - Secure Inputs ligado.
6. **HTTP** (`GET`, busca `nome`/`rascunho_gerado` — início do Fluxo D):
   - URI: `https://bqjzyebbhboocytigacx.supabase.co/rest/v1/contacts?email=eq.@{encodeURIComponent(triggerOutputs()?['body/from'])}&select=nome,rascunho_gerado`
   - Headers: `apikey`, `Authorization: Bearer <service_role>`
   - Secure Inputs ligado.
7. **Condition** (idempotência):
   ```
   not(equals(body('HTTP_-_GET_contato')?[0]?['rascunho_gerado'], true))
   ```
8. No Sim, **HTTP** (`POST` para o Gemini):
   - URI: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=SUA_API_KEY`
   - Body:
     ```json
     {
       "systemInstruction": {
         "parts": [{ "text": "Você é um assistente de captação de alunos para MBAs. Tom profissional, cordial e direto, sempre em português do Brasil. Nunca invente informações que não foram fornecidas." }]
       },
       "contents": [{
         "parts": [{ "text": "Escreva uma resposta curta (5 a 7 frases) para @{body('HTTP_-_GET_contato')?[0]?['nome']}, que demonstrou interesse em nossos MBAs. Agradeça o interesse, apresente brevemente os MBAs, convide para a comunidade pelo link https://SUA_URL_DA_COMUNIDADE, e ofereça disponibilidade para conversar." }]
       }]
     }
     ```
   - Secure Inputs ligado (a API key vai na própria URI).
9. **Compose** `TextoGemini`: `body('HTTP_-_Gemini')?['candidates'][0]?['content']?['parts'][0]?['text']`
10. **Outlook — "Create draft email (V2)"**:
    - To: `triggerOutputs()?['body/from']`
    - Subject: `concat('Re: ', triggerOutputs()?['body/subject'])`
    - Body: `outputs('TextoGemini')`
11. **HTTP** (`PATCH`, marca `rascunho_gerado`):
    - URI: `https://bqjzyebbhboocytigacx.supabase.co/rest/v1/contacts?email=eq.@{encodeURIComponent(triggerOutputs()?['body/from'])}`
    - Body: `{"rascunho_gerado": true, "atualizado_em": "@{utcNow()}"}`
    - Secure Inputs ligado.

## Placeholders a trocar

`bqjzyebbhboocytigacx` (referência do projeto Supabase — a mesma usada em `supabase/functions/` deste repo),
`SUA_API_KEY` (Gemini), `SUA_URL_DA_COMUNIDADE`, e os nomes de coluna do CSV da Apollo na seção 1
(confira os cabeçalhos reais antes de rodar).
