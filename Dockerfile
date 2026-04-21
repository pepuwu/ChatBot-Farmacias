FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npm ci

COPY src ./src
RUN npx prisma generate && npx tsc

FROM node:20-alpine AS runtime
WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=build /app/dist ./dist

RUN mkdir -p /app/sessions

EXPOSE 8080
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
