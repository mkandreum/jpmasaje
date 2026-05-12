# Utilizamos node:22-alpine que soporta la flag --experimental-strip-types
FROM node:22-alpine AS builder

WORKDIR /app

# Instalar todas las dependencias
COPY package*.json ./
RUN npm ci

# Copiar el código fuente y compilar (frontend Vite)
COPY . .
RUN npm run build

# Imagen de producción
FROM node:22-alpine AS runner

WORKDIR /app

# Establecer entorno de producción
ENV NODE_ENV=production
ENV PORT=3000

# Copiar package.json y package-lock.json
COPY --from=builder /app/package*.json ./

# Copiamos node_modules para que server.ts pueda arrancar sin problemas (incluye vite que es dinámico/estático dependiendo del entorno)
COPY --from=builder /app/node_modules ./node_modules

# Copiar el build de frontend
COPY --from=builder /app/dist ./dist

# Copiar nuestro backend
COPY --from=builder /app/server.ts ./

EXPOSE 3000

# Iniciar servidor con flags nativas de Typescript de NodeJS 22+
CMD ["npm", "start"]
