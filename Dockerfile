# vyralive.app — the static site and its reverse proxy.
#
# Two stages, and the reason is the whole point of this file: what reaches the document root is
# assembled by an allowlist rather than by copying the repository and deleting afterwards.
#
# The previous version did `COPY . /app` followed by `RUN rm -f /app/Caddyfile`. The build log showed
# that step succeeding, and the file was served in production anyway — a deletion in a later layer
# does not reliably survive the image export. Anything built that way rests on a guess about layer
# semantics, and a guess is not a security boundary. A file that was never copied cannot be served.
#
# It also closes what was there before either version: the image carried the entire repository, so
# /server/index.js, /server/schema.sql, /electron-app/main.js, /docker-compose.yml and
# /.env.production.example were all publicly readable on vyralive.app.
#
# The allowlist is not a guess either. Scanning every HTML, CSS and JS file in the repository
# resolves 162 local references across 169 sources, and not one of them falls outside what is copied
# here. tests/site-image-contents.test.js keeps it that way.

# ---- stage 1: assemble exactly what is served -----------------------------------------------------
FROM alpine:3 AS site
WORKDIR /src
COPY . .
RUN set -eux; \
    mkdir -p /site; \
    # The two directories the pages load from. Everything under them is site content: gift artwork,
    # sounds, frames, and the standalone widget pages OBS opens.
    cp -R assets /site/; \
    cp -R public /site/; \
    # The repository root is a flat pile of the files the pages load by name, so the root is taken by
    # extension rather than by a list that would go stale the first time someone adds a widget.
    for f in *.html *.js *.css *.png *.jpg *.jpeg *.gif *.svg *.ico *.webp *.woff *.woff2 *.mp3 *.wav; do \
      [ -e "$f" ] && cp "$f" /site/ || true; \
    done; \
    # Two data files the pages fetch by name; every other .json in the root is tooling.
    for f in manifest.json theme.schema.json; do [ -e "$f" ] && cp "$f" /site/ || true; done; \
    # Belt and braces. .dockerignore already keeps these out of the context and no rule above would
    # pick them up, but this is the file someone reads in a year to learn what is public.
    rm -f /site/package.json /site/package-lock.json /site/Caddyfile; \
    # Nothing outside the allowlist can have arrived. This does not remove anything — it fails the
    # build if that ever stops being true.
    for forbidden in server electron-app tiktok-bridge tests scripts docs deploy \
                     .env.production.example docker-compose.yml docker-compose.production.yml \
                     Dockerfile Caddyfile package.json; do \
      if [ -e "/site/$forbidden" ]; then echo "FEL: $forbidden hamnade i dokumentroten"; exit 1; fi; \
    done

# ---- stage 2: serve it ----------------------------------------------------------------------------
# Caddy, because the Caddyfile does more than serve files: it reverse-proxies /api/* and /health/* to
# the api service. A static-file provider that generates its own configuration would drop the proxy,
# and every API call the browser makes with it.
FROM caddy:2-alpine

# Configuration, and only into the config path. It is never copied into the document root, so
# /Caddyfile cannot publish the internal upstream address the way it did after the previous deploy.
COPY Caddyfile /etc/caddy/Caddyfile

# `root * /app` in the Caddyfile is what makes this the document root.
COPY --from=site /site /app

# Matches the Caddyfile's :80. Railway routes to the exposed port.
EXPOSE 80

# No CMD: the base image already runs
#   caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
