# Security

## Current baseline

- keep secrets in environment variables
- do not expose database credentials to client code
- validate route handler input with contract schemas
- centralize error serialization in server helpers

## Multi-tenant caution

The new app still uses local fallback tenant/workspace context for the first extracted slice. Before broader rollout:

- replace fallback context with authenticated tenant resolution
- enforce workspace scoping in route handlers
- remove any local-development shortcuts from production
