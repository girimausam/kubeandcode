---
title: "Embeddings and RAG with Amazon Nova"
description: "Vector embeddings, knowledge bases, and retrieval-augmented generation on Amazon Bedrock."
tags:
  - aws
  - bedrock
  - nova
  - rag
  - embeddings
---

# Part 2 - Embeddings and RAG

Amazon **Nova** is Amazon's family of foundation models on **Amazon Bedrock**. This part covers inference (**Converse**, **InvokeModel**, streaming), **tool calling**, **multimodal** inputs, and **structured JSON** output.

**Next:** [Part 2 - Embeddings and RAG](./02-embeddings-and-rag.md) · [Part 3 - Deploy, operate, integrate](./03-deploy-operate-and-integrate.md)

---

## Inference: Converse, InvokeModel, streaming, model IDs

For most new apps, start with the **Converse API** - one request shape for chat, tools, and multimodal content. Use **InvokeModel** when you need a model-specific payload or legacy samples.

### Pick a Nova model

| Model ID | Good for |
|----------|----------|
| `amazon.nova-micro-v1:0` | Lowest cost, simple tasks, high volume |
| `amazon.nova-lite-v1:0` | Balanced speed and quality |
| `amazon.nova-pro-v1:0` | Stronger reasoning and longer context |
| `amazon.nova-premier-v1:0` | Highest capability in the Nova line (enable in console when available) |

Always confirm IDs in your region: **Bedrock console → Model catalog → Amazon Nova**.

### Converse API (recommended)

**Converse** sends `messages`, optional `system`, optional `inferenceConfig`, and optional `toolConfig`. The response includes `output.message` with `content` blocks (text, tool use, and so on).

```text
Your app → bedrock-runtime:Converse → Nova → assistant message
```

<details>
<summary>AWS CLI - single turn with Converse</summary>

```bash
export AWS_REGION=us-east-1
export MODEL_ID=amazon.nova-lite-v1:0

aws bedrock-runtime converse \
  --region "$AWS_REGION" \
  --model-id "$MODEL_ID" \
  --messages '[{"role":"user","content":[{"text":"Summarize Bedrock in one sentence."}]}]' \
  --inference-config '{"maxTokens":256,"temperature":0.3}'
```

</details>

<details>
<summary>Python (boto3) - Converse</summary>

```python
import boto3

client = boto3.client("bedrock-runtime", region_name="us-east-1")

response = client.converse(
    modelId="amazon.nova-lite-v1:0",
    messages=[
        {
            "role": "user",
            "content": [{"text": "What is the Converse API?"}],
        }
    ],
    inferenceConfig={"maxTokens": 512, "temperature": 0.2},
)

print(response["output"]["message"]["content"][0]["text"])
```

</details>

### InvokeModel (model-native JSON)

**InvokeModel** passes a JSON body defined by each model provider. Use it when you follow older tutorials or need a field not on Converse yet.

<details>
<summary>AWS CLI - InvokeModel (Nova Lite)</summary>

```bash
aws bedrock-runtime invoke-model \
  --region us-east-1 \
  --model-id amazon.nova-lite-v1:0 \
  --content-type application/json \
  --accept application/json \
  --body '{"messages":[{"role":"user","content":[{"text":"Hello"}]}],"inferenceConfig":{"maxTokens":128}}' \
  /tmp/nova-out.json

cat /tmp/nova-out.json
```

</details>

### Streaming

- **ConverseStream** - same message format as Converse.
- **InvokeModelWithResponseStream** - stream with InvokeModel bodies.

<details>
<summary>AWS CLI - ConverseStream (first events)</summary>

```bash
aws bedrock-runtime converse-stream \
  --region us-east-1 \
  --model-id amazon.nova-lite-v1:0 \
  --messages '[{"role":"user","content":[{"text":"Write a haiku about clouds."}]}]' \
  --inference-config '{"maxTokens":128}' \
  --output json | head -c 4000
```

</details>

<details>
<summary>Python - ConverseStream</summary>

```python
import boto3

client = boto3.client("bedrock-runtime", region_name="us-east-1")
stream = client.converse_stream(
    modelId="amazon.nova-lite-v1:0",
    messages=[{"role": "user", "content": [{"text": "Count from 1 to 5."}]}],
    inferenceConfig={"maxTokens": 64},
)

for event in stream["stream"]:
    if "contentBlockDelta" in event:
        delta = event["contentBlockDelta"]["delta"]
        if "text" in delta:
            print(delta["text"], end="", flush=True)
```

</details>

### Inference parameters

| Parameter | Role |
|-----------|------|
| `maxTokens` | Cap on generated tokens |
| `temperature` | Randomness (lower = more deterministic) |
| `topP` | Nucleus sampling |
| `stopSequences` | Strings that stop generation |

Keep `temperature` low (0-0.3) for extraction and classification.

### Converse vs InvokeModel

| | Converse | InvokeModel |
|---|----------|-------------|
| Message shape | Standard across models | Provider-specific JSON |
| Tools | Built-in `toolConfig` | Depends on model |
| Multimodal | `image`, `document`, etc. | Model-specific |
| Best for | New applications | Legacy or special payloads |

