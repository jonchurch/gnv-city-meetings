#!/bin/bash
set -e

echo "Starting Redis container..."
docker-compose up -d redis

echo "Waiting for Redis to be ready..."
for i in {1..30}; do
  if docker exec gnv-meetings-redis redis-cli ping > /dev/null 2>&1; then
    echo "Redis is ready!"
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo "Redis failed to start within 30 seconds"
exit 1