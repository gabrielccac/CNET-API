FROM node:18-slim

# Instalar dependências necessárias incluindo Xvfb
RUN apt-get update \
    && apt-get install -y wget gnupg xvfb x11-xkb-utils xfonts-100dpi xfonts-75dpi xfonts-scalable x11-apps \
    && mkdir -p /etc/apt/keyrings \
    && wget -q -O- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google.gpg \
    && echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar código fonte
COPY . .

# Expor porta
EXPOSE 3000

# Iniciar a aplicação
CMD ["node", "api.js"]