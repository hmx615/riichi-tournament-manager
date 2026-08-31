#!/bin/sh
set -eu

mkdir -p "$DATA_DIRECTORY/competitions" "$DATA_DIRECTORY/logs" "$DATA_DIRECTORY/naga-reports" "$DATA_DIRECTORY/backups/competitions"
if ! find "$DATA_DIRECTORY/competitions" -type f -name '*.json' -print -quit | grep -q .; then
  cp -R /app/seed-data/. "$DATA_DIRECTORY/"
fi

exec "$@"
