---
title: "AI/ML: Search and Recommendations (Kendra, Personalize)"
description: "Console-first guide to Amazon Kendra and Amazon Personalize. AWS CLI in collapsible sections."
tags:
  - aws
  - kendra
  - personalize
  - search
  - recommendations
  - ai-ml
resources:
  - title: Kendra getting started (console)
    url: https://docs.aws.amazon.com/kendra/latest/dg/gs-console.html
  - title: Kendra getting started (CLI)
    url: https://docs.aws.amazon.com/kendra/latest/dg/gs-cli.html
  - title: Personalize getting started (console)
    url: https://docs.aws.amazon.com/personalize/latest/dg/getting-started-console.html
  - title: Personalize getting started (CLI)
    url: https://docs.aws.amazon.com/personalize/latest/dg/getting-started-cli.html
---

Part **3 of 3** in the AWS managed AI/ML series.

| Part | Topic |
| --- | --- |
| [1 — Text and chatbots](/aws-ai-ml-text-and-chatbots/) | Comprehend, Translate, Lex |
| [2 — Speech, vision, documents](/aws-ai-ml-speech-vision-documents/) | Polly, Transcribe, Rekognition, Textract |
| **3 (this page)** | Kendra, Personalize |

These services take longer to provision than Comprehend or Polly. Plan extra wait time after **Create**.

> **Kendra availability:** AWS announced that [Amazon Kendra will not accept new customers after July 30, 2026](https://docs.aws.amazon.com/kendra/latest/dg/gs-console.html). Existing customers can continue; new search projects should evaluate alternatives in AWS documentation (for example managed knowledge bases). This page documents Kendra for accounts that already have access.

---

## Prerequisites

```bash
aws sts get-caller-identity
export AWS_REGION=us-east-1
```

---

## Amazon Kendra

**Use when:** enterprise search over documents in S3, SharePoint, web crawlers, and other connectors—with ranking and FAQ-style answers.

### Console

1. Open [Amazon Kendra](https://console.aws.amazon.com/kendra/).
2. **Indexes** → **Create index**.
3. **Index name**, description, **Create a new role** (or pick an existing Kendra index role).
4. Accept defaults on access control unless your lab specifies otherwise → **Next**.
5. **Provisioning** → **Developer edition** for learning → **Create**.
6. Wait until index status is **Active** (can take several minutes).
7. **Data sources** → **Add data source** → choose **Amazon S3** (simplest lab path).
8. Point at a bucket with PDF/HTML/text, sync, then wait for indexing to finish.
9. Use **Search** in the console (or the test search UI) with a natural-language query.

Reference: [Getting started with the Kendra console](https://docs.aws.amazon.com/kendra/latest/dg/gs-console.html).

<details>
<summary>AWS CLI (Kendra)</summary>

Create index (IAM role must trust `kendra.amazonaws.com` and allow Kendra + CloudWatch Logs—see [IAM roles for indexes](https://docs.aws.amazon.com/kendra/latest/dg/iam-roles.html)):

```bash
aws kendra create-index \
  --region "$AWS_REGION" \
  --name cli-demo-index \
  --description "CLI demo index" \
  --edition DEVELOPER_EDITION \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/YOUR_KENDRA_ROLE
```

Wait until active:

```bash
aws kendra describe-index --region "$AWS_REGION" --id INDEX_ID \
  --query 'Status'
```

S3 data source (minimal configuration):

```bash
aws kendra create-data-source \
  --region "$AWS_REGION" \
  --index-id INDEX_ID \
  --name cli-s3-source \
  --type S3 \
  --role-arn arn:aws:iam::ACCOUNT_ID:role/YOUR_KENDRA_DS_ROLE \
  --configuration "{\"S3Configuration\":{\"BucketName\":\"YOUR_BUCKET\"}}"
```

Sync and query:

```bash
aws kendra start-data-source-sync-job \
  --region "$AWS_REGION" \
  --index-id INDEX_ID \
  --id DATA_SOURCE_ID

aws kendra query \
  --region "$AWS_REGION" \
  --index-id INDEX_ID \
  --query-text "What is our refund policy?"
```

Full walkthrough: [Getting started (AWS CLI)](https://docs.aws.amazon.com/kendra/latest/dg/gs-cli.html).

</details>

---

## Amazon Personalize

**Use when:** item recommendations for users (movies, products, articles) from **interaction history** CSV in S3.

Flow: **dataset group** → **Interactions dataset** → **import job** → **solution** (recipe) → **campaign** → get recommendations.

### Console

1. Open [Amazon Personalize](https://console.aws.amazon.com/personalize/home).
2. **Create dataset group** → name it → **Domain: Custom** → **Create**.
3. **Create dataset** → **Item interactions** → attach or create a **schema** matching your CSV columns (USER_ID, ITEM_ID, TIMESTAMP, etc.).
4. **Create dataset import job** → select your interactions CSV in S3 → run import until status succeeds.
5. **Create solution** → pick a recipe (for example **User-Personalization** for custom domain labs).
6. Wait for **solution version** status **Active** (training takes time).
7. **Create campaign** → select the solution → enable **latest solution version** → **Create campaign**.
8. On the campaign page, use **Test campaign** with a **user ID** from your CSV.

Reference: [Getting started (console)](https://docs.aws.amazon.com/personalize/latest/dg/getting-started-console.html).

<details>
<summary>AWS CLI (Personalize)</summary>

Personalize uses the `personalize` control plane and `personalize-runtime` for recommendations. The official CLI tutorial uses the [Movie Lens sample](https://docs.aws.amazon.com/personalize/latest/dg/getting-started-cli.html)—follow that for schema ARNs and recipe ARNs in your Region.

Skeleton sequence:

```bash
aws personalize create-dataset-group \
  --region "$AWS_REGION" \
  --name MovieRatingDatasetGroup

# Note dataset group ARN from output, then create schema + dataset + import job
# (see getting-started-cli for schema JSON and create-schema)

aws personalize create-solution \
  --region "$AWS_REGION" \
  --name MovieSolution \
  --dataset-group-arn DATASET_GROUP_ARN \
  --recipe-arn RECIPE_ARN

# After solution version is ACTIVE:
aws personalize create-campaign \
  --region "$AWS_REGION" \
  --name MovieRecommendationCampaign \
  --solution-version-arn SOLUTION_VERSION_ARN \
  --min-provisioned-tps 1

aws personalize-runtime get-recommendations \
  --region "$AWS_REGION" \
  --campaign-arn CAMPAIGN_ARN \
  --user-id USER_ID_FROM_CSV
```

Docs: [Getting started (CLI)](https://docs.aws.amazon.com/personalize/latest/dg/getting-started-cli.html), [create-campaign](https://docs.aws.amazon.com/cli/latest/reference/personalize/create-campaign.html).

</details>

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Kendra index stuck | `describe-index` status; IAM role trust and CloudWatch Logs permissions. |
| Kendra sync no results | Data source **ACTIVE**; sync job completed; supported file types in prefix. |
| Personalize import fails | CSV matches schema; timestamp format; S3 bucket policy allows Personalize. |
| Campaign has no recommendations | User ID exists in interactions; solution version **ACTIVE**; wait for training to finish. |

---

## Series complete

Back to [Part 1 — Comprehend, Translate, Lex](/aws-ai-ml-text-and-chatbots/) or [CLI snippets index](/aws-cli-snippets/).
