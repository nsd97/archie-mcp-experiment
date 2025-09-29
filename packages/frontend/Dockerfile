# Frontend Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci

# Copy source files
COPY . .

# Build args for environment variables
ARG VITE_OPERATIONS_API_URL=/v1
ARG VITE_OPERATIONS_USER_ID=agent:noah
ARG VITE_OPERATIONS_DEBUG_USER={"userId":"agent:noah","email":"noah@example.com","name":"Noah Agent"}
ARG VITE_OPERATIONS_LISTING_LIMIT=100

# Set environment variables for build
ENV VITE_OPERATIONS_API_URL=$VITE_OPERATIONS_API_URL
ENV VITE_OPERATIONS_USER_ID=$VITE_OPERATIONS_USER_ID
ENV VITE_OPERATIONS_DEBUG_USER=$VITE_OPERATIONS_DEBUG_USER
ENV VITE_OPERATIONS_LISTING_LIMIT=$VITE_OPERATIONS_LISTING_LIMIT

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

# Add nginx config for SPA routing
RUN echo 'server { \
    listen 80; \
    server_name localhost; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /v1 { \
        proxy_pass http://app:3000; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
