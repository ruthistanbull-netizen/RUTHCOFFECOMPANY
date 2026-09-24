FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

ARG ROSTA_APP=""
ENV ROSTA_APP=${ROSTA_APP}

COPY . .
RUN npm install --no-audit --no-fund

# Prefer an explicit ROSTA_APP build arg. Fall back to Zeabur's service URL.
# If neither is available, build both workspaces rather than silently building
# the wrong application.
RUN target="$ROSTA_APP"; \
    if [ -z "$target" ]; then \
      if printf '%s %s' "$ZEABUR_WEB_DOMAIN" "$ZEABUR_WEB_URL" | grep -qi 'rostapanel'; then target="admin"; \
      elif printf '%s %s' "$ZEABUR_WEB_DOMAIN" "$ZEABUR_WEB_URL" | grep -qi 'rostacoffecompany'; then target="storefront"; \
      fi; \
    fi; \
    if [ "$target" = "admin" ]; then npm run build:admin; \
    elif [ "$target" = "storefront" ]; then npm run build:storefront; \
    else npm run build:all; \
    fi

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["sh","-c","if [ \"$ROSTA_APP\" = \"admin\" ] || printf '%s %s' \"$ZEABUR_WEB_DOMAIN\" \"$ZEABUR_WEB_URL\" | grep -qi 'rostapanel'; then exec npm run start:admin; else exec npm run start:storefront; fi"]
