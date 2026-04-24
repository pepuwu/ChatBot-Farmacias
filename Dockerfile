FROM node:20-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npm ci

COPY src ./src
RUN npx prisma generate && npx tsc

FROM node:20-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

# Copiar el Prisma client ya generado del build stage (no regenerar)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

COPY --from=build /app/dist ./dist
COPY scripts/start.sh ./start.sh
COPY dbsetup.js ./

RUN chmod +x /app/start.sh

EXPOSE 8080
