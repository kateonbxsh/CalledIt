#!/usr/bin/env bash
set -euo pipefail

site=/etc/nginx/sites-available/accounts.rivalium.online
backup="${site}.bak.$(date +%Y%m%d%H%M%S)"

if grep -q 'location /api/football/' "$site"; then
  echo 'Football route is already installed.'
  exit 0
fi

cp "$site" "$backup"
python3 - "$site" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
needle = "    location / {"
route = """    location /api/football/ {
        proxy_pass http://127.0.0.1:8788;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        add_header X-Accel-Buffering no;
    }

"""
if needle not in text:
    raise SystemExit("Could not find the HTTPS server's root location.")
path.write_text(text.replace(needle, route + needle, 1))
PY

if ! nginx -t; then
  cp "$backup" "$site"
  echo 'Nginx validation failed; restored the original config.' >&2
  exit 1
fi

systemctl reload nginx
echo 'Football HTTPS route installed.'
