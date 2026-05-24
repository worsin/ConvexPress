# Technology Agents

Expert agents for auditing, building, and debugging with each technology in the Hybrid5Studio stack. Each agent contains all collected knowledge from the Tech Stack Tracker Airtable base.

## What Each Agent Contains

- **Tech Changes** — Breaking changes, new features, pattern shifts with old/new code examples
- **Known Issues** — Active bugs, gotchas, and workarounds with severity ratings
- **Best Practices** — Bad/good pattern pairs with explanations and priority levels
- **Audit Checklist** — Step-by-step verification checks with automated commands
- **Debug Playbook** — Symptom-based troubleshooting guides with diagnostic steps
- **Known Claude Fuck-ups** — Documented mistakes Claude has made with this technology (where applicable)
- **Migration Guides** — Version upgrade paths for breaking changes

## Agents (26)

### Frontend & UI
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| React | `react-expert.md` | 115 | 15 |
| Tailwind CSS | `tailwind-expert.md` | 76 | 4 |
| shadcn | `shadcn-expert.md` | 61 | 1 |
| BaseUI | `baseui-expert.md` | 51 | 0 |
| Lucide React | `lucide-expert.md` | 42 | 0 |
| React Hook Form | `react-hook-form-expert.md` | 53 | 0 |
| Tiptap | `tiptap-expert.md` | 52 | 0 |

### Meta-frameworks & Build Tools
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| TanStack Router | `tanstack-router-expert.md` | 51 | 3 |
| TanStack Start | `tanstack-start-expert.md` | 56 | 1 |
| Next.js | `nextjs-expert.md` | 70 | 0 |
| Vite | `vite-expert.md` | 84 | 4 |
| Turborepo | `turborepo-expert.md` | 35 | 0 |

### Backend Services
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| Convex | `convex-expert.md` | 104 | 12 |
| Clerk | `clerk-expert.md` | 65 | 1 |

### Languages & Runtimes
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| TypeScript | `typescript-expert.md` | 66 | 0 |
| Node.js | `nodejs-expert.md` | 62 | 0 |
| Bun | `bun-expert.md` | 43 | 2 |
| Python | `python-expert.md` | 55 | 0 |

### Infrastructure
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| Docker | `docker-expert.md` | 64 | 0 |
| Electron | `electron-expert.md` | 57 | 3 |
| pnpm | `pnpm-expert.md` | 54 | 0 |

### Systems Programming (Rust Stack)
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| Rust | `rust-expert.md` | 64 | 0 |
| Axum | `axum-expert.md` | 54 | 0 |
| Tokio | `tokio-expert.md` | 48 | 0 |
| Tonic | `tonic-expert.md` | 42 | 0 |

### Validation
| Agent | File | Records | Claude Mistakes |
|-------|------|---------|-----------------|
| Zod | `zod-expert.md` | 56 | 0 |

## Totals

- **26 expert agents**
- **~1,598 total knowledge records**
- **46 documented Claude mistakes** across 10 technologies
- **Airtable tracking:** Base `apphc1Zda0HD51mla`, Table `Experts` (`tbltThzwNISW4D0HX`)

## Data Source

All data sourced from the **Tech Stack Tracker** Airtable base (`apphc1Zda0HD51mla`) with 6 linked tables: Tech Changes, Known Issues, Best Practices, Audit Checklist, Debug Playbook, Known Claude Fuck-ups.
