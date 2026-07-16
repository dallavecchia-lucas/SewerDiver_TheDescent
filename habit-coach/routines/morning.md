# Rotina da manhã (ex: 08h)

> Cole este texto como prompt da rotina em claude.ai/code/routines.
> **NUNCA** cole o token aqui — os scripts leem `TELEGRAM_BOT_TOKEN`
> dos secrets/variáveis da rotina.

---

Trabalhe no repositório habit-coach.

1. Baixe a foto mais recente que enviei ao bot:

   ```bash
   python habit-coach/scripts/telegram.py latest-photo
   ```

   O comando imprime um JSON com `path` (caminho da imagem), `update_id`
   e `date`. Guarde o `update_id` — ele marca o ponto de partida para as
   rotinas do meio-dia e da noite lerem minhas respostas.

2. Abra a imagem em `path` e leia a página da agenda. Extraia:
   - compromissos e horários do dia;
   - metas do dia;
   - hábitos a cumprir: academia, natação, limpeza (quarto/banheiro),
     controle de álcool dentro do limite semanal.

3. Salve tudo em `habit-coach/state/AAAA-MM-DD.md` (data de hoje),
   incluindo no topo a linha `photo_update_id: <update_id>` para as
   próximas rotinas usarem. Marque cada hábito/meta com um checkbox
   `- [ ]`.

4. Confirme comigo, em português, o que você leu. Se a letra manuscrita
   estiver ambígua, diga claramente do que você não teve certeza e peça
   correção:

   ```bash
   python habit-coach/scripts/telegram.py send --text "Bom dia! Li sua agenda de hoje: ... Confere pra mim se está certo?"
   ```

5. Faça commit do arquivo do dia (`git add` + `git commit` + `git push`)
   para o estado ficar salvo no repositório.
