#!/bin/sh
set -e
npx prisma db push --skip-generate --accept-data-loss
node dist/index.js
