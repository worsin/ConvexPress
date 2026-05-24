## Summary

<!-- 1-3 bullet points describing the change and why -->

## Test plan

- [ ] Typecheck passes (`bun run check-types`)
- [ ] Backend tests pass (`cd packages/backend && bun test`)
- [ ] Smoke suite passes (`cd apps/web && bun run test:smoke`)
- [ ] Smoke tests added for any new routes
- [ ] Manual DevTools check on touched routes (console clean, no failed network calls)
- [ ] For schema changes: deployed by `/experts:convex-deployment` and verified
- [ ] For role/capability changes: reseed run, propagation verified

## Risk

<!-- What could break? Anything to watch in production? -->
