#!/usr/bin/env bash
set -euo pipefail

echo "==> ComplianceGuard Enterprise Installer"

# Load all image tarballs
for tar_file in images/*.tar; do
    echo "    Loading ${tar_file}..."
    docker load -i "${tar_file}"
done

# Configure environment
if [ ! -f ".env" ]; then
    cp .env.enterprise.example .env
    echo ""
    echo "==> IMPORTANT: Edit .env before continuing."
    echo "    Set POSTGRES_PASSWORD, SECRET_KEY, TLS_CERT_PATH, TLS_KEY_PATH, CORS_ORIGINS."
    echo "    Then re-run this script."
    exit 0
fi

# Start services
docker compose -f docker-compose.enterprise.yml up -d

# Wait for backend health
echo "==> Waiting for backend to be healthy..."
for i in $(seq 1 30); do
    if docker compose -f docker-compose.enterprise.yml exec -T backend curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        echo "==> ComplianceGuard Enterprise is running."
        exit 0
    fi
    sleep 3
done

echo "ERROR: Backend did not become healthy in 90 seconds. Check logs:"
echo "  docker compose -f docker-compose.enterprise.yml logs backend"
exit 1
