FROM node:18-slim

RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates \
    fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 \
    libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 \
    libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 \
    libxfixes3 libxrandr2 libxshmfence1 xdg-utils \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV SESSIONS_DIR=/data/sessions
ENV DB_PATH=/data/accounts.db
ENV TELEGRAM_BOT_TOKEN=8351126929:AAGxUlqKBpRNedRugObQnYY54OXxPtDDdl0
ENV ADMIN_ID=458204971

CMD ["npm", "start"]
