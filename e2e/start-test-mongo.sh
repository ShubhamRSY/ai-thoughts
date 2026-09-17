#!/usr/bin/env bash
# Starts a disposable MongoDB for E2E tests, with TLS enabled.
#
# src/lib/mongodb.ts hard-codes `tls: true` (correct for production Atlas),
# so a plain, non-TLS local/CI Mongo container can't be used as-is — this
# gives it a throwaway self-signed certificate instead of weakening that
# production setting. See TESTING.md for why.
#
# Usage: ./e2e/start-test-mongo.sh
# Then:  MONGODB_URL="mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true" npm run test:e2e
# Stop:  docker rm -f aito-e2e-mongo
set -euo pipefail

CERT_DIR="$(mktemp -d)"
trap 'rm -rf "$CERT_DIR"' EXIT

openssl req -x509 -newkey rsa:2048 -days 1 -nodes \
  -keyout "$CERT_DIR/key.pem" -out "$CERT_DIR/cert.pem" -subj "/CN=127.0.0.1" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" >/dev/null 2>&1
cat "$CERT_DIR/key.pem" "$CERT_DIR/cert.pem" > "$CERT_DIR/combined.pem"

docker rm -f aito-e2e-mongo >/dev/null 2>&1 || true
docker run -d --name aito-e2e-mongo -p 27017:27017 \
  -v "$CERT_DIR/combined.pem:/etc/mongo-tls.pem:ro" \
  -v "$CERT_DIR/cert.pem:/etc/mongo-ca.pem:ro" \
  mongo:7 --tlsMode requireTLS --tlsCertificateKeyFile /etc/mongo-tls.pem \
    --tlsCAFile /etc/mongo-ca.pem --tlsAllowConnectionsWithoutCertificates \
  >/dev/null

echo -n "Waiting for MongoDB to accept TLS connections"
for _ in $(seq 1 30); do
  if docker exec aito-e2e-mongo mongosh --tls --tlsAllowInvalidCertificates \
      --eval "db.runCommand({ping:1})" >/dev/null 2>&1; then
    echo " ready."
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo " timed out." >&2
docker logs aito-e2e-mongo >&2
exit 1
