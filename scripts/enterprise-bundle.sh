#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-3.2.0}"
BUNDLE="complianceguard-enterprise-${VERSION}"

echo "==> Building enterprise bundle v${VERSION}"
mkdir -p "${BUNDLE}/images"

# Pull and save all required images
docker pull "postgres:15-alpine"
docker pull "nginx:alpine"
docker pull "complianceguard-backend:${VERSION}"
docker pull "complianceguard-frontend:${VERSION}"

docker save "postgres:15-alpine"                     -o "${BUNDLE}/images/postgres-15-alpine.tar"
docker save "nginx:alpine"                           -o "${BUNDLE}/images/nginx-alpine.tar"
docker save "complianceguard-backend:${VERSION}"     -o "${BUNDLE}/images/backend-${VERSION}.tar"
docker save "complianceguard-frontend:${VERSION}"    -o "${BUNDLE}/images/frontend-${VERSION}.tar"

# Tag and save with local names expected by compose file
docker tag "postgres:15-alpine"                   "complianceguard-postgres:15-alpine"
docker tag "nginx:alpine"                         "complianceguard-nginx:alpine"
docker save "complianceguard-postgres:15-alpine"  -o "${BUNDLE}/images/postgres-tagged.tar"
docker save "complianceguard-nginx:alpine"        -o "${BUNDLE}/images/nginx-tagged.tar"

# Copy deployment files
cp docker-compose.enterprise.yml "${BUNDLE}/"
cp nginx.enterprise.conf          "${BUNDLE}/"
cp .env.enterprise.example        "${BUNDLE}/"
cp scripts/enterprise-install.sh  "${BUNDLE}/"
cp scripts/enterprise-update.sh   "${BUNDLE}/"
chmod +x "${BUNDLE}/enterprise-install.sh" "${BUNDLE}/enterprise-update.sh"

# Create archive
tar -czf "${BUNDLE}.tar.gz" "${BUNDLE}/"
rm -rf "${BUNDLE}/"
echo "==> Bundle ready: ${BUNDLE}.tar.gz"
