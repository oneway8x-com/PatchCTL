# Offline Strategy

The active Next.js runtime is currently **online-first**.

The repository still contains offline-oriented shared packages, but they are not part of the primary `apps/app` request path today.

## Current stance

- `apps/app` should not depend on offline state to function
- route handlers assume server connectivity
- client modules should degrade gracefully on request failure

## Future direction

If offline support returns, it should be added as an explicit feature layer in `apps/app/src/modules/*` or a dedicated client surface.
