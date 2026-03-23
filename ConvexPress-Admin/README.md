# ConvexPress Admin

Admin dashboard and Convex backend for the ConvexPress platform. Built with TanStack Router, Convex, and Tiptap.

## Part of a Two-Repo System

ConvexPress consists of **two separate repositories** that work together:

| Repository | Purpose | Deployment |
|------------|---------|------------|
| **ConvexPress-Admin** (this repo) | Admin dashboard + Convex backend (OWNER) | Desktop/internal |
| [ConvexPress-Website](https://github.com/worsin/ConvexPress-Website) | Public website (CONSUMER) | Cloud server |

**Important:** ConvexPress-Admin **owns** the Convex backend. All schema changes, mutations, and queries are defined here. ConvexPress-Website connects to this Convex deployment.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3.8+
- [Node.js](https://nodejs.org/) v22+
- [Convex](https://convex.dev/) account

### Setup

```bash
# Clone both repos into the same parent directory
git clone https://github.com/worsin/ConvexPress-Admin.git
git clone https://github.com/worsin/ConvexPress-Website.git

# Install dependencies
cd ConvexPress-Admin
bun install

# Setup Convex (first time only)
bun run dev:setup
```

### Development

```bash
# Start admin app + Convex backend
bun run dev
```

## Project Structure

```
ConvexPress-Admin/
├── apps/
│   └── web/              # Admin frontend (TanStack Router)
│       └── src/
│           ├── routes/   # File-based routing
│           └── components/
├── packages/
│   ├── backend/          # Convex functions & schema (SOURCE OF TRUTH)
│   │   └── convex/
│   │       ├── schema.ts # Database schema
│   │       └── *.ts      # Mutations, queries, actions
│   ├── config/           # Shared TypeScript config
│   └── env/              # Environment variable schemas
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start admin app + Convex backend |
| `bun run dev:web` | Start only the admin frontend |
| `bun run dev:server` | Start only Convex backend |
| `bun run dev:setup` | Initial Convex project setup |
| `bun run build` | Build for production |
| `bun run check-types` | TypeScript type checking |

## Running Both Apps Together

For local development with both apps:

1. Start ConvexPress-Admin first (it runs Convex)
2. Copy the `VITE_CONVEX_URL` from Admin's `.env.local` to Website's `.env`
3. Start ConvexPress-Website in another terminal

Or create a parent `package.json` for orchestration:

```json
{
  "name": "convexpress",
  "private": true,
  "workspaces": [
    "ConvexPress-Admin",
    "ConvexPress-Admin/apps/*",
    "ConvexPress-Admin/packages/*",
    "ConvexPress-Website",
    "ConvexPress-Website/apps/*",
    "ConvexPress-Website/packages/*"
  ],
  "scripts": {
    "dev": "turbo dev",
    "dev:admin": "turbo dev --filter=convexpress-admin...",
    "dev:website": "turbo dev --filter=convexpress-website..."
  },
  "devDependencies": {
    "turbo": "^2.6.3"
  },
  "packageManager": "bun@1.3.8"
}
```

## Tech Stack

- **TanStack Router** - Type-safe file-based routing
- **Convex** - Real-time backend, database, and functions
- **Tiptap** - Rich text editor
- **Tailwind CSS** - Utility-first styling
- **Turborepo** - Monorepo build system
- **Bun** - Package manager and runtime

## License

Private - All rights reserved
