#!/bin/sh
# PLT-03 adds `prisma migrate deploy` here, before the server starts.
set -e
exec "$@"
