#!/usr/bin/env python3
"""Helper de Telegram para o agente de hábitos (habit-coach).

Sem dependências externas: usa apenas a biblioteca padrão do Python 3.
As rotinas (manhã / meio-dia / noite) chamam este script via bash; o
Claude faz a leitura da imagem e escreve o resumo, o script cuida só da
parte mecânica de falar com a API do Telegram.

O token NUNCA é passado por argumento nem escrito em prompt. Ele é lido
da variável de ambiente TELEGRAM_BOT_TOKEN (configure nos secrets da
rotina em claude.ai/code/routines, ou num .env local fora do git).

Comandos:
    latest-photo   Baixa a foto mais recente enviada ao bot.
    replies        Lista as mensagens de texto recebidas.
    send           Envia uma mensagem de texto.
    chat-id        Mostra o chat id detectado.
    updates        Dump cru de getUpdates (debug).

Exemplos:
    python telegram.py latest-photo --out state/2026-07-16.jpg
    python telegram.py replies --after 481923 --json
    python telegram.py send --text "Bom dia! Li sua agenda..."
    echo "resumo do dia" | python telegram.py send --stdin
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_BASE = "https://api.telegram.org"
TIMEOUT = 30


def _token() -> str:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        sys.exit(
            "ERRO: TELEGRAM_BOT_TOKEN não está definido. Configure o token "
            "nos secrets da rotina (claude.ai/code/routines) ou num .env "
            "local. Nunca cole o token no prompt da rotina."
        )
    return token


def _api(method: str, params: dict | None = None) -> dict:
    """Chama um método da Bot API e devolve o campo `result`."""
    url = f"{API_BASE}/bot{_token()}/{method}"
    data = None
    if params:
        data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(url, data=data)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        sys.exit(f"ERRO HTTP {e.code} em {method}: {body}")
    except urllib.error.URLError as e:
        sys.exit(f"ERRO de rede em {method}: {e.reason}")
    if not payload.get("ok"):
        sys.exit(f"ERRO da API em {method}: {payload.get('description')}")
    return payload.get("result")


def _get_updates(after: int | None = None) -> list:
    """getUpdates sem confirmar offset (não descarta updates).

    O Telegram guarda updates por ~24h. Não confirmamos o offset de
    propósito: assim a rotina do meio-dia e da noite ainda conseguem ler
    as mesmas respostas que chegaram de manhã.
    """
    params = {"timeout": 0, "limit": 100}
    if after is not None:
        # offset positivo confirmaria e descartaria; usamos filtro manual.
        params["offset"] = 0
    return _api("getUpdates", params) or []


def _messages(updates: list) -> list:
    out = []
    for u in updates:
        msg = u.get("message") or u.get("channel_post")
        if msg:
            out.append((u.get("update_id"), msg))
    return out


def _detect_chat_id(updates: list) -> int | None:
    env = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if env:
        return int(env)
    for _, msg in reversed(_messages(updates)):
        chat = msg.get("chat") or {}
        if "id" in chat:
            return chat["id"]
    return None


def _fmt_time(ts: int | None) -> str:
    if not ts:
        return ""
    return datetime.fromtimestamp(ts, tz=timezone.utc).astimezone().strftime(
        "%Y-%m-%d %H:%M"
    )


# ---------------------------------------------------------------------------
# comandos
# ---------------------------------------------------------------------------

def cmd_latest_photo(args) -> None:
    updates = _get_updates()
    best = None  # (update_id, message, photo_size)
    for uid, msg in _messages(updates):
        photos = msg.get("photo")
        if not photos:
            continue
        largest = max(photos, key=lambda p: p.get("file_size", 0))
        if best is None or uid > best[0]:
            best = (uid, msg, largest)

    if best is None:
        sys.exit("Nenhuma foto encontrada nas mensagens recentes.")

    uid, msg, size = best
    file_info = _api("getFile", {"file_id": size["file_id"]})
    file_path = file_info["file_path"]
    file_url = f"{API_BASE}/file/bot{_token()}/{file_path}"

    ext = os.path.splitext(file_path)[1] or ".jpg"
    out = args.out or f"state/{datetime.now().strftime('%Y-%m-%d')}{ext}"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    try:
        with urllib.request.urlopen(file_url, timeout=TIMEOUT) as resp, open(
            out, "wb"
        ) as fh:
            fh.write(resp.read())
    except (urllib.error.URLError, OSError) as e:
        sys.exit(f"ERRO ao baixar a imagem: {e}")

    result = {
        "path": out,
        "update_id": uid,
        "date": _fmt_time(msg.get("date")),
        "caption": msg.get("caption", ""),
        "chat_id": (msg.get("chat") or {}).get("id"),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def cmd_replies(args) -> None:
    updates = _get_updates()
    rows = []
    for uid, msg in _messages(updates):
        if args.after is not None and uid <= args.after:
            continue
        text = msg.get("text")
        if not text:
            continue
        rows.append(
            {
                "update_id": uid,
                "date": _fmt_time(msg.get("date")),
                "text": text,
                "chat_id": (msg.get("chat") or {}).get("id"),
            }
        )

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    elif not rows:
        print("(nenhuma resposta de texto encontrada)")
    else:
        for r in rows:
            print(f"[{r['update_id']}] {r['date']}  {r['text']}")


def cmd_send(args) -> None:
    if args.stdin:
        text = sys.stdin.read()
    else:
        text = args.text or ""
    text = text.strip()
    if not text:
        sys.exit("ERRO: mensagem vazia. Use --text ou --stdin.")

    chat_id = args.chat_id or _detect_chat_id(_get_updates())
    if chat_id is None:
        sys.exit(
            "ERRO: não foi possível detectar o chat id. Envie uma mensagem "
            "ao bot primeiro, ou defina TELEGRAM_CHAT_ID / use --chat-id."
        )

    params = {"chat_id": chat_id, "text": text}
    if args.markdown:
        params["parse_mode"] = "Markdown"
    result = _api("sendMessage", params)
    print(f"OK: mensagem enviada para chat {chat_id} (message_id "
          f"{result.get('message_id')})")


def cmd_chat_id(args) -> None:
    chat_id = _detect_chat_id(_get_updates())
    if chat_id is None:
        sys.exit("Nenhum chat detectado. Envie uma mensagem ao bot primeiro.")
    print(chat_id)


def cmd_updates(args) -> None:
    print(json.dumps(_get_updates(), ensure_ascii=False, indent=2))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("latest-photo", help="baixa a foto mais recente")
    sp.add_argument("--out", help="caminho de saída (padrão: state/AAAA-MM-DD.jpg)")
    sp.set_defaults(func=cmd_latest_photo)

    sp = sub.add_parser("replies", help="lista mensagens de texto recebidas")
    sp.add_argument("--after", type=int,
                    help="só mostra updates com update_id maior que este")
    sp.add_argument("--json", action="store_true", help="saída em JSON")
    sp.set_defaults(func=cmd_replies)

    sp = sub.add_parser("send", help="envia uma mensagem de texto")
    sp.add_argument("--text", help="texto da mensagem")
    sp.add_argument("--stdin", action="store_true", help="lê o texto da entrada padrão")
    sp.add_argument("--chat-id", type=int, help="chat id (padrão: detectado)")
    sp.add_argument("--markdown", action="store_true", help="usa parse_mode=Markdown")
    sp.set_defaults(func=cmd_send)

    sp = sub.add_parser("chat-id", help="mostra o chat id detectado")
    sp.set_defaults(func=cmd_chat_id)

    sp = sub.add_parser("updates", help="dump cru de getUpdates (debug)")
    sp.set_defaults(func=cmd_updates)

    return p


def main(argv=None) -> None:
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
