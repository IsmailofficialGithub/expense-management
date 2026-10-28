#!/usr/bin/env bash
# Sync server/ to ammarco and rebuild the api container. Server-side .env is never overwritten.
set -euo pipefail
cd "$(dirname "$0")"
tar czf - --exclude=node_modules --exclude=dist --exclude=.env --exclude=redis-data . \
  | ssh ammarco 'mkdir -p /srv/ismail_data/expense-management/server && cd /srv/ismail_data/expense-management/server && tar xzf - && docker compose up -d --build 2>&1 | tail -3'
