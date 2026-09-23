---
title: "Amazon Bedrock AgentCore in Production"
description: "Part 4 — AgentCore Build console (Harness, Runtime, Gateways, Memory, Policy, Identity), IAM roles, and Lambda/compute integration for production agents."
tags:
  - aws
  - bedrock
  - agentcore
  - generative-ai
  - production
  - lambda
links:
  - title: AgentCore overview (AWS)
    url: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html
  - title: AgentCore Harness
    url: https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html
  - title: AgentCore pricing
    url: https://aws.amazon.com/bedrock/agentcore/pricing/
---

# Part 4 - Amazon Bedrock AgentCore in production

**Amazon Bedrock AgentCore** is a modular platform for building, deploying, and operating agents at scale. In the console, the **Build** menu is where you wire the moving parts together: **Harness**, **Runtime**, **Gateways**, **Memory**, **Policy**, **Identity**, and **Built-in tools** (Browser, Code Interpreter, Knowledge Bases).

This guide walks through those components in a **production order**—identity and governance first, then durable state and tools, then the agent surface (Harness or Runtime), then **IAM**, **Lambda/compute integration**, and operate.

**Series:** [Part 1 - Nova](./building-with-nova.md) · [Part 2 - Embeddings and RAG](./embeddings-and-rag.md) · [Part 3 - Deploy and integrate](./deploy-operate-and-integrate.md)

---

## How the Build pieces fit together

| Console (Build) | Role in production | Typical when |
|-----------------|-------------------|--------------|
| **Identity** | Inbound JWT/OAuth for users; outbound credentials for Slack, GitHub, SaaS APIs | Any user-facing or multi-tenant agent |
| **Memory** | Short-term session context + long-term facts across sessions | Support, copilots, workflows that remember users |
| **Gateways** | Single MCP-oriented entry for APIs, Lambda, agents, models, Memory, KB | Enterprise tools, RAG, governed tool access |
| **Policy** | Cedar (or natural language) rules evaluated **before** tool calls via Gateway | Regulated or high-risk tool use |
| **Built-in tools** | Managed Browser, Code Interpreter, KB connectors | Web research, code/data tasks, managed RAG |
| **Runtime** | Host **your** agent code (Strands, LangGraph, etc.) in isolated microVM sessions | Custom loops, frameworks, BYO container |
| **Harness** | **Managed** agent loop (model, prompt, tools, memory) without writing orchestration | Fast path to production; config over code |

```text
                    ┌─────────────────────────────────────────┐
  End users / apps  │  AgentCore Gateway (+ Policy engine)     │
        ───────────►│  JWT/Cognito/Okta · MCP tools · KB ·    │
                    │  Memory connector · Runtime targets      │
                    └───────────────┬─────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
       ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
       │  Harness    │      │  Runtime    │      │ Built-in    │
       │  (managed   │      │  (your      │      │ Browser /   │
       │   loop)     │      │   agent)    │      │ Code interp │
       └──────┬──────┘      └──────┬──────┘      └─────────────┘
              │                    │
              └────────┬───────────┘
                       ▼
              ┌─────────────────┐
              │ AgentCore Memory │  ◄── Identity (actorId / JWT sub)
              └─────────────────┘
```

**Harness vs Runtime:** Use **Harness** when a declarative agent (model + system prompt + tools + memory) is enough. Use **Runtime** when you ship custom agent code or an open-source framework. Both can share **Gateway**, **Memory**, **Identity**, and built-in tools.

---

## Prerequisites

1. **Region** — Enable AgentCore and your models in the same region (check [AgentCore regional availability](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html)).
2. **Model access** — Bedrock model access for Nova/Claude/etc., or credentials for OpenAI/Gemini if the harness uses external providers.
3. **IAM** — Separate roles for harness/runtime **execution**, gateway **service role**, and Memory access (least privilege).
4. **IdP** (production) — Amazon Cognito, Okta, Entra ID, or Auth0 for **CUSTOM_JWT** on Gateway and Runtime where end users call the agent.

