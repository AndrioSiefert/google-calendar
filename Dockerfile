# ==========================
# STAGE 1: build (TypeScript -> JS)
# ==========================
FROM node:22-alpine AS builder

# Pasta de trabalho dentro do container
WORKDIR /app

# Copia definições de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instala TODAS as dependências (inclui dev, pra ter typescript)
RUN npm install

# Copia o código fonte
COPY src ./src

# Compila TypeScript -> dist/
RUN npm run build


# ==========================
# STAGE 2: runtime (apenas JS + deps de produção)
# ==========================
FROM node:22-alpine AS runner

WORKDIR /app

# Copia somente package.json para instalar deps de produção
COPY package*.json ./

#image.png# Instala apenas dependencies (sem devDependencies)
RUN npm install --omit=dev

# Copia o código compilado do stage de build
COPY --from=builder /app/dist ./dist

# Copia arquivos estáticos necessários em tempo de execução (ex.: templates HTML)
COPY public ./public

# Porta que o serviço expõe (a mesma do server.ts)
EXPOSE 3000

# Comando de inicialização
CMD ["node", "dist/server.js"]
