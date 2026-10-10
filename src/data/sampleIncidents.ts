import { IncidentInvestigation, WhatIfPreset } from '../types/trace';

export const INITIAL_INCIDENTS: IncidentInvestigation[] = [
  {
    id: 'INC-2026-0842',
    title: 'Checkout API 504 Gateway Timeouts & Order Drop following v2.14.0 Release',
    severity: 'SEV-1',
    status: 'Investigating',
    createdAt: '2026-10-08T14:04:30Z',
    updatedAt: '2026-10-08T14:18:12Z',
    commander: 'Elena Rostova (Staff SRE)',
    environment: 'prod-us-east-1',
    summary:
      'Following deployment DEP-9041 (checkout-service:v2.14.0 at 14:02:10Z), api-edge-router began returning HTTP 504 Gateway Timeouts on POST /v2/checkout/confirm (LOG-4409). Order completion rate dropped by 68.4% (MET-7110). Telemetry shows simultaneous HikariCP database connection pool saturation at 10/10 connections (LOG-4401, MET-7104) alongside elevated TLS handshake and authorization latency from payment-gateway-proxy (LOG-4402, EVT-3019).',
    customerImpact:
      '68.4% of checkout confirmation requests failing with HTTP 504 after 10,001ms timeout across both credit card and PayPal Express flows (TCK-1092). Estimated 42.8 failed orders/sec in prod-us-east-1.',
    affectedServices: [
      {
        name: 'checkout-service',
        tier: 'Core API',
        status: 'Critical',
        errorRate: '68.4%',
        p99Latency: '10,002ms',
        ownerTeam: 'Commerce Core',
      },
      {
        name: 'orders-db-primary',
        tier: 'Data Store',
        status: 'Degraded',
        errorRate: '0.0%',
        p99Latency: '4.1ms (Pool: 100%)',
        ownerTeam: 'Storage Platform',
      },
      {
        name: 'payment-gateway-proxy',
        tier: 'External Proxy',
        status: 'Degraded',
        errorRate: '4.2%',
        p99Latency: '4,820ms',
        ownerTeam: 'Payments Infra',
      },
      {
        name: 'api-edge-router',
        tier: 'Edge',
        status: 'Critical',
        errorRate: '68.1%',
        p99Latency: '10,001ms',
        ownerTeam: 'Traffic Edge',
      },
    ],
    records: [
      {
        id: 'EVT-3019',
        timestamp: '2026-10-08T14:01:45Z',
        type: 'service_event',
        service: 'payment-gateway-proxy',
        summary:
          'Regional POP us-east-1b BGP route flap adding ~350ms RTT and intermittent TLS session cache misses on outbound payment provider links.',
        rawPayload: JSON.stringify(
          {
            event_id: 'EVT-3019',
            timestamp: '2026-10-08T14:01:45Z',
            source: 'net-telemetry-agent',
            service: 'payment-gateway-proxy',
            region: 'us-east-1b',
            anomaly: 'BGP_PATH_HUNTING',
            added_rtt_ms: 350,
            tls_session_miss_rate: 0.41,
          },
          null,
          2
        ),
        severity: 'warning',
        sourceOrigin: 'baseline',
        metadata: {
          environment: 'prod-us-east-1',
          author: 'net-telemetry-agent',
        },
      },
      {
        id: 'DEP-9041',
        timestamp: '2026-10-08T14:02:10Z',
        type: 'deployment',
        service: 'checkout-service',
        summary:
          'Deployed checkout-service:v2.14.0 (commit a8f39c1). Updated payment retry policy (maxAttempts=2) and renamed Helm env key DB_MAX_POOL to DB_POOL_MAX_CONNECTIONS.',
        rawPayload: JSON.stringify(
          {
            deployment_id: 'DEP-9041',
            timestamp: '2026-10-08T14:02:10Z',
            service: 'checkout-service',
            version: 'v2.14.0',
            previous_version: 'v2.13.9',
            commit_sha: 'a8f39c19d4e2',
            author: 'm.chen@trace-demo.internal',
            diff_summary: [
              'payment.client.retry.maxAttempts: 1 -> 2',
              'helm/values-prod.yaml: renamed DB_MAX_POOL (60) -> DB_POOL_MAX_CONNECTIONS (60)',
              'Note: application.yml still binds spring.datasource.hikari.maximum-pool-size=${DB_MAX_POOL:10}',
            ],
          },
          null,
          2
        ),
        severity: 'info',
        sourceOrigin: 'baseline',
        metadata: {
          commitSha: 'a8f39c19d4e2',
          author: 'm.chen@trace-demo.internal',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'LOG-4401',
        timestamp: '2026-10-08T14:03:18Z',
        type: 'log',
        service: 'checkout-service',
        summary:
          'ERROR HikariPool-1 - Connection is not available, request timed out after 5000ms (total=10, active=10, idle=0, waiting=84) in OrderRepository.',
        rawPayload: JSON.stringify(
          {
            log_id: 'LOG-4401',
            timestamp: '2026-10-08T14:03:18.412Z',
            level: 'ERROR',
            service: 'checkout-service',
            pod: 'checkout-service-7f8b9c-x92k',
            thread: 'http-nio-8080-exec-42',
            logger: 'com.trace.checkout.db.OrderRepository',
            trace_id: 'tr-99201a',
            message:
              'HikariPool-1 - Connection is not available, request timed out after 5000ms (total=10, active=10, idle=0, waiting=84)',
            exception: 'java.sql.SQLTransientConnectionException',
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          traceId: 'tr-99201a',
          commitSha: 'a8f39c19d4e2',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'LOG-4402',
        timestamp: '2026-10-08T14:03:24Z',
        type: 'log',
        service: 'payment-gateway-proxy',
        summary:
          'WARN Upstream payment provider TLS session resumption miss; p99 latency elevated to 4820ms on POST /v1/charges/authorize (retry_attempt=2).',
        rawPayload: JSON.stringify(
          {
            log_id: 'LOG-4402',
            timestamp: '2026-10-08T14:03:24.109Z',
            level: 'WARN',
            service: 'payment-gateway-proxy',
            pod: 'payment-proxy-5d41a-m11p',
            thread: 'reactor-http-epoll-3',
            trace_id: 'tr-99201a',
            upstream_endpoint: 'https://api.stripe-sim.internal/v1/charges/authorize',
            duration_ms: 4820,
            retry_attempt: 2,
            tls_resumed: false,
          },
          null,
          2
        ),
        severity: 'warning',
        sourceOrigin: 'baseline',
        metadata: {
          traceId: 'tr-99201a',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'MET-7104',
        timestamp: '2026-10-08T14:03:30Z',
        type: 'metric',
        service: 'orders-db-primary',
        summary:
          'Checkout client pool active connections pinned at 10/10 (100% saturation), while orders-db-primary host CPU utilization is nominal at 14.2% and query latency is 3.8ms.',
        rawPayload: JSON.stringify(
          {
            metric_id: 'MET-7104',
            timestamp: '2026-10-08T14:03:30Z',
            service: 'orders-db-primary',
            metrics: {
              'hikari.connections.active{client="checkout-service"}': 10,
              'hikari.connections.max{client="checkout-service"}': 10,
              'hikari.connections.pending{client="checkout-service"}': 84,
              'postgres.host.cpu_utilization_pct': 14.2,
              'postgres.query.p99_duration_ms': 3.8,
            },
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          metricName: 'hikari.connections.active',
          metricValue: '10 / 10 (100%)',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'LOG-4409',
        timestamp: '2026-10-08T14:04:02Z',
        type: 'log',
        service: 'api-edge-router',
        summary:
          'ERROR 504 GATEWAY_TIMEOUT on POST /v2/checkout/confirm upstream_reset_before_response_started after 10001ms (trace_id=tr-99201a).',
        rawPayload: JSON.stringify(
          {
            log_id: 'LOG-4409',
            timestamp: '2026-10-08T14:04:02.004Z',
            level: 'ERROR',
            service: 'api-edge-router',
            listener: 'ingress-https-443',
            method: 'POST',
            path: '/v2/checkout/confirm',
            status_code: 504,
            response_flags: 'UT',
            duration_ms: 10001,
            upstream_cluster: 'checkout-service:8080',
            trace_id: 'tr-99201a',
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          traceId: 'tr-99201a',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'MET-7110',
        timestamp: '2026-10-08T14:04:15Z',
        type: 'metric',
        service: 'checkout-service',
        summary:
          'HTTP 504 rate spiked to 42.8 req/s (68.4% of checkout traffic); JVM blocked threads rose from 2 to 78.',
        rawPayload: JSON.stringify(
          {
            metric_id: 'MET-7110',
            timestamp: '2026-10-08T14:04:15Z',
            service: 'checkout-service',
            metrics: {
              'http.server.requests.504.rate_per_sec': 42.8,
              'http.server.requests.error_ratio': 0.684,
              'jvm.threads.blocked.count': 78,
              'checkout.orders.completed_per_min': 19,
              'checkout.orders.baseline_per_min': 62,
            },
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          metricName: 'http.server.requests.504.rate_per_sec',
          metricValue: '42.8 req/s (68.4%)',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'TCK-1092',
        timestamp: '2026-10-08T14:06:00Z',
        type: 'ticket',
        service: 'checkout-service',
        summary:
          'Merchant Support Escalation #1092: Customers failing at checkout confirmation with 10s spinner and 504 error across BOTH Card and PayPal Express flows.',
        rawPayload: JSON.stringify(
          {
            ticket_id: 'TCK-1092',
            created_at: '2026-10-08T14:06:00Z',
            reporter: 'Enterprise Merchant Ops (Tier-1)',
            priority: 'P0-Blocker',
            affected_component: 'checkout-service',
            description:
              'Multiple shoppers reporting a 10-second hang followed by 504 Gateway Timeout when clicking Complete Order. Started sharply after 14:02 UTC. Crucial detail: customers using PayPal Express (which bypasses card-auth endpoint on payment-gateway-proxy) are experiencing the exact same 10-second timeout.',
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          author: 'Enterprise Merchant Ops',
          environment: 'prod-us-east-1',
        },
      },
    ],
    relationships: [
      {
        id: 'REL-01',
        sourceId: 'DEP-9041',
        targetId: 'LOG-4401',
        type: 'direct',
        label: 'Commit SHA & Service Match',
        ruleExplanation:
          'Direct provenance: DEP-9041 deployed commit a8f39c19d4e2 to checkout-service; LOG-4401 was emitted by checkout-service running commit a8f39c19d4e2 68s later.',
        confidenceWeight: 96,
        temporalDeltaSeconds: 68,
      },
      {
        id: 'REL-02',
        sourceId: 'LOG-4401',
        targetId: 'LOG-4409',
        type: 'direct',
        label: 'Shared Trace ID (tr-99201a)',
        ruleExplanation:
          'Direct distributed trace link: Both LOG-4401 (HikariPool timeout) and LOG-4409 (Edge 504 Gateway Timeout) share immutable trace_id="tr-99201a".',
        confidenceWeight: 99,
        temporalDeltaSeconds: 44,
      },
      {
        id: 'REL-03',
        sourceId: 'LOG-4402',
        targetId: 'LOG-4409',
        type: 'direct',
        label: 'Shared Trace ID (tr-99201a)',
        ruleExplanation:
          'Direct distributed trace link: LOG-4402 (payment-gateway-proxy 4820ms retry) and LOG-4409 (Edge 504) share trace_id="tr-99201a".',
        confidenceWeight: 99,
        temporalDeltaSeconds: 38,
      },
      {
        id: 'REL-04',
        sourceId: 'LOG-4401',
        targetId: 'MET-7104',
        type: 'direct',
        label: 'HikariPool-1 Telemetry Match',
        ruleExplanation:
          'Direct metric corroboration: LOG-4401 reports total=10, active=10, waiting=84; MET-7104 measures hikari.connections.active=10/10 and pending=84.',
        confidenceWeight: 98,
        temporalDeltaSeconds: 12,
      },
      {
        id: 'REL-05',
        sourceId: 'EVT-3019',
        targetId: 'LOG-4402',
        type: 'inferred',
        label: 'Inferred Network -> TLS Stall',
        ruleExplanation:
          'Inferred causal link: EVT-3019 BGP route flap in us-east-1b preceded LOG-4402 TLS resumption miss on payment-gateway-proxy by 99s in the same service.',
        confidenceWeight: 76,
        temporalDeltaSeconds: 99,
      },
      {
        id: 'REL-06',
        sourceId: 'LOG-4402',
        targetId: 'LOG-4401',
        type: 'inferred',
        label: 'Inferred Connection Hold Amplification',
        ruleExplanation:
          'Inferred co-factor: Elevated 4820ms payment latency (LOG-4402) likely held @Transactional DB connections open longer, accelerating exhaustion of the 10-connection pool (LOG-4401).',
        confidenceWeight: 72,
        temporalDeltaSeconds: 6,
      },
      {
        id: 'REL-07',
        sourceId: 'MET-7110',
        targetId: 'TCK-1092',
        type: 'inferred',
        label: 'Inferred Symptom Manifestation',
        ruleExplanation:
          'Inferred user impact: 42.8 req/s HTTP 504 spike in MET-7110 aligns temporally (Δ105s) and symptomatically with merchant escalation TCK-1092.',
        confidenceWeight: 85,
        temporalDeltaSeconds: 105,
      },
    ],
    hypotheses: [
      {
        id: 'HYP-01',
        title: 'Client-Side DB Connection Pool Starvation in checkout-service (v2.14.0 Config Regression)',
        category: 'Configuration & Resource Exhaustion',
        plausibilityScore: 78,
        baselineScore: 78,
        statusLabel: 'Leading Hypothesis',
        summary:
          'Deployment DEP-9041 renamed DB_MAX_POOL to DB_POOL_MAX_CONNECTIONS in Helm without updating spring.datasource.hikari.maximum-pool-size=${DB_MAX_POOL:10}, shrinking the pool from 60 to 10 connections. When checkout-service holds DB connections across outbound calls, 84 threads block waiting for HikariPool-1 (LOG-4401, MET-7104), causing 10s edge 504 timeouts (LOG-4409) while orders-db-primary CPU remains idle at 14.2%.',
        supportingEvidence: [
          {
            recordId: 'DEP-9041',
            reason:
              'Introduces exact env variable mismatch (DB_MAX_POOL -> DB_POOL_MAX_CONNECTIONS) causing fallback to default pool size of 10 at 14:02:10Z.',
            weight: 28,
          },
          {
            recordId: 'LOG-4401',
            reason:
              'Directly proves HikariPool-1 is capped at total=10, active=10 with 84 threads queued and timing out after 5000ms.',
            weight: 26,
          },
          {
            recordId: 'MET-7104',
            reason:
              'Confirms orders-db-primary CPU is only 14.2% with 3.8ms query latency, ruling out database server overload and isolating the bottleneck to client-side pool sizing.',
            weight: 20,
          },
          {
            recordId: 'TCK-1092',
            reason:
              'PayPal Express checkouts also fail with 504s; PayPal flows use HikariPool-1 in checkout-service but do not use the degraded card-auth endpoint.',
            weight: 16,
          },
        ],
        contradictoryEvidence: [
          {
            recordId: 'LOG-4402',
            reason:
              'Shows a concurrent 4820ms latency spike on payment-gateway-proxy within the same trace (tr-99201a), suggesting DB pool starvation may not be acting alone.',
            weight: -12,
          },
        ],
        missingInformation: [
          {
            id: 'MIS-01',
            description:
              'JVM thread dump (jstack) & /actuator/env snapshot from checkout-service pod confirming active maximumPoolSize=10 and whether DB connections are acquired before payment HTTP calls.',
            targetService: 'checkout-service',
            expectedRecordType: 'log',
            whatIfPresetId: 'WIF-PRESET-01',
          },
          {
            id: 'MIS-02',
            description:
              'Connection hold-time histogram prior to DEP-9041 (v2.13.9) to verify whether 10 connections would have sufficed without payment retry amplification.',
            targetService: 'checkout-service',
            expectedRecordType: 'metric',
          },
        ],
        confidenceLimitations: [
          'Temporal confounding: EVT-3019 (14:01:45Z) and DEP-9041 (14:02:10Z) occurred 25 seconds apart.',
          'Without a span-level breakdown or thread dump (MIS-01), we cannot quantify how much of the 10s timeout is pool acquisition wait vs outbound payment retry.',
        ],
        falsificationTest: {
          testAction:
            'Restore env variable DB_MAX_POOL=60 on checkout-service (or rollback DEP-9041 to v2.13.9) while leaving payment-gateway-proxy in its current state.',
          expectedIfTrue:
            'HikariPool-1 pending queue drops to 0 (MET-7104), LOG-4401 timeouts cease immediately, and overall checkout 504 rate (MET-7110) drops below 5% even with elevated card latency.',
          expectedIfFalse:
            'HikariPool-1 expands to 60 active connections that all block on payment-gateway-proxy, and 504 gateway timeouts persist at >50%.',
          status: 'untested',
        },
      },
      {
        id: 'HYP-02',
        title: 'Upstream Payment Provider BGP/TLS Latency Degradation & Retry Amplification',
        category: 'External Dependency & Network Degradation',
        plausibilityScore: 46,
        baselineScore: 46,
        statusLabel: 'Competing Co-Factor',
        summary:
          'Regional POP BGP route flapping (EVT-3019) triggered TLS session resumption misses and 4,820ms p99 latency on payment-gateway-proxy (LOG-4402). Combined with DEP-9041 increasing maxAttempts from 1 to 2, two sequential slow attempts (2 × 4,820ms = 9,640ms) exceed the 10,000ms api-edge-router timeout (LOG-4409).',
        supportingEvidence: [
          {
            recordId: 'EVT-3019',
            reason:
              'Establishes an upstream network anomaly in us-east-1b starting at 14:01:45Z, 25 seconds prior to deployment DEP-9041.',
            weight: 18,
          },
          {
            recordId: 'LOG-4402',
            reason:
              'Demonstrates 4,820ms latency on retry_attempt=2 in trace tr-99201a, consuming nearly half of the 10,001ms edge router timeout budget per attempt.',
            weight: 24,
          },
          {
            recordId: 'LOG-4409',
            reason:
              'Total duration before edge 504 is 10,001ms, which matches 2 payment attempts (~9.6s) or 1 pool wait (5.0s) + 1 payment attempt (4.8s).',
            weight: 14,
          },
        ],
        contradictoryEvidence: [
          {
            recordId: 'MET-7104',
            reason:
              'Does not explain why checkout-service max pool size dropped from 60 to 10 connections.',
            weight: -14,
          },
          {
            recordId: 'TCK-1092',
            reason:
              'Merchant ticket confirms PayPal Express checkouts are also failing with 10s 504 timeouts, even though PayPal traffic does not route through the degraded card-auth endpoint.',
            weight: -16,
          },
        ],
        missingInformation: [
          {
            id: 'MIS-03',
            description:
              'OpenTelemetry span waterfall for trace_id="tr-99201a" showing exact millisecond split between HikariPool acquisition and payment-gateway-proxy HTTP call.',
            targetService: 'payment-gateway-proxy',
            expectedRecordType: 'log',
            whatIfPresetId: 'WIF-PRESET-02',
          },
        ],
        confidenceLimitations: [
          'Cannot independently account for the hard cap of 10 DB connections observed in LOG-4401 and MET-7104.',
          'Contradicted by PayPal Express failures in TCK-1092 unless PayPal workers share the exhausted DB connection pool.',
        ],
        falsificationTest: {
          testAction:
            'Shift payment-gateway-proxy egress traffic from us-east-1b to us-east-1a (resolving EVT-3019 TLS latency) while keeping checkout-service DB_MAX_POOL at 10.',
          expectedIfTrue:
            'Payment p99 drops to <180ms and checkout 504 timeouts disappear without touching HikariCP configuration.',
          expectedIfFalse:
            'Under peak checkout concurrency (150 RPS), the 10-connection HikariPool still saturates and 504 errors continue.',
          status: 'untested',
        },
      },
    ],
    recommendations: [
      'Immediate Mitigation: Patch checkout-service deployment to set both DB_MAX_POOL=60 and DB_POOL_MAX_CONNECTIONS=60, or rollback DEP-9041 to v2.13.9.',
      'Architectural Fix: Refactor OrderService.confirmCheckout() to release HikariCP database connections before invoking external payment-gateway-proxy HTTP calls (avoid @Transactional across remote RPCs).',
      'Resilience Guardrail: Add CI/CD Helm schema validation to assert all ${ENV_VAR} placeholders in Spring application.yml match defined keys in values-prod.yaml.',
      'Traffic Engineering: Drain payment-gateway-proxy egress from us-east-1b during BGP route instability (EVT-3019) and cap total retry timeout budget below api-edge-router 10s deadline.',
    ],
  },
  {
    id: 'INC-2026-0839',
    title: 'Identity Provider 401 Token Rejection Spike after Redis Cluster Slot Rebalance',
    severity: 'SEV-2',
    status: 'Mitigated',
    createdAt: '2026-10-08T11:20:00Z',
    updatedAt: '2026-10-08T12:05:00Z',
    commander: 'Marcus Vance (Principal Security Eng)',
    environment: 'prod-eu-central-1',
    summary:
      'During automated Redis cluster shard rebalancing (EVT-2011), identity-provider experienced a 19.4% spike in HTTP 401 Unauthorized responses (MET-5012) on session token introspection. Competing hypotheses examine Redis ASK/MOVED redirect handling in the Lettuce client (LOG-3104) versus JWKS public key rotation cache staleness following config push (DEP-8810).',
    customerImpact:
      '19.4% of active authenticated web sessions in eu-central-1 were unexpectedly prompted to re-authenticate between 11:16 UTC and 11:42 UTC (TCK-0988).',
    affectedServices: [
      {
        name: 'identity-provider',
        tier: 'Core API',
        status: 'Degraded',
        errorRate: '19.4%',
        p99Latency: '340ms',
        ownerTeam: 'Identity & Access',
      },
      {
        name: 'redis-session-cluster',
        tier: 'Data Store',
        status: 'Degraded',
        errorRate: '6.8%',
        p99Latency: '85ms',
        ownerTeam: 'Caching Platform',
      },
      {
        name: 'api-edge-router',
        tier: 'Edge',
        status: 'Nominal',
        errorRate: '0.2%',
        p99Latency: '42ms',
        ownerTeam: 'Traffic Edge',
      },
    ],
    records: [
      {
        id: 'DEP-8810',
        timestamp: '2026-10-08T11:14:00Z',
        type: 'deployment',
        service: 'identity-provider',
        summary: 'Rotated secondary JWKS signing key kid="eu-2026-10b" via automated vault-agent config reload.',
        rawPayload: JSON.stringify(
          {
            deployment_id: 'DEP-8810',
            timestamp: '2026-10-08T11:14:00Z',
            service: 'identity-provider',
            change: 'jwks_key_rotation',
            new_kid: 'eu-2026-10b',
          },
          null,
          2
        ),
        severity: 'info',
        sourceOrigin: 'baseline',
        metadata: {
          commitSha: 'c410ab88',
          environment: 'prod-eu-central-1',
        },
      },
      {
        id: 'EVT-2011',
        timestamp: '2026-10-08T11:15:12Z',
        type: 'service_event',
        service: 'redis-session-cluster',
        summary:
          'Initiated online hash-slot migration (slots 4096..6144) from node redis-shard-02 to redis-shard-05.',
        rawPayload: JSON.stringify(
          {
            event_id: 'EVT-2011',
            timestamp: '2026-10-08T11:15:12Z',
            service: 'redis-session-cluster',
            operation: 'CLUSTER_SETSLOT_MIGRATING',
            slots: '4096-6144',
          },
          null,
          2
        ),
        severity: 'warning',
        sourceOrigin: 'baseline',
        metadata: {
          environment: 'prod-eu-central-1',
        },
      },
      {
        id: 'LOG-3104',
        timestamp: '2026-10-08T11:16:05Z',
        type: 'log',
        service: 'identity-provider',
        summary:
          'WARN LettuceClusterClient - Topology refresh disabled; MOVED 5120 10.24.8.19:6379 treated as cache miss, returning null session for token lookup.',
        rawPayload: JSON.stringify(
          {
            log_id: 'LOG-3104',
            timestamp: '2026-10-08T11:16:05Z',
            level: 'WARN',
            service: 'identity-provider',
            trace_id: 'tr-44109b',
            message:
              'MOVED 5120 10.24.8.19:6379 caught by fallback handler; returning EmptySession (401)',
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          traceId: 'tr-44109b',
          environment: 'prod-eu-central-1',
        },
      },
      {
        id: 'MET-5012',
        timestamp: '2026-10-08T11:17:00Z',
        type: 'metric',
        service: 'identity-provider',
        summary:
          'auth.introspect.401.ratio rose to 19.4% (exactly matching the 12.5% hash-slot range 4096..6144 plus retry churn).',
        rawPayload: JSON.stringify(
          {
            metric_id: 'MET-5012',
            timestamp: '2026-10-08T11:17:00Z',
            service: 'identity-provider',
            metrics: {
              'auth.introspect.401.ratio': 0.194,
              'redis.client.moved_redirects_per_sec': 312,
            },
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          metricName: 'auth.introspect.401.ratio',
          metricValue: '19.4%',
          environment: 'prod-eu-central-1',
        },
      },
      {
        id: 'TCK-0988',
        timestamp: '2026-10-08T11:22:10Z',
        type: 'ticket',
        service: 'identity-provider',
        summary:
          'EU Customer Support Ticket #0988: Users randomly logged out mid-session; re-login succeeds immediately when assigned a new session ID.',
        rawPayload: JSON.stringify(
          {
            ticket_id: 'TCK-0988',
            timestamp: '2026-10-08T11:22:10Z',
            service: 'identity-provider',
            description:
              'Users report sudden 401 logouts. Logging back in works when the new session ID hashes outside slots 4096-6144.',
          },
          null,
          2
        ),
        severity: 'warning',
        sourceOrigin: 'baseline',
        metadata: {
          author: 'EU Support Desk',
          environment: 'prod-eu-central-1',
        },
      },
    ],
    relationships: [
      {
        id: 'REL-201',
        sourceId: 'EVT-2011',
        targetId: 'LOG-3104',
        type: 'direct',
        label: 'Hash Slot Range Match (5120 in 4096..6144)',
        ruleExplanation:
          'Direct slot match: EVT-2011 migrated slots 4096..6144; LOG-3104 failed on MOVED redirect for slot 5120.',
        confidenceWeight: 97,
        temporalDeltaSeconds: 53,
      },
      {
        id: 'REL-202',
        sourceId: 'LOG-3104',
        targetId: 'MET-5012',
        type: 'direct',
        label: 'MOVED Redirect -> 401 Metric',
        ruleExplanation:
          'Direct metric correlation: LOG-3104 fallback returns 401 on MOVED redirects; MET-5012 shows 312 MOVED redirects/s and 19.4% 401 ratio.',
        confidenceWeight: 95,
        temporalDeltaSeconds: 55,
      },
      {
        id: 'REL-203',
        sourceId: 'DEP-8810',
        targetId: 'MET-5012',
        type: 'inferred',
        label: 'Inferred Temporal Proximity (Δ180s)',
        ruleExplanation:
          'Inferred link: JWKS key rotation DEP-8810 occurred 3 minutes prior to the 401 spike MET-5012 on the same service.',
        confidenceWeight: 54,
        temporalDeltaSeconds: 180,
      },
    ],
    hypotheses: [
      {
        id: 'HYP-201',
        title: 'Lettuce Redis Client Swallowing MOVED Redirects as Null Sessions During Slot Migration',
        category: 'Distributed Cache Topology',
        plausibilityScore: 86,
        baselineScore: 86,
        statusLabel: 'Leading Hypothesis',
        summary:
          'When redis-session-cluster began migrating slots 4096..6144 (EVT-2011), identity-provider pods with periodic topology refresh disabled caught MOVED 5120 redirects and treated them as missing session keys (LOG-3104), returning HTTP 401 (MET-5012).',
        supportingEvidence: [
          {
            recordId: 'EVT-2011',
            reason: 'Slot migration 4096..6144 started 53s before the first MOVED error.',
            weight: 28,
          },
          {
            recordId: 'LOG-3104',
            reason: 'Explicitly logs MOVED 5120 caught by fallback handler returning EmptySession (401).',
            weight: 34,
          },
          {
            recordId: 'MET-5012',
            reason: 'Shows 312 MOVED redirects/sec correlating with the 19.4% 401 rate.',
            weight: 24,
          },
        ],
        contradictoryEvidence: [],
        missingInformation: [
          {
            id: 'MIS-201',
            description: 'Confirm ClusterTopologyRefreshOptions configuration in identity-provider Lettuce bean.',
            targetService: 'identity-provider',
            expectedRecordType: 'log',
          },
        ],
        confidenceLimitations: [
          'Requires verification that zero 401 errors bore JWT signature verification failures from DEP-8810.',
        ],
        falsificationTest: {
          testAction: 'Halt Redis slot migration (EVT-2011) and trigger manual topology refresh on identity-provider.',
          expectedIfTrue: '401 error rate drops to baseline (<0.1%) within 10 seconds.',
          expectedIfFalse: '401 errors continue if caused by JWKS key rotation (DEP-8810).',
          status: 'confirmed',
        },
      },
      {
        id: 'HYP-202',
        title: 'JWKS Signing Key Rotation Propagation Lag Across Identity Pods',
        category: 'Cryptography & Config Sync',
        plausibilityScore: 29,
        baselineScore: 29,
        statusLabel: 'Low Plausibility',
        summary:
          'DEP-8810 rotated signing key kid="eu-2026-10b" 3 minutes prior to the incident. If verifier pods had not reloaded the public keyset, tokens signed with the new key would fail with 401.',
        supportingEvidence: [
          {
            recordId: 'DEP-8810',
            reason: 'Occurred on identity-provider at 11:14:00Z shortly before the 401 spike.',
            weight: 18,
          },
        ],
        contradictoryEvidence: [
          {
            recordId: 'LOG-3104',
            reason: 'Logs show 401s originate from Redis EmptySession fallback on MOVED 5120, not JWT signature mismatch.',
            weight: -22,
          },
          {
            recordId: 'TCK-0988',
            reason: 'Re-login with a new session ID hashed to non-migrating slots immediately works using the same signing key.',
            weight: -15,
          },
        ],
        missingInformation: [
          {
            id: 'MIS-202',
            description: 'Audit log of jwt.signature.invalid counter during 11:14Z–11:30Z.',
            targetService: 'identity-provider',
            expectedRecordType: 'metric',
          },
        ],
        confidenceLimitations: ['Strongly contradicted by Redis MOVED error logs in LOG-3104.'],
        falsificationTest: {
          testAction: 'Inspect jwt.signature.invalid metric across all identity-provider pods.',
          expectedIfTrue: 'jwt.signature.invalid matches the 19.4% 401 rate.',
          expectedIfFalse: 'jwt.signature.invalid is 0, disproving JWKS key skew.',
          status: 'falsified',
        },
      },
    ],
    recommendations: [
      'Enable adaptive cluster topology refresh (enableAllAdaptiveRefreshTriggers) in Lettuce Redis client configuration.',
      'Never swallow RedisMovedRedirectException as an authentication cache miss; surface 503 retryable error instead of 401 logout.',
    ],
    historicalResolution: {
      summary:
        'Mitigated by halting Redis slot migration (EVT-2011) and enabling Lettuce adaptive cluster topology refresh across identity-provider pods.',
      rootCauseConfirmed:
        'HYP-201 Confirmed: Lettuce client had periodic topology refresh disabled and swallowed MOVED 5120 redirects as EmptySession (LOG-3104).',
      remediationApplied:
        'Rolled out identity-provider patch enabling ClusterTopologyRefreshOptions.enableAllAdaptiveRefreshTriggers() and halted online slot migration.',
      verifiedByRecordIds: ['EVT-2011', 'LOG-3104', 'MET-5012'],
      isDemoArchive: true,
    },
  },
  {
    id: 'INC-2026-0791',
    title:
      'Order Checkout 504 Timeouts after Helm Chart v2.11.0 Env Key Mismatch (Fictional Demo Archive)',
    severity: 'SEV-1',
    status: 'Resolved',
    createdAt: '2026-09-19T09:10:00Z',
    updatedAt: '2026-09-19T10:05:00Z',
    commander: 'R. Vance (Staff SRE)',
    environment: 'prod-us-east-1',
    summary:
      'Following checkout-service deployment DEP-7011 (v2.11.0), edge router 504 timeouts surged to 14.8% (MET-5202). Logs in LOG-3102 confirmed HikariPool-1 connection starvation (10/10 active connections) caused by a Helm values key rename that dropped DB_MAX_POOL_SIZE from 50 to the 10-connection default. Unlike INC-2026-0842, payment-gateway-proxy exhibited zero TLS jitter (LOG-3109).',
    customerImpact:
      '1,190 failed checkout requests over a 38-minute window in prod-us-east-1 before Helm config rollback.',
    affectedServices: [
      {
        name: 'checkout-service',
        tier: 'Core API',
        status: 'Nominal',
        errorRate: '0.1%',
        p99Latency: '145ms',
        ownerTeam: 'Commerce Core',
      },
      {
        name: 'postgres-orders-db',
        tier: 'Data Store',
        status: 'Nominal',
        errorRate: '0.0%',
        p99Latency: '11ms',
        ownerTeam: 'Data Platform',
      },
      {
        name: 'payment-gateway-proxy',
        tier: 'External Proxy',
        status: 'Nominal',
        errorRate: '0.0%',
        p99Latency: '210ms',
        ownerTeam: 'Payments Eng',
      },
      {
        name: 'api-edge-router',
        tier: 'Edge',
        status: 'Nominal',
        errorRate: '0.1%',
        p99Latency: '160ms',
        ownerTeam: 'Traffic Edge',
      },
    ],
    records: [
      {
        id: 'DEP-7011',
        timestamp: '2026-09-19T09:12:00Z',
        type: 'deployment',
        service: 'checkout-service',
        summary:
          'Helm release checkout-service v2.11.0 (commit 8f12c09a): Refactored ConfigMap env keys; DB_MAX_POOL_SIZE omitted from pod env spec.',
        rawPayload: JSON.stringify(
          {
            deployment_id: 'DEP-7011',
            timestamp: '2026-09-19T09:12:00Z',
            service: 'checkout-service',
            version: 'v2.11.0',
            commit_sha: '8f12c09a',
            config_diff: {
              removed_key: 'DB_MAX_POOL_SIZE=50',
              effective_hikari_default: 10,
            },
          },
          null,
          2
        ),
        severity: 'warning',
        sourceOrigin: 'baseline',
        metadata: {
          commitSha: '8f12c09a',
          author: 'ci-deploy-bot',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'LOG-3102',
        timestamp: '2026-09-19T09:14:22Z',
        type: 'log',
        service: 'checkout-service',
        summary:
          'ERROR HikariPool - HikariPool-1 - Connection is not available, request timed out after 5000ms (total=10, active=10, idle=0, waiting=64).',
        rawPayload: JSON.stringify(
          {
            log_id: 'LOG-3102',
            timestamp: '2026-09-19T09:14:22Z',
            level: 'ERROR',
            service: 'checkout-service',
            trace_id: 'tr-77104c',
            exception: 'java.sql.SQLTransientConnectionException',
            message:
              'HikariPool-1 - Connection is not available, request timed out after 5000ms.',
            pool_stats: { total: 10, active: 10, idle: 0, waiting: 64 },
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          traceId: 'tr-77104c',
          commitSha: '8f12c09a',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'MET-5202',
        timestamp: '2026-09-19T09:15:00Z',
        type: 'metric',
        service: 'checkout-service',
        summary:
          'hikaricp.connections.active capped at 10/10 per pod; http.server.requests.504.rate reached 14.8% while postgres-orders-db CPU remained at 16%.',
        rawPayload: JSON.stringify(
          {
            metric_id: 'MET-5202',
            timestamp: '2026-09-19T09:15:00Z',
            service: 'checkout-service',
            metrics: {
              'hikaricp.connections.active': 10,
              'hikaricp.connections.pending': 64,
              'http.server.504.rate': 0.148,
              'postgres.cpu.utilization': 0.16,
            },
          },
          null,
          2
        ),
        severity: 'critical',
        sourceOrigin: 'baseline',
        metadata: {
          metricName: 'hikaricp.connections.active',
          metricValue: '10 (100% saturated)',
          environment: 'prod-us-east-1',
        },
      },
      {
        id: 'LOG-3109',
        timestamp: '2026-09-19T09:16:10Z',
        type: 'log',
        service: 'payment-gateway-proxy',
        summary:
          'INFO PaymentGatewayHealth - Upstream Stripe/Adyen TLS handshake p99=38ms, 0% timeout errors during checkout 504 window.',
        rawPayload: JSON.stringify(
          {
            log_id: 'LOG-3109',
            timestamp: '2026-09-19T09:16:10Z',
            level: 'INFO',
            service: 'payment-gateway-proxy',
            trace_id: 'tr-77104c',
            tls_handshake_p99_ms: 38,
            upstream_error_rate: 0.0,
          },
          null,
          2
        ),
        severity: 'info',
        sourceOrigin: 'baseline',
        metadata: {
          traceId: 'tr-77104c',
          environment: 'prod-us-east-1',
        },
      },
    ],
    relationships: [
      {
        id: 'REL-701',
        sourceId: 'DEP-7011',
        targetId: 'LOG-3102',
        type: 'direct',
        label: 'Commit 8f12c09a -> HikariPool Starvation',
        ruleExplanation:
          'Direct provenance: LOG-3102 bears commit_sha=8f12c09a deployed by DEP-7011 142s earlier.',
        confidenceWeight: 96,
        temporalDeltaSeconds: 142,
      },
      {
        id: 'REL-702',
        sourceId: 'LOG-3102',
        targetId: 'MET-5202',
        type: 'direct',
        label: 'Pool Cap 10/10 -> 504 Rate 14.8%',
        ruleExplanation:
          'Direct metric match: LOG-3102 pool_stats (active=10, waiting=64) matches MET-5202 hikaricp.connections.active=10.',
        confidenceWeight: 98,
        temporalDeltaSeconds: 38,
      },
      {
        id: 'REL-703',
        sourceId: 'LOG-3102',
        targetId: 'LOG-3109',
        type: 'direct',
        label: 'Shared Trace ID tr-77104c',
        ruleExplanation:
          'Direct trace match: LOG-3102 and LOG-3109 share trace_id=tr-77104c.',
        confidenceWeight: 92,
        temporalDeltaSeconds: 108,
      },
    ],
    hypotheses: [
      {
        id: 'HYP-701',
        title:
          'Helm Chart v2.11.0 Env Key Drop Reset HikariCP Pool Size from 50 to 10',
        category: 'Configuration Regression',
        plausibilityScore: 95,
        baselineScore: 95,
        statusLabel: 'Leading Hypothesis',
        summary:
          'DEP-7011 omitted DB_MAX_POOL_SIZE=50, causing checkout-service pods to initialize HikariPool-1 with the default 10 connections (LOG-3102, MET-5202) and triggering 504 timeouts.',
        supportingEvidence: [
          {
            recordId: 'DEP-7011',
            reason: 'Removed DB_MAX_POOL_SIZE=50 in v2.11.0 Helm ConfigMap refactor.',
            weight: 30,
          },
          {
            recordId: 'LOG-3102',
            reason: 'Confirmed HikariPool-1 capped at total=10, active=10, waiting=64.',
            weight: 35,
          },
          {
            recordId: 'MET-5202',
            reason: 'Confirmed hikaricp.connections.active=10 while DB CPU stayed at 16%.',
            weight: 25,
          },
        ],
        contradictoryEvidence: [],
        missingInformation: [],
        confidenceLimitations: [
          'Resolved historical demo case; verified via post-rollback metric recovery.',
        ],
        falsificationTest: {
          testAction:
            'Restore explicit spring.datasource.hikari.maximumPoolSize=50 in Helm ConfigMap and rolling-restart checkout-service.',
          expectedIfTrue:
            'Pending connection queue drops to 0 and 504 timeouts cease within 60 seconds.',
          expectedIfFalse: '504 timeouts persist despite 50 connections per pod.',
          status: 'confirmed',
        },
      },
      {
        id: 'HYP-702',
        title: 'Upstream Payment Gateway Latency Degradation',
        category: 'External Dependency',
        plausibilityScore: 12,
        baselineScore: 12,
        statusLabel: 'Disproved',
        summary:
          'Evaluated whether upstream payment gateway latency held DB connections open; disproved by LOG-3109 showing 38ms TLS handshake p99 and 0% error rate.',
        supportingEvidence: [
          {
            recordId: 'MET-5202',
            reason: 'Checkout 504 rate rose to 14.8%, initially suspected as upstream stall.',
            weight: 10,
          },
        ],
        contradictoryEvidence: [
          {
            recordId: 'LOG-3109',
            reason: 'Payment gateway proxy logged 38ms p99 TLS handshake and 0% errors.',
            weight: -30,
          },
        ],
        missingInformation: [],
        confidenceLimitations: ['Disproved by direct payment-gateway-proxy telemetry LOG-3109.'],
        falsificationTest: {
          testAction: 'Inspect payment-gateway-proxy TLS handshake p99 during 504 window.',
          expectedIfTrue: 'Payment gateway p99 exceeds 3000ms.',
          expectedIfFalse: 'Payment gateway p99 remains <100ms (observed 38ms in LOG-3109).',
          status: 'falsified',
        },
      },
    ],
    recommendations: [
      'Add CI schema validation asserting spring.datasource.hikari.maximumPoolSize is explicitly bound before Helm deploy.',
      'Alert on hikaricp.connections.max < 30 in production environments.',
    ],
    historicalResolution: {
      summary:
        'Resolved in 38 minutes by restoring spring.datasource.hikari.maximumPoolSize=50 in the checkout-service Helm ConfigMap and performing a rolling restart.',
      rootCauseConfirmed:
        'HYP-701 Confirmed: Helm v2.11.0 ConfigMap refactor dropped DB_MAX_POOL_SIZE=50, starving HikariPool-1 at 10 connections per pod (DEP-7011, LOG-3102, MET-5202).',
      remediationApplied:
        'Restored explicit HikariCP maximumPoolSize=50 and added Prometheus alert on pool size regression.',
      verifiedByRecordIds: ['DEP-7011', 'LOG-3102', 'MET-5202', 'LOG-3109'],
      isDemoArchive: true,
    },
  },
];

export const WHAT_IF_PRESETS: WhatIfPreset[] = [
  {
    id: 'WIF-PRESET-01',
    incidentId: 'INC-2026-0842',
    title: 'Inject JVM Thread Dump & Actuator Env Snapshot (Confirms DB Pool Starvation)',
    description:
      'Simulates capturing jstack and /actuator/env from checkout-service-7f8b9c-x92k: proves maximumPoolSize fell back to 10 and 78 threads are blocked on HikariPool.getConnection() BEFORE any payment HTTP call is made.',
    expectedImpactBadge: 'HYP-01 +17% / HYP-02 -18%',
    resolvesMissingId: 'MIS-01',
    recordToInject: {
      id: 'WIF-8001',
      timestamp: '2026-10-08T14:04:45Z',
      type: 'what_if',
      service: 'checkout-service',
      summary:
        '[WHAT-IF] Actuator & jstack capture: spring.datasource.hikari.maximumPoolSize=10 (fallback default); 78/84 blocked threads waiting at OrderRepository.beginTx() prior to PaymentClient.authorize().',
      rawPayload: JSON.stringify(
        {
          what_if_id: 'WIF-8001',
          timestamp: '2026-10-08T14:04:45Z',
          service: 'checkout-service',
          source: 'jstack + /actuator/env',
          effective_hikari_max_pool_size: 10,
          unmapped_env_var: 'DB_POOL_MAX_CONNECTIONS=60 (ignored by Spring)',
          blocked_threads_at_db_acquire_pre_payment: 78,
          active_threads_in_payment_client: 10,
          trace_id: 'tr-99201a',
        },
        null,
        2
      ),
      severity: 'critical',
      sourceOrigin: 'what_if',
      metadata: {
        traceId: 'tr-99201a',
        commitSha: 'a8f39c19d4e2',
        environment: 'prod-us-east-1',
      },
    },
    hypothesisImpacts: [
      {
        hypothesisId: 'HYP-01',
        role: 'supporting',
        reason:
          'Directly resolves MIS-01: confirms effective maximumPoolSize=10 from env typo and proves 78 threads stall acquiring a DB connection before reaching payment-gateway-proxy.',
        weight: 17,
      },
      {
        hypothesisId: 'HYP-02',
        role: 'contradictory',
        reason:
          'Proves 78 of 88 stalled requests never even reached payment-gateway-proxy because they timed out waiting for HikariPool-1 first.',
        weight: -18,
      },
    ],
  },
  {
    id: 'WIF-PRESET-02',
    incidentId: 'INC-2026-0842',
    title: 'Inject OpenTelemetry Trace Waterfall Showing Sub-5ms DB & 9.9s Payment Hang (Favors HYP-02)',
    description:
      'Counterfactual What-If: Simulates an OpenTelemetry trace where HikariPool acquisition takes only 4ms, DB connections are released immediately, and 9,980ms is spent entirely inside payment-gateway-proxy TLS retries.',
    expectedImpactBadge: 'HYP-01 -24% / HYP-02 +36%',
    resolvesMissingId: 'MIS-03',
    recordToInject: {
      id: 'WIF-8002',
      timestamp: '2026-10-08T14:04:50Z',
      type: 'what_if',
      service: 'payment-gateway-proxy',
      summary:
        '[WHAT-IF] OTel Trace tr-99201a span breakdown: HikariPool acquire=4ms, SQL insert=3ms (connection closed), payment-gateway-proxy HTTP call=9982ms across 2 TLS timeouts.',
      rawPayload: JSON.stringify(
        {
          what_if_id: 'WIF-8002',
          timestamp: '2026-10-08T14:04:50Z',
          service: 'payment-gateway-proxy',
          trace_id: 'tr-99201a',
          spans: [
            { name: 'hikari.acquire', duration_ms: 4 },
            { name: 'postgres.insert_order_draft', duration_ms: 3, connection_released: true },
            { name: 'payment_proxy.authorize_attempt_1', duration_ms: 4990, status: 'TLS_TIMEOUT' },
            { name: 'payment_proxy.authorize_attempt_2', duration_ms: 4992, status: 'GATEWAY_504' },
          ],
        },
        null,
        2
      ),
      severity: 'critical',
      sourceOrigin: 'what_if',
      metadata: {
        traceId: 'tr-99201a',
        environment: 'prod-us-east-1',
      },
    },
    hypothesisImpacts: [
      {
        hypothesisId: 'HYP-01',
        role: 'contradictory',
        reason:
          'Counterfactual span shows DB connections are released in 7ms and account for only 0.07% of the 10,001ms gateway timeout.',
        weight: -24,
      },
      {
        hypothesisId: 'HYP-02',
        role: 'supporting',
        reason:
          'Resolves MIS-03 in favor of HYP-02: proves 9,982ms of the 10,001ms 504 timeout was consumed by two sequential payment-gateway-proxy TLS timeouts.',
        weight: 36,
      },
    ],
  },
  {
    id: 'WIF-PRESET-03',
    incidentId: 'INC-2026-0842',
    title: 'Inject Staging Rollback Test Result (DB_MAX_POOL=60 Hotfix Verification)',
    description:
      'Simulates running the HYP-01 Falsification Test: patching DB_MAX_POOL=60 drops 504 rate from 68.4% down to 1.8% within 45 seconds even while us-east-1b BGP flap continues.',
    expectedImpactBadge: 'HYP-01 +19% (Confirmed)',
    recordToInject: {
      id: 'WIF-8003',
      timestamp: '2026-10-08T14:08:00Z',
      type: 'what_if',
      service: 'checkout-service',
      summary:
        '[WHAT-IF] Falsification Test Execution: Patched DB_MAX_POOL=60 on canary pod; HikariPool-1 waiting threads dropped 84 -> 0 and checkout 504 rate fell from 68.4% to 1.8%.',
      rawPayload: JSON.stringify(
        {
          what_if_id: 'WIF-8003',
          timestamp: '2026-10-08T14:08:00Z',
          service: 'checkout-service',
          action: 'hotfix_env_DB_MAX_POOL_60',
          hikari_active: 28,
          hikari_max: 60,
          hikari_waiting: 0,
          http_504_error_ratio_after: 0.018,
          payment_proxy_p99_ms: 4650,
        },
        null,
        2
      ),
      severity: 'info',
      sourceOrigin: 'what_if',
      metadata: {
        commitSha: 'a8f39c19d4e2',
        environment: 'prod-us-east-1',
      },
    },
    hypothesisImpacts: [
      {
        hypothesisId: 'HYP-01',
        role: 'supporting',
        reason:
          'Executes HYP-01 falsification test with positive confirmation: restoring pool size to 60 eliminates 97% of 504 timeouts despite ongoing payment latency.',
        weight: 19,
      },
      {
        hypothesisId: 'HYP-02',
        role: 'contradictory',
        reason:
          'Proves payment-gateway-proxy latency alone only causes a 1.8% tail timeout when DB connection pool starvation is removed.',
        weight: -20,
      },
    ],
  },
];

export const SAMPLE_INGESTION_BATCHES: Record<
  string,
  { name: string; format: 'json' | 'csv'; description: string; payload: string }
> = {
  jvm_diagnostics: {
    name: 'Batch 1: JVM Actuator & Connection Pool Telemetry (Valid JSON)',
    format: 'json',
    description:
      '2 valid forensic records from checkout-service and orders-db-primary with preserved IDs, timestamps, and trace_id links.',
    payload: JSON.stringify(
      [
        {
          id: 'LOG-4415',
          timestamp: '2026-10-08T14:04:10Z',
          type: 'log',
          service: 'checkout-service',
          severity: 'warning',
          summary:
            'WARN SpringConfigBinder - Property spring.datasource.hikari.maximum-pool-size resolved to fallback default [10] because env DB_MAX_POOL is undefined.',
          traceId: 'tr-99201a',
          commitSha: 'a8f39c19d4e2',
          environment: 'prod-us-east-1',
        },
        {
          id: 'MET-7118',
          timestamp: '2026-10-08T14:04:35Z',
          type: 'metric',
          service: 'orders-db-primary',
          severity: 'info',
          summary:
            'pg_stat_activity shows 10 idle-in-transaction connections from checkout-service waiting on client socket read (average state_change age: 4.82s).',
          metricName: 'pg_stat_activity.idle_in_transaction',
          metricValue: '10 connections (age 4.82s)',
          environment: 'prod-us-east-1',
        },
      ],
      null,
      2
    ),
  },
  csv_edge_logs: {
    name: 'Batch 2: Edge Router & Payment Proxy Logs (Valid CSV)',
    format: 'csv',
    description:
      'CSV export of 2 correlated telemetry records with preserved source IDs and ISO-8601 UTC timestamps.',
    payload: `id,timestamp,type,service,severity,summary,traceId,environment
LOG-4421,2026-10-08T14:05:12Z,log,api-edge-router,critical,"ERROR 504 GATEWAY_TIMEOUT on POST /v2/checkout/confirm (payment_method=paypal_express, duration=10002ms)",tr-99201a,prod-us-east-1
MET-7125,2026-10-08T14:05:30Z,metric,payment-gateway-proxy,warning,"Outbound TLS handshake p99 latency 410ms on us-east-1b; PayPal Express bypasses this proxy completely",,prod-us-east-1`,
  },
  untrusted_malformed: {
    name: 'Batch 3: Untrusted / Malformed Security Test Batch (Validation Demo)',
    format: 'json',
    description:
      'Contains 1 valid record alongside records with missing timestamps, duplicate IDs (LOG-4401), and XSS <script> injection payloads to demonstrate TRACE AI validation.',
    payload: JSON.stringify(
      [
        {
          id: 'LOG-4490',
          timestamp: '2026-10-08T14:06:40Z',
          type: 'log',
          service: 'checkout-service',
          severity: 'info',
          summary:
            'Sanitized log entry with attempted script tag <script>alert("xss")</script> in raw message.',
          environment: 'prod-us-east-1',
        },
        {
          id: 'LOG-4401',
          timestamp: '2026-10-08T14:03:18Z',
          type: 'log',
          service: 'checkout-service',
          severity: 'critical',
          summary: 'Duplicate ID collision test with existing baseline record LOG-4401.',
        },
        {
          id: 'LOG-BAD-TIME',
          timestamp: 'NOT-A-VALID-TIMESTAMP',
          type: 'log',
          service: 'checkout-service',
          severity: 'warning',
          summary: 'Record with invalid ISO-8601 timestamp format.',
        },
      ],
      null,
      2
    ),
  },
};
