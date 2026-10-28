# Imagen oficial de Node con el parche de octubre 2026 (22.23.4). Nixpacks solo ofrece 22.19.0.
FROM node:22.23.4-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

# fontconfig + DejaVu: el texto de las etiquetas QR (sharp renderiza SVG con fuentes del sistema).
# postgresql-client-17: pg_dump para /api/backup; debe ser de la misma version mayor que wolfbd (17).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core postgresql-common \
 && /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Next inlinea estas variables en el build: deben existir como build args (Easypanel -> Entorno).
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN npm run build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
