#!/usr/bin/env sh

set -eu

CERT_PATH="${TLS_CERT_PATH:-/etc/nginx/certs/server.crt}"
KEY_PATH="${TLS_KEY_PATH:-/etc/nginx/certs/server.key}"
PUBLIC_HOST="${PUBLIC_HOST:-localhost}"
TLS_ALT_NAMES="${TLS_ALT_NAMES:-DNS:${PUBLIC_HOST}}"
TLS_CERT_DAYS="${TLS_CERT_DAYS:-825}"

mkdir -p "$(dirname "$CERT_PATH")"
mkdir -p "$(dirname "$KEY_PATH")"

if [ -s "$CERT_PATH" ] && [ -s "$KEY_PATH" ]; then
  exit 0
fi

openssl_config="$(mktemp)"

cat > "$openssl_config" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = v3_req
distinguished_name = dn

[dn]
CN = ${PUBLIC_HOST}

[v3_req]
subjectAltName = ${TLS_ALT_NAMES}
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req \
  -x509 \
  -nodes \
  -days "$TLS_CERT_DAYS" \
  -newkey rsa:2048 \
  -keyout "$KEY_PATH" \
  -out "$CERT_PATH" \
  -config "$openssl_config" \
  >/dev/null 2>&1

rm -f "$openssl_config"
