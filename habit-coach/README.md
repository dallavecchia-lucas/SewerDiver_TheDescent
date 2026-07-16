# habit-coach — agente de hábitos e agenda via Telegram

Um agente que, todo dia, lê a foto da sua agenda de papel de manhã,
acompanha o dia e manda um briefing de progresso à noite — tudo pelo
Telegram, usando **Claude Code Routines**.

São três rotinas agendadas (manhã / meio-dia / noite). O Claude faz a
parte "inteligente" (ler a letra manuscrita, escrever no tom de
treinador); os scripts em `scripts/telegram.py` cuidam só da conversa
mecânica com a API do Telegram.

---

## ⚠️ Correções de segurança em relação ao guia original

O guia de setup original tinha alguns pontos frágeis. Aqui eles estão
corrigidos:

| Red flag no guia original | Como está resolvido aqui |
| --- | --- |
| Token guardado num arquivo dentro do repo ("gitignored localmente, presente no runtime") | O token vive **só** como variável de ambiente/secret da rotina (`TELEGRAM_BOT_TOKEN`). Nunca toca o repositório. Fallback local é um `.env` que o `.gitignore` bloqueia. |
| `[TOKEN_TELEGRAM]` colado inline no prompt da rotina | O prompt **nunca** contém o token. Os scripts leem do ambiente; o prompt só chama `python telegram.py ...`. |
| `getUpdates` confirmando o offset apaga as mensagens para as rotinas seguintes | O script **não** confirma o offset. As três rotinas conseguem ler as mesmas respostas (o Telegram guarda updates por ~24h). O filtro entre rotinas é feito por `--after <update_id>`. |
| Foto da agenda (dado pessoal) versionada | Imagens em `state/*.jpg|png` são ignoradas pelo git. Só o `.md` do dia é versionado. |
| Letra manuscrita lida errada sem aviso | A rotina da manhã pede confirmação explícita e sinaliza o que ficou ambíguo. |

---

## Pré-requisitos

- Claude Code com plano Pro e acesso web (claude.ai/code).
- Uma conta no Telegram.
- Python 3 no ambiente da rotina (os scripts usam **só** a biblioteca
  padrão — nada de `pip install`).

---

## Passo 1 — Criar o bot

1. No Telegram, procure `@BotFather` e envie `/newbot`.
2. Dê um nome e um username ao bot.
3. Guarde o token (`123456:ABC-def...`). **Não** cole esse token em
   nenhum prompt de rotina nem faça commit dele.
4. Envie qualquer mensagem ao próprio bot a partir da sua conta (bots não
   iniciam conversa, só respondem). Isso também é o que permite detectar
   seu `chat_id` automaticamente.

## Passo 2 — Repositório de estado

Use este diretório `habit-coach/` como base. O ideal, como o guia sugere,
é copiá-lo para um **repositório privado dedicado** (ex: `habit-coach`),
já que ele vai guardar seus arquivos diários (`state/AAAA-MM-DD.md`).

## Passo 3 — Guardar o token com segurança

1. Abra `claude.ai/code/routines` e verifique se existe seção de
   **secrets / variáveis de ambiente por rotina** (a interface pode ter
   mudado — confira na hora).
2. **Se existir:** defina `TELEGRAM_BOT_TOKEN` ali (e, opcionalmente,
   `TELEGRAM_CHAT_ID`). É o caminho recomendado.
3. **Se não existir:** copie `.env.example` para `.env` e preencha. O
   `.gitignore` já impede o `.env` de ir para o git. Confirme na
   interface que o `.env` fica disponível no runtime da rotina antes de
   colocar o token real.

## Passo 4 — Criar as três rotinas (gatilho: agendado)

Cole como prompt de cada rotina o conteúdo de:

- `routines/morning.md`  → manhã (ex: 08h)
- `routines/midday.md`   → meio-dia (ex: 13h)
- `routines/night.md`    → noite (ex: 21h)

## Passo 5 — Testar antes de confiar no agendamento

Rode cada rotina manualmente ("run now") e confira:

- a leitura da letra manuscrita saiu correta;
- a mensagem chegou no Telegram;
- o `state/AAAA-MM-DD.md` foi salvo e commitado.

Para testar os scripts direto no terminal (com o token no ambiente):

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC-def..."   # não deixe no histórico do shell
python scripts/telegram.py chat-id
python scripts/telegram.py latest-photo
python scripts/telegram.py replies
python scripts/telegram.py send --text "teste ✅"
```

---

## Referência dos comandos (`scripts/telegram.py`)

| Comando | O que faz |
| --- | --- |
| `latest-photo [--out CAMINHO]` | Baixa a foto mais recente; imprime JSON com `path`, `update_id`, `date`. |
| `replies [--after N] [--json]` | Lista mensagens de texto; `--after` filtra por `update_id`. |
| `send --text "..."` / `--stdin` | Envia mensagem (`--markdown` para formatação, `--chat-id` para forçar destino). |
| `chat-id` | Mostra o chat id detectado. |
| `updates` | Dump cru de `getUpdates` (debug). |

---

## Notas

- 3 execuções/dia ficam dentro do limite de 5/dia do plano Pro.
- Routines são pré-lançamento (research preview, abril/2026) —
  comportamento e limites podem mudar.
- Letra manuscrita difícil pode gerar erro de extração; por isso a rotina
  da manhã sempre pede confirmação.
