FROM oven/bun:1-alpine

WORKDIR /app

# Copy lockfile for deterministic builds
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Run as non-root user
USER bun

EXPOSE 3000

# Use exec to forward signals (graceful shutdown)
CMD ["sh", "-c", "bun run db:migrate && exec bun run start"]
