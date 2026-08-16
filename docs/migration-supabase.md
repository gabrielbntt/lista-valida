# Migração PocketBase → Supabase — Lista Válida

Mapeamento de referência para a migração via Strangler Fig. PocketBase continua no ar até cada
camada ser trocada e validada.

Nota de plataforma: o PocketBase atual é hospedado pela Skip (`goskip.dev`) e usa dois bindings
proprietários sem equivalente nativo em Postgres/Supabase: `$ai.chat`/`$ai.embed` (classificação
por IA) e `$vectors.search` (busca semântica sobre um campo `vector`). Por instrução explícita,
essa parte fica para uma fase 2 e não é implementada agora — só deixamos os pontos de extensão
prontos.

## 0. Discrepâncias encontradas na inspeção

O código real diverge um pouco do briefing em três pontos (confirmado lendo o repo agora):

- Os hooks do PocketBase são `.js`, não `.ts` (`pocketbase/hooks/*.js`).
- O hook de auth do frontend está em `src/hooks/use-auth.tsx`, não `src/use-auth.tsx`.
- Não existe `pb_schema.json`; o schema foi lido diretamente das migrations
  (`pocketbase/migrations/0001` a `0009`), que é a fonte de verdade.

Além disso, existem **12 arquivos** em `pocketbase/hooks/`, não 10: `set_owner.js` e
`protect_fields.js` não são rotas custom, são hooks de registro (`onRecordCreateRequest` /
`onRecordUpdateRequest`) que hoje aplicam a regra de tenancy (owner obrigatório e imutável, role
imutável por não-admin). Eles não viram Edge Functions — viram RLS policies (seção 4).

## 1. Schema: PocketBase → Postgres/Supabase

| PocketBase (`pocketbase/migrations/`) | Supabase (`public.*`) | Observações |
|---|---|---|
| `_pb_users_auth_` (+ `role`, `sender_name`, `sender_email` da migration 0009) | `auth.users` (nativo) + `profiles` | `profiles.id` referencia `auth.users.id`; `role` some do JWT via custom access token hook, não fica só na tabela |
| `events` | `events` | `owner` → `owner_id` |
| `mailing_contacts` | `mailing_contacts` | `event` → `event_id`; `interests`/`demands` (json array) → `text[]`; `search_embedding` (vector 1536) → coluna `embedding vector(1536)` **comentada no DDL**, fase 2 |
| `email_templates` | `email_templates` | `body_template` → `body` |
| `email_campaigns` | `email_campaigns` | `event` → `event_id`; **mudança de schema**: adicionamos `template_id` (FK opcional para `email_templates`, `on delete set null`) conforme pedido, mas mantendo `subject`/`body` próprios da campanha (cópia editável) para não quebrar o fluxo atual de criar campanha com texto livre — `template_id` vira só rastreabilidade/prefill, não substitui `subject`/`body` |
| `email_logs` | `email_logs` | `campaign`/`contact` → `campaign_id`/`contact_id` (agora `on delete set null`, antes era `cascade`/opcional); **mudança de comportamento**: `status` ganha o valor `queued` (default), inexistente no PocketBase — reflete o novo modelo assíncrono via `email_outbox` (log nasce `queued`, vira `sent`/`failed` quando `send-email` processa) |
| `blocked_contacts` | `blocked_contacts` | mantive `contact_id`, `event_id`, `reason`, `source`, `notes`, `blocked_at` além de `owner_id`/`email`/`created_at` do DDL de referência — são usados por `resend-webhook`/`unsubscribe-confirm`/bloqueio manual hoje; sem eles a tela `BlockedContacts.tsx` perde informação. Se a intenção era realmente só as 3 colunas do exemplo, me avisa e eu reduzo. |
| — (não existe) | `email_outbox` | novo — fila de envio assíncrono, substitui o loop síncrono de `send_campaign.js`/`retry_failures.js` |

Unicidade `(owner_id, email)` em `blocked_contacts` agora é uma constraint nativa do Postgres — no
PocketBase isso exigia um índice único filtrado (migration 0009); aqui é `unique` direto.

## 2. Hooks de registro → RLS (não viram Edge Function)

| Hook PocketBase | O que faz hoje | Equivalente Supabase |
|---|---|---|
| `set_owner.js` (`onRecordCreateRequest`, 7 coleções) | Força `owner = auth.id` no create, ignorando valor enviado pelo cliente; para `users`, força `role = 'user'` se quem cria não é admin | `with check (auth.uid() = owner_id)` na policy de insert — o cliente é obrigado a mandar o `owner_id` certo, senão o insert falha (em vez de o servidor sobrescrever silenciosamente, que é o que a RLS permite) |
| `protect_fields.js` (`onRecordUpdateRequest`, 7 coleções) | Em update, restaura `owner` para o valor original (imutável); para `users`, restaura `role` se quem edita não é admin | Policy de update com `using (auth.uid() = owner_id or is_admin())` + `with check` repetindo a mesma condição sobre o **novo** valor de `owner_id` (bloqueia trocar o dono); `profiles.role` fica de fora do `with check` de update do próprio usuário — só muda via `set_user_role()` (security definer) |

## 3. Rotas custom → Edge Functions

