# ConvexPress Website

Public-facing website for the ConvexPress platform. Built with TanStack Start (SSR), Convex, and Clerk authentication.

## Part of a Two-Repo System

ConvexPress consists of **two separate repositories** that work together:

| Repository | Purpose | Deployment |
|------------|---------|------------|
| [ConvexPress-Admin](https://github.com/worsin/ConvexPress-Admin) | Admin dashboard + Convex backend (OWNER) | Desktop/internal |
| **ConvexPress-Website** (this repo) | Public website (CONSUMER) | Cloud server |

**Important:** This repo is a **consumer** of the Convex backend. It connects to ConvexPress-Admin's Convex deployment via `VITE_CONVEX_URL`. **Never** run `convex dev` or `convex deploy` from this repo.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) v1.3.8+
- [Node.js](https://nodejs.org/) v22+
- ConvexPress-Admin set up and running (or deployed to Convex cloud)

### Setup

```bash
# Clone both repos into the same parent directory
git clone https://github.com/worsin/ConvexPress-Admin.git
git clone https://github.com/worsin/ConvexPress-Website.git

# Install dependencies
cd ConvexPress-Website
bun install

# Copy Convex URL from Admin
# Get VITE_CONVEX_URL from ConvexPress-Admin/packages/backend/.env.local
# Add it to ConvexPress-Website/apps/web/.env
```

### Development

```bash
# Start website (connects to Admin's Convex)
bun run dev
```

## Project Structure

```
ConvexPress-Website/
├── apps/
│   └── web/              # Website frontend (TanStack Start - SSR)
│       └── src/
│           ├── routes/   # File-based routing
│           └── components/
├── packages/
│   ├── backend/          # Convex codegen only (CONSUMER - no schema)
│   ├── config/           # Shared TypeScript config
│   └── env/              # Environment variable schemas
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start website in development mode |
| `bun run dev:web` | Start only the web frontend |
| `bun run build` | Build for production |
| `bun run check-types` | TypeScript type checking |

## Environment Variables

Create `apps/web/.env` with:

```env
VITE_CONVEX_URL=https://your-deployment.convex.cloud
AUTH_API_KEY=sk_...
AUTH_CLIENT_ID=client_...
```

Get `VITE_CONVEX_URL` from ConvexPress-Admin after running `bun run dev:setup`.

## Running Both Apps Together

For local development with both apps:

1. Start ConvexPress-Admin first (it runs Convex)
2. Copy the `VITE_CONVEX_URL` from Admin's `.env.local` to Website's `.env`
3. Start ConvexPress-Website in another terminal

Or create a parent `package.json` for orchestration (see ConvexPress-Admin README).

## Tech Stack

- **TanStack Start** - Full-stack React framework with SSR
- **Convex** - Real-time backend (consuming Admin's deployment)
- **Clerk** - Authentication
- **Tailwind CSS** - Utility-first styling
- **Turborepo** - Monorepo build system
- **Bun** - Package manager and runtime

## Deployment

This app is designed for cloud deployment with auto-deploy:

1. Connect your cloud provider to this GitHub repo
2. Set environment variables (`VITE_CONVEX_URL`, `AUTH_API_KEY`, etc.)
3. Build command: `bun run build`
4. Output directory: `.output`

## License

Private - All rights reserved
