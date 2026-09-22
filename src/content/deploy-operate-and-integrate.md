---
title: "Deploy, Operate, and Integrate Amazon Bedrock"
description: "Production Bedrock patterns—Agents, IAM, Lambda, API Gateway, S3, DynamoDB, OpenSearch, and EventBridge."
tags:
  - aws
  - bedrock
  - nova
  - generative-ai
---

# Part 3 - Deploy, operate, and integrate

Run Bedrock in production: **Bedrock Agents** (when useful), **IAM** and **troubleshooting**, and wiring **Lambda**, **API Gateway**, **S3**, **DynamoDB**, **OpenSearch**, and **EventBridge**.

**Previous:** [Part 2 - Embeddings and RAG](./02-embeddings-and-rag.md) · [Index](./README.md)

---

## Bedrock Agents (when they help)

**Agents** orchestrate **action groups** (OpenAPI → Lambda), **knowledge bases**, and **memory** with AWS-managed planning.

| | Lambda + Converse | Bedrock Agent |
|---|-------------------|---------------|
| Control flow | You code the tool loop | Agent runtime plans |
| Tools | `toolConfig` | Action groups |
| Knowledge | Your RAG or KB retrieve | KB attached to agent |
| Best for | Product APIs, strict UX | Prototypes, many tools |

Use agents when the planner saves time; skip them when you need deterministic pipelines or sub-second, fully custom audit trails.

<details>
<summary>AWS CLI - invoke agent</summary>

```bash
export AGENT_ID=ABCDEFGHIJ
export AGENT_ALIAS_ID=TSTALIASID
export SESSION_ID=$(uuidgen)

aws bedrock-agent-runtime invoke-agent \
  --region us-east-1 \
  --agent-id "$AGENT_ID" \
  --agent-alias-id "$AGENT_ALIAS_ID" \
  --session-id "$SESSION_ID" \
  --input-text "What is our refund policy?" \
  /tmp/agent-stream.bin
```

</details>

Otherwise prefer **Converse + Knowledge Base Retrieve** from Part 2.

---

## IAM and troubleshooting

### Model access

Enable each model in **Bedrock → Model access** in the **same region** as your code.

### Common IAM actions

| Action | Used for |
|--------|----------|
| `bedrock:InvokeModel` | InvokeModel, embeddings, Converse |
| `bedrock:InvokeModelWithResponseStream` | Streaming |
| `bedrock:Retrieve` / `bedrock:RetrieveAndGenerate` | Knowledge Bases |
| `bedrock:InvokeAgent` | Agents |

<details>
<summary>IAM policy - Nova Lite invoke</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream"
    ],
    "Resource": "arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0"
  }]
}
```

</details>

Knowledge Bases and Agents need **service roles** (console wizard) for S3 and OpenSearch access. Check **SCPs** if console works but Lambda does not.

### CloudWatch

- Lambda: `/aws/lambda/your-function`
- Enable **model invocation logging** on Bedrock for audit and debug.

<details>
<summary>Enable model invocation logging (outline)</summary>

```bash
aws bedrock put-model-invocation-logging-configuration \
  --region us-east-1 \
  --logging-config '{
    "cloudWatchConfig": {
      "logGroupName": "/aws/bedrock/modelinvocations",
      "roleArn": "arn:aws:iam::123456789012:role/BedrockLoggingRole"
    },
    "textDataDeliveryEnabled": true,
    "embeddingDataDeliveryEnabled": true
  }'
```

</details>

### Common errors

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `AccessDeniedException` | Model access or IAM | Enable model; fix resource ARN |
| `ValidationException` | Wrong model ID | Copy from catalog |
| `ThrottlingException` | Quota | Increase quota; backoff |
| Empty RAG answers | No chunks | Sync KB; check dimensions/filters |
| Tool never called | Vague schema | Better descriptions; `toolChoice` if supported |

<details>
<summary>AWS CLI - list Nova model IDs</summary>

```bash
aws bedrock list-foundation-models \
  --region us-east-1 \
  --by-provider Amazon \
  --query "modelSummaries[?contains(modelId, 'nova')].modelId" \
  --output table
```

</details>

**Security:** IAM roles on Lambda (no static keys), SSE-KMS on S3, redact PII in logs, VPC endpoints when required.

---

## AWS service integration

```text
API Gateway → Lambda orchestrator ↔ DynamoDB (sessions)
                    ↓
              Bedrock Converse
                    ↓
        S3 (docs)   OpenSearch (vectors)   EventBridge (ingest)
              ↓
        Ingest Lambda (Titan embed)
```

### Lambda

Python 3.12 or Node.js 20; timeout 30-120s for RAG; use response streaming for token UIs; buffer OpenSearch with SQS if needed.

<details>
<summary>SAM - Bedrock invoke on function</summary>

```yaml
Policies:
  - Statement:
      - Effect: Allow
        Action:
          - bedrock:InvokeModel
          - bedrock:InvokeModelWithResponseStream
        Resource: !Sub arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-lite-v1:0
```

</details>

### API Gateway

HTTP API → Lambda for `/chat`; CORS; JWT (Cognito) or IAM; streaming via Lambda response streaming or WebSockets.

<details>
<summary>AWS CLI - create HTTP API (outline)</summary>

```bash
aws apigatewayv2 create-api \
  --name bedrock-chat-api \
  --protocol-type HTTP \
  --target arn:aws:lambda:us-east-1:123456789012:function:chat-orchestrator
```

</details>

### S3 and EventBridge

<details>
<summary>S3 EventBridge notifications</summary>

```bash
aws s3api put-bucket-notification-configuration \
  --bucket my-rag-docs-123456789012 \
  --notification-configuration '{"EventBridgeConfiguration": {}}'
```

</details>

<details>
<summary>EventBridge rule → ingest Lambda</summary>

```bash
aws events put-rule \
  --name s3-rag-ingest \
  --event-pattern '{
    "source": ["aws.s3"],
    "detail-type": ["Object Created"],
    "detail": { "bucket": { "name": ["my-rag-docs-123456789012"] } }
  }'

aws events put-targets \
  --rule s3-rag-ingest \
  --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:123456789012:function:rag-ingest"
```

</details>

### DynamoDB

Store sessions: `pk=user#id`, `sk=session#id`, bounded message history, optional TTL.

<details>
<summary>Create ChatSessions table (on-demand)</summary>

```bash
aws dynamodb create-table \
  --table-name ChatSessions \
  --attribute-definitions \
      AttributeName=pk,AttributeType=S \
      AttributeName=sk,AttributeType=S \
  --key-schema \
      AttributeName=pk,KeyType=HASH \
      AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST
```

</details>

### Also useful

| Service | Role |
|---------|------|
| **Cognito** | Auth for API Gateway |
| **Secrets Manager** | Third-party keys for tool Lambdas |
| **SQS** | Ingest queue + DLQ |
| **Step Functions** | Long OCR + embed pipelines |
| **CloudFront** | Static UI |
| **KMS** | Encrypt data at rest |

### Launch checklist

1. Model access in region.
2. IAM for Lambda, KB service role, OpenSearch data access.
3. One S3 object through ingest; verify retrieve returns chunks.
4. Wire Nova; add CloudWatch alarms on errors and throttles.

[Back to index](./README.md)
