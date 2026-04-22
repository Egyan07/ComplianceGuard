# SSL certificates

The production `nginx.conf` expects two files in this directory:

- `cert.pem` — fullchain certificate (server + intermediates)
- `key.pem`  — matching private key

nginx **will refuse to start** if either file is missing. That is deliberate —
it prevents accidentally booting a production deployment without TLS.

## Production

Use real certificates from a public CA (Let's Encrypt is fine). Mount them
into the container via the volume already configured in `docker-compose.yml`.

## Local development

Use the dev override, which points nginx at an HTTP-only config:

```
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

If you specifically want to exercise the HTTPS path locally, generate a
self-signed cert:

```
openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -subj "/CN=localhost" \
  -keyout key.pem -out cert.pem
```

Do **not** commit real keys or certs. This directory is intentionally empty.