| PocketBase (`pocketbase/hooks/`) | Trigger/auth hoje | Edge Function | Entrada | Saída | Observação |
|---|---|---|---|---|---|
| `classify_contact.js` | `POST /backend/v1/classify`, `requireAuth` | `classify-contact` (JWT) | `{ id }` | contato atualizado | **Fase 2 — placeholder**, `$ai.chat`/`$ai.embed` sem substituto ainda |
| `import_contacts.js` | `POST /backend/v1/import-contacts`, `requireAuth` | `import-contacts` (JWT) | `{ event_id, contacts[], allow_duplicates }` | `{ imported, skipped, errors, imported_ids }` | Portável agora, sem IA envolvida |
| `search_contacts.js` | `POST /backend/v1/contacts/search`, `requireAuth` | `search-contacts` (JWT) | `{ query, event_id?, k? }` | `{ items[] }` | Troca `$vectors.search` (embeddings) por `ILIKE '%q%'` com `pg_trgm` — relevância pior que a versão semântica, mas funcional; embeddings ficam pra fase 2 |
| `send_campaign.js` | `POST /backend/v1/campaigns/{id}/send`, `requireAuth` | `send-campaign` (JWT) | `{ id }` (via path hoje, via body/JWT depois) | `{ status: 'sending' }` em ms | Não envia mais síncrono: valida campanha, filtra destinatários, insere em `email_outbox`, marca campanha `sending` — tudo em uma transação |
| `retry_failures.js` | `POST /backend/v1/campaigns/{id}/retry-failures`, `requireAuth` | **não existe mais como function** | — | — | Vira config de fila: `next_attempt_at`/`attempt_count` com backoff cuidam do retry automático. Ver "decisão aberta" abaixo sobre o botão "reenviar falhas" que existe hoje na UI |
| `resend_webhook.js` | `POST /backend/v1/resend-webhook`, **sem auth** | `resend-webhook` (`--no-verify-jwt`) | payload Resend | `{ ok: true }` | PocketBase **não validava assinatura** — aqui passa a verificar `Resend-Signature` (Ed25519) antes de processar. Corrige uma lacuna de segurança que já existia |
| `track_click.js` | `GET /backend/v1/track-click/{logId}`, sem auth | `track-click` (`--no-verify-jwt`) | query `?url=` | redirect 302 | Mesmo contrato público |
| `track_open.js` | `GET /backend/v1/track-open/{logId}`, sem auth | `track-open` (`--no-verify-jwt`) | — | GIF 1x1 | Mesmo contrato público |
| `unsubscribe_confirm.js` | `POST /backend/v1/unsubscribe/{logId}`, sem auth | `unsubscribe-confirm` (`--no-verify-jwt`) | `{ reason? }` | `{ success: true }` | Mesmo contrato público |
| `unsubscribe_get.js` | `GET /backend/v1/unsubscribe/{logId}`, sem auth | `unsubscribe-get` (`--no-verify-jwt`) | — | `{ email, name }` | Mesmo contrato público |
| — (não existe) | — | `send-email` (secret interno) | `{ batch_size }` via `pg_cron`/`pg_net` | — | Novo — processa a fila `email_outbox`, nunca é chamada pelo frontend |

## 4. Auth e papéis

- Sessão: `pb.authStore` (localStorage + refresh no mount) → `supabase.auth.onAuthStateChange` +
  `getSession()` no mount. Mesmo padrão de "token sobrevive a reload, valida uma vez".
- `isAdmin` hoje é `user?.role === 'admin'` lido do registro auth (client-side, sem custo) →
  vira `session.user.app_metadata.role === 'admin'`, populado pelo custom access token hook
  (sem round-trip extra, igual ao PocketBase).
- Autocadastro aberto (`createRule: ''`) → mantém: qualquer `signUp` funciona, `handle_new_user`
  cria o `profiles` com `role = 'user'` sempre (nunca confia em valor enviado pelo cliente).
- Promoção a admin: hoje `pb.collection('users').update(id, { role })` bloqueado por
  `protect_fields.js` se quem chama não é admin → vira `set_user_role(target_id, new_role)`
  (security definer, `is_admin()` obrigatório). **O frontend precisa chamar
  `supabase.auth.refreshSession()` depois de promover alguém** (ou da própria promoção, se for
  autopromoção por outro admin) para o JWT pegar a claim nova — sem isso o usuário promovido
  continua "user" até relogar.

## 5. Realtime

`useRealtime(collectionName, cb)` (`src/hooks/use-realtime.ts`) assina `'*'` em uma coleção via
SSE e sempre reexecuta um refetch completo — nunca usa o payload do evento. Equivalente direto:
canal Supabase Realtime em `postgres_changes` filtrado por tabela, com o mesmo padrão
"qualquer mudança → refetch". RLS já escopa quais linhas cada canal entrega, sem filtro adicional
no client. Não é uma rota nem um service, mas todo o service layer depende dele indiretamente
(9 páginas o usam) — fica registrado aqui para não esquecer na fase de frontend.

## 6. Services do frontend → Supabase

