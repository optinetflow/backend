# ADR-001: Self-Managed Infrastructure Over Managed Cloud Services

## Status
Accepted

## Context
The platform needed database hosting, object storage, monitoring, and application deployment. The standard approach for a SaaS application would be to use managed services (AWS RDS, S3, CloudWatch, ECS/EKS). However, three constraints applied:

1. **Regulatory/sanctions restrictions** prevented access to major cloud providers (AWS, GCP, Azure) for account creation and billing.
2. **Cost sensitivity** — as a bootstrapped, solo-operated business, managed service costs for the expected scale (5,000+ concurrent subscribers) would significantly impact unit economics.
3. **Single operator** — the infrastructure needed to be manageable by one person without a dedicated DevOps team.

## Decision
Run all services (application, database, object storage, monitoring, analytics) on a single ARM64 server using Docker Compose. Specifically:

- **PostgreSQL 15** in Docker with custom tuning parameters (shared_buffers=2GB, work_mem=64MB, etc.) and persistent volumes.
- **PgBouncer** for connection pooling in transaction mode (50 pool connections serving 200 concurrent clients).
- **MinIO** as an S3-compatible object storage alternative.
- **Nginx** as reverse proxy with SSL termination, SPA routing, and static asset caching.
- **Metabase** and **Apache Superset** for business analytics, querying the same PostgreSQL instance.
- **Prometheus** for application metrics collection.
- **Autoheal** container to automatically restart unhealthy containers based on Docker healthchecks.
- **GitHub Actions** for CI/CD, deploying via SSH + Docker pull.

Each service gets its own `docker-compose.*.yml` file for independent lifecycle management.

## Consequences

**Positive:**
- Total infrastructure cost was a single server (~$20-40/month), compared to ~$200-500/month for equivalent managed services.
- Full control over database tuning, connection pooling, and caching — able to optimize PostgreSQL specifically for this workload.
- No vendor lock-in. All tooling is open-source and portable.
- Zero dependency on cloud provider accounts that could be suspended.
- Simpler mental model — one server, one network, all services reachable by container name.

**Negative:**
- No automatic failover. A server failure takes down everything until manual intervention.
- Backups are script-based (pg_dump via SSH) rather than point-in-time recovery from a managed provider.
- Monitoring and alerting are basic — no equivalent of CloudWatch alarms or PagerDuty integration out of the box.
- Scaling beyond a single server would require significant re-architecture (introducing a load balancer, read replicas, separate storage nodes).
- Security responsibility falls entirely on the operator (OS patches, Docker updates, network configuration).

**Trade-off assessment:** For a 5,000-subscriber platform operated by a single developer, the simplicity and cost advantages of self-managed infrastructure outweighed the operational risk. The platform ran for 2+ years without infrastructure-related outages.
