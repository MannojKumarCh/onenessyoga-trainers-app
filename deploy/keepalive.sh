#!/bin/bash
# Prevents Oracle from reclaiming the instance due to idle CPU (<20%)
# Add to crontab: */30 * * * * /opt/oneness-yoga/keepalive.sh
# This runs a harmless CPU spike every 30 min
stress-ng --cpu 1 --timeout 10s --quiet 2>/dev/null || true
curl -sf http://localhost:3000/api/health > /dev/null 2>&1 || true
