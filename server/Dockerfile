FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
RUN bun install --production

COPY . .

RUN bun run db:generate

EXPOSE 3000

CMD ["bun", "run", "start"]
