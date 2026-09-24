FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Stable Zeabur service IDs observed from the project runtime:
# panel:      6ab1db67afd7153d77b410bb
# storefront: 6ab040b5477bfd0030149f96
ARG ZEABUR_SERVICE_ID

COPY package.json ./package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/commerce-core/package.json ./packages/commerce-core/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN npm install --no-audit --no-fund

COPY . .

# Build exactly the app owned by this Zeabur service. If Zeabur ever creates a
# replacement service with a new ID, keep a safe both-app fallback until the
# new ID is pinned.
RUN if [ "$ZEABUR_SERVICE_ID" = "6ab1db67afd7153d77b410bb" ]; then \
      npm run build:admin; \
    elif [ "$ZEABUR_SERVICE_ID" = "6ab040b5477bfd0030149f96" ]; then \
      npm run build:storefront; \
    else \
      echo "[ROSTA] Unknown Zeabur service ID; building both apps as safe fallback"; \
      npm run build:admin && npm run build:storefront; \
    fi

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["sh","-c","hint=\"$ZEABUR_SERVICE_ID $ROSTA_APP $ZEABUR_WEB_DOMAIN $ZEABUR_WEB_URL\"; if printf '%s' \"$hint\" | grep -q '6ab1db67afd7153d77b410bb' || printf '%s' \"$hint\" | grep -Eqi 'admin|panel|rostapanel'; then exec npm run start:admin; elif printf '%s' \"$hint\" | grep -q '6ab040b5477bfd0030149f96' || printf '%s' \"$hint\" | grep -Eqi 'storefront|rostacoffecompany|rostacoffeecompany|ruthcoffecompany|ruthcoffeecompany'; then exec npm run start:storefront; else echo '[ROSTA] No service hint; defaulting to storefront'; exec npm run start:storefront; fi"]