```text
Client → API Gateway or ALB → Lambda → Converse → Nova
```

---

## Tool and function calling

Tool calling lets Nova **request** structured actions instead of guessing facts. Your app runs the tool and sends results back.

| Term | Meaning |
|------|---------|
| **Tool spec** | JSON schema: name, description, `inputSchema` |
| **toolUse** | Model asks you to run a tool with arguments |
| **toolResult** | Your reply with output (or error) |
| **toolConfig** | Tools list passed to Converse |

```text
User → Converse (tools) → toolUse → your Lambda/HTTP/DB
  → user message with toolResult → Converse → final text
```

<details>
<summary>AWS CLI - Converse with one tool</summary>

```bash
aws bedrock-runtime converse \
  --region us-east-1 \
  --model-id amazon.nova-lite-v1:0 \
  --tool-config '{
    "tools": [{
      "toolSpec": {
        "name": "get_weather",
        "description": "Get weather for a city",
        "inputSchema": {
          "json": {
            "type": "object",
            "properties": { "city": { "type": "string" } },
            "required": ["city"]
          }
        }
      }
    }]
  }' \
  --messages '[{"role":"user","content":[{"text":"Weather in Portland?"}]}]'
```

</details>

<details>
<summary>Python - tool round-trip loop</summary>

```python
import json
import boto3

brt = boto3.client("bedrock-runtime", region_name="us-east-1")
MODEL = "amazon.nova-lite-v1:0"
TOOLS = {"tools": [{"toolSpec": {
    "name": "get_weather",
    "description": "Get weather for a city",
    "inputSchema": {"json": {
        "type": "object",
        "properties": {"city": {"type": "string"}},
        "required": ["city"],
    }},
}}]}

def run_tool(name, args):
    if name == "get_weather":
        return {"temp": 72, "city": args["city"]}
    raise ValueError(name)

messages = [{"role": "user", "content": [{"text": "Weather in Austin?"}]}]
resp = brt.converse(modelId=MODEL, messages=messages, toolConfig=TOOLS)

while True:
    msg = resp["output"]["message"]
    messages.append(msg)
    tool_uses = [b["toolUse"] for b in msg["content"] if "toolUse" in b]
    if not tool_uses:
        print(msg["content"][0]["text"])
        break
    results = []
    for tu in tool_uses:
        out = run_tool(tu["name"], tu["input"])
        results.append({
            "toolResult": {
                "toolUseId": tu["toolUseId"],
                "content": [{"text": json.dumps(out)}],
                "status": "success",
            }
        })
    messages.append({"role": "user", "content": results})
    resp = brt.converse(modelId=MODEL, messages=messages, toolConfig=TOOLS)
```

</details>

**Design tips:** small tools, strict schemas, idempotent handlers, timeouts, no secrets in prompts.

---

## Multimodal: images, documents, video

Use the same **Converse** API with different `content` blocks: `text`, `image`, `document`, `video` (where supported). Prefer **S3 URIs** for large PDFs instead of inline base64.

<details>
<summary>AWS CLI - Converse with image (base64)</summary>

```bash
export MODEL_ID=amazon.nova-lite-v1:0
B64=$(base64 -w0 /path/to/photo.png)

aws bedrock-runtime converse \
  --region us-east-1 \
  --model-id "$MODEL_ID" \
  --messages "[{
    \"role\": \"user\",
    \"content\": [
      {\"image\": {\"format\": \"png\", \"source\": {\"bytes\": \"${B64}\"}}},
      {\"text\": \"Describe this image in two sentences.\"}
    ]
  }]"
```

</details>

For long video, use key frames, **Transcribe**, or **Rekognition**, then pass text to Nova. For scanned PDFs at scale, prefer **Textract** + RAG (Part 2) over huge inline documents.

---

## Structured JSON output

| Approach | When |
|----------|------|
| Prompt + `json.loads` + retry | Quick prototypes; low temperature |
| **Tool use** as schema contract | Reliable extraction (`toolUse.input`) |
| Model JSON mode (if available) | Check Nova release notes for your region |

<details>
<summary>Python - JSON extract with retry</summary>

```python
import json
import boto3

brt = boto3.client("bedrock-runtime", region_name="us-east-1")

def structured_summary(text: str) -> dict:
    prompt = (
        "Return only valid JSON: {\"summary\": string, \"sentiment\": \"positive\"|\"neutral\"|\"negative\"}\n\n"
        f"Text:\n{text}"
    )
    for _ in range(2):
        resp = brt.converse(
            modelId="amazon.nova-lite-v1:0",
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 256, "temperature": 0},
        )
        raw = resp["output"]["message"]["content"][0]["text"].strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            prompt = "Reply again with JSON only."
    raise ValueError("invalid json from model")
```

</details>

Validate with JSON Schema or Pydantic before writing to DynamoDB or returning API responses.

**Next:** [Part 2 - Embeddings and RAG](./02-embeddings-and-rag.md)
