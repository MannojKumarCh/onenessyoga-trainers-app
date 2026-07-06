#!/bin/bash
# Run from your local machine to deploy to the VM
# Usage: ./deploy.sh ubuntu@YOUR_VM_IP

set -e
SERVER=$1

if [ -z "$SERVER" ]; then
  echo "Usage: ./deploy.sh ubuntu@YOUR_VM_IP"
  exit 1
fi

echo "=== Building frontend ==="
cd ../frontend
npm run build

echo "=== Uploading frontend ==="
rsync -avz --delete dist/ $SERVER:/var/www/oneness-yoga/

echo "=== Uploading backend ==="
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude 'data' \
  ../backend/ $SERVER:/opt/oneness-yoga/

echo "=== Installing backend dependencies on server ==="
ssh $SERVER "cd /opt/oneness-yoga && npm install --production"

echo "=== Restarting backend ==="
ssh $SERVER "cd /opt/oneness-yoga && pm2 restart oneness-yoga || pm2 start src/index.js --name oneness-yoga"
ssh $SERVER "pm2 save"

echo "=== Reloading Nginx ==="
ssh $SERVER "sudo nginx -t && sudo systemctl reload nginx"

echo "=== Done! ==="
