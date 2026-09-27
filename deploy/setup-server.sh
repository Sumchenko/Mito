#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 22.04/24.04 server for Mito. Run as root:
#
#   bash setup-server.sh "ssh-ed25519 AAAA... mito-deploy"
#
# The argument is the PUBLIC half of the key GitHub Actions deploys with (see docs/DEPLOY.md).
# Safe to run again: every step checks what already exists.
set -euo pipefail

PUBKEY="${1:?Pass the public deploy key as the first argument}"

echo "==> Packages"
apt-get update -q
apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg rsync ufw

echo "==> Caddy (official repository)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

echo "==> Deploy user (no password, no root; key login only)"
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "$PUBKEY" >/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

echo "==> Site directories"
install -d -o deploy -g deploy /var/www/mito /var/www/mito/releases
if [ ! -e /var/www/mito/current ]; then
  install -d -o deploy -g deploy /var/www/mito/releases/placeholder
  echo '<!doctype html><meta charset="utf-8"><title>Mito</title><p>Mito is on its way.</p>' \
    >/var/www/mito/releases/placeholder/index.html
  ln -sfn /var/www/mito/releases/placeholder /var/www/mito/current
  chown -h deploy:deploy /var/www/mito/current
fi

echo "==> Let the deploy user update the Caddy config, reload Caddy and restart the mentor — nothing else"
chown deploy:caddy /etc/caddy/Caddyfile
chmod 664 /etc/caddy/Caddyfile
cat >/etc/sudoers.d/mito-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload caddy, /usr/bin/systemctl restart mito-mentor
EOF
chmod 440 /etc/sudoers.d/mito-deploy
visudo -cf /etc/sudoers.d/mito-deploy

echo "==> Node.js 24 for the AI mentor service"
if ! node --version 2>/dev/null | grep -q '^v2[4-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -q nodejs
fi

echo "==> Mentor service: its own user, code from the deploy user, secrets readable by root only"
id mito-mentor >/dev/null 2>&1 || adduser --system --no-create-home --group mito-mentor
install -d -o deploy -g deploy /opt/mito-mentor
install -d -m 755 /etc/mito
if [ ! -e /etc/mito/mentor.env ]; then
  install -m 600 -o deploy -g deploy /dev/null /etc/mito/mentor.env
fi
cat >/etc/systemd/system/mito-mentor.service <<'EOF'
[Unit]
Description=Mito AI mentor
After=network-online.target

[Service]
User=mito-mentor
Group=mito-mentor
# systemd reads this as root before dropping privileges; the service user cannot.
EnvironmentFile=/etc/mito/mentor.env
Environment=NODE_ENV=production
Environment=MENTOR_DB=/var/lib/mito-mentor/limits.db
WorkingDirectory=/opt/mito-mentor
ExecStart=/usr/bin/node server/mentor/main.ts
Restart=on-failure
RestartSec=3
StateDirectory=mito-mentor
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mito-mentor

echo "==> Firewall: SSH, HTTP, HTTPS (and HTTP/3)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

systemctl enable --now caddy
echo
echo "Done. Now add the repository secrets and variables (docs/DEPLOY.md) and push to main."
