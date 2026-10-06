#!/usr/bin/env bash
# Configura la copia cifrata dei backup su Google Drive (una volta, sul server, da root).
# Prima, su un computer con browser: rclone authorize "drive" "<opzioni>" (vedi deploy/README.md).
#
# - remote "gdrive": Google Drive con scope drive.file, cioè solo i file creati da rclone;
# - remote "sharebox-drive": cifratura rclone crypt sopra gdrive:ShareBox-backup.
# Le due chiavi di cifratura sono in /root/.sharebox-backup-chiavi: senza, i backup su Drive non si leggono.
set -euo pipefail

RCLONE="rclone --config /root/.config/rclone/rclone.conf"
KEYS=/root/.sharebox-backup-chiavi

read -rsp "Incolla il token di rclone authorize (la riga tra 'Paste the following' e 'End paste'): " RAW
echo
# Le versioni recenti di rclone stampano il token codificato in base64, le vecchie come JSON: accetta entrambi.
TOKEN=$(printf '%s' "$RAW" | python3 -c '
import base64, json, sys
raw = sys.stdin.read().strip()
def parse(text):
    try:
        return json.loads(text)
    except Exception:
        return None
data = parse(raw)
if data is None:
    padded = raw + "=" * (-len(raw) % 4)
    for decode in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            data = parse(decode(padded).decode())
        except Exception:
            data = None
        if data is not None:
            break
if isinstance(data, dict) and "access_token" not in data and "token" in data:
    data = data["token"] if isinstance(data["token"], dict) else parse(data["token"])
if not isinstance(data, dict) or "access_token" not in data:
    sys.exit(1)
print(json.dumps(data))
') || { echo "Non riconosco il token: copia esattamente la riga tra 'Paste the following' e 'End paste'."; exit 1; }
unset RAW

mkdir -p /root/.config/rclone && chmod 700 /root/.config/rclone
$RCLONE config create gdrive drive scope=drive.file token="$TOKEN" --non-interactive >/dev/null
unset TOKEN

if [ ! -f "$KEYS" ]; then
  (umask 077 && { openssl rand -base64 32; openssl rand -base64 32; } > "$KEYS")
fi
$RCLONE config create sharebox-drive crypt remote=gdrive:ShareBox-backup \
  password="$(sed -n 1p "$KEYS")" password2="$(sed -n 2p "$KEYS")" --obscure --non-interactive >/dev/null
chmod 600 /root/.config/rclone/rclone.conf

# Prova: scrive, rilegge e cancella un file.
echo "prova ShareBox $(date -Is)" | $RCLONE rcat sharebox-drive:prova.txt
$RCLONE cat sharebox-drive:prova.txt >/dev/null
$RCLONE deletefile sharebox-drive:prova.txt
echo "Google Drive configurato: i backup andranno, cifrati, nella cartella ShareBox-backup."
