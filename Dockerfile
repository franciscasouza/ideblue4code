# 1) Monta o site
FROM node:22-bookworm-slim AS site
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npx vite build

# 2) Servidor com arduino-cli e o núcleo AVR (Uno, Nano)
FROM node:22-bookworm-slim
ARG ARDUINO_CLI_VERSION=1.1.1
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | BINDIR=/usr/local/bin sh -s ${ARDUINO_CLI_VERSION} \
 && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN useradd -m app
USER app
RUN arduino-cli core update-index && arduino-cli core install arduino:avr \
 && echo 'void setup(){} void loop(){}' > /tmp/x.ino && mkdir /tmp/x && mv /tmp/x.ino /tmp/x/x.ino \
 && arduino-cli compile --fqbn arduino:avr:uno /tmp/x && rm -rf /tmp/x
WORKDIR /app
COPY --chown=app server ./server
COPY --from=site --chown=app /app/dist ./dist
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["node", "server/index.js"]