Optional: install the **AgentCore CLI** for repeatable setup (`pip install bedrock-agentcore-starter-toolkit` — confirm package name in [Get started with AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/get-started.html)).

---

## Step 1 — Identity (Build → Identity)

Production agents rarely run as a single shared IAM user. **AgentCore Identity** provides workload identities, inbound JWT validation, outbound OAuth/API keys, and a **Consent Portal** for user-delegated access.

**Do this:**

1. In **Build → Identity**, register **credential providers** for each third-party system the agent touches (Slack, GitHub, Salesforce, etc.).
2. Configure **inbound JWT authorizers** on Gateway (and Runtime if exposed) with your OIDC discovery URL and allowed client IDs.
3. Prefer **JWT bearer** workload tokens for production (`GetWorkloadAccessTokenForJWT`). Avoid relying on opaque user-id headers except for dev/quickstarts ([Runtime security best practices](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)).
4. For agents that act **on behalf of users**, enable a **Consent Portal** tied to a JWT-configured Gateway so users approve scopes before the agent uses their credentials.

**Production tip:** Map `actorId` in Memory and harness sessions to a stable user key. For Memory FGAC, align `actorId` with JWT `sub` or enforce mapping in Policy ([Memory FGAC](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-gateway-fgac.html)).

---

## Step 2 — Memory (Build → Memory)

**AgentCore Memory** holds **short-term** turn-by-turn context and **long-term** extracted facts (preferences, summaries) across sessions.

**Do this:**

1. **Build → Memory → Create** a Memory resource if you need BYO memory (custom KMS, namespace templates, shared memory across multiple agents).
2. For **Harness**, you can skip creation: default **managed memory** is provisioned on `CreateHarness` (semantic + summarization strategies, 30-day event expiry). Set `memory: { disabled: {} }` for stateless agents, or pass `agentCoreMemoryConfiguration` with your Memory ARN ([Harness memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-memory.html)).
3. Scope conversations with **`sessionId`** (required) and **`actorId`** (recommended for multi-user apps). The harness loads history from Memory; you send only the new user message.
4. For **direct Memory API** access from your app, front Memory with a **Gateway** `agentcore-memory` connector and FGAC policies (Step 4).

---

## Step 3 — Gateways (Build → Gateways)

**AgentCore Gateway** is the governed front door: OpenAPI/Lambda/Smithy → MCP tools, passthrough to other agents, model routing, Memory and **managed Knowledge Base** connectors, plus inbound/outbound auth.

**Do this:**

1. **Create gateway** with an **authorizer**:
   - **CUSTOM_JWT** for user-facing production APIs.
   - **IAM (SigV4)** for service-to-service from your VPC/Lambda.
2. Attach a **gateway execution role** (`GATEWAY_IAM_ROLE`) scoped to only the targets you add (`bedrock:Retrieve` for KB, Memory actions for memory connector, etc.).
3. **Add targets** (Build → Gateways → your gateway → Targets):
   - **OpenAPI / Lambda / Smithy** — existing enterprise APIs.
   - **MCP servers** — remote tool servers.
   - **Managed Knowledge Base** — exposes `Retrieve` and `AgenticRetrieveStream` MCP tools ([KB connector](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-managed-kb.html)).
   - **AgentCore Runtime** — route to a deployed runtime agent (GA; optional API schema for Policy).
   - **agentcore-memory** — Memory with OAuth-aware FGAC.
4. Note tool names exposed via `tools/list` (KB tools are prefixed with the target name).

<details>
<summary>Example — create gateway (CLI sketch)</summary>

Replace placeholders with your account, region, and IdP settings. See [Set up an AgentCore gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-setup.html).

