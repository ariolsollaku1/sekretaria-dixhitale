#!/bin/sh
# AC-4: apply pending migrations before serving. A failed migration stops the container.
set -e
cd /migrate
node node_modules/prisma/build/index.js migrate deploy
cd /app
exec "$@"
