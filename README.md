# KubeSignal

Read-only Kubernetes cluster health and drift dashboard. The local prototype is connected to Argo CD and reads live application status. The cluster health score, activity feed, quick insight, and field-level diffs are not implemented yet.

## Local setup (macOS)

Prerequisites: Homebrew, Docker Desktop running, and `kubectl` installed.

Install a local Kubernetes cluster and Argo CD:

```sh
brew install kind argocd
kind create cluster --name argocd-cluster
kubectl cluster-info --context kind-argocd-cluster
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl get pods -n argocd -w
```

Wait for Argo CD pods to be ready, then press Control+C. Start the port-forward in Terminal 1 and leave it running:

```sh
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Open [https://localhost:8080](https://localhost:8080). Get the initial admin password in another Terminal window:

```sh
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
```

Log in as `admin` and change the initial password. In the Argo CD UI, create a sample app with repository `https://github.com/argoproj/argocd-example-apps.git`, path `guestbook`, project `default`, destination `https://kubernetes.default.svc`, namespace `default`, and manual sync. Click **Sync** and wait for **Synced** and **Healthy**.

## Configure a read-only token

In Argo CD, open **Settings → Projects → default → Roles**. Create a role named `kubesignal-readonly` with this policy:

```text
p, proj:default:kubesignal-readonly, applications, get, default/*, allow
```

Create a token for that role and keep it private. Argo CD only displays the generated token once.

Copy `.env.example` to `.env.local` and set:

```env
ARGOCD_BASE_URL=https://localhost:8080
ARGOCD_TOKEN=paste-your-read-only-role-token-here
ARGOCD_CA_CERT_PATH=./certs/argocd-ca.crt
```

The local Argo CD server uses a self-signed certificate. Export its public certificate (not a private key) into the project. Try `argocd-server-tls` first:

```sh
mkdir -p certs
kubectl -n argocd get secret argocd-server-tls \
  -o jsonpath='{.data.tls\.crt}' | base64 -d > certs/argocd-ca.crt
```

If that secret does not exist, try `argocd-secret`:

```sh
kubectl -n argocd get secret argocd-secret \
  -o jsonpath='{.data.tls\.crt}' | base64 -d > certs/argocd-ca.crt
```

`.env.local` and `certs/argocd-ca.crt` are ignored by Git. TLS verification remains enabled; do not disable it. These variables are server-side only; never prefix them with `NEXT_PUBLIC_`.

## Start and stop

Start with two Terminal windows. Make sure Docker Desktop is running.

**Terminal 1 — Argo CD port-forward** (required while using KubeSignal):

```sh
cd /Users/venusonavane/Projects/Personal/auto01
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

**Terminal 2 — KubeSignal:**

```sh
cd /Users/venusonavane/Projects/Personal/auto01
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Check the live Argo CD response at [http://localhost:3000/api/argocd/applications](http://localhost:3000/api/argocd/applications); it should include `guestbook` with `Synced` and `Healthy` status.

To stop, press **Control+C** in both Terminal windows. This stops the dashboard and port-forward, but keeps the local Kubernetes cluster, Argo CD, and deployed app intact. To start again, rerun both commands. Keep the port-forward running while using the dashboard.

## Current implementation

- Live Argo CD application list via a server-side bearer token
- Search and out-of-sync filter over fetched applications
- Application detail panel with live status, revision, and resource tree
- Read-only desired/live field comparison for a selected managed resource, with sensitive values redacted
- Diff noise filtering for Kubernetes bookkeeping and common server defaults
- Live summary counts for application health and Argo CD-reported drift
- Live pod readiness, restart totals, replica mismatches, and failed Job counts from Argo CD managed resources
- Read-only UI; no sync or remediation actions
- Responsive layout

The Argo CD API routes map upstream data to a small response and never return the token or raw workload manifests to the browser. Workload health is aggregated server-side from managed Pod, Deployment, StatefulSet, DaemonSet, and Job live state. Diffs suppress Kubernetes bookkeeping (`uid`, `resourceVersion`, `managedFields`, controller revision and kubectl last-applied annotations) and selected Service/Deployment/Pod defaults only when they are absent from desired state and match known defaults. Activity history is explicitly marked unavailable until event persistence exists. No database or authentication is included.

## Next steps

1. Persist observed status transitions and drift events.
2. Add authentication, per-user cluster authorization, and secret-manager support before production use.