```bash
export AWS_REGION=us-east-1
export GW_ROLE_ARN=arn:aws:iam::123456789012:role/AgentCoreGatewayRole

aws bedrock-agentcore-control create-gateway \
  --region "$AWS_REGION" \
  --name prod-agent-tools \
  --role-arn "$GW_ROLE_ARN" \
  --authorizer-type CUSTOM_JWT \
  --authorizer-configuration '{"customJWTAuthorizer":{"discoveryUrl":"https://cognito-idp.us-east-1.amazonaws.com/POOL_ID/.well-known/openid-configuration","allowedClients":["APP_CLIENT_ID"]}}'
```

</details>

---

## Step 4 — Policy (Build → Policy)

**Policy** attaches **policy engines** to Gateways. Every tool call is evaluated in **Cedar** (or authored from natural language) **before** execution—deny-by-default, with audit logs in CloudWatch.

**Do this:**

1. **Build → Policy → Create policy engine**.
2. Author policies for:
   - Which principals may call which tools.
   - Input constraints (amount limits, allowed resource IDs).
   - **Temporal** rules (e.g. approval must precede a transfer) where needed.
3. **Associate** the policy engine with your production Gateway.
4. Start in **LOG_ONLY** if offered, then move to **ENFORCE** after validation (common pattern for Memory FGAC).

**Example pattern (Memory):** permit only when `context.input.actorId == principal.getTag("sub")` so users cannot read another user’s memory ([Memory FGAC](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory-gateway-fgac.html)).

**Critical:** Restrict **Runtime** (and sensitive targets) so invocations cannot bypass the Gateway—IAM `aws:SourceArn` for SigV4 runtimes, or `allowedWorkloadConfiguration` for JWT runtimes ([Runtime security best practices](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)).

---

## Step 5 — Built-in tools (Build → Built-in tools)

These are first-class capabilities you attach to **Harness** or call from **Runtime** agents—not replacements for Gateway, but complements.

### Browser

- **Build → Built-in tools → Browser** — use `aws.browser.v1` for quick setup or a custom browser (recording, custom network, execution role).
- Sessions are isolated (default TTL 15 minutes, max 8 hours); use for form fill, navigation, and screenshots with Live View and CloudTrail ([Browser tool](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/browser-tool.html)).

### Code Interpreter

- Sandboxed **Python / JavaScript / TypeScript** for analysis and computation in an isolated environment ([Code Interpreter](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/code-interpreter.html)).

### Knowledge Bases (KB)

- Prefer **managed Knowledge Bases** + **Gateway connector** so agents discover `Retrieve` / `AgenticRetrieveStream` as MCP tools.
- Requires gateway IAM permission to `bedrock:Retrieve` on the KB ARN ([KB gateway target](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-gateway-target.html)).

**Harness wiring:** declare tools in harness config—`agentcore_gateway` (gateway ARN), `agentcore_browser`, `agentcore_code_interpreter`, etc. Default **shell** and **file_operations** are on unless restricted with `allowedTools` ([Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)).

---

## Step 6 — Runtime (Build → Runtime) when you need custom code

Use **Runtime** to deploy containerized agents (Strands, LangGraph, CrewAI, OpenAI Agents SDK, etc.).

**Do this:**

1. Package your agent (`CreateAgentRuntime` / console **Create runtime**).
2. Configure **inbound auth** (IAM or OAuth) consistent with Gateway.
3. Use **`runtimeSessionId`** for conversation isolation; microVM sessions are ephemeral (up to ~8 hours)—persist durable context in **Memory**, not in the session filesystem alone ([Runtime how it works](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-how-it-works.html)).
4. Create **versioned endpoints** (`DEFAULT` tracks latest; named endpoints for dev/stage/prod).
5. Expose the runtime **only through Gateway** in production (Step 4).

---

## Step 7 — Harness (Build → Harness) for the managed agent loop

**Harness** is the fastest path to a production agent when configuration is enough: model (Bedrock, OpenAI, Gemini, LiteLLM-compatible), system prompt, tools, skills, memory, limits.