| Service | Hoje (PocketBase) | Depois |
|---|---|---|
| `events.ts` | CRUD via `pb.collection('events')` | CRUD direto via `supabase-js`, RLS cobre o isolamento |
| `templates.ts` | CRUD via `pb.collection('email_templates')` | CRUD direto via `supabase-js` |
| `contacts.ts` | CRUD direto + `classifyContact`/`importContacts`/`searchContacts` via `pb.send` | CRUD direto via `supabase-js`; os 3 métodos via `supabase.functions.invoke(...)` |
| `campaigns.ts` | CRUD direto + `sendCampaign`/`retryCampaignFailures` via `pb.send`; `getCampaignLogs` direto | CRUD direto via `supabase-js`; `sendCampaign` → `invoke('send-campaign')`; `retryCampaignFailures` → **decisão aberta**, ver abaixo |
| `blocked-contacts.ts` | CRUD direto (dedupe só por índice único parcial) | CRUD direto via `supabase-js`; `unique (owner_id, email)` nativo faz o trabalho de dedupe |
| `users.ts` | `getUsers`/`createUser`/`updateUserRole` direto na coleção `users` | **decisão aberta**, ver abaixo — `profiles` não tem e-mail, e criar usuário com senha exige `service_role` |

### Decisões (fechadas em 2026-08-04, confirmadas pelo usuário)

1. **`retryCampaignFailures`**: Edge Function dedicada `retry-campaign-failures` (JWT), que chama a
   RPC `requeue_campaign_failures()`. Mantém `email_outbox` 100% fechado ao client (sem policy,
   como já decidido na Fase 1) em vez de abrir uma policy de update nela. Resposta deixa de trazer
   contagem imediata de `sent`/`failed` — devolve `{ status: 'sending', requeued, ignored_blocked }`
   em ms; o reprocessamento de fato ocorre no próximo tick do `pg_cron` (até 1 minuto).
2. **`getUsers`**: RPC SQL `admin_list_users()` (`security definer`, restrita por `is_admin()`),
   junta `profiles` com `auth.users` e devolve `id, email, role, sender_name, sender_email,
   created_at`. Chamada via `supabase.rpc('admin_list_users')`.
3. **`createUser`**: Edge Function admin-only `create-user`, usando `service_role`
   (`auth.admin.createUser`) internamente — preserva 100% a UX atual (admin define nome, e-mail,
   senha e papel num único formulário; usuário já loga de imediato). `handle_new_user()` cria o
   profile com `role = 'user'`; se o papel pedido for `admin`, a function promove em seguida via
   `update` direto (client `service_role`, não a RPC `set_user_role` — essa depende de
   `auth.jwt()`/`is_admin()` do chamador, que não existe num client de `service_role`).

Implementadas na Fase 2 (ver seção 10).

## 7. Migração de dados

Script server-side (`service_role`) lê PocketBase, gera `uuid` determinístico
(`md5('pb:' || old_id)::uuid`) por registro para preservar relações, cria `profiles` a partir de
`_pb_users_auth_`, e faz upsert em `blocked_contacts` com `on conflict (owner_id, email) do
nothing`. Detalhado na fase 6 do plano abaixo.

## 8. Ajustes no desenho de RLS em relação ao briefing literal

Dois pontos onde segui o espírito da regra em vez do texto literal, porque a versão literal
regredia comportamento que existe hoje:

- **`with check` do update**: se eu aplicar `with check (auth.uid() = owner_id)` também no
  update (como no texto literal), um admin editando o registro de outro usuário falha o check,
  porque `owner_id` da linha continua sendo o dono original, não o uid do admin — isso quebraria
  a capacidade de admin editar registros de qualquer usuário, que existe hoje via
  `ownerOrAdmin` no PocketBase. Troquei o `with check` do update para
  `(auth.uid() = owner_id or is_admin())`, igual ao `using`. O `with check (auth.uid() =
  owner_id)` estrito fica só no insert (onde faz sentido: toda linha nova pertence a quem criou).
- **Imutabilidade de `owner_id`**: em vez de tentar expressar "não pode mudar o dono" só com
  `using`/`with check` (RLS não compara facilmente valor antigo vs. novo em uma única cláusula),
  usei um trigger `before update` (`protect_owner_id()`) que restaura `owner_id` para o valor
  original sempre — isso é literalmente o que `protect_fields.js` faz hoje (um hook que
  sobrescreve o campo, não uma regra declarativa), então é a tradução mais fiel, e vale até para
  admin (ninguém reatribui o dono de um registro, igual hoje).
- **`profiles` sem policy de update**: como pedido, todo write em `profiles` passa por
  trigger/security definer. Isso inclui a auto-edição de `sender_name`/`sender_email` que hoje
  existe em `AccountSettings.tsx` (`updateProfile`) — na fase 6 isso vira uma RPC
  `update_own_profile()` (security definer, restrita a `auth.uid() = id`), não um update direto
  na tabela.

## 9. Nota sobre o scaffold Firebase

Na conversa anterior a este briefing eu tinha deixado `firebase.json`, `firestore.rules`,
`firestore.indexes.json` e `functions/` prontos para uma migração PocketBase → **Firebase**. Como
este briefing muda o destino para **Supabase**, esses arquivos ficaram órfãos. Removidos em
2026-08-04 (confirmado pelo usuário) — nenhum estava commitado no git.

## 10. Fase 2 — Edge Functions com JWT + RPCs de suporte

