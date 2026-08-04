# vyralive.app — the static site and its reverse proxy, built explicitly.
#
# This file exists to stop Railway guessing. The service had no Dockerfile, so Railpack inspected
# the repository root and inferred the project type from what it found there. That worked until the
# client test suite added a package.json to the root: Railpack then read the repo as a Node app,
# found no start command, and aborted the build in fifteen seconds. The site stayed on the previous
# commit and Live Goals never reached production. Adding the file to .dockerignore did not help —
# those filters decide what is copied into the image, not what the detector reads.
#
# Railway prefers a Dockerfile over Railpack whenever one sits at the build context root, so from
# here the build is what this file says and nothing else. A file appearing in the repository can no
# longer change how the site is built.
#
# What runs is unchanged: the same Caddy, the same Caddyfile, the same document root. The Caddyfile
# binds :80, serves /app, and reverse-proxies /api/* and /health/* to the api service — that is the
# reason this is a Caddy image and not a static-file provider. Handing the serving to something that
# generates its own configuration would drop the proxy, and with it every API call the browser makes.
FROM caddy:2-alpine

# The proxy rules and headers, at the path the base image's default command already reads.
COPY Caddyfile /etc/caddy/Caddyfile

# The site. `root * /app` in the Caddyfile is what makes this the document root.
#
# Everything in the build context, deliberately: the root of this repository is a flat pile of the
# .js, .css and image files the pages load by name, and enumerating them here would mean the build
# breaks the day someone adds one. .dockerignore is where exclusions belong, and it already keeps
# out node_modules, archives, secrets and the client test suite.
COPY . /app

# The Caddyfiles are configuration, not content. COPY brought them along with everything else, and
# leaving them under the document root would publish the internal upstream address to anyone who
# asked for /Caddyfile. Nothing on any page loads them.
RUN rm -f /app/Caddyfile /app/Caddyfile.production

# Matches the Caddyfile's :80. Railway routes to the exposed port.
EXPOSE 80

# No CMD: the base image already runs
#   caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
# and repeating it here would be one more thing to keep in step with the upstream image.
