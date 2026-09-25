FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Theme editor accepts MOV/M4V/WebM/MP4 uploads and normalizes them to
# browser-safe H.264 MP4 in the admin API. The shared Zeabur Dockerfile is the
# image actually used by both services, so ffmpeg must be available here.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ARG ZEABUR_SERVICE_ID
ARG ZEABUR_WEB_DOMAIN
ARG ZEABUR_WEB_URL

COPY package.json ./package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/commerce-core/package.json ./packages/commerce-core/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN npm install --no-audit --no-fund

COPY . .

RUN rm -rf apps/admin/.next apps/storefront/.next

# Build exactly one app. Zeabur exposes these values to the Docker build as
# mounted env secrets, while ARG keeps local/manual Docker builds predictable.
RUN hint="$ZEABUR_SERVICE_ID $ZEABUR_WEB_DOMAIN $ZEABUR_WEB_URL"; \
    if [ "$ZEABUR_SERVICE_ID" = "6ab1db67afd7153d77b410bb" ] || printf '%s' "$hint" | grep -Eqi 'rostapanel|admin|panel'; then \
      echo "[ROSTA] Building admin panel only"; \
      npm run build:admin; \
    elif [ "$ZEABUR_SERVICE_ID" = "6ab040b5477bfd0030149f96" ] || printf '%s' "$hint" | grep -Eqi 'rostacoffecompany|rostacoffeecompany|ruthcoffecompany|ruthcoffeecompany|storefront'; then \
      echo "[ROSTA] Building storefront only"; \
      npm run build:storefront; \
    else \
      echo "[ROSTA] Unable to resolve Zeabur service role from SERVICE_ID/WEB_DOMAIN/WEB_URL" >&2; \
      exit 2; \
    fi

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["sh","-c","hint=\"$ZEABUR_SERVICE_ID $ROSTA_APP $ZEABUR_WEB_DOMAIN $ZEABUR_WEB_URL\"; if printf '%s' \"$hint\" | grep -q '6ab1db67afd7153d77b410bb' || printf '%s' \"$hint\" | grep -Eqi 'rostapanel|admin|panel'; then exec npm run start:admin; elif printf '%s' \"$hint\" | grep -q '6ab040b5477bfd0030149f96' || printf '%s' \"$hint\" | grep -Eqi 'rostacoffecompany|rostacoffeecompany|ruthcoffecompany|ruthcoffeecompany|storefront'; then exec npm run start:storefront; else echo '[ROSTA] Unable to resolve runtime service role' >&2; exit 2; fi"]
