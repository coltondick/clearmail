#!/bin/sh

# Generate the .env file dynamically from environment variables
cat <<EOF >/app/.env
OPENAI_API_KEY=${OPENAI_API_KEY}
IMAP_USER=${IMAP_USER}
IMAP_PASSWORD=${IMAP_PASSWORD}
IMAP_HOST=${IMAP_HOST:-imap.gmail.com}
IMAP_PORT=${IMAP_PORT:-993}
CONFIG_YML_PATH=${CONFIG_YML_PATH}
EOF

# Start the application
node /app/src/server.js
