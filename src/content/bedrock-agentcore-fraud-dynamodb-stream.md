---
title: "Fraud detection with DynamoDB Streams and AgentCore Harness"
description: "Scenario: DynamoDB stream triggers Lambda, Lambda invokes a fraud orchestrator harness that calls four specialist agents via Gateway, then persists results to DynamoDB."
tags:
  - aws
  - bedrock
  - agentcore
  - lambda
  - dynamodb
  - fraud
links:
  - title: Part 4 - AgentCore in production
    url: ./bedrock-agentcore-production-guide.md
---

# Scenario: DynamoDB Stream → Lambda → Harness → 4 fraud agents → DynamoDB

This walkthrough applies the **Part 4** build steps from [Amazon Bedrock AgentCore in Production](./bedrock-agentcore-production-guide.md) to an event-driven fraud pipeline:

1. A payment lands in **DynamoDB** (`PaymentEvents`).
2. A **DynamoDB stream** invokes **Lambda**.
3. Lambda calls **`InvokeHarness`** on a **fraud orchestrator** harness.
4. The harness calls **four specialist agents** (velocity, device, geo, merchant) exposed as **Gateway tools**.
5. Lambda writes the consolidated verdict to **`FraudAssessments`**.

Sample code: [`dir/agentcore-fraud-pipeline/`](./dir/agentcore-fraud-pipeline/).

**Series:** [Part 4 - AgentCore](./bedrock-agentcore-production-guide.md)

---

## Architecture

```text
 Payment API
      │
      ▼
┌─────────────────┐     stream (NEW_IMAGE)     ┌──────────────────────┐
│ PaymentEvents   │ ─────────────────────────► │ stream_to_harness    │
│ DynamoDB        │                            │ Lambda               │
└─────────────────┘                            └──────────┬───────────┘
                                                          │ InvokeHarness
                                                          ▼
                                               ┌──────────────────────┐
                                               │ Fraud orchestrator     │
                                               │ (AgentCore Harness)    │
                                               └──────────┬───────────┘
                                                          │ MCP tools
                                                          ▼
                                               ┌──────────────────────┐
                                               │ AgentCore Gateway    │
                                               │ + Policy engine      │
                                               └───┬───┬───┬───┬──────┘
                                                   │   │   │   │
                     velocity   device    geo    merchant
                      Lambda    Lambda   Lambda  Lambda
                      (agent)   (agent)  (agent) (agent)
                                                          │
                                                          ▼
                                               ┌──────────────────────┐
                                               │ FraudAssessments     │
                                               │ DynamoDB             │
                                               └──────────────────────┘
```

Each specialist is a **focused agent** (single responsibility, structured JSON output). The **harness** is the only component that runs the multi-tool reasoning loop—you do not hand-write that loop in Lambda.

---

## Data model

### `PaymentEvents` (source)

| Attribute | Type | Notes |
|-----------|------|--------|
| `transactionId` | String (PK) | Idempotency key |
| `merchantId` | String | Maps to harness `actorId` |
| `amount` | Number | |
| `currency` | String | |
| `deviceId` | String | |
| `deviceTrusted` | Boolean | |
| `ipCountry` | String | |
| `cardCountry` | String | |
| `txnCountLastHour` | Number | From your velocity service |
| `merchantChargebackRate` | Number | 0.0–1.0 |
| `status` | String | Set `PENDING_FRAUD_CHECK` to trigger the stream |

Enable **DynamoDB Streams** (`NEW_AND_OLD_IMAGES` or `NEW_IMAGE` only).

### `FraudAssessments` (sink)

| Attribute | Type |
|-----------|------|
| `transactionId` | String (PK) |
| `riskScore` | Number |
| `recommendation` | String (`APPROVE` \| `REVIEW` \| `DECLINE`) |
| `summary` | String |
| `signals` | List |
| `assessedAt` | Number (epoch) |

---

## Step 1 — Identity (Build → Identity)

This pipeline is **service-to-service** (stream → Lambda → AgentCore). You typically **do not** need an end-user JWT on the harness path.

**Do this:**

