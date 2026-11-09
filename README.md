# KubeSignal

Read-only Kubernetes cluster health and drift dashboard. The current UI is an interactive frontend prototype backed by seeded sample data.

## Run locally

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Connect to Argo CD

Copy `.env.example` to `.env.local`, then set `ARGOCD_BASE_URL` and `ARGOCD_TOKEN`. These are server-only variables; never add the `NEXT_PUBLIC_` prefix and never commit `.env.local`.

Use a dedicated Argo CD identity/project role token with permission to get/list applications only. The integration requires network access from the Next.js server to the Argo CD API endpoint and valid HTTPS certificates (HTTPS is required except for localhost development).

The dashboard calls the server route at `/api/argocd/applications`; that route calls Argo CD, maps its response into a small safe shape, and returns it to the browser. The token is never returned to the browser. Refresh re-queries Argo CD.

## Current slice

- Argo CD application list using a server-side bearer token
- Application search and out-of-sync filter over fetched data
- Application detail panel with live status/revision and a clear note that field-level diffs are not implemented yet
- Read-only affordances
- Responsive layout for smaller screens

Cluster health cards, activity feed, and quick insight remain illustrative. Application listing/status is live only when Argo CD variables are configured. No data is persisted and no remediation action is available.

## Next implementation steps

1. Fetch resource details and field-level diffs; redact sensitive fields.
2. Derive health summaries only from actual application and Kubernetes data.
3. Add Postgres persistence for observed status transitions and drift events.
4. Add authentication, per-user cluster authorization, and secret-manager support before connecting production clusters.

Keep the first live integration read-only. Argo CD credentials must stay server-side and should have the minimum required permissions.
