FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm install --no-audit --no-fund

# Zeabur injects ZEABUR_WEB_DOMAIN / ZEABUR_WEB_URL into build RUN steps.
# Build the correct workspace even when both services use the root Dockerfile.
RUN if printf '%s %s' "$ZEABUR_WEB_DOMAIN" "$ZEABUR_WEB_URL" | grep -qi 'rostapanel'; \
    then npm run build:admin; \
    else npm run build:storefront; \
    fi

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["sh","-c","if printf '%s %s' \"$ZEABUR_WEB_DOMAIN\" \"$ZEABUR_WEB_URL\" | grep -qi 'rostapanel'; then exec npm run start:admin; else exec npm run start:storefront; fi"]
