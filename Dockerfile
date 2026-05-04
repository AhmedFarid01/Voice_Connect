# Lumen — video sharing & live broadcast app
FROM node:20-slim

WORKDIR /app

# System deps: netcat for the DB readiness probe; ffmpeg for thumbnail/duration
# extraction on uploaded videos.
RUN apt-get update \
    && apt-get install -y --no-install-recommends netcat-openbsd ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install JS deps first for better layer caching
COPY package*.json ./
RUN npm install

# Copy the rest of the source (incl. migrations/ and db/migrate.ts)
COPY . .

# Build the client + server bundles
RUN npm run build

# Normalize line endings + make entrypoint executable (handles Windows checkouts)
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh \
    && chmod +x /app/docker-entrypoint.sh

EXPOSE 5000

CMD ["/app/docker-entrypoint.sh"]
