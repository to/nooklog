FROM mcr.microsoft.com/playwright:v1.59.0-noble

# Install system dependencies required for building native modules (e.g., node-llama-cpp)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifest files first to leverage Docker build caching for dependencies
COPY package*.json ./

# Skip browser download during npm install as they are already pre-installed in the base image
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install node modules using cache mount for faster builds
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

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