**Do this:**

1. **Build → Harness → Create**
   - **Model** and **system prompt**
   - **Tools** — gateway ARN, browser, code interpreter, MCP, inline functions
   - **Memory** — managed (default), disabled, or BYO ARN
   - **Skills** — Git, S3, or AWS skills catalog (optional)
   - **Execution role** — IAM permissions for gateway invoke, built-in tools, and any AWS APIs you allow
   - **Limits** — `maxIterations`, `maxTokens`, `timeoutSeconds`, truncation
2. **Invoke** with `sessionId`, optional `actorId`, and the new user message only.
3. **Versioning** — each update creates an immutable **harness version**; create **named endpoints** pointing at approved versions for rollout/rollback.
4. **Test → Harness playground** for iterative prompts; move to API/Step Functions (`InvokeHarness`) for production traffic.

<details>
<summary>Example — create and invoke harness (control plane API sketch)</summary>

Use the [CreateHarness](https://docs.aws.amazon.com/bedrock-agentcore-control/latest/APIReference/API_CreateHarness.html) and InvokeHarness APIs (exact service prefix and CLI commands may vary by SDK version—verify in your region’s API reference).

```bash
export AWS_REGION=us-east-1
export EXEC_ROLE_ARN=arn:aws:iam::123456789012:role/AgentCoreHarnessExecutionRole
export GATEWAY_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/abcdef

# Create (JSON body simplified — expand model, tools, memory in production)
aws bedrock-agentcore-control create-harness \
  --region "$AWS_REGION" \
  --harness-name prod-support-agent \
  --execution-role-arn "$EXEC_ROLE_ARN" \
  --cli-input-json file://harness-create.json
```

Example `harness-create.json` structure:

```json
{
  "model": {
    "bedrockModel": {
      "modelId": "amazon.nova-lite-v1:0"
    }
  },
  "systemPrompt": [{ "text": "You are a support agent. Use KB tools for policy questions. Never expose secrets." }],
  "tools": [
    {
      "name": "enterprise-tools",
      "type": "agentcore_gateway",
      "config": { "gatewayArn": "arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/abcdef" }
    }
  ],
  "maxIterations": 15,
  "timeoutSeconds": 300
}
```

Invoke with a stable `sessionId` per chat and `actorId` per authenticated user.

</details>

---

## Step 8 — Test, assess, and operate

| Console area | Production use |
|--------------|----------------|
| **Test → Harness playground** | Prompt/tool tuning before pinning a version |
| **Assess → Observability** | Trace spans across harness, gateway, browser, memory (OpenTelemetry → CloudWatch) |
| **Assess → Evaluations** | Regression tests on sessions/traces |
| **Assess → Optimizations** | Prompt/tool-description experiments with Gateway A/B traffic |

**Launch checklist**

1. Identity: JWT on Gateway; outbound creds in Identity, not in agent source code.
2. Memory: `actorId` strategy documented; FGAC or harness namespaces for multi-tenant isolation.
3. Gateway: all production tools and KB/Memory behind one gateway per environment.
4. Policy: engine attached; ENFORCE mode; sample deny/allow tests in CI.
5. Harness/Runtime: execution role least privilege; named endpoint pinned to tested version.
6. Network: runtime not directly callable except via Gateway (resource policy / allowed workload).
7. Alarms on error rates, throttles, and policy denials; run Evaluations on release candidates.

---

## IAM roles and policies (production)

AgentCore touches **three IAM boundaries** in most deployments. Keep them separate so a compromised Lambda cannot redefine your harness or read unrelated Memory.

| Role | Attached to | Typical permissions |
|------|-------------|---------------------|
| **Harness execution role** | Harness resource | Invoke gateway targets, built-in Browser/Code Interpreter, `bedrock:InvokeModel` (if using Bedrock models), read mounted S3/EFS as configured |
| **Gateway service role** | Gateway | `bedrock:Retrieve` on KB ARNs, Memory connector actions, `lambda:InvokeFunction` on tool Lambdas, runtime invoke if runtime is a target |
| **Compute invocation role** | Lambda, ECS task, Step Functions | `bedrock-agentcore:InvokeHarness`, `bedrock-agentcore:InvokeAgentRuntime` on specific harness/runtime ARNs; **no** blanket `*` on AgentCore |

<details>
<summary>IAM — Lambda function that calls InvokeHarness</summary>

Trust policy (Lambda assumes this role):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

Identity policy (scope ARNs to your account and harness name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeProductionHarness",
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:InvokeHarness",
        "bedrock-agentcore:InvokeAgentRuntime"
      ],
      "Resource": "arn:aws:bedrock-agentcore:us-east-1:123456789012:harness/prod-support-agent/*"
    },
    {
      "Sid": "Logs",
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:us-east-1:123456789012:*"
    }
  ]
}
```

Confirm exact action names and ARN patterns in [InvokeHarness](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html) and your account’s IAM policy simulator. Some setups also require control-plane read (`GetHarness`, `GetHarnessEndpoint`) on the harness ARN without `/*`.

</details>

<details>
<summary>IAM — Gateway service role (KB + Lambda tools)</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "KnowledgeBaseRetrieve",
      "Effect": "Allow",
      "Action": ["bedrock:Retrieve"],
      "Resource": "arn:aws:bedrock:us-east-1:123456789012:knowledge-base/ABCDEFGH"
    },
    {
      "Sid": "ToolLambdas",
      "Effect": "Allow",
      "Action": ["lambda:InvokeFunction"],
      "Resource": [
        "arn:aws:lambda:us-east-1:123456789012:function:agent-tool-orders",
        "arn:aws:lambda:us-east-1:123456789012:function:agent-tool-refunds"
      ]
    }
  ]
}
```

The gateway **assumes** this role when calling targets (`GATEWAY_IAM_ROLE`). Your **harness execution role** still needs permission to **use** the gateway (invoke MCP tools through AgentCore), separate from the gateway’s own outbound calls.

</details>

---

## Integrate with Lambda and other compute

Your product API usually lives in **your** compute layer. AgentCore runs the **agent loop** (Harness or Runtime) and **tools** (Gateway, built-ins). The split below keeps auth, rate limits, and billing in code you already operate.

```text
  Browser / mobile app
         │
         ▼
  API Gateway (Cognito JWT authorizer)
         │
         ▼
  Lambda "chat BFF"  ──InvokeHarness──►  AgentCore Harness
         │                                      │
         │                                      ├── Memory (session + actorId)
         │                                      └── Gateway ──► Lambda tools / KB / SaaS
         ▼
  DynamoDB (optional sessionId ↔ user mapping)
```

### Pattern A — API Gateway + Lambda → Harness (most common)

**Flow**

1. Client sends `POST /chat` with `{ "message": "...", "sessionId": "..." }` and a **Cognito JWT** (or other OIDC token).
2. API Gateway JWT authorizer validates the token; Lambda receives `requestContext.authorizer.jwt.claims.sub`.
3. Lambda maps `sub` → **`actorId`** and reuses **`sessionId`** per conversation (store in DynamoDB if the client does not send one).
4. Lambda calls **`bedrock-agentcore:InvokeHarness`** with only the new user message; Memory retains history.
5. Lambda returns the final text (or streams chunks if you use [Lambda response streaming](https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html)).

**Rules**

- `runtimeSessionId` must be **at least 33 characters** ([InvokeHarness](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html)). Use a UUID v4 or pad a stable id.
- Pass **`qualifier`** (harness endpoint name) to pin `prod` vs `staging` without changing code.
- Set Lambda timeout **below** harness `timeoutSeconds`, with headroom for cold start (often 60–120s+ for tool-heavy turns).

<details>
<summary>Python — Lambda handler (InvokeHarness)</summary>

```python
import json
import os
import uuid
import boto3

HARNESS_ARN = os.environ["HARNESS_ARN"]
HARNESS_QUALIFIER = os.environ.get("HARNESS_QUALIFIER", "prod")
REGION = os.environ.get("AWS_REGION", "us-east-1")

agentcore = boto3.client("bedrock-agentcore", region_name=REGION)


def _session_id(raw: str | None) -> str:
    sid = raw or uuid.uuid4().hex
    return sid if len(sid) >= 33 else (sid + uuid.uuid4().hex)[:40]


def handler(event, context):
    body = json.loads(event.get("body") or "{}")
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    actor_id = claims.get("sub") or "anonymous"
    session_id = _session_id(body.get("sessionId"))
    user_text = body.get("message", "").strip()
    if not user_text:
        return {"statusCode": 400, "body": json.dumps({"error": "message required"})}

    response = agentcore.invoke_harness(
        harnessArn=HARNESS_ARN,
        qualifier=HARNESS_QUALIFIER,
        runtimeSessionId=session_id,
        actorId=actor_id,
        messages=[{"role": "user", "content": [{"text": user_text}]}],
    )

    parts: list[str] = []
    for ev in response.get("stream", []):
        if "contentBlockDelta" in ev:
            delta = ev["contentBlockDelta"].get("delta", {})
            if "text" in delta:
                parts.append(delta["text"])
        elif "runtimeClientError" in ev:
            err = ev["runtimeClientError"].get("message", "agent error")
            return {"statusCode": 502, "body": json.dumps({"error": err, "sessionId": session_id})}

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"reply": "".join(parts), "sessionId": session_id}),
    }
```

Environment variables: `HARNESS_ARN`, optional `HARNESS_QUALIFIER`. Wire the function behind HTTP API with a JWT authorizer ([Part 3 API Gateway notes](./deploy-operate-and-integrate.md)).

</details>

### Pattern B — Lambda → AgentCore Runtime (custom agent code)

Use when the agent loop lives in **your container** on Runtime (Strands, LangGraph, etc.) instead of Harness.

```python
import json
import boto3

client = boto3.client("bedrock-agentcore")
payload = json.dumps({"prompt": event["message"]}).encode()

resp = client.invoke_agent_runtime(
    agentRuntimeArn=os.environ["RUNTIME_ARN"],
    qualifier="prod",
    runtimeSessionId=session_id,
    payload=payload,
)

# Stream: resp["response"].iter_lines() when contentType is text/event-stream
```

For **OAuth inbound** on the runtime, call the HTTPS InvokeAgentRuntime endpoint with the **user’s bearer token** instead of SigV4 from Lambda ([Inbound Auth](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)).

### Pattern C — Lambda **as** a Gateway tool (not the caller)

Expose existing microservices to the harness **without** embedding business logic in the agent VM:

1. Implement a **tool Lambda** (idempotent, input schema in OpenAPI).
2. **Build → Gateways → Add target → Lambda**.
3. Reference that gateway ARN on the harness (`agentcore_gateway` tool).

The harness invokes tools through Gateway; your **chat Lambda** only calls `InvokeHarness`. This mirrors classic Bedrock Agents “action groups → Lambda” but with MCP and Policy on the gateway path.

### Pattern D — Step Functions orchestration

For workflows that mix **deterministic steps** with **agent steps**, use the optimized integration:

- Resource: `arn:aws:states:::bedrockagentcore:invokeHarness`
- Reuse **`RuntimeSessionId`** across states for multi-turn continuity within one execution.
- Grant the state machine role `bedrock-agentcore:InvokeHarness` on the harness ARN.

See [Invoke harness with Step Functions](https://docs.aws.amazon.com/step-functions/latest/dg/connect-bedrockagentcore.html) and the [support-ticket sample](https://docs.aws.amazon.com/step-functions/latest/dg/sample-bedrock-agentcore-invoke-harness.html). Note: the integration is **request/response** (final message), not a live token stream—use Lambda + `InvokeHarness` streaming for chat UIs.

### Pattern E — ECS, App Runner, EC2, or Kubernetes

Any compute that can use the AWS SDK follows the **same** patterns as Lambda:

| Concern | Guidance |
|---------|----------|
| Credentials | Task role / IRSA with `InvokeHarness` or `InvokeAgentRuntime` |
| Long-lived connections | WebSocket server on ECS; backend calls AgentCore per message |
| Timeouts | Tasks can run longer than Lambda’s 15-minute cap; align with harness `timeoutSeconds` |
| Scale | AgentCore scales agent sessions; your BFF scales on request rate |

### Pattern F — EventBridge and async jobs

Trigger harness work from schedules or domain events:

```text
EventBridge rule → Lambda or Step Functions → InvokeHarness
```

Pass a stable `runtimeSessionId` derived from `event.id` for idempotent retries. Good for nightly report agents, ticket triage, or pipeline gates—not for sub-second interactive chat unless combined with a queue and polling.

### Integration checklist

1. **Auth at the edge** — Cognito/API Gateway JWT; forward `sub` as `actorId` only (never trust client-supplied actor id without verification).
2. **Session ownership** — DynamoDB item `{ sessionId, userId, createdAt }` before calling AgentCore.
3. **Least privilege** — BFF role invokes one harness endpoint; tool Lambdas have their own roles; gateway role scoped per target.
4. **Observability** — Propagate `X-Amzn-Trace-Id` / W3C `traceparent` on `InvokeHarness` when supported; correlate Lambda request id with AgentCore traces in **Assess → Observability**.
5. **Cost and limits** — Rate-limit at API Gateway; cap `maxIterations` on harness; use Haiku/Nova Lite for routing and Sonnet/Pro for complex turns via per-invocation `model` override.

**Sample:** [Serverless image-editing agent with Harness + Lambda tools](https://github.com/aws-samples/sample-serverless-image-editing-agent-bedrock-agentcore-harness) (BFF + gateway tool Lambdas).

**Scenario walkthrough:** [DynamoDB Stream → Lambda → Harness → 4 fraud agents → DynamoDB](./bedrock-agentcore-fraud-dynamodb-stream.md) (uses Steps 1–8 end to end).

---

## Choose Harness, Runtime, or classic Bedrock Agent

| Approach | Best for |
|----------|----------|
| **AgentCore Harness** | Managed loop, multi-provider models, built-in browser/code/KB via config |
| **AgentCore Runtime** | Custom frameworks, fine-grained code control, same platform services |
| **Classic Bedrock Agent** | Existing action groups + KB on Bedrock Agents ([Part 3](./deploy-operate-and-integrate.md)) |
| **Lambda + Converse** | Fully custom orchestration and UX |

For greenfield **production services** on AgentCore, a common pattern is: **Identity + Memory + Gateway (with Policy and KB target) + Harness endpoint**, with Observability and Evaluations gating promotions between harness versions.

---

## Reference links

- [What is Amazon Bedrock AgentCore?](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/what-is-bedrock-agentcore.html)
- [AgentCore Harness](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness.html)
- [AgentCore Gateway](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)
- [Policy in AgentCore](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/policy.html)
- [AgentCore Identity](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html)
- [AgentCore Memory](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/memory.html)
- [Harness tools](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-tools.html)
- [Release notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html)
- [InvokeHarness API](https://docs.aws.amazon.com/bedrock-agentcore/latest/APIReference/API_InvokeHarness.html)
- [Invoke AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html)
- [Step Functions + InvokeHarness](https://docs.aws.amazon.com/step-functions/latest/dg/connect-bedrockagentcore.html)

[← Part 3 - Deploy, operate, and integrate](./deploy-operate-and-integrate.md)
