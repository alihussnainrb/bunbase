# AMANTRA Control Panel - Quick Start Guide

## Prerequisites

- Bun installed
- PostgreSQL database running
- SMTP credentials (for email notifications)

## Setup Steps

### 1. Install Dependencies

```bash
cd examples/amantra-cpanel
bun install
```

### 2. Configure Environment

Copy the example environment file and update with your credentials:

```bash
cp .env.example .env
```

Edit `.env` and set:
- `DATABASE_URL` - Your PostgreSQL connection string
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - Your SMTP credentials
- `SESSION_SECRET` - A random secret key for session encryption
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` - Initial super admin credentials

### 3. Run Database Migrations

```bash
bun run migrate
```

This will create all required tables:
- users (super admins)
- modules (Risk, Compliance)
- frameworks & framework_versions
- organizations & organization_admins
- licenses & license_modules
- product_versions
- notifications

### 4. Generate Database Types

```bash
bun run typegen
```

This introspects your database and generates TypeScript types.

### 5. Start the Server

```bash
bun run dev
```

The control panel will start at **http://localhost:3002**

## API Endpoints

### Authentication
- POST `/auth/login` - Super admin login
- GET `/auth/me` - Get current user

### Frameworks
- POST `/frameworks` - Create framework
- GET `/frameworks` - List frameworks
- GET `/frameworks/:id` - Get framework details
- PATCH `/frameworks/:id` - Update framework
- DELETE `/frameworks/:id` - Delete framework (requires password)
- POST `/frameworks/:id/versions` - Add version
- GET `/frameworks/:id/versions` - List versions
- POST `/frameworks/:id/versions/:versionId/upload` - Upload JSON content

### Organizations
- POST `/organizations` - Create organization
- GET `/organizations` - List organizations
- GET `/organizations/:id` - Get organization details
- PATCH `/organizations/:id` - Update organization
- DELETE `/organizations/:id` - Delete organization
- POST `/organizations/:id/logo` - Upload logo
- POST `/organizations/:id/notify` - Send notification to admin

### Licenses
- POST `/licenses` - Generate license
- GET `/licenses` - List licenses
- GET `/licenses/:id` - Get license details
- PATCH `/licenses/:id/reactivate` - Reactivate license
- PATCH `/licenses/:id/revoke` - Revoke license
- GET `/licenses/:id/download` - Download license JSON

### Version Registry
- POST `/versions` - Add product version
- GET `/versions` - List product versions
- GET `/versions/:id` - Get version details
- PATCH `/versions/:id` - Update version

## Example Workflow

### 1. Login as Super Admin

```bash
curl -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@amantra.com",
    "password": "admin123"
  }'
```

### 2. Create a Compliance Framework

```bash
curl -X POST http://localhost:3002/frameworks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PCI-DSS",
    "type": "Standard"
  }'
```

### 3. Add Framework Version

```bash
curl -X POST http://localhost:3002/frameworks/{frameworkId}/versions \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v4.0.1",
    "is_active": true
  }'
```

### 4. Create Organization

```bash
curl -X POST http://localhost:3002/organizations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp",
    "email": "admin@acme.com",
    "phone": "+1234567890",
    "employees": 500,
    "type": "Cloud",
    "admin_name": "John Doe",
    "admin_email": "john@acme.com"
  }'
```

An invite email will be sent to the admin automatically.

### 5. Generate License for Organization

First, get module IDs:

```bash
curl http://localhost:3002/api/modules
# Risk module: {id}
# Compliance module: {id}
```

Then generate license:

```bash
curl -X POST http://localhost:3002/licenses \
  -H "Content-Type: application/json" \
  -d '{
    "organization_id": "{orgId}",
    "module_ids": ["{riskModuleId}", "{complianceModuleId}"],
    "operational_users_limit": 50,
    "frameworks_limit": 5,
    "duration_days": 365
  }'
```

A license JSON file will be generated and saved to storage, and a notification email will be sent.

### 6. Download License

```bash
curl http://localhost:3002/licenses/{licenseId}/download > license.json
```

## Background Jobs

### License Expiry Check (Cron)

Runs daily at midnight to:
- Check for expired licenses and mark them as "Expired"
- Check for licenses expiring within 7 days
- Send email notifications to organization admins

## File Storage

- Framework JSON files: `storage/frameworks/{frameworkId}/{versionId}/...`
- Organization logos: `storage/organizations/{orgId}/logo-...`
- License files: `storage/licenses/{licenseId}/...`

## Monitoring

View logs in the console for:
- Framework operations
- Organization creation and updates
- License generation and revocation
- Email notifications
- Cron job executions

## Production Checklist

- [ ] Change `SESSION_SECRET` to a strong random string
- [ ] Update super admin password in migration file
- [ ] Implement proper bcrypt password hashing in login action
- [ ] Set up proper SMTP credentials
- [ ] Configure database backups
- [ ] Set up SSL/TLS for HTTPS
- [ ] Add rate limiting to API endpoints
- [ ] Implement proper authorization guards
- [ ] Set up monitoring and alerting
