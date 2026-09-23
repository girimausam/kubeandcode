---
title: "Use existing AI services (console, no model training)"
description: "Northwind invoices: S3 to Textract and Comprehend via Lambda. Architect pattern for managed AI, IAM, KMS, and what not to build in SageMaker."
tags:
  - aws
  - textract
  - comprehend
  - lambda
  - s3
  - ai
  - architect
---

# Use existing AI services (console, no model training)

Cloud architect work **uses** machine learning services. It does not train a new model unless the task explicitly says to label data and run a training job. Northwind finance drops supplier invoices as PDFs in S3. You extract totals and flag angry free-text notes with **Amazon Textract** and **Amazon Comprehend**.

| Need | Service | Not this |
| --- | --- | --- |
| PDF or image to text and forms | Textract | A custom OCR model |
| Sentiment or PII in that text | Comprehend | A fine-tuned LLM you host |
| Chat over a policy manual | Bedrock (Nova or another foundation model) plus a knowledge base | SageMaker training |
| "Is this product photo unsafe?" | Rekognition DetectModerationLabels | A vision training cluster |

Speech, vision, and documents overview: [Polly, Transcribe, Rekognition, Textract](./aws-ai-ml-speech-vision-documents.md). Text APIs: [Comprehend, Translate, Lex](./aws-ai-ml-text-and-chatbots.md).

---

## Architecture

```text
Finance user -> S3 invoices/ (SSE-KMS, block public)
        -> S3 event notification -> Lambda
              -> textract:AnalyzeExpense
              -> comprehend:DetectSentiment on the vendor note
              -> DynamoDB invoice row (total, sentiment)
        -> SNS email only when sentiment is NEGATIVE
```

Async Textract (`StartDocumentAnalysis`) is the production choice for multi-page PDFs. This walkthrough uses **AnalyzeExpense** synchronous for a one-page lab PDF so you can finish inside a time box. If the call times out, switch to the async API and an SNS completion topic.

---

## Step 1 - Bucket

Console: **S3** -> create `northwind-invoices-ACCOUNT`.

- Block public access on.
- SSE-KMS with `alias/northwind-lake` or a dedicated CMK.
- Event notification: prefix `incoming/`, suffix `.pdf`, destination Lambda (add this after the function exists).

---

## Step 2 - Lambda

Console: **Lambda** -> Python 3.12 -> `northwind-invoice-ai`.

Timeout **60** seconds. Memory **512** MB. The PDF download plus two API calls does not fit in 3 seconds.

Execution role, inline policy shape:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::northwind-invoices-ACCOUNT/incoming/*"
    },
    {
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "arn:aws:kms:us-east-1:ACCOUNT:key/KEY_ID"
    },
    {
      "Effect": "Allow",
      "Action": ["textract:AnalyzeExpense", "comprehend:DetectSentiment"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT:table/NorthwindInvoices"
    }
  ]
}
```

Textract and Comprehend actions are often `Resource: "*"`. Scope S3 and DynamoDB. Comprehend is not available in every Region. Pick the same Region as the bucket.

Handler sketch:

```python
import os
import boto3

s3 = boto3.client("s3")
textract = boto3.client("textract")
comprehend = boto3.client("comprehend")
table = boto3.resource("dynamodb").Table(os.environ["TABLE"])

def lambda_handler(event, context):
    record = event["Records"][0]["s3"]
    bucket = record["bucket"]["name"]
    key = record["object"]["key"]
    obj = s3.get_object(Bucket=bucket, Key=key)
    blob = obj["Body"].read()
    expense = textract.analyze_expense(Document={"Bytes": blob})
    # Pull the first summary field named TOTAL if present
    total = None
    for doc in expense.get("ExpenseDocuments", []):
        for field in doc.get("SummaryFields", []):
            if field.get("Type", {}).get("Text") == "TOTAL":
                total = field.get("ValueDetection", {}).get("Text")
    note = "invoice processed"
    sentiment = comprehend.detect_sentiment(Text=note, LanguageCode="en")["Sentiment"]
    table.put_item(Item={"objectKey": key, "total": total or "unknown", "sentiment": sentiment})
    return {"key": key, "total": total, "sentiment": sentiment}
```

Replace `note` with a real extracted text field when the PDF has a comment line. DetectSentiment rejects empty strings and strings over 5000 bytes.

---

## Step 3 - DynamoDB and the event

Console: **DynamoDB** -> table `NorthwindInvoices`, partition key `objectKey` (string). Turn on **deletion protection** and **point-in-time recovery**.

Console: S3 -> **Properties** -> **Event notifications** -> create -> Lambda -> `northwind-invoice-ai`. Accept the resource policy prompt so S3 can invoke the function.

Upload a one-page PDF under `incoming/`. Check the DynamoDB item and CloudWatch logs.

---

## Step 4 - When the document is large

Console pattern for async Textract:

1. Lambda calls `start_expense_analysis` with `DocumentLocation` pointing at S3, and `NotificationChannel` an SNS topic.
2. SNS subscribes a second Lambda that calls `get_expense_analysis`.
3. The first function returns in under a second. The PDF can be many pages.

IAM adds `textract:StartExpenseAnalysis`, `textract:GetExpenseAnalysis`, and `sns:Publish`. The Textract service principal needs permission to publish to that SNS topic (topic policy). That topic policy is the step people skip. The job succeeds and the notification never arrives.

---

## What the security engineer adds

- Bucket policy deny if `aws:SecureTransport` is false.
- No public Comprehend custom endpoint. You are using the AWS API, not a VPC-hosted model. If the Lambda is in a VPC, add interface endpoints for Textract, Comprehend, S3, DynamoDB, and KMS, or a NAT Gateway. A Lambda in a VPC with no route fails with a timeout, not AccessDenied.
- Do not log the full invoice body. Log the object key and the job id.
- Comprehend **DetectPiiEntities** if the note might contain card numbers, then mask before DynamoDB.

---

## Bedrock instead of Textract

Use Bedrock when the task is language (summarize, classify with a prompt), not form geometry. Textract is better at totals and line items on a fixed invoice layout. Mixing both is normal: Textract for fields, Bedrock for a short exception summary. Model access must be enabled in the Bedrock console for that model id. See [Building with Nova](./building-with-nova.md).

---

## Mistakes

| Mistake | What you see |
| --- | --- |
| SageMaker notebook "because AI" | Hours lost, no invoice fields |
| Lambda timeout 3 seconds | Task timed out, no DynamoDB row |
| KMS decrypt missing | S3 GetObject fails inside the function |
| Comprehend in a Region where it is not offered | Endpoint error |
| Async Textract with no SNS topic policy | Job COMPLETE, Lambda never runs |
| Storing the raw PDF text in CloudWatch | Data leak in the log group |

[<- Roles map](./aws-cloud-roles-responsibility-map.md) · [<- Hidden settings](./aws-competition-hidden-settings.md)
