# Bunbase Basic Example

A comprehensive example showcasing all Bunbase features: database, storage, key-value store, authentication, and more.

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```

2. Set up PostgreSQL database:
   ```bash
   # Update .env with your DATABASE_URL
   cp .env.example .env
   ```

3. Run migrations:
   ```bash
   bun run migrate
   ```

4. Start the development server:
   ```bash
   bun run dev
   ```

## Features Demonstrated

### Database (ctx.db)
- **Tasks CRUD**: Full CRUD operations using TypedQueryBuilder
  - `POST /api/tasks` - Create task
  - `GET /api/tasks` - List tasks with filtering
  - `GET /api/tasks/:id` - Get single task
  - `PATCH /api/tasks/:id` - Update task
  - `DELETE /api/tasks/:id` - Delete task

### File Storage (ctx.storage)
- **File Upload/Download**: Local filesystem storage
  - `POST /upload` - Upload file (base64 encoded)
  - `GET /download/:filename` - Download file

### Key-Value Store (ctx.kv)
- **Cache Operations**: PostgreSQL-backed KV with TTL
  - `POST /cache` - Store value with optional TTL
  - `GET /cache/:key` - Retrieve value
  - `GET /cache` - List all keys with prefix filter

### Authentication
- **Session Management**: Cookie-based sessions
  - `POST /api/auth/login` - Login with email/password
  - `GET /api/auth/me` - Get current user

### Events
- **Event Bus**: In-memory event system
  - Task creation triggers background notification
  - Event listeners respond to domain events

## API Endpoints

### Tasks
```bash
# Create a task
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "My Task", "description": "Task description"}'

# List tasks
curl http://localhost:3000/api/tasks?status=pending

# Get task
curl http://localhost:3000/api/tasks/{id}

# Update task
curl -X PATCH http://localhost:3000/api/tasks/{id} \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# Delete task
curl -X DELETE http://localhost:3000/api/tasks/{id}
```

### File Storage
```bash
# Upload file
curl -X POST http://localhost:3000/upload \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.txt", "content": "SGVsbG8gV29ybGQ=", "contentType": "text/plain"}'

# Download file
curl http://localhost:3000/download/test.txt
```

### Cache/KV
```bash
# Store value
curl -X POST http://localhost:3000/cache \
  -H "Content-Type: application/json" \
  -d '{"key": "user:123", "value": {"name": "Alice"}, "ttl": 3600}'

# Get value
curl http://localhost:3000/cache/user:123

# List keys
curl http://localhost:3000/cache?prefix=user:
```

### Authentication
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@example.com", "password": "password123"}'

# Get current user
curl http://localhost:3000/api/auth/me \
  -H "Cookie: bunbase_session=YOUR_SESSION_TOKEN"
```

## OpenAPI Documentation

View interactive API docs at: http://localhost:3000/api/docs

## Migrations

```bash
# Run pending migrations
bun run migrate

# Create new migration
bun run migrate:new add_users_table

# Check migration status
bun run migrate:status
```

## Project Structure

```
src/
├── auth/             # Authentication module
│   ├── _module.ts   # Module definition
│   ├── login.ts     # Login action
│   └── me.ts        # Get current user action
├── tasks/           # Tasks CRUD module
│   ├── _module.ts
│   ├── create-task.ts
│   ├── list-tasks.ts
│   ├── get-task.ts
│   ├── update-task.ts
│   └── delete-task.ts
├── upload-file.ts   # File upload (storage)
├── download-file.ts # File download (storage)
├── cache-demo.ts    # KV cache operations
├── health.ts        # Health check
└── on-task-created.ts # Event listener

migrations/
└── 001_init.sql     # Initial schema

bunbase.config.ts    # Configuration
.env                 # Environment variables
```

## Configuration

See `bunbase.config.ts` for:
- Database connection
- Storage adapter (local/S3)
- Authentication settings
- OpenAPI settings
- Studio dashboard

## Learn More

- [Bunbase Documentation](https://github.com/anthropics/bunbase)
- [TypedQueryBuilder API](https://github.com/anthropics/bunbase#database)
- [Storage Adapters](https://github.com/anthropics/bunbase#storage)
- [Key-Value Store](https://github.com/anthropics/bunbase#kv)
