#!/bin/bash
# One-time baseline setup for the Contabo VM (Ubuntu 26.04).
# Run once as a sudo-capable user. Installs Node, Postgres, Nginx, Certbot,
# PM2, configures the firewall, creates the app directories, and creates
# two isolated Postgres databases (dev + prod) with their own least-privilege
# users. Does NOT deploy the app itself — see contabo-deploy.sh for that.

set -e

# When run as `sudo bash contabo-vm-setup.sh`, $USER/$HOME resolve to root's,
# not the real login user's - use $SUDO_USER (always set by sudo) instead so
# /opt/oneness-yoga and the credentials file end up owned by the right person.
TARGET_USER="${SUDO_USER:-$USER}"
TARGET_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a

echo "=== Updating apt ==="
sudo apt-get update

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Installing PostgreSQL ==="
sudo apt-get install -y postgresql postgresql-contrib

echo "=== Installing Nginx ==="
sudo apt-get install -y nginx

echo "=== Installing Certbot ==="
sudo apt-get install -y certbot python3-certbot-nginx

echo "=== Installing PM2 (process manager) ==="
sudo npm install -g pm2

echo "=== Creating app directories ==="
sudo mkdir -p /opt/oneness-yoga/dev
sudo mkdir -p /opt/oneness-yoga/prod
sudo chown -R "$TARGET_USER:$TARGET_USER" /opt/oneness-yoga

echo "=== Configuring firewall (ufw) ==="
sudo apt-get install -y ufw
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "=== Creating Postgres databases and users ==="
DEV_DB_PASS=$(openssl rand -base64 24)
PROD_DB_PASS=$(openssl rand -base64 24)

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE DATABASE oneness_trainers_dev;
CREATE DATABASE oneness_trainers_prod;

CREATE USER oneness_dev_user WITH ENCRYPTED PASSWORD '${DEV_DB_PASS}';
CREATE USER oneness_prod_user WITH ENCRYPTED PASSWORD '${PROD_DB_PASS}';

GRANT ALL PRIVILEGES ON DATABASE oneness_trainers_dev TO oneness_dev_user;
GRANT ALL PRIVILEGES ON DATABASE oneness_trainers_prod TO oneness_prod_user;

\c oneness_trainers_dev
GRANT ALL ON SCHEMA public TO oneness_dev_user;

\c oneness_trainers_prod
GRANT ALL ON SCHEMA public TO oneness_prod_user;
SQL

CREDS_FILE="$TARGET_HOME/oneness-db-credentials.txt"
cat > "$CREDS_FILE" <<EOF
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") by contabo-vm-setup.sh
# Delete this file once you've copied these into the two backend/.env files.

DEV_DATABASE_URL=postgresql://oneness_dev_user:${DEV_DB_PASS}@localhost:5432/oneness_trainers_dev?schema=public&connection_limit=10&pool_timeout=10&connect_timeout=10

PROD_DATABASE_URL=postgresql://oneness_prod_user:${PROD_DB_PASS}@localhost:5432/oneness_trainers_prod?schema=public&connection_limit=10&pool_timeout=10&connect_timeout=10
EOF
chown "$TARGET_USER:$TARGET_USER" "$CREDS_FILE"
chmod 600 "$CREDS_FILE"

echo ""
echo "=== Done ==="
echo "Postgres DB credentials written to $CREDS_FILE (chmod 600)."
echo "Next steps:"
echo "1. git clone the repo into /opt/oneness-yoga/dev and /opt/oneness-yoga/prod (checkout 'dev' and 'main' branches respectively)"
echo "2. Create backend/.env and frontend/.env in each checkout (see DEVELOPMENT-LOG.md for the full env var list)"
echo "3. Run contabo-deploy.sh dev (then later contabo-deploy.sh prod)"
echo "4. Install deploy/nginx-dev.conf and deploy/nginx-prod.conf, then run certbot once DNS has propagated"