1. Use **IAM** on the stream Lambda execution role (`bedrock-agentcore:InvokeHarness`).
2. Register **credential providers** in Identity only if a specialist agent must call external fraud APIs (e.g. device intelligence SaaS) with OAuth—then attach outbound auth on the **Gateway** target, not in Lambda.
3. Set harness **`actorId`** to `merchantId` for audit and optional Memory namespaces if you add merchant-scoped memory later.

---

## Step 2 — Memory (Build → Memory)

Fraud scoring is **one-shot per transaction**—do not reuse chat history across payments.

**Do this:**

1. On harness create, set **`memory: { disabled: {} }`** ([Harness memory](./bedrock-agentcore-production-guide.md#step-2--memory-build--memory)).
2. Use **`runtimeSessionId`** derived from `transactionId` (≥ 33 characters) so retries for the same payment stay correlated without long-term memory.

---

## Step 3 — Gateways (Build → Gateways)

Expose the **four specialist agents** as Gateway tools (Lambda targets with OpenAPI schemas).

**Do this:**

1. Deploy four Lambdas from [`fraud_specialist_lambda.py`](./dir/agentcore-fraud-pipeline/fraud_specialist_lambda.py) (same code, `SPECIALIST_ROLE` = `velocity`, `device`, `geo`, `merchant`).
2. **Build → Gateways → Create** gateway `fraud-gateway` with **IAM** inbound auth (Lambda invokes harness; gateway is called by harness execution role).
3. Add **four Lambda targets** with tool names:
   - `velocity_check`
   - `device_check`
   - `geo_check`
   - `merchant_check`
4. Gateway execution role: `lambda:InvokeFunction` on those four ARNs only.

Tool names appear to the harness as `fraud-gateway___velocity_check`, etc. (gateway name + target name). Match these in `allowedTools` on the harness and stream Lambda.

**Alternative:** Register four **AgentCore Runtime** agents as gateway targets instead of Lambdas if specialists need custom Strands/LangGraph code—the orchestration pattern is unchanged.

---

## Step 4 — Policy (Build → Policy)

Fraud needs **deterministic guardrails** on tool calls.

**Do this:**

1. Create a **policy engine** and attach it to `fraud-gateway`.
2. Example rules (Cedar-style intent):
   - Permit `velocity_check` only when `context.input.amount` is present.
   - Forbid `merchant_check` when `context.input.amount` > 50000 unless principal has role `fraud-senior`.
   - Deny all tools if `context.input.transactionId` is missing.
3. Run **LOG_ONLY**, then **ENFORCE** before production traffic.

---

## Step 5 — Built-in tools (Build → Built-in tools)

Not required for this scenario. Skip Browser, Code Interpreter, and KB unless you add **merchant policy documents** via a managed KB connector on the same gateway.

---

## Step 6 — Runtime (Build → Runtime)

Optional. Use **Runtime** only for specialists that need a custom container loop. For this lab, **Lambda specialists + Gateway** are enough and cheaper to iterate.

If you later move a specialist to Runtime, add it as a **gateway runtime target** and keep the orchestrator on Harness.

---

## Step 7 — Harness (Build → Harness)

Create the **fraud orchestrator** harness.

**Do this:**

1. **Build → Harness → Create** using [`harness-create.json`](./dir/agentcore-fraud-pipeline/harness-create.json) as a template (update ARNs and model ID).
2. **System prompt** — require calling **all four** tools before emitting JSON verdict.
3. **Tools** — one `agentcore_gateway` entry pointing at `fraud-gateway`.
4. **`allowedTools`** — restrict to the four fraud tools (no shell in production).
5. Create harness endpoint **`prod`** pinned to a tested version.

<details>
<summary>CLI — create harness (after editing JSON)</summary>

```bash
export AWS_REGION=us-east-1
aws bedrock-agentcore-control create-harness \
  --region "$AWS_REGION" \
  --cli-input-json file://harness-create.json
```

Poll `get-harness` until `status` is `READY`, then create endpoint `prod`.

</details>

---

## Step 8 — Test, assess, and operate

| Check | Action |
|-------|--------|
| **Harness playground** | Paste a sample transaction JSON; confirm four tool calls and JSON verdict |
| **Observability** | Trace harness + gateway tool spans in **Assess → Observability** |
| **Evaluations** | Golden-set transactions with expected `APPROVE`/`DECLINE` |
| **Alarms** | Lambda errors, harness `runtimeClientError`, DLQ on stream batch failures |

---

## Wire DynamoDB Stream → Lambda

### IAM — stream Lambda role

In addition to DynamoDB stream read and `FraudAssessments` write:

```json
{
  "Effect": "Allow",
  "Action": ["bedrock-agentcore:InvokeHarness", "bedrock-agentcore:InvokeAgentRuntime"],
  "Resource": "arn:aws:bedrock-agentcore:us-east-1:123456789012:harness/fraud-orchestrator/*"
}
```

### Lambda event source

- **Batch size:** 1–10 (fraud checks are slow; start with **1**).
- **Bisect on error:** on partial harness failures, use **on-failure destination** or raise to retry the batch.
- **Filter criteria** (optional): `{ "dynamodb": { "NewImage": { "status": { "S": ["PENDING_FRAUD_CHECK"] } } } }`.

### Handler

Use [`stream_to_harness_lambda.py`](./dir/agentcore-fraud-pipeline/stream_to_harness_lambda.py):

- Unmarshals stream `NewImage`.
- Skips unless `status == PENDING_FRAUD_CHECK`.
- `InvokeHarness` with `allowedTools` locked to the four specialists.
- Parses JSON verdict and **`put_item`** on `FraudAssessments`.

Environment variables:

```bash
HARNESS_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:harness/fraud-orchestrator/...
HARNESS_QUALIFIER=prod
FRAUD_RESULTS_TABLE=FraudAssessments
TRIGGER_STATUS=PENDING_FRAUD_CHECK
```

### End-to-end test

1. Put a test item on `PaymentEvents` with `status: PENDING_FRAUD_CHECK`.
2. Confirm Lambda invocation in CloudWatch Logs.
3. Query `FraudAssessments` for `transactionId`.
4. Update `PaymentEvents.status` to `FRAUD_COMPLETE` in the same Lambda (optional second `update_item`) or via a DynamoDB stream on `FraudAssessments`.

<details>
<summary>Example test payment item (AWS CLI)</summary>

```bash
aws dynamodb put-item --table-name PaymentEvents --item '{
  "transactionId": {"S": "txn-9f3a2b1c"},
  "merchantId": {"S": "mrc-10042"},
  "amount": {"N": "1299.00"},
  "currency": {"S": "USD"},
  "deviceId": {"S": "dev-abc"},
  "deviceTrusted": {"BOOL": false},
  "ipCountry": {"S": "US"},
  "cardCountry": {"S": "NG"},
  "txnCountLastHour": {"N": "12"},
  "merchantChargebackRate": {"N": "0.08"},
  "status": {"S": "PENDING_FRAUD_CHECK"}
}'
```

</details>

---

## Production checklist (this scenario)

1. **Identity** — IAM-only on Lambda; OAuth only for external fraud vendors via Gateway.
2. **Memory** — disabled on orchestrator harness.
3. **Gateway** — four Lambda specialists; least-privilege gateway role.
4. **Policy** — ENFORCE on gateway; amount and field guards.
5. **Harness** — `allowedTools` whitelist; endpoint `prod` version pinned.
6. **Lambda** — timeout ≥ harness `timeoutSeconds` + buffer; stream batch size tuned.
7. **DynamoDB** — idempotent writes on `transactionId`; TTL on old assessments if required.
8. **Observability** — correlate `transactionId` in Lambda logs with AgentCore trace IDs.

---

## Related patterns

- [Part 4 - Integrate with Lambda and compute](./bedrock-agentcore-production-guide.md#integrate-with-lambda-and-other-compute) — BFF and `InvokeHarness` details.
- [Lambda event-driven pipelines](./aws-lambda-event-pipeline.md) — stream and partial failure patterns.
- [Step Functions + InvokeHarness](https://docs.aws.amazon.com/step-functions/latest/dg/connect-bedrockagentcore.html) — replace stream Lambda with a state machine if you need human review between specialist calls.

[← Part 4 - AgentCore in production](./bedrock-agentcore-production-guide.md)
