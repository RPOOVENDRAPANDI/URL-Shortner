FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data

EXPOSE 3000

ENV PORT=3000 \
    BASE_URL=http://localhost:3000 \
    DB_PATH=/app/data/urls.db

CMD ["node", "server.js"]
