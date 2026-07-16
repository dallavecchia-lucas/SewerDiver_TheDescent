# Rotina da noite (ex: 21h)

> Cole este texto como prompt da rotina em claude.ai/code/routines.
> **NUNCA** cole o token aqui.

---

Trabalhe no repositório habit-coach.

1. Leia o arquivo de hoje: `habit-coach/state/AAAA-MM-DD.md` e pegue o
   `photo_update_id` do topo.

2. Leia todas as minhas respostas do dia:

   ```bash
   python habit-coach/scripts/telegram.py replies --after <photo_update_id>
   ```

3. Atualize o arquivo do dia com o estado final (marque o que foi
   cumprido, registre o que ficou pendente) e faça commit.

4. Escreva um resumo do progresso em desenvolvimento pessoal e hábitos
   do dia — academia, natação, limpeza, controle de álcool — em
   português, tom de treinador: direto mas encorajador. Sinalize
   claramente o que ficou pendente para amanhã. Envie:

   ```bash
   python habit-coach/scripts/telegram.py send --text "..."
   ```
