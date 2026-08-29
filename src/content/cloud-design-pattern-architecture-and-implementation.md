---
title: "Cloud design patterns — plain English"
description: "AWS Prescriptive Guidance modernization patterns, explained simply, with official diagrams."
tags:
  - architecture
  - microservices
  - aws
  - patterns
  - notes
date: 2026-08-29
---

Source: [Cloud design patterns, architectures, and implementations](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/introduction.html) (diagrams from that guide).

A **monolith** is one program, one database. **Microservices** are many small programs that talk over the network and often each have their own database. These patterns are the usual answers to: “how do they talk, fail, and stay consistent?”


| Pattern                           | One line                                             |
| --------------------------------- | ---------------------------------------------------- |
| Anti-corruption layer             | Translator so old code need not learn the new API    |
| Hostname / path / header routing  | How the front door picks a service                   |
| Circuit breaker                   | Stop calling a sick neighbor                         |
| Event sourcing                    | Save *what happened*, not only the latest row        |
| Hexagonal                         | Business rules in the middle; DB and HTTP are plugs  |
| Publish-subscribe                 | Shout an event; whoever cares listens                |
| Retry with backoff                | Wait longer each time you retry                      |
| Saga choreography / orchestration | Multi-step “transaction” without a shared DB lock    |
| Scatter-gather                    | Ask many, then combine answers                       |
| Strangler fig                     | Replace the monolith piece by piece                  |
| Transactional outbox              | Write DB + “please publish this event” in one commit |


---



## Anti-corruption layer (ACL)

You moved **User** out of the monolith. **Cart** still speaks the *old* User shape. ACL is a **translator** in the middle. Cart does not change.

![ACL in the monolith](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/d06ebf02-c3b5-4224-b091-dc8d0026c0a9.png)

**AWS:** ACL class in the monolith → API Gateway → Lambda (new service).

![ACL on AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/d0b414ab-9b41-46a8-949d-44289eac047d.png)

Delete the ACL when every caller has moved. Pair with **retry** and **circuit breaker**. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/acl.html) · [sample](https://github.com/aws-samples/anti-corruption-layer-pattern)

---



## API routing

Same idea: one **front door**, different ways to choose the kitchen.

### Hostname

Each service owns a name: `orders.api.example.com`, `billing.api.example.com`. Teams do not share a gateway config. Clients must remember many hosts (or you give them an SDK).

![Hostname routing](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/76355efe-b416-4cdc-81f8-e94a2851e264.png)

### Path

One host: `api.example.com/orders`, `api.example.com/billing`. Easier for humans. One bad config can hit everyone. On AWS: API Gateway proxy `/billing/*`, CloudFront origin by path, or NGINX.

![Path routing](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/9470aa6b-8f8f-4d71-8402-29c57b6e5727.png)

### HTTP header

Path still names the resource. A header picks **version**, **A/B**, or **action** (`x-service-a-action: get-thing`). You need control of the client. Often combined with hostname or path.

![Header routing](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/93e01f76-328c-4ea5-9108-4066d1a3fe94.png)

[Hostname](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/api-routing-hostname.html) · [path](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/api-routing-path.html) · [header](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/api-routing-http-header.html)

---



## Circuit breaker

If Payment is down, do not keep waiting. After too many failures, the breaker **opens**: fail fast. After a wait, **half-open**: one test call. Success → **closed** again.

![Closed](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/1d9485fb-d1d2-4143-b16b-cd1c9671fc6d.png)

![Open](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/5ac967d1-3aa1-45e6-add7-b3e8342879be.png)

**AWS:** Step Functions, app libraries, or API Gateway + Lambda with stored state (e.g. DynamoDB). [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html)

---



## Event sourcing

Do not only store “balance = 40”. Store **events**: deposited 50, withdrew 10. Rebuild state by replaying. Good audit trail; reads often use a **projection** (a table built from events).

![Event sourcing](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/7920ff8b-9580-46e9-8517-15377aeda36e.png)

**AWS:** EventBridge, Kinesis, DynamoDB Streams, EventStore-style tables. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing-pattern.html)

