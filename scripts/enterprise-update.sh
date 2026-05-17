#!/usr/bin/env bash
set -euo pipefail

NEW_VERSION="${1:?Usage: enterprise-update.sh <new-version>}"
echo "==> Updating ComplianceGuard Enterprise to v${NEW_VERSION}"

# Load new image tarballs
for tar_file in images/*.tar; do
    echo "    Loading ${tar_file}..."
    docker load -i "${tar_file}"
done

# Update APP_VERSION in .env
sed -i "s/^APP_VERSION=.*/APP_VERSION=${NEW_VERSION}/" .env

# Rolling restart using locally loaded images — no registry interaction
docker compose -f docker-compose.enterprise.yml up -d --force-recreate

# Health check
echo "==> Waiting for updated backend..."
for i in $(seq 1 30); do
    if docker compose -f docker-compose.enterprise.yml exec -T backend curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "==> Update to v${NEW_VERSION} complete."
        exit 0
    fi
    sleep 3
done

echo "ERROR: Updated backend did not become healthy. Check logs."
exit 1
