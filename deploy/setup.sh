#!/bin/bash
# Run this on your Oracle Cloud VM (Ubuntu) to set up the server

set -e

echo "=== Installing Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "=== Installing Nginx ==="
sudo apt-get install -y nginx

echo "=== Installing Certbot ==="
sudo apt-get install -y certbot python3-certbot-nginx

echo "=== Installing PM2 (process manager) ==="
sudo npm install -g pm2

echo "=== Creating app directories ==="
sudo mkdir -p /var/www/oneness-yoga
sudo mkdir -p /opt/oneness-yoga/data
sudo chown -R $USER:$USER /var/www/oneness-yoga
sudo chown -R $USER:$USER /opt/oneness-yoga

echo "=== Setting up firewall ==="
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT

echo "Done. Next steps:"
echo "1. Copy nginx.conf to /etc/nginx/sites-available/oneness-yoga"
echo "2. Run: sudo ln -s /etc/nginx/sites-available/oneness-yoga /etc/nginx/sites-enabled/"
echo "3. Run: sudo certbot --nginx -d your-domain.com"
echo "4. Deploy backend to /opt/oneness-yoga/"
echo "5. Deploy frontend build to /var/www/oneness-yoga/"
echo "6. Start backend with PM2"
