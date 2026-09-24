FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json ./package.json
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/storefront/package.json ./apps/storefront/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/commerce-core/package.json ./packages/commerce-core/package.json
COPY packages/ui/package.json ./packages/ui/package.json

RUN npm install --no-audit --no-fund

COPY . .

# Zeabur currently resolves both ROSTA services through the root Dockerfile.
# Build both apps once in the image so runtime can safely select the correct one.
RUN npm run build:admin
RUN npm run build:storefront

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=8080

EXPOSE 8080

CMD ["sh","-c","hint=\"$ROSTA_APP $ZEABUR_WEB_DOMAIN $ZEABUR_WEB_URL\"; if printf '%s' \"$hint\" | grep -qi 'admin\|panel\|rostapanel'; then exec npm run start:admin; elif printf '%s' \"$hint\" | grep -Eqi 'storefront|rostacoffecompany|rostacoffeecompany|ruthcoffecompany|ruthcoffeecompany'; then exec npm run start:storefront; else echo '[ROSTA] No explicit service hint; defaulting to storefront'; exec npm run start:storefront; fi"]
