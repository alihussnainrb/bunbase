# AMANTRA Control Panel

Super Admin control panel for managing the AMANTRA compliance platform.

## Features

- **Framework Management** - Manage compliance frameworks (PCI-DSS, ISO, SAMA) with versioned JSON content
- **Organization Management** - Manage client organizations with admin accounts
- **License Generation** - Generate licenses with module access, user limits, and framework limits
- **Version Registry** - Track AMANTRA product versions and artifacts
- **Email Notifications** - Admin invites, license expiry reminders
- **License Expiry Monitoring** - Daily cron job to check and notify expiring licenses

## Domain Model

### Frameworks
- Framework definitions (name, type, status)
- Multiple versions per framework with JSON content
- Upload framework content via file storage

### Organizations
- Client organizations using AMANTRA
- Organization details (name, email, phone, employees, address)
- Type: Cloud or On-Premise
- Admin accounts with notification history
- Logo upload support

### Licenses
- Generated for organizations
- Modules: Risk, Compliance (multi-select)
- Operational users limit
- Frameworks limit (max frameworks org can use)
- Duration and validity period
- Status: Active, Inactive, Revoked, Expired
- Downloadable license JSON files

### Version Registry
- AMANTRA product versions
- Artifacts (Backend, Frontend, AI Services versions)
- Release type (Beta, Stable, Patch)
- Release dates

## Setup

1. Install dependencies:
```bash
bun install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your database and SMTP credentials
```

3. Run migrations:
```bash
bun run migrate
```

4. Generate database types:
```bash
bun run typegen
```

5. Start the server:
```bash
bun run dev
```

The control panel will be available at http://localhost:3002

## Database Schema

- `frameworks` - Compliance framework definitions
- `framework_versions` - Versioned framework content
- `organizations` - Client organizations
- `organization_admins` - Admin users for organizations
- `licenses` - License keys with limits and modules
- `license_modules` - Many-to-many: licenses to modules
- `modules` - Available modules (Risk, Compliance)
- `product_versions` - AMANTRA version registry
- `notifications` - Notification history

## API Endpoints

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

## Architecture

Built with Bunbase framework:
- Type-safe actions with validation
- PostgreSQL database with typed queries
- Local file storage for framework JSON and org logos
- SMTP mailer for notifications
- Cron scheduler for license expiry checks
- Event bus for async notifications
- Super admin guards for all endpoints