Migration `0004_functions.sql` (funções `security definer`, cada uma faz sua própria checagem de
autorização porque as tabelas que escrevem não têm policy de write para o client comum):

| Função SQL | Chamada por | O que faz |
|---|---|---|
| `admin_list_users()` | `getUsers` (fase 5) | Junta `profiles` + `auth.users`, restrita por `is_admin()` |
| `set_user_role(user_id, role)` | `updateUserRole` (fase 5) | Único caminho de escrita em `profiles.role` |
| `update_own_profile(name, email)` | `updateProfile` do `use-auth` (fase 4) | Auto-edição restrita a `auth.uid() = id` |
| `queue_campaign_send(campaign_id)` | Edge Function `send-campaign` | Seleciona destinatários (evento/owner/filtros da campanha), exclui bloqueados, insere em `email_outbox` e marca a campanha `sending` — tudo em uma transação |
| `requeue_campaign_failures(campaign_id)` | Edge Function `retry-campaign-failures` | Reseta linhas `failed` da campanha em `email_outbox` para `pending`, excluindo quem foi bloqueado desde o envio original |

Edge Functions (`supabase/functions/`, todas com `verify_jwt`, usam `_shared/auth.ts`):

| Function | Entrada | Saída | Observação |
|---|---|---|---|
| `import-contacts` | `{ event_id, contacts[], allow_duplicates }` | `{ imported, skipped, errors, imported_ids }` | Porte direto de `import_contacts.js`, sem mudança de comportamento |
| `search-contacts` | `{ query, event_id?, k? }` | `{ items[] }` | `ILIKE` + `pg_trgm` no lugar de `$vectors.search`; RLS isola por owner (admin vê tudo, igual ao hook original); `k` limitado a 25 |
| `classify-contact` | `{ id }` | contato atualizado | **Placeholder fase 2 IA** — devolve o mesmo fallback determinístico que o hook usava quando `$ai.chat` falhava; ponto de extensão comentado no código |
| `send-campaign` | `{ id }` | `{ status: 'sending', queued, ignored_blocked }` em ms | Valida `sender_email`/`RESEND_API_KEY`, delega para `queue_campaign_send` |
| `retry-campaign-failures` | `{ id }` | `{ status: 'sending', requeued, ignored_blocked }` em ms | Delega para `requeue_campaign_failures` |
| `create-user` | `{ name, email, password, role }` | `{ id, email }` | Admin-only (`isAdmin` de `_shared/auth.ts`), usa `_shared/service-client.ts` |

Pendente para a Fase 3: `send-email` (drena `email_outbox`, renderiza o corpo do e-mail com os
links de tracking — isso migra de `send_campaign.js`/`retry_failures.js`, que hoje montam o HTML
rastreado no momento do envio), `resend-webhook`, `track-click`, `track-open`, `unsubscribe-get`,
`unsubscribe-confirm`, e o job `pg_cron` que drena a fila a cada minuto.

## 11. Fase 3 — Edge Functions públicas + drain assíncrono

Todas com `--no-verify-jwt` (sem sessão Supabase envolvida) e `service_role` interno:

| Function | Entrada | Saída | Observação |
|---|---|---|---|
| `track-click` | query `?log=&url=` | redirect 302 | `log` (id de `email_logs`) via query string, não path param — mais robusto entre versões do Edge Runtime que um segmento de path após o nome da function |
| `track-open` | query `?log=` | GIF 1x1 | Mesmo hex do pixel original |
| `unsubscribe-get` | query `?log=` | `{ email, name }` | Chamada pela página `/descadastrar/:logId` do frontend (fase 5) |
| `unsubscribe-confirm` | query `?log=`, body `{ reason? }` | `{ success: true }` | Ver nota de divergência abaixo |
| `resend-webhook` | payload Resend + header `Resend-Signature` | `{ ok, blocked?, email?, reason? }` | Agora valida assinatura Ed25519 sobre o corpo cru antes de processar — o PocketBase não validava. Formato exato do header a confirmar na doc do Resend no momento de configurar (comentário no código) |
| `send-email` | interna, `{ batch_size }` via `pg_cron`/`pg_net`, header `x-internal-secret` | `{ processed }` | Nunca chamada pelo frontend |

**Divergência deliberada (`resend-webhook` e `unsubscribe-confirm`)**: o hook original conseguia
criar um `blocked_contacts` sem dono quando não achava a origem do e-mail (campo `owner`
opcional no PocketBase). No schema novo `blocked_contacts.owner_id` é `not null` (migration 0001,
decisão já aplicada no banco). Quando não é possível resolver o `owner_id` (nenhum log/contato
conhecido), as duas functions agora pulam o bloqueio em vez de tentar um insert que violaria a
constraint — resultado: `{ ok: true, blocked: false }` / `{ success: true }` mesmo assim (não
falha para quem chamou), só o registro em `blocked_contacts` não é criado.