---



## Hexagonal architecture (ports and adapters)

The **hexagon** is business rules. **Ports** are sockets. **Adapters** are plugs: HTTP in, DynamoDB out. Swap DynamoDB for Postgres by changing the adapter, not the rules. Easy unit tests with fake adapters.

![Ports and adapters](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/d285f0c0-8da5-43b2-b35b-8200edb616cd.png)

**AWS:** Lambda handler = adapter; domain classes have no `boto3`.

![Lambda](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/f273b3f8-2959-4a44-a928-670044ecfa8f.png)

[Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html) · [sample](https://github.com/aws-samples/aws-lambda-domain-model-sample)

---



## Publish-subscribe

Producer **publishes** “OrderPlaced”. It does not know who listens. Inventory and email **subscribe**. Add a new listener without changing the producer.

![Pub/sub](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/2449baf1-8239-4783-b872-e10082388898.png)

**AWS:** SNS + SQS, EventBridge. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/publish-subscribe.html)

---



## Retry with backoff

Network blips happen. Retry, but **wait longer each time** (1s, 2s, 4s…) plus jitter so everyone does not retry together. Do not retry forever. Do not retry non-idempotent POSTs without care.

![Retry](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/603c4a69-5bf2-4b3e-adab-ca5ecdc570b6.png)

**AWS:** SDK retry modes, Step Functions retries, SQS redrive. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/retry-backoff.html)

---



## Saga (no 2-phase commit across databases)

Order + inventory + payment are **three databases**. You cannot lock them as one SQL transaction. A **saga** is a chain of local steps. If payment fails, run **compensations** (release stock, cancel order).

### Choreography

No boss. Order publishes an event; Inventory reacts; Payment reacts. Simple with few services; hard to see the whole story later.

![Choreography](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/4e92e053-6d80-4959-9ffb-067d67d205d7.png)

### Orchestration

A **conductor** (often Step Functions) calls T1, T2, T3. On T3 fail, it runs C2 then C1. One place to read the flow; the conductor is a dependency.

![Orchestration](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/f2c495f6-ccfe-4488-9dc6-f0fd913c897d.png)

![Step Functions](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/a4123569-3116-4ec7-913d-869c81263f43.png)

[Overview](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-patterns.html) · [choreography](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-choreography.html) · [orchestration](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/saga-orchestration.html)

---



## Scatter-gather

**Scatter:** send the same question to many workers. **Gather:** merge results (fastest quote, all answers, or first N).

![Scatter-gather](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/c00f559a-a88a-4a4b-ba60-1dd8b2190dc9.png)

**AWS:** Step Functions parallel, SQS + aggregator Lambda, Map state. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/scatter-gather.html)

---



## Strangler fig

Do not rewrite the whole tree. Put a **proxy** in front. Route one URL to a new service; the rest still hits the monolith. Grow the new until the old is gone.

![Strangler](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/4334547f-fd23-48fc-8dbb-acbca43b1b5b.png)

**AWS:** API Gateway, ALB, CloudFront — path or host to Lambda/ECS vs the old app. Use with ACL. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html)

---



## Transactional outbox

You saved the order in SQL **and** you must publish `OrderPlaced`. Two systems: if the publish fails after commit, listeners never hear. **Outbox:** same DB transaction writes the row **and** an outbox row. A relay reads the outbox and publishes (SNS/EventBridge). At-least-once: consumers must be idempotent.

![Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/374adadf-6871-4750-a274-6e48948506e5.png)

**AWS:** DynamoDB Streams / RDS + poller Lambda, or CDC.

![AWS outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/images/guide-img/48f618e4-d8ad-490f-982b-7b304dbf76c9/images/c50eba5b-3d62-480e-9b8e-232d88ae6258.png)

[Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

---



## How they fit

```text
Strangler + ACL     → leave the monolith without a big-bang rewrite
Hexagonal           → keep rules testable while you swap AWS pieces
Pub/sub + outbox    → notify others without dual-write bugs
Saga                → multi-service business flow
Circuit + retry     → survive the other team’s outage
Routing             → one URL or many, on purpose
```

