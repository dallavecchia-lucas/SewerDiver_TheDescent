# Rotina do meio-dia (ex: 13h)

> Cole este texto como prompt da rotina em claude.ai/code/routines.
> **NUNCA** cole o token aqui.

---

Trabalhe no repositório habit-coach.

1. Leia o arquivo de hoje: `habit-coach/state/AAAA-MM-DD.md`. Pegue o
   valor de `photo_update_id` no topo dele.

2. Veja minhas respostas desde a mensagem da manhã (use o
   `photo_update_id` como filtro):

   ```bash
   python habit-coach/scripts/telegram.py replies --after <photo_update_id>
   ```

3. Se eu tiver corrigido algo, atualize o arquivo do dia (marque
   hábitos/metas concluídos como `- [x]`, corrija o que eu apontei) e
   faça commit.

4. Envie uma mensagem **curta**, em português, em tom de treinador:
   reforce o que já foi cumprido e avise, sem enrolação, o que ainda
   falta fazer hoje.

   ```bash
   python habit-coach/scripts/telegram.py send --text "..."
   ```