**`send-email`** — renderiza o e-mail (`supabase/functions/send-email/render.ts`, mesma lógica de
placeholders + tracking + rodapé de descadastro que `send_campaign.js` fazia no envio síncrono),
envia via Resend, e mantém idempotência estrutural: todo update de status em `email_outbox` é
condicionado a `where status = 'pending'` (nunca introduz um status `'processing'`, porque o
`check` constraint da coluna só permite `pending`/`sent`/`failed`). Backoff: `next_attempt_at =
now() + attempt_count * 60s`, até `MAX_ATTEMPTS = 5` (constante no código, não pedida
explicitamente no briefing — ajustável). Ao final de cada lote, recalcula `total_sent`/
`total_failed`/`status` da campanha quando não sobra nenhuma linha `pending` para ela.

`supabase/migrations/0005_cron.sql` — habilita `pg_cron`/`pg_net` e agenda `outbox-drain` a cada
minuto. Precisa de `<ref>` substituído e do secret `INTERNAL_SECRET` cadastrado tanto no Vault
(para o `pg_cron` montar o header) quanto via `supabase secrets set` (para a function validar) —
mesmo valor nos dois lugares.

## 12. Fase 4 — Frontend: autenticação

`@supabase/supabase-js` adicionado (`pnpm add`). `src/lib/supabase/client.ts` — mesmo padrão de
`src/lib/pocketbase/client.ts` (client único exportado default, lendo `VITE_SUPABASE_URL`/
`VITE_SUPABASE_ANON_KEY` do `.env`).

`src/hooks/use-auth.tsx` reescrito para `supabase.auth` (`onAuthStateChange` +
`signInWithPassword`/`signUp`/`signOut`). `user` passa a ser um objeto montado a partir da sessão
Supabase + `public.profiles` (id, email, `role` — vem da claim `app_metadata.role` injetada pelo
hook, sem round-trip extra — `sender_name`/`sender_email` — via select em `profiles`, e `name` —
via `user_metadata.name`, gravado no `signUp`; **não criei uma coluna `name` em `profiles`** para
não alterar a estrutura já aplicada no banco fora desta fase). `updateProfile` chama a RPC
`update_own_profile` (fase 2). `signInWith` (OAuth) foi removido: existia na interface antiga mas
não tinha nenhum botão/fluxo que o chamasse em nenhuma tela — nada no briefing pedia OAuth.

**Decisão não pedida explicitamente, mas necessária — shim transitório de dupla sessão**: nenhum
`service` do frontend foi migrado ainda (isso é a fase 5). Eles continuam chamando
`pb.collection(...)`, que exige `pb.authStore` válido. Se `use-auth.tsx` só autenticasse no
Supabase, a sessão do PocketBase nunca mais seria populada e **toda tela ainda não migrada
quebraria para todo mundo** no instante em que esta fase fosse ao ar — o oposto do Strangler Fig
pedido no briefing ("sem big bang"). Por isso `signIn`/`signUp`/`signOut` agora também
autenticam/limpam a sessão do PocketBase em paralelo, **best-effort** (`try/catch`, nunca bloqueia
o resultado do Supabase). Efeito colateral aceito: um usuário que só existe de um lado (ex.: já
migrado para o Supabase mas apagado do PocketBase, ou vice-versa) consegue logar no Supabase mas
as telas ainda-PocketBase param de funcionar só para ele, até a fase 5/6 fecharem. Este shim (e a
própria dependência de `pocketbase`) some na fase 7.

**Ação manual pendente**: preencher `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` reais no `.env`
(hoje com placeholder `<ref>`/`<anon-key>`); e, na Auth do Supabase, **desligar "Confirm email"**
(Authentication → Providers → Email) — o app espera sessão ativa imediatamente após `signUp`
(autocadastro aberto, sem etapa de confirmação), igual ao comportamento atual do PocketBase.

**Testado de ponta a ponta** (dev server real + Playwright headless, projeto `bqjzyebbhboocytigacx`
já configurado): cadastro, login, e um bug real encontrado e corrigido — a coleção `users` do
PocketBase live exige `role` preenchido no create e o hook `set_owner.js` não estava aplicando
isso nessa instância hospedada; corrigido mandando `role: 'user'` explícito no client (não muda
segurança, o hook sobrescreveria pra `'user'` de qualquer forma).

## 13. Fase 5 — Frontend: services

Todos os 6 services (`events`, `templates`, `blocked-contacts`, `contacts`, `campaigns`, `users`)
migrados para `supabase-js`, mantendo a **interface TypeScript exportada idêntica** à versão
PocketBase (mesmo nome de campo, mesmo formato) sempre que o dado por trás não mudou de
significado — cada service funciona como uma camada anti-corrupção: traduz nomes de coluna
(`event_id` → `event`, `body` → `body_template`, `created_at`/`updated_at` → `created`/`updated`)
e formatos de relação (`select('*, event:events(name)')` → `expand: { event } }`) sem que nenhuma
página precisasse mudar. `getContacts(eventId, filterStr?)` e `getBlockedContacts(filterStr?)`
perderam o parâmetro `filterStr` (filtro no dialeto de query do PocketBase) — grep confirmou que
nenhuma chamada no app inteiro passava esse argumento, então era código morto (YAGNI).

**Duas mudanças que vazaram para páginas**, porque a mudança de comportamento é real, não só de
transporte:

1. **`sendCampaign`/`retryCampaignFailures` são assíncronos agora** (fase 2/3: enfileiram e
   voltam em ms, não mais `{sent, failed, total, first_error}` síncrono). `CampaignDetail.tsx`
   (`handleSend`/`handleRetryFailures`) trocou os toasts de resultado imediato por confirmação de
   enfileiramento — os números finais chegam via Realtime (`campaign.total_sent`/`total_failed`,
   já assinado nessa tela) conforme o `pg_cron` drena a fila.
2. **`email_logs.status` ganhou um terceiro estado (`queued`)** sem equivalente no PocketBase
   (lá o log só existia depois do resultado final). Mapeado para `'enviando'` no
   `EmailLogRecord.status` (antes só `'enviado' | 'falhou'`), com um badge próprio em
   `CampaignDetail.tsx` (cinza, ícone de relógio) — sem isso, e-mails ainda na fila apareceriam
   com o badge vermelho de "Falhou".

**`use-realtime.ts`** reescrito para `postgres_changes` (canal por assinatura, nome único por
montagem — evita colisão entre componentes assinando a mesma tabela). Migrado de uma vez (não por
service) porque é infraestrutura transversal, igual `use-auth.tsx` na fase 4: o risco de trocar
antes é só perda temporária de auto-refresh em tabelas ainda sem escrita via Supabase, nunca uma
quebra. `Users.tsx` também trocou o nome da tabela assinada de `'users'` (PocketBase) para
`'profiles'`. Precisa de `supabase/migrations/0006_realtime.sql` (habilita replication nas 6
tabelas) rodado no banco.

**`admin_list_users()` ganhou a coluna `name`** (`supabase/migrations/0007_admin_list_users_name.sql`)
— a versão da fase 2 não trazia nome, e a tela de usuários (`Users.tsx`) mostrava "Sem nome" para
todo mundo. Lida de `auth.users.raw_user_meta_data ->> 'name'` (gravado no `signUp`, fase 4). Como
`RETURNS TABLE` mudou de formato, a migration dropa a função antes de recriar
(`CREATE OR REPLACE` não aceita mudar o shape de retorno).

**`Unsubscribe.tsx`** (rota pública `/descadastrar/:logId`) trocou `pb.send(...)` por `fetch` direto
às Edge Functions `unsubscribe-get`/`unsubscribe-confirm`, usando `?log=` como os outros endpoints
públicos da fase 3 (não path param).

**Achado à parte, não corrigido** (fora do escopo desta migração): a rota `/eventos` referenciada
no `Sidebar.tsx` **não existe** — não há `Events.tsx` nem uma `<Route path="/eventos">` em
`App.tsx`. É um gap pré-existente do app (confirmado: nenhum arquivo `Events.tsx` jamais existiu),
não algo que a migração quebrou. Fica registrado aqui porque limitou o teste end-to-end desta
fase: não deu para exercitar os fluxos de campanhas/contatos que dependem de um evento selecionado
via UI. `events.ts` foi migrado e testado indiretamente (o seletor de mailing no Topbar chama
`getEvents()` em toda navegação, sem erros).

**Testado**: login, navegação por Dashboard/Modelos/Contatos/Campanhas/Bloqueados/Relatório/Conta
sem erros de console/rede: e criação de um modelo de e-mail de ponta a ponta (insert com RLS,
toast de sucesso, reaparece na lista agrupado por categoria).

## 14. Fase 6 — Script de migração de dados

`scripts/migrate-to-supabase.js` (Node, `pocketbase` + `@supabase/supabase-js` — ambos já
dependências do projeto, nada novo pra instalar). Autentica no PocketBase como um usuário com
`role = "admin"` (a regra `ownerOrAdmin` das collections já dá acesso a tudo pra esse usuário —
não precisa de superusuário do PocketBase em si) e no Supabase com `service_role`.

**uuid determinístico**: `deterministicUuid(oldId)` replica exatamente o cast
`(md5('pb:' || old_id))::uuid` do Postgres — só insere hífens nas posições padrão do formato uuid,
sem forçar bits de versão/variante (um "v4 UUID de verdade" geraria um valor diferente do que o
SQL do briefing produziria). Isso preserva toda referência cruzada (`event_id`, `owner_id`,
`campaign_id`, `contact_id`) sem precisar de uma tabela de mapeamento à parte — qualquer coleção
pode ser migrada de forma independente, na ordem certa (users → events → templates → contacts →
campaigns → logs → blocked_contacts, porque cada uma referencia ids gerados pela anterior).

**Idempotência**: todas as tabelas de negócio usam `upsert(..., { ignoreDuplicates: true })` —
reruns só adicionam o que ainda não existe (por id determinístico), nunca sobrescrevem uma linha
já migrada. Isso é deliberado, não só uma sobra do padrão de `blocked_contacts`: os services do
frontend (fase 5) já gravam direto no Supabase, então uma edição feita por um usuário real depois
da primeira migração não pode ser apagada por um rerun. `blocked_contacts` usa
`onConflict: 'owner_id,email'` exatamente como pedido no briefing; as demais tabelas usam
`onConflict: 'id'`. Trade-off aceito: uma edição feita **no PocketBase** depois da primeira
migração não é re-sincronizada automaticamente — se isso for necessário, é uma mudança consciente
de `ignoreDuplicates` pra `false` na função `upsertRows()`.

