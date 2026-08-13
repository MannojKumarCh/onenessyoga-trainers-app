#!/bin/bash
# Run ON the Contabo VM to deploy/redeploy one environment.
# Usage: ./contabo-deploy.sh dev   OR   ./contabo-deploy.sh prod
#
# Assumes the repo has already been cloned once into /opt/oneness-yoga/<env>
# with the correct branch checked out (dev -> 'dev' branch, prod -> 'main'),
# and that backend/.env + frontend/.env already exist in that checkout.
# See contabo-vm-setup.sh for the one-time VM baseline setup.

set -e

ENV_NAME=$1

if [ "$ENV_NAME" != "dev" ] && [ "$ENV_NAME" != "prod" ]; then
  echo "Usage: ./contabo-deploy.sh dev|prod"
  exit 1
fi

APP_DIR="/opt/oneness-yoga/$ENV_NAME"
PM2_NAME="oneness-yoga-$ENV_NAME-api"
BRANCH="dev"
if [ "$ENV_NAME" = "prod" ]; then
  BRANCH="main"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  echo "$APP_DIR is not a git checkout yet."
  echo "First time only:"
  echo "  git clone <repo-url> $APP_DIR"
  echo "  cd $APP_DIR && git checkout $BRANCH"
  echo "  Then create $APP_DIR/backend/.env and $APP_DIR/frontend/.env before rerunning this script."
  exit 1
fi

if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo "Missing $APP_DIR/backend/.env - create it before deploying (see DEVELOPMENT-LOG.md for required vars)."
  exit 1
fi

if [ ! -f "$APP_DIR/frontend/.env" ]; then
  echo "Missing $APP_DIR/frontend/.env - create it before deploying (needs VITE_GOOGLE_CLIENT_ID)."
  exit 1
fi

echo "=== [$ENV_NAME] Pulling latest ($BRANCH) ==="
cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "=== [$ENV_NAME] Installing backend dependencies (runs prisma generate via postinstall) ==="
cd "$APP_DIR/backend"
npm install --production=false

echo "=== [$ENV_NAME] Applying database migrations ==="
npx prisma migrate deploy

echo "=== [$ENV_NAME] Building frontend ==="
cd "$APP_DIR/frontend"
npm install
npm run build

echo "=== [$ENV_NAME] Restarting backend via PM2 ==="
cd "$APP_DIR/backend"
pm2 restart "$PM2_NAME" || pm2 start src/index.js --name "$PM2_NAME"
pm2 save

echo "=== [$ENV_NAME] Done ==="
