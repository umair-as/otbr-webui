# --- Dev stage ---
FROM node:22-slim AS dev

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

EXPOSE 5173 8080
CMD ["npm", "run", "dev"]

# --- Build stage ---
FROM dev AS build

RUN npm run build

# --- Production stage ---
FROM node:22-slim AS production

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 80
ENV PORT=80
CMD ["node", "dist/server/index.js"]