**Usuários e senha** (decisão do usuário, 2026-08-05): como o hash de senha do PocketBase não é
compatível com o do Supabase Auth — isso vale pra qualquer migração entre dois sistemas de auth
diferentes, não é uma limitação desta implementação — o script cria cada conta via
`auth.admin.createUser()` com senha aleatória e **dispara automaticamente um e-mail de
redefinição de senha** (`resetPasswordForEmail`) assim que cria o usuário. Só acontece na
criação (idempotente: rerun não reenvia pra quem já foi migrado). Isso manda e-mail de verdade
pra usuários reais no momento em que o script roda — não é algo pra rodar "só pra testar";
requer SMTP configurado no projeto Supabase (Authentication → Emails → SMTP Settings) antes de
rodar de verdade, senão os e-mails falham silenciosamente ou usam o remetente de teste do
Supabase (rate-limited).

**Variáveis de ambiente** (nunca commitadas — usar um `.env.migration` local, já coberto pelo
`.env*` do `.gitignore`, ou exportar no shell): `PB_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, e opcionalmente `SITE_URL` (link no e-mail de reset)
e `MIGRATE_DRY_RUN=true` (mostra o que faria sem escrever nada).

**Não executei o script** — precisa das credenciais reais (service_role, admin do PocketBase) que
não devem passar por aqui, e a versão com envio de e-mail real não é algo pra eu disparar sem você
decidir o momento. Rodar com `MIGRATE_DRY_RUN=true` primeiro é o caminho recomendado antes da
migração de verdade.

## 16. Bug de CORS descoberto ao testar o envio em massa (2026-08-06)

Nenhuma Edge Function tinha tratamento de CORS (cabeçalho `Access-Control-Allow-Origin` no
preflight `OPTIONS`). Toda chamada feita pelo navegador (`supabase.functions.invoke` ou `fetch`
direto) era bloqueada pelo próprio navegador antes de chegar no Supabase — nunca apareceu como
erro do lado do Supabase, só no console do navegador, por isso passou despercebido até testar
`send-bulk-email` de verdade. Corrigido com `supabase/functions/_shared/cors.ts`
(`corsHeaders` + `handleCorsPreflight`) aplicado nas 9 functions chamadas direto do frontend:
`classify-contact`, `import-contacts`, `search-contacts`, `send-campaign`,
`retry-campaign-failures`, `create-user`, `send-bulk-email`, `unsubscribe-get`,
`unsubscribe-confirm`. As demais (`track-click`, `track-open`, `resend-webhook`, `send-email`,
`custom-access-token-hook`, `unsubscribe`, `interesse` do projeto MBA) não precisam — são
acessadas por navegação direta de link ou chamada servidor-a-servidor, nunca por `fetch`/XHR do
SPA, que é o que o CORS restringe.

**Todas as 9 precisam de redeploy** para o fix ter efeito.

### Correção do diagnóstico: o CORS sozinho não resolvia (2026-08-13)

O `handleCorsPreflight` dentro da function **nunca chega a rodar** nas functions publicadas com
verificação de JWT no gateway. Medido diretamente:

```
import-contacts   -> OPTIONS 401   (verify_jwt ligado)
send-bulk-email   -> OPTIONS 401   (verify_jwt ligado)
unsubscribe-get   -> OPTIONS 204   (--no-verify-jwt)
track-click       -> OPTIONS 204   (--no-verify-jwt)
```

O gateway do Supabase rejeita o preflight `OPTIONS` com 401 antes de invocar a function — e o
navegador **sempre** manda preflight quando há header `Authorization` (que é o caso de todo
`supabase.functions.invoke`). Resultado: importar contatos, buscar, classificar, disparar campanha
e criar usuário estavam **todos quebrados pelo navegador**, mesmo com o código correto.

**A correção é publicar as 7 functions autenticadas também com `--no-verify-jwt`**, deixando a
autenticação inteiramente a cargo de `_shared/auth.ts`:

```
supabase functions deploy classify-contact --no-verify-jwt
supabase functions deploy import-contacts --no-verify-jwt
supabase functions deploy search-contacts --no-verify-jwt
supabase functions deploy send-campaign --no-verify-jwt
supabase functions deploy retry-campaign-failures --no-verify-jwt
supabase functions deploy send-bulk-email --no-verify-jwt
supabase functions deploy create-user --no-verify-jwt
```

Isso **não enfraquece a autenticação**: `getUser()` valida o JWT contra o servidor de auth a cada
chamada e lança `unauthorized` se o header faltar ou o token for inválido — a checagem do gateway
era redundante com ela. `create-user` continua exigindo admin por cima disso (`isAdmin`, agora
consultando `profiles`). Sem sessão válida, a resposta é 401 igual a antes.

Isso substitui a instrução anterior deste documento, que mandava manter `verify_jwt` nessas sete.

## 17. Fase 7 — remoção do PocketBase e do builder da Skip (2026-08-06)

Executada a pedido do usuário, depois que o `use-auth.tsx` foi revertido pela terceira vez pelo
trabalho paralelo (o `signUp` voltou a ser 100% PocketBase e quebrou o cadastro com
`400 value must be unique`).

**PocketBase removido:**
- `pocketbase/` (13 hooks + 11 migrations) — a fonte de verdade do backend antigo. Continua no
  histórico do git; a **instância viva** em `goskip.dev` não é afetada por nada disso.
- `src/lib/pocketbase/` (`client.ts`, `errors.ts`, `schema.json`)
- `src/hooks/use-auth.tsx` — `signUp` restaurado para `supabase.auth.signUp`, e o shim de sessão
  dupla (`syncLegacyPocketBaseSession` / `createLegacyPocketBaseUser`) removido: nenhum service
  usa mais PocketBase para dados desde a fase 5, então o shim só gerava 400 a cada cadastro/login.
- `VITE_POCKETBASE_URL` do `.env`
- Dependência `pocketbase`: **movida para `devDependencies`, não removida** —
  `scripts/migrate-to-supabase.js` ainda a importa e a migração de dados real ainda não rodou.
  Pode sair de vez depois que a migração for concluída.

**`src/lib/errors.ts`** (novo) substitui `src/lib/pocketbase/errors.ts`, mantendo a mesma API
(`extractFieldErrors`, `getErrorMessage`, `FieldErrors`) usada por 8 telas. Diferença de
capacidade, não de contrato: o PocketBase devolvia um mapa de erros por campo pronto; o Supabase
não tem equivalente, então `extractFieldErrors` virou best-effort — só identifica o campo em
violação de unicidade (23505) ou not-null (23502), quando o nome da coluna aparece na mensagem do
Postgres. Nos demais casos devolve `{}` e a tela cai no toast com `getErrorMessage`, que já era o
caminho principal em todas elas.

**Builder da Skip removido:**
- `index.html` — `<script src="https://goskip.dev/skip.js">` (era ele que injetava o badge
  "Criado com o Skip" e a chamada a `api.goskip.dev/v1/projects/config/public` que aparecia
  bloqueada por CORS no console em todo teste) e o `<meta name="author" content="Skip">`
- `.skip.config.json` — manifesto do builder (`preventAI`, `excludeFromContext`, refs de deploy)
- `vite-plugin-react-uid.js` + seu uso em `vite.config.ts` — instrumentação que injetava
  `data-uid="arquivo:linha:coluna"` e `data-prohibitions` em cada elemento para o editor visual
- `src/lib/skipAi.ts` — helpers de SSE para os bindings `$ai.chat`/`$ai.agent` da Skip; grep
  confirmou zero importadores

**Validado**: `tsc --noEmit` limpo, `pnpm build` passa (3316 módulos), e o smoke test no navegador
(login + 7 telas + criação de evento) rodou com **zero erros de console** — antes sempre havia o
ruído de CORS do `goskip.dev`.

**Atenção — a migração de dados ainda não rodou de verdade.** A instância do PocketBase em
`goskip.dev` continua sendo a única cópia dos dados de produção (6.495 contatos, 8 usuários, etc.).
Não desligar o projeto na Skip antes de rodar `scripts/migrate-to-supabase.js` sem
`MIGRATE_DRY_RUN`. Também vale confirmar onde o frontend passa a ser hospedado: sem
`.skip.config.json` o deploy pela Skip deixa de funcionar.

## 15. Reconciliação com trabalho paralelo no PocketBase (2026-08-05)

Depois da fase 6, `contacts.ts`, `campaigns.ts`, `events.ts`, `CampaignDetail.tsx`, `Import.tsx` e
`Unsubscribe.tsx` apareceram com uma mistura de código Supabase (o que eu tinha escrito) e código
PocketBase antigo (`pb.collection`/`pb.send`), com variáveis indefinidas e uma função duplicada —
build quebrado. Misturado com a reversão vieram **funcionalidades novas que nunca fizeram parte
desta migração**, sinal de trabalho em paralelo do lado do PocketBase enquanto a migração estava
em andamento:

- Campo `cnpj` em `mailing_contacts` (tabela e formulário de importação)
- Campo `notes` por contato na importação (já cobria isso via `extraFields` dinâmico do
  `Import.tsx`, sem mudança de schema)
- Contagem de `blocked` no resultado da importação — contatos cujo e-mail já está em
  `blocked_contacts` do mesmo owner agora são pulados na importação (bucket separado de
  `skipped`, que é só duplicata)
- `Unsubscribe.tsx` ganhou um design mais simples (confirmação em um clique, sem mostrar o
  e-mail antes) — mantido a pedido do usuário, mas religado à Edge Function `unsubscribe-confirm`
  real (a versão que apareceu chamava uma rota do PocketBase que não existe mais)

Resolvido restaurando a implementação Supabase de cada função e **incorporando** os campos novos
(não descartando): `supabase/migrations/0008_add_cnpj.sql` adiciona a coluna;
`supabase/functions/import-contacts/index.ts` grava `cnpj`/`notes` e checa `blocked_contacts`
antes de importar. `unsubscribe-get` (Edge Function) ficou sem consumidor no frontend depois dessa
decisão — continua implementada e correta, só não é mais chamada por nenhuma tela.

**Risco em aberto**: parece haver desenvolvimento ativo nesses mesmos arquivos do lado do
PocketBase/repositório original enquanto esta migração roda em paralelo no fork. Vale conferir com
quem estiver mexendo no `erosasturiano/lista-valida` antes de futuras mudanças nesses arquivos,
para não repetir esta reconciliação.
