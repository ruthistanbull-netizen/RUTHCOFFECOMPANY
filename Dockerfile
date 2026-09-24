FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG ROSTA_APP
ENV ROSTA_APP=${ROSTA_APP}

COPY . .
RUN npm install --no-audit --no-fund

# Build exactly one application per Zeabur service.
# Prefer an explicit ROSTA_APP build arg, then use Zeabur service/domain hints.
# Never fall back to build:all: one app's compile error must not fail the other service.
RUN target="$ROSTA_APP"; \
    service_hint="$(printf '%s %s %s %s' "$ZEABUR_SERVICE_NAME" "$ZEABUR_SERVICE_DOMAIN" "$ZEABUR_WEB_DOMAIN" "$ZEABUR_WEB_URL")"; \
    if [ -z "$target" ]; then \
      if printf '%s' "$service_hint" | grep -qi 'rostapanel'; then target="admin"; \
      elif printf '%s' "$service_hint" | grep -qi 'rostacoffeecompany'; then target="storefront"; \
      else target="storefront"; \
      fi; \
    fi; \
    if [ "$target" = "admin" ]; then npm run build:admin && test -f apps/admin/.next/BUILD_ID; \
    elif [ "$target" = "storefront" ]; then npm run build:storefront && test -f apps/storefront/.next/BUILD_ID; \
    else echo "Invalid ROSTA_APP: $target (expected admin or storefront)" >&2; exit 2; \
    fi; \
    printf '%s' "$target" > /app/.rosta-app-target

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["sh","-c","target=\"$ROSTA_APP\"; if [ -z \"$target\" ] && [ -f /app/.rosta-app-target ]; then target=\"$(cat /app/.rosta-app-target)\"; fi; if [ \"$target\" = \"admin\" ]; then exec npm run start:admin; elif [ \"$target\" = \"storefront\" ]; then exec npm run start:storefront; else echo \"Invalid runtime ROSTA_APP: $target\" >&2; exit 2; fi"]
