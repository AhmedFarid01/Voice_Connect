#!/bin/bash
echo "Waiting for database to be ready..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "Database is ready!"

echo "Pushing database schema..."
npm run db:push

echo "Starting application..."
npm run start