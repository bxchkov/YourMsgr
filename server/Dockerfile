FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

# Run as non-root user
USER bun

EXPOSE 3000

# Use exec to forward signals (graceful shutdown)
CMD ["sh", "-c", "bun run db:migrate && exec bun run start"]
