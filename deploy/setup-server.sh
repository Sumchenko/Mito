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

echo "==> Let the deploy user update the Caddy config and reload Caddy — nothing else"
chown deploy:caddy /etc/caddy/Caddyfile
chmod 664 /etc/caddy/Caddyfile
cat >/etc/sudoers.d/mito-deploy <<'EOF'
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload caddy
EOF
chmod 440 /etc/sudoers.d/mito-deploy
visudo -cf /etc/sudoers.d/mito-deploy

echo "==> Firewall: SSH, HTTP, HTTPS (and HTTP/3)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

systemctl enable --now caddy
echo
echo "Done. Now add the repository secrets and variables (docs/DEPLOY.md) and push to main."
