# HabeshaHub — Deployment Guide

This guide covers every step required to run HabeshaHub in local development, Docker Compose, and a production Kubernetes cluster.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Environment Variables](#environment-variables)
4. [Docker Build](#docker-build)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Database Management](#database-management)
8. [Monitoring & Health Checks](#monitoring--health-checks)
9. [Production Checklist](#production-checklist)
10. [Mobile (Expo) Preview](#mobile-expo-preview)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Runtime & Tooling

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 20.x LTS | API runtime (engines field enforces >=20) |
| npm | 10.x | Package management |
| Docker | 24.x | Container builds and local infra |
| Docker Compose | v2.x | Local service orchestration |
| kubectl | 1.28+ | Kubernetes cluster management |
| Helm | 3.x | (Optional) chart-based deployments |

### Infrastructure Services

All services are provided via Docker Compose locally. In production they run as Kubernetes StatefulSets.

| Service | Version | Purpose |
|---------|---------|---------|
| PostgreSQL | 16-alpine | Primary relational database |
| Redis | 7-alpine | Cache, pub/sub, rate-limit counters |
| NATS | 2.10-alpine (JetStream) | Distributed event bus |
| MinIO | latest | S3-compatible object storage (dev/staging) |
| MeiliSearch | v1.6 | Full-text search engine |

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/habeshahub/habeshahub-backend.git
cd habeshahub-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in every required value. See the [Environment Variables](#environment-variables) section for a full description of each variable.

### 4. Start infrastructure services

```bash
docker compose up -d postgres redis nats minio meilisearch
```

Wait for all services to report healthy:

```bash
docker compose ps
```

All services expose the following ports locally:

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| NATS client | 4222 |
| NATS monitoring | 8222 |
| MinIO API | 9000 |
| MinIO Console | 9001 |
| MeiliSearch | 7700 |

### 5. Set up the database

Generate the Prisma client and apply all migrations:

```bash
npx prisma generate
npx prisma migrate deploy
```

Seed the database with initial data:

```bash
npm run db:seed
```

### 6. Start the development server

```bash
npm run dev
```

The API is now available at `http://localhost:3000`. The `tsx watch` process automatically restarts on file changes.

### Useful development scripts

```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting files
npm run lint         # ESLint over src/
npm run db:migrate   # Create and apply a new migration
npm run db:studio    # Launch Prisma Studio at http://localhost:5555
npm run db:seed      # Re-run the seed script
```

---

## Environment Variables

Copy `.env.example` to `.env` and populate the values below. Variables marked **required** must be set before the server will start correctly.

### Server

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `development` | Yes | Runtime environment. Set to `production` in deployed environments. |
| `PORT` | `3000` | Yes | HTTP port the Express server listens on. |

### Database

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | `postgresql://habeshahub:password@localhost:5432/habeshahub_db` | Yes | Full Prisma-compatible PostgreSQL connection string. In Docker Compose the hostname is `postgres`; in Kubernetes it is `postgres-primary`. |

### Authentication (JWT)

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | *(random 64-char string)* | Yes | HMAC secret used to sign and verify JSON Web Tokens. **Must be at least 32 characters.** Rotate by issuing a new secret and coordinating token expiry. |
| `JWT_EXPIRES_IN` | `24h` | Yes | Token lifetime in [ms/vercel format](https://github.com/vercel/ms). Use shorter values (e.g. `1h`) in high-security contexts. |

### Redis

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `REDIS_URL` | `redis://localhost:6379` | Yes | ioredis-compatible connection URL. Supports `redis://`, `rediss://` (TLS), and sentinel/cluster formats. In Kubernetes the service is `redis-master:6379`. |

### NATS Event Bus

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `NATS_URL` | `nats://localhost:4222` | Yes | NATS server connection URL. For the Kubernetes cluster with 3 replicas, use comma-separated seed URLs: `nats://nats-0.nats:4222,nats://nats-1.nats:4222,nats://nats-2.nats:4222`. |
| `NATS_ENABLED` | `false` | Yes | Set to `true` to activate event publishing and consumption. Leave `false` in local development when not testing event-driven features. |

### S3 / Object Storage

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `S3_BUCKET` | `habeshahub-media` | Yes | Name of the bucket that stores all user-uploaded media. |
| `S3_REGION` | `us-west-2` | Yes | AWS region (or MinIO region, which can be any non-empty string). |
| `S3_ACCESS_KEY` | *(IAM access key)* | Yes | AWS IAM or MinIO access key with `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` permissions on the bucket. |
| `S3_SECRET_KEY` | *(IAM secret)* | Yes | Corresponding secret key for the access key above. |
| `CDN_BASE_URL` | `https://cdn.habeshahub.com` | Yes | Public base URL prepended to all media paths returned by the API. In development with MinIO this is `http://localhost:9000/habeshahub-media`. |

### MeiliSearch

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `MEILISEARCH_HOST` | `http://localhost:7700` | Yes | Base URL of the MeiliSearch instance. In Docker Compose: `http://meilisearch:7700`. In Kubernetes: `http://meilisearch:7700`. |
| `MEILISEARCH_KEY` | *(master key string)* | Yes | MeiliSearch master key. All search and index operations use this key. Change the default `masterKey123` before deploying to any shared environment. |

### Firebase Cloud Messaging (FCM)

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `FCM_PROJECT_ID` | `habeshahub-prod` | Yes (push) | Firebase project ID found in the Firebase console under Project Settings. |
| `FCM_SERVER_KEY` | `AAAA...` | Yes (push) | Legacy FCM server key or a service-account JSON path for HTTP v1 API. Required to send Android push notifications. |

### Apple Push Notification Service (APNs)

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `APNS_KEY_ID` | `ABC123DEFG` | Yes (iOS push) | 10-character key ID from the Apple Developer portal (.p8 key). |
| `APNS_TEAM_ID` | `TEAMID1234` | Yes (iOS push) | 10-character Team ID from the Apple Developer account. |
| `APNS_BUNDLE_ID` | `com.habeshahub.app` | Yes (iOS push) | App bundle identifier that matches the provisioning profile. |

### OpenAI

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `OPENAI_API_KEY` | `sk-...` | No | OpenAI API key for AI-powered features (content recommendations, moderation). Leave blank to disable AI features. |

### Analytics

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `CLICKHOUSE_URL` | `http://clickhouse:8123` | No | ClickHouse connection URL for event analytics. Leave blank to disable analytics writes. |
| `POSTHOG_API_KEY` | `phc_...` | No | PostHog project API key for product analytics and feature flags. |

### CORS & Rate Limiting

| Variable | Example | Required | Description |
|----------|---------|----------|-------------|
| `CORS_ORIGINS` | `https://habeshahub.com,https://app.habeshahub.com` | Yes | Comma-separated list of allowed CORS origins. In development include `http://localhost:3001` and `http://localhost:19006` (Expo Metro). |
| `RATE_LIMIT_POINTS` | `200` | Yes | Maximum number of requests allowed per IP per `RATE_LIMIT_DURATION` window. |
| `RATE_LIMIT_DURATION` | `86400` | Yes | Rate-limit sliding window in seconds. `86400` = 24 hours. |

---

## Docker Build

The `Dockerfile` uses a multi-stage build to produce a lean production image.

### Stage overview

| Stage | Base | Purpose |
|-------|------|---------|
| `deps` | `node:20-alpine` | Install production `node_modules` |
| `build` | `node:20-alpine` | Install dev deps, generate Prisma client, compile TypeScript |
| `production` | `node:20-alpine` | Copy compiled output + production modules only |

### Build the image locally

```bash
docker build -t habeshahub/api:local .
```

Target a specific stage (e.g. to debug the build stage):

```bash
docker build --target build -t habeshahub/api:build-debug .
```

### Run the container locally

```bash
docker run --rm \
  --env-file .env \
  -e NODE_ENV=production \
  -p 3000:3000 \
  --network habeshahub-backend_default \
  habeshahub/api:local
```

The `--network` flag connects the container to the Docker Compose network so it can reach `postgres`, `redis`, etc. by hostname.

### Run the full stack with Docker Compose

```bash
# Build the backend image and start all services
docker compose up --build

# Run in detached mode
docker compose up --build -d

# View logs
docker compose logs -f backend

# Stop everything
docker compose down

# Stop and remove volumes (destructive — wipes all local data)
docker compose down -v
```

The Nginx reverse proxy listens on port `80` and forwards requests to the backend container.

---

## Kubernetes Deployment

All manifests live in `k8s/base/`. Apply them with `kubectl` or wire them into an Argo CD / Flux CD GitOps pipeline.

### Namespace

```bash
kubectl apply -f k8s/base/namespace.yaml
```

Creates the `habeshahub` namespace with standard platform labels.

### Secrets & ConfigMap

The `k8s/base/configmap.yaml` file contains two resources:

- **`habeshahub-config` (ConfigMap)** — non-sensitive configuration: `NODE_ENV`, `PORT`, CORS origins, rate-limit settings, NATS URL, S3 bucket, CDN base URL.
- **`habeshahub-secrets` (Secret)** — sensitive values: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, third-party API keys.

**Never commit real secrets to version control.** Use one of the following approaches in production:

#### Option A — Sealed Secrets (Bitnami)

```bash
# Install the controller once per cluster
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets -n kube-system sealed-secrets/sealed-secrets

# Seal a secret
kubeseal --format=yaml < k8s/base/configmap.yaml > k8s/base/configmap.sealed.yaml
kubectl apply -f k8s/base/configmap.sealed.yaml
```

#### Option B — External Secrets Operator

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets -n external-secrets --create-namespace
```

Then create an `ExternalSecret` resource pointing at AWS Secrets Manager, HashiCorp Vault, or GCP Secret Manager.

#### Apply secrets (development/staging only)

For non-production clusters you can apply the raw manifest after substituting the placeholder values:

```bash
# Replace CHANGE_ME values in configmap.yaml first, then:
kubectl apply -f k8s/base/configmap.yaml
```

### Stateful Services

```bash
# PostgreSQL — 50Gi gp3 PVC, single primary
kubectl apply -f k8s/base/postgres.yaml

# Redis — 10Gi gp3 PVC, LRU eviction, 512 MB maxmemory
kubectl apply -f k8s/base/redis.yaml

# NATS JetStream — 3-node cluster, 5Gi per node
kubectl apply -f k8s/base/nats.yaml

# MeiliSearch — single replica, 20Gi gp3 PVC
kubectl apply -f k8s/base/meilisearch.yaml
```

All StatefulSets use the `gp3` storage class. If your cluster uses a different class, patch the `storageClassName` field before applying.

### Database Migration Job

Run migrations before updating the API deployment:

```bash
kubectl apply -f k8s/base/migration-job.yaml
kubectl -n habeshahub wait --for=condition=complete job/prisma-migrate --timeout=120s
```

The job is annotated with `argocd.argoproj.io/hook: PreSync` so Argo CD runs it automatically as a pre-sync hook. A `CronJob` (`search-reindex`) runs at 3 AM daily to keep MeiliSearch indexes in sync.

### API Deployment

```bash
kubectl apply -f k8s/base/api-deployment.yaml
```

This creates:

- **Deployment** — 3 replicas, rolling update with `maxSurge: 1` / `maxUnavailable: 0`, spread across nodes via `topologySpreadConstraints`.
- **Service** — ClusterIP on port 3000.
- **ServiceAccount** — dedicated identity for the API pods.
- **HorizontalPodAutoscaler** — scales between 3–20 replicas; triggers at 70% CPU or 80% memory.

Resource allocations per pod:

| | CPU | Memory |
|-|-----|--------|
| Request | 250m | 256Mi |
| Limit | 1000m | 512Mi |

### Ingress & TLS

```bash
kubectl apply -f k8s/base/ingress.yaml
```

Requires the [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) controller and [cert-manager](https://cert-manager.io/) with a `letsencrypt-prod` ClusterIssuer. The ingress:

- Terminates TLS for `api.habeshahub.com` using a cert-manager-managed certificate stored in the `habeshahub-tls` secret.
- Enables WebSocket upgrades for Socket.io (`Upgrade` / `Connection` headers).
- Enforces ingress-level rate limiting: 50 RPS per IP with a burst multiplier of 5.
- Applies a `NetworkPolicy` restricting pod-to-pod traffic to only the required ports (5432, 6379, 4222, 7700) plus outbound HTTPS (443) for external APIs.

#### Install ingress-nginx and cert-manager (if not present)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

Create the Let's Encrypt ClusterIssuer:

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ops@habeshahub.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

### Apply everything at once

```bash
kubectl apply -f k8s/base/
```

### Verify the deployment

```bash
# Check pod status
kubectl -n habeshahub get pods

# Watch rollout progress
kubectl -n habeshahub rollout status deployment/habeshahub-api

# View API logs
kubectl -n habeshahub logs -l app=habeshahub-api --tail=100 -f

# Run a health check from inside the cluster
kubectl -n habeshahub exec deploy/habeshahub-api -- wget -qO- http://localhost:3000/health
```

### Update the image tag

```bash
kubectl -n habeshahub set image deployment/habeshahub-api \
  api=ghcr.io/habeshahub/api:<NEW_SHA>
kubectl -n habeshahub rollout status deployment/habeshahub-api --timeout=300s
```

### Roll back a bad deployment

```bash
kubectl -n habeshahub rollout undo deployment/habeshahub-api
```

---

## CI/CD Pipeline

The GitHub Actions workflow at `.github/workflows/ci-cd.yaml` runs on every push to `main` or `develop` and on pull requests targeting `main`.

### Jobs

```
push / PR
    │
    ▼
┌──────────────────────────────────────┐
│  quality  (all branches & PRs)       │
│  • npm ci                            │
│  • npx prisma generate               │
│  • npm run typecheck                 │
│  • npm run lint                      │
└──────────────────────────────────────┘
    │ (push events only)
    ▼
┌──────────────────────────────────────┐
│  build                               │
│  • docker/login → ghcr.io           │
│  • docker/metadata-action            │
│    tags: SHA, branch name, semver    │
│  • docker/build-push-action          │
│    (GHA layer cache enabled)         │
└──────────────────────────────────────┘
    │                    │
    ▼ (develop)          ▼ (main)
┌─────────────┐    ┌──────────────────────┐
│deploy-staging│   │ deploy-production     │
│ environment: │   │ environment:          │
│   staging   │    │   production          │
│             │    │                       │
│ namespace:  │    │ namespace:            │
│ habeshahub- │    │ habeshahub            │
│  staging    │    │                       │
└─────────────┘    └──────────────────────┘
```

### Branch strategy

| Branch | Environment | Namespace | Triggered by |
|--------|-------------|-----------|--------------|
| `develop` | Staging | `habeshahub-staging` | Push to `develop` |
| `main` | Production | `habeshahub` | Push to `main` |

Pull requests run only the `quality` job — no image build or deployment.

### Image tagging

Every pushed image receives three tags simultaneously:

- `<commit-sha>` — immutable, used for deployments
- `<branch-name>` — `main` or `develop`
- `<semver>` — when the commit is tagged with a version (e.g. `v1.2.3`)

### Required GitHub Secrets

Configure these under **Settings → Environments** in your repository:

| Secret | Environment | Description |
|--------|-------------|-------------|
| `KUBE_CONFIG_STAGING` | `staging` | Base64-encoded kubeconfig for the staging cluster |
| `KUBE_CONFIG_PRODUCTION` | `production` | Base64-encoded kubeconfig for the production cluster |
| `GITHUB_TOKEN` | (automatic) | Provided by GitHub Actions; used for GHCR push |

Generate a base64-encoded kubeconfig:

```bash
cat ~/.kube/config | base64 -w 0
```

---

## Database Management

### Prisma workflow

```bash
# Generate the Prisma client after schema changes
npx prisma generate

# Create and apply a new migration (development)
npx prisma migrate dev --name <descriptive_name>

# Apply pending migrations in CI/production (no schema drift check)
npx prisma migrate deploy

# Open Prisma Studio (GUI)
npx prisma db studio
```

### Migration naming convention

Use descriptive, snake_case names:

```bash
npx prisma migrate dev --name add_user_profile_fields
npx prisma migrate dev --name create_community_table
npx prisma migrate dev --name add_post_media_index
```

### Rolling back a migration

Prisma does not support automatic rollbacks. To revert a migration:

1. Create a new migration that reverses the schema change:

   ```bash
   npx prisma migrate dev --name revert_<original_migration_name>
   ```

2. Write the inverse SQL manually in the generated migration file.

3. Deploy the revert migration:

   ```bash
   npx prisma migrate deploy
   ```

### Seeding

```bash
# Run the seed script (uses tsx to execute prisma/seed.ts)
npm run db:seed
```

In Kubernetes, run the seed as a one-off Job after the migration Job completes:

```bash
kubectl -n habeshahub-staging run seed-job \
  --image=ghcr.io/habeshahub/api:<SHA> \
  --restart=Never \
  --env-from=secret/habeshahub-secrets \
  -- npx tsx prisma/seed.ts
```

### Backup strategy

**PostgreSQL on Kubernetes** — use `pg_dump` via a CronJob:

```bash
# Manual on-demand backup
kubectl -n habeshahub exec statefulset/postgres -- \
  pg_dump -U habeshahub habeshahub_db | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

Recommended production approach:

- Deploy [pgBackRest](https://pgbackrest.org/) or [Barman](https://www.pgbarman.org/) as a sidecar for continuous WAL archiving to S3/GCS.
- Set a daily full backup schedule and retain 30 days.
- Test restores monthly.

**Docker Compose (local)** — the `postgres_data` volume can be backed up with:

```bash
docker run --rm \
  -v habeshahub-backend_postgres_data:/var/lib/postgresql/data \
  -v $(pwd):/backup \
  postgres:16-alpine \
  tar czf /backup/postgres_backup_$(date +%Y%m%d).tar.gz /var/lib/postgresql/data
```

---

## Monitoring & Health Checks

### Health endpoint

The API exposes a health check at:

```
GET /health
```

This endpoint is used by:
- Docker Compose `healthcheck` (30s interval)
- Kubernetes liveness probe (30s period, 15s initial delay)
- Kubernetes readiness probe (10s period, 5s initial delay)
- Kubernetes startup probe (5s period, up to 60s to become ready)
- CI post-deploy verification step

### Logging

The application uses [Winston](https://github.com/winstonjs/winston) with structured JSON output in production. Each log line includes:

- `timestamp` — ISO 8601
- `level` — `error`, `warn`, `info`, `debug`
- `message` — human-readable description
- `requestId` — trace ID for correlating request lifecycle logs
- `method`, `path`, `statusCode`, `durationMs` — HTTP request fields

Collect logs from Kubernetes with:

```bash
kubectl -n habeshahub logs -l app=habeshahub-api --tail=200 -f
```

Ship to a log aggregation backend (e.g. Loki, Elasticsearch, Datadog) by running a Fluent Bit or Fluentd DaemonSet.

### Recommended observability stack

| Concern | Tool |
|---------|------|
| Metrics | Prometheus + Grafana |
| Tracing | OpenTelemetry → Jaeger or Tempo |
| Error tracking | Sentry (`@sentry/node`) |
| Uptime / synthetic | Grafana Cloud Synthetic Monitoring or Checkly |
| Log aggregation | Grafana Loki + Promtail |

#### Prometheus scrape config

Expose application metrics by adding `prom-client` and a `/metrics` endpoint. Then annotate the pod:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

---

## Production Checklist

Before going live, verify every item below:

- [ ] All environment variables set (no empty required values)
- [ ] `JWT_SECRET` is at least 32 characters and randomly generated
- [ ] `NODE_ENV=production` in all deployed pods
- [ ] SSL/TLS certificates issued and auto-renewing via cert-manager
- [ ] Database password changed from `CHANGE_ME_IN_PRODUCTION`
- [ ] Database backups configured and tested
- [ ] Rate limiting enabled (`RATE_LIMIT_POINTS` / `RATE_LIMIT_DURATION`)
- [ ] CORS configured for production domains only (no `localhost` origins)
- [ ] Firebase project configured and `FCM_PROJECT_ID` / `FCM_SERVER_KEY` set
- [ ] APNs `.p8` key uploaded; `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID` set
- [ ] S3 bucket created with appropriate IAM policy; `S3_ACCESS_KEY` / `S3_SECRET_KEY` set
- [ ] `CDN_BASE_URL` pointing to the production CDN (CloudFront, Cloudflare R2, etc.)
- [ ] MeiliSearch master key changed from default; `MEILISEARCH_KEY` set
- [ ] NATS cluster healthy (3 replicas); `NATS_ENABLED=true`
- [ ] Ingress-nginx and cert-manager deployed
- [ ] `letsencrypt-prod` ClusterIssuer created
- [ ] NetworkPolicy applied (restricts pod-to-pod traffic)
- [ ] HPA configured and `metrics-server` running in the cluster
- [ ] Admin account created via seed script or manually
- [ ] Search indexes populated (`search-reindex` CronJob run at least once)
- [ ] `KUBE_CONFIG_STAGING` and `KUBE_CONFIG_PRODUCTION` secrets added to GitHub Actions
- [ ] Sentry DSN configured for error tracking
- [ ] Log aggregation pipeline operational

---

## Mobile (Expo) Preview

The mobile client lives in the sibling `habeshahub-mobile` directory.

```bash
# Navigate to the mobile project
cd ../habeshahub-mobile    # or wherever the Expo project resides

# Install dependencies
npm install

# Start the Expo development server
npx expo start
```

Once Metro starts, scan the QR code displayed in the terminal with:

- **iOS** — the built-in Camera app (iOS 16+) or Expo Go from the App Store
- **Android** — Expo Go from the Play Store

The mobile app connects to the backend at the `API_BASE_URL` defined in its `.env` (default `http://localhost:3000`). On a physical device on the same Wi-Fi network, replace `localhost` with your machine's local IP address.

To preview against staging:

```bash
EXPO_PUBLIC_API_URL=https://api-staging.habeshahub.com npx expo start
```

---

## Troubleshooting

### `prisma migrate deploy` fails with "database does not exist"

The `DATABASE_URL` is pointing at a database that hasn't been created yet. Create it manually:

```bash
docker compose exec postgres psql -U habeshahub -c "CREATE DATABASE habeshahub_db;"
```

Then re-run `npx prisma migrate deploy`.

---

### `ECONNREFUSED` connecting to Redis / PostgreSQL / NATS

**Local:** Make sure the Docker Compose services are running and healthy:

```bash
docker compose ps
docker compose up -d postgres redis nats
```

**Kubernetes:** Check that the StatefulSet pods are `Running` and the Service DNS resolves:

```bash
kubectl -n habeshahub get pods -l tier=database
kubectl -n habeshahub exec deploy/habeshahub-api -- nslookup postgres-primary
```

---

### MeiliSearch returns `401 Unauthorized`

The `MEILISEARCH_KEY` in your environment does not match the key the MeiliSearch instance was started with (`MEILI_MASTER_KEY`). Ensure both are identical.

---

### Docker Compose backend container exits immediately

Check the logs:

```bash
docker compose logs backend
```

Common causes:
- `.env` file missing or a required variable is empty
- `postgres` or `redis` containers not yet healthy when the backend starts (the `depends_on` condition `service_healthy` should prevent this, but re-running `docker compose up` often resolves transient race conditions)

---

### Kubernetes pods stuck in `Pending`

Usually a storage class issue. Verify the `gp3` storage class exists:

```bash
kubectl get storageclass
```

If it doesn't exist, patch the `storageClassName` in each StatefulSet's `volumeClaimTemplates` to match an available class, or create a `gp3` alias:

```bash
kubectl patch storageclass gp2 -p '{"metadata": {"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
kubectl apply -f - <<EOF
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
reclaimPolicy: Retain
allowVolumeExpansion: true
EOF
```

---

### Ingress returns 502 Bad Gateway

The API pods are not ready. Check:

```bash
kubectl -n habeshahub get endpoints habeshahub-api
kubectl -n habeshahub describe ingress habeshahub-ingress
kubectl -n habeshahub logs -l app=habeshahub-api --tail=50
```

---

### GitHub Actions deployment step fails with `kubectl: command not found`

The `azure/setup-kubectl@v4` step installs kubectl automatically. If you see this error it means an earlier step failed or the action was skipped. Check the workflow run logs for the preceding step.

---

### `npm run dev` shows `tsx: command not found`

`tsx` is a dev dependency. Run `npm install` first:

```bash
npm install
npm run dev
```

---

*Last updated: March 2026*
