FROM public.ecr.aws/docker/library/node:22-bookworm-slim

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN npm install --no-audit --no-fund
RUN npm run build:storefront
RUN npm run build:admin

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV ROSTA_APP=storefront

EXPOSE 3000

CMD ["sh", "-c", "if [ \"$ROSTA_APP\" = \"admin\" ]; then npm run start:admin; else npm run start:storefront; fi"]
