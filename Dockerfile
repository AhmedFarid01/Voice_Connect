# Use Node.js 20 as the base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create a startup script
RUN echo '#!/bin/bash\n\
echo "Waiting for database to be ready..."\n\
while ! nc -z postgres 5432; do\n\
  sleep 1\n\
done\n\
echo "Database is ready!"\n\
\n\
echo "Pushing database schema..."\n\
npm run db:push\n\
\n\
echo "Starting application..."\n\
npm run start' > /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

# Install netcat for database health check
RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Expose port 5000
EXPOSE 5000

# Start the application using the entrypoint script
CMD ["/app/docker-entrypoint.sh"]