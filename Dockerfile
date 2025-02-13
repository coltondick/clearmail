# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app/src

# Install Git and other dependencies
RUN apk add --no-cache git openssl

# Clone the repository during build time (this ensures it always fetches the latest)
RUN git clone https://github.com/coltondick/clearmail.git /app/src

# Install dependencies
RUN npm install

# Make executable
RUN chmod +x /app/src/entrypoint.sh

# Use the entrypoint script to set up the .env file and start the app
ENTRYPOINT ["/app/src/entrypoint.sh"]
