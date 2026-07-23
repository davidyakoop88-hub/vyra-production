FROM caddy:2-alpine
WORKDIR /srv
COPY . /tmp/vyra
RUN find /tmp/vyra -type f \( \
      -name '*.html' -o -name '*.css' -o -name '*.js' -o -name '*.json' -o \
      -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.svg' -o \
      -name '*.webp' -o -name '*.gif' -o -name '*.mp3' -o -name '*.wav' -o \
      -name '*.ogg' -o -name '*.mp4' -o -name '*.webm' -o -name '*.woff2' \
    \) -not -path '/tmp/vyra/server/*' -not -path '/tmp/vyra/electron-app/*' \
       -not -path '/tmp/vyra/tiktok-bridge/*' -not -path '/tmp/vyra/docs/*' \
       -not -path '/tmp/vyra/tests/*' -not -path '/tmp/vyra/.github/*' \
       -not -path '/tmp/vyra/scripts/*' -exec sh -c 'f="$1"; d="/srv/${f#/tmp/vyra/}"; mkdir -p "$(dirname "$d")"; cp "$f" "$d"' _ {} \; \
    && rm -rf /tmp/vyra
COPY Caddyfile.production /etc/caddy/Caddyfile
RUN chown -R caddy:caddy /srv
USER caddy
