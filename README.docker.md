# Docker Setup for ArchieOS Backend

This project includes Docker configurations for both development and production environments.

## Quick Start

### Development Mode (with hot reload)

```bash
# Start all services in development mode
docker-compose -f docker-compose.dev.yml up

# Access the application
# Frontend: http://localhost:5173
# Backend API: http://localhost:3000
# LocalStack: http://localhost:4566
```

### Production Mode

```bash
# Build and start all services
docker-compose -f docker-compose.full.yml up --build

# Access the application
# Frontend: http://localhost (port 80)
# Backend API: http://localhost:3000
# LocalStack: http://localhost:4566
```

## Services

### LocalStack
- Provides local AWS services (DynamoDB, S3, SQS, CloudWatch)
- Automatically initialized with required tables and queues
- Health check: http://localhost:4566/_localstack/health

### Backend
- Node.js/TypeScript API server
- Connects to LocalStack for AWS services
- Includes automatic database initialization and seeding
- API documentation: http://localhost:3000/openapi.json

### Frontend
- Vite + React application
- In dev mode: Hot reload enabled on port 5173
- In production: Served via Nginx on port 80
- Proxies API requests to backend

## Environment Variables

The following environment variables can be customized:

```bash
# AWS Configuration (for LocalStack)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test

# Frontend Configuration
VITE_OPERATIONS_API_URL=/v1
VITE_OPERATIONS_USER_ID=agent:noah
VITE_OPERATIONS_DEBUG_USER={"userId":"agent:noah","email":"noah@example.com","name":"Noah Agent"}
VITE_OPERATIONS_LISTING_LIMIT=100
```

## Troubleshooting

### Services not starting
```bash
# Check service logs
docker-compose -f docker-compose.dev.yml logs -f [service-name]

# Restart specific service
docker-compose -f docker-compose.dev.yml restart [service-name]
```

### LocalStack issues
```bash
# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Reset LocalStack data
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up
```

### Port conflicts
If you get port binding errors, ensure no other services are running on ports:
- 5173 (frontend dev)
- 3000 (backend)
- 4566 (LocalStack)
- 80 (frontend production)

## Development Workflow

1. Make changes to code
2. Frontend changes will hot-reload automatically
3. Backend changes require container restart:
   ```bash
   docker-compose -f docker-compose.dev.yml restart backend
   ```

## Building for Production

```bash
# Build production images
docker-compose -f docker-compose.full.yml build

# Run production containers
docker-compose -f docker-compose.full.yml up -d
```
