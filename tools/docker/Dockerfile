FROM node:22-slim

# Install system dependencies required for building native modules (e.g., node-llama-cpp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifest files first to leverage Docker build caching for dependencies
COPY package*.json ./

# Install production-only dependencies to keep the image lightweight
RUN npm install --omit=dev

# Copy the rest of the application source code
# Files specified in .dockerignore will be excluded
COPY . .

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=5050

# Application resides on port 5050
EXPOSE 5050

# Start the application server
CMD ["npm", "start"]
