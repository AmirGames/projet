#!/usr/bin/env bash
# Préparation d'un VPS neuf (Scaleway, OVH… ; Ubuntu 24.04/26.04 LTS ou Debian 12), en root :
#
#   curl -fsSL https://raw.githubusercontent.com/AmirGames/projet/main/deploy/installer-serveur.sh -o installer.sh
#   sudo bash installer.sh
#
# Installe : mises à jour automatiques de sécurité, Docker + Compose (dépôt
# officiel), pare-feu (22/80/443), fail2ban, 4 Go de swap (le build Next.js
# en a besoin sur une petite machine), un utilisateur « deploy ».
# Le script peut être relancé sans risque.
set -euo pipefail

UTILISATEUR="${UTILISATEUR:-deploy}"
SWAP_GO="${SWAP_GO:-4}"

[ "$(id -u)" -eq 0 ] || { echo "❌ À lancer en root (sudo bash $0)"; exit 1; }

. /etc/os-release
case "$ID" in
  ubuntu|debian) ;;
  *) echo "❌ Système non pris en charge : $ID (Ubuntu ou Debian attendus)"; exit 1 ;;
esac
# Une Ubuntu toute neuve peut précéder les paquets Docker : on vérifie avant
# de modifier quoi que ce soit.
if ! command -v docker >/dev/null 2>&1 && \
   ! curl -fsSI "https://download.docker.com/linux/$ID/dists/$VERSION_CODENAME/Release" >/dev/null; then
  echo "❌ Docker ne publie pas encore de paquets pour $PRETTY_NAME ($VERSION_CODENAME)."
  echo "   Réinstallez le VPS en Ubuntu 24.04 LTS."
  exit 1
fi
echo "▶ Système : $PRETTY_NAME"

export DEBIAN_FRONTEND=noninteractive

echo "▶ Mises à jour du système"
apt-get update -q
apt-get -yq upgrade
apt-get -yq install ca-certificates curl gnupg git ufw fail2ban unattended-upgrades htop
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "▶ Fuseau horaire Europe/Paris"
timedatectl set-timezone Europe/Paris || true

echo "▶ Docker (dépôt officiel)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$ID $VERSION_CODENAME stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get -yq install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Journaux des conteneurs plafonnés : sinon ils finissent par remplir le disque.
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
JSON
  systemctl restart docker
fi
systemctl enable --now docker

echo "▶ Swap de ${SWAP_GO} Go"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "${SWAP_GO}G" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
fi

echo "▶ Pare-feu : SSH, HTTP, HTTPS"
# Docker publie ses ports en contournant UFW : c'est pourquoi seul Caddy
# (80/443) publie un port dans docker-compose.prod.yml, jamais la base.
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "▶ fail2ban (SSH)"
cat > /etc/fail2ban/jail.d/sshd.local <<'CONF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
CONF
systemctl enable --now fail2ban
systemctl restart fail2ban

echo "▶ Utilisateur $UTILISATEUR"
if ! id "$UTILISATEUR" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$UTILISATEUR"
fi
usermod -aG docker,sudo "$UTILISATEUR"
# Même clé SSH que le compte qui lance le script : « ubuntu » chez OVH (via
# sudo), root chez Scaleway. Les lignes « command=… » sont écartées : chez
# OVH, la clé de root ne fait qu'afficher « connectez-vous en ubuntu ».
SOURCE_CLES=/root/.ssh/authorized_keys
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ] && [ -s "/home/$SUDO_USER/.ssh/authorized_keys" ]; then
  SOURCE_CLES="/home/$SUDO_USER/.ssh/authorized_keys"
fi
if [ -f "$SOURCE_CLES" ] && [ ! -s "/home/$UTILISATEUR/.ssh/authorized_keys" ]; then
  install -d -m 700 -o "$UTILISATEUR" -g "$UTILISATEUR" "/home/$UTILISATEUR/.ssh"
  grep -v 'command=' "$SOURCE_CLES" > "/home/$UTILISATEUR/.ssh/authorized_keys" || true
  chown "$UTILISATEUR:$UTILISATEUR" "/home/$UTILISATEUR/.ssh/authorized_keys"
  chmod 600 "/home/$UTILISATEUR/.ssh/authorized_keys"
fi
# sudo sans mot de passe : le compte n'en a pas, la connexion se fait par clé.
echo "$UTILISATEUR ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$UTILISATEUR"
chmod 440 "/etc/sudoers.d/90-$UTILISATEUR"

echo "▶ SSH : connexion par clé uniquement"
if [ -s "/home/$UTILISATEUR/.ssh/authorized_keys" ]; then
  cat > /etc/ssh/sshd_config.d/90-durcissement.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
CONF
  systemctl reload ssh 2>/dev/null || systemctl reload sshd
else
  echo "⚠️  Aucune clé SSH trouvée : connexion par mot de passe laissée active."
fi

echo
echo "✅ Serveur prêt. Étapes suivantes (voir DEPLOIEMENT-SCALEWAY.md) :"
echo "   ssh $UTILISATEUR@$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | cut -d' ' -f1)"
echo "   git clone https://github.com/AmirGames/projet.git && cd projet"
echo "   cp deploy/env.production.example .env.production && nano .env.production"
echo "   ./deploy/zup.sh up"
