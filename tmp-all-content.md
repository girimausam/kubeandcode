
---

# aws-acm-import-certificate.md

---
title: "Import a Private Certificate into ACM"
description: "OpenSSL CA + self-signed cert, import into ACM, and optional Mountpoint for S3 on the host."
tags:
  - acm
  - certificate
  - openssl
  - elastic-beanstalk
  - s3
  - notes
date: 2026-09-12
---

```bash
openssl genrsa 2048 > ca-private-key.pem
openssl req -new -x509 -nodes -sha256 -days 365 -key ca-private-key.pem -outform PEM -out ca-certificate.pem
```

In Certificate Generation put the common name for the url you are generating
> Common Name |	The fully qualified domain name for your web site. This must match the domain name that users see when they visit your site, otherwise certificate errors will be shown. | www.example.com
>
eg: Generate and import another self-signed certificate, we may still get warning but we want to make sure the domain name is for certificate is matching ELB endpoint url (common name should be elb.amazonaws.com )

Reference: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/configuring-https-ssl.html

Go to Certificate Manager 
- Import Certificate
- Get the private-key and pem key and generate certificate
- Find it under List Certificate

Can Use MountPoint for S3

- sudo dnf install mountpoint-s3
- mount-s3 s3://<bucket-name>/folder/ path/to/directory

---

# aws-ai-ml-search-and-recommendations.md

---
title: "AWS AI/ML: Search and Recommendations (Kendra, Personalize)"
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

---

# aws-ai-ml-speech-vision-documents.md

---
title: "AWS AI/ML: Speech, Vision, and Documents (Polly, Transcribe, Rekognition, Textract)"
description: "Console-first guide to Polly, Transcribe, Rekognition, and Textract. AWS CLI in collapsible sections."
tags:
  - aws
  - polly
  - transcribe
  - rekognition
  - textract
  - ai-ml
resources:
  - title: Polly synthesize example (console and CLI)
    url: https://docs.aws.amazon.com/polly/latest/dg/synthesize-example.html
  - title: Transcribe getting started (CLI)
    url: https://docs.aws.amazon.com/transcribe/latest/dg/getting-started-cli.html
  - title: Rekognition detect labels
    url: https://docs.aws.amazon.com/rekognition/latest/dg/labels.html
  - title: Textract analyze document
    url: https://docs.aws.amazon.com/textract/latest/dg/analyzing-document-text.html
---

Part **2 of 3** in the AWS managed AI/ML series.

| Part | Topic |
| --- | --- |
| [1 — Text and chatbots](/aws-ai-ml-text-and-chatbots/) | Comprehend, Translate, Lex |
| **2 (this page)** | Polly, Transcribe, Rekognition, Textract |
| [3 — Search and recommendations](/aws-ai-ml-search-and-recommendations/) | Kendra, Personalize |

## Prerequisites

```bash
aws sts get-caller-identity
export AWS_REGION=us-east-1
export BUCKET=your-unique-demo-bucket-$(aws sts get-caller-identity --query Account --output text)
```

Create a bucket in the same Region as your API calls (required for Transcribe, Rekognition, and Textract with S3 input):

```bash
aws s3 mb "s3://${BUCKET}" --region "$AWS_REGION"
```

Upload a test image (JPEG/PNG) and optional audio (FLAC/MP3/WAV) before Transcribe/Rekognition/Textract sections.

---

## Amazon Polly

**Use when:** text-to-speech for apps, IVR, or accessibility.

### Console

1. Open [Amazon Polly](https://console.aws.amazon.com/polly/).
2. **Text-to-Speech** tab.
3. Turn **SSML** off for plain text.
4. Enter a short sentence.
5. Choose **Engine** (Standard, Neural, Long Form, or Generative where available), **Language**, and **Voice**.
6. **Listen**, or **Download** (MP3 and other formats under **Additional settings**).

Reference: [Synthesizing speech example](https://docs.aws.amazon.com/polly/latest/dg/synthesize-example.html).

<details>
<summary>AWS CLI (Polly)</summary>

Synthesize to a local file:

```bash
aws polly synthesize-speech \
  --region "$AWS_REGION" \
  --output-format mp3 \
  --voice-id Joanna \
  --text "Hello from Amazon Polly." \
  hello.mp3
```

List voices in the Region:

```bash
aws polly describe-voices --region "$AWS_REGION" --language-code en-US
```

Long text to S3 (async task):

```bash
echo "Long narration text goes here." > polly-input.txt
aws polly start-speech-synthesis-task \
  --region "$AWS_REGION" \
  --output-format mp3 \
  --output-s3-bucket-name "$BUCKET" \
  --voice-id Joanna \
  --text file://polly-input.txt
```

On Windows PowerShell, keep `--text` in single quotes if the string contains double quotes.

Docs: [synthesize-speech](https://docs.aws.amazon.com/cli/latest/reference/polly/synthesize-speech.html).

</details>

---

## Amazon Transcribe

**Use when:** speech in a media file → text transcript (meetings, call recordings, captions).

Transcribe batch jobs read audio from **S3 in the same Region** as the job.

### Console

1. Upload audio to your bucket (for example `s3://BUCKET/audio/sample.flac`).
2. Open [Amazon Transcribe](https://console.aws.amazon.com/transcribe/).
3. **Transcription jobs** → **Create job**.
4. Name the job, choose **Language** (or language identification if enabled).
5. Point **Input media** at your S3 object; optional output bucket.
6. Create the job and open it when status is **Completed**; download or open the transcript JSON.

Reference: [What is Amazon Transcribe](https://docs.aws.amazon.com/transcribe/latest/dg/what-is.html).

<details>
<summary>AWS CLI (Transcribe)</summary>

```bash
aws s3 cp ./your-audio.flac "s3://${BUCKET}/audio/sample.flac" --region "$AWS_REGION"

aws transcribe start-transcription-job \
  --region "$AWS_REGION" \
  --transcription-job-name demo-job-$(date +%s) \
  --language-code en-US \
  --media MediaFileUri="s3://${BUCKET}/audio/sample.flac"

aws transcribe get-transcription-job \
  --region "$AWS_REGION" \
  --transcription-job-name YOUR_JOB_NAME \
  --query 'TranscriptionJob.{Status:TranscriptionJobStatus,Uri:Transcript.TranscriptFileUri}'
```

When `Status` is `COMPLETED`, fetch the transcript URL with `curl` or open it in a browser (presigned or public per bucket policy).

Docs: [Getting started with the CLI](https://docs.aws.amazon.com/transcribe/latest/dg/getting-started-cli.html).

</details>

---

## Amazon Rekognition

**Use when:** labels/objects in images or **Detect text** (OCR). CLI requires S3 image reference (not raw bytes).

### Console

1. Upload `photo.jpg` to `s3://BUCKET/images/photo.jpg`.
2. Open [Amazon Rekognition](https://console.aws.amazon.com/rekognition/).
3. **Label detection** or **Text detection** → upload or choose S3 object.
4. Review labels or detected lines of text.

Reference: [Detecting labels](https://docs.aws.amazon.com/rekognition/latest/dg/labels.html), [Detecting text](https://docs.aws.amazon.com/rekognition/latest/dg/text-detection.html).

<details>
<summary>AWS CLI (Rekognition)</summary>

Labels:

```bash
aws rekognition detect-labels \
  --region "$AWS_REGION" \
  --image "{\"S3Object\":{\"Bucket\":\"${BUCKET}\",\"Name\":\"images/photo.jpg\"}}" \
  --max-labels 10 \
  --min-confidence 70
```

Text (OCR):

```bash
aws rekognition detect-text \
  --region "$AWS_REGION" \
  --image "{\"S3Object\":{\"Bucket\":\"${BUCKET}\",\"Name\":\"images/photo.jpg\"}}"
```

Docs: [detect-labels](https://docs.aws.amazon.com/cli/latest/reference/rekognition/detect-labels.html), [detect-text](https://docs.aws.amazon.com/cli/latest/reference/rekognition/detect-text.html).

</details>

---

## Amazon Textract

**Use when:** forms, tables, or layout on **documents** (PDF/TIFF/PNG/JPEG)—more structure than plain Rekognition OCR.

### Console

1. Open [Amazon Textract](https://console.aws.amazon.com/textract/).
2. Use **Analyze document** (demo) or upload a sample invoice/form.
3. Enable **Forms**, **Tables**, or **Queries** as needed and inspect blocks in the UI.

For your own files, upload to S3 first (same Region).

Reference: [Getting started with Textract](https://docs.aws.amazon.com/textract/latest/dg/getting-started.html), [Analyzing document text](https://docs.aws.amazon.com/textract/latest/dg/analyzing-document-text.html).

<details>
<summary>AWS CLI (Textract)</summary>

Upload a one-page PDF or image:

```bash
aws s3 cp ./document.pdf "s3://${BUCKET}/docs/document.pdf" --region "$AWS_REGION"
```

Analyze forms and tables (sync, single-page or first page of PDF):

```bash
aws textract analyze-document \
  --region "$AWS_REGION" \
  --document "{\"S3Object\":{\"Bucket\":\"${BUCKET}\",\"Name\":\"docs/document.pdf\"}}" \
  --feature-types '["TABLES","FORMS"]'
```

Multi-page PDFs: use `start-document-analysis` and `get-document-analysis` instead of `analyze-document`.

Docs: [analyze-document](https://docs.aws.amazon.com/cli/latest/reference/textract/analyze-document.html).

</details>

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Transcribe job fails immediately | Input bucket and job **Region** match; audio format [supported](https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html). |
| Rekognition / Textract invalid S3 | Object exists; caller has `s3:GetObject`; bucket Region matches API Region. |
| Textract empty tables | Enable `TABLES` in `--feature-types`; scanned PDF quality and rotation. |
| Polly voice error | Voice supports chosen **Engine** (Neural vs Standard); try `describe-voices`. |

---

## Next

Continue with [Part 3 — Kendra and Personalize](/aws-ai-ml-search-and-recommendations/).

---

# aws-ai-ml-text-and-chatbots.md

---
title: "AWS AI/ML: Text and Chatbots (Comprehend, Translate, Lex)"
description: "Console-first guide to Amazon Comprehend, Translate, and Lex V2. AWS CLI commands in collapsible sections."
tags:
  - aws
  - comprehend
  - translate
  - lex
  - nlp
  - ai-ml
resources:
  - title: Comprehend real-time analysis (console)
    url: https://docs.aws.amazon.com/comprehend/latest/dg/realtime-console-analysis.html
  - title: Comprehend synchronous API (CLI)
    url: https://docs.aws.amazon.com/comprehend/latest/dg/using-api-sync.html
  - title: Amazon Translate
    url: https://docs.aws.amazon.com/translate/latest/dg/getting-started.html
  - title: Create a Lex V2 bot (console)
    url: https://docs.aws.amazon.com/lexv2/latest/dg/create-bot-console.html
  - title: Lex recognize-text (CLI)
    url: https://docs.aws.amazon.com/cli/latest/reference/lexv2-runtime/recognize-text.html
---

Part **1 of 3** in the AWS managed AI/ML series.

| Part | Topic |
| --- | --- |
| **1 (this page)** | Comprehend, Translate, Lex |
| [2 — Speech, vision, documents](/aws-ai-ml-speech-vision-documents/) | Polly, Transcribe, Rekognition, Textract |
| [3 — Search and recommendations](/aws-ai-ml-search-and-recommendations/) | Kendra, Personalize |

Console steps come first. Copy-paste **AWS CLI** lives in `<details>` blocks.

## Prerequisites

- Signed-in AWS account in a chosen Region (stick to one Region for the whole exercise).
- IAM user or role with service access (labs often attach broad managed policies; production uses least privilege).
- Optional sample text: [`dir/ai-ml/sample-review.txt`](./dir/ai-ml/sample-review.txt).

Verify credentials:

```bash
aws sts get-caller-identity
export AWS_REGION=us-east-1
```

---

## Amazon Comprehend

**Use when:** you need sentiment, entities, key phrases, or language from short text—no model training required.

### Console

1. Open [Amazon Comprehend](https://console.aws.amazon.com/comprehend/).
2. Left menu → **Real-time analysis**.
3. **Analysis type** → **Built-in**.
4. Paste text (up to 5,000 characters) or use the sample from [`sample-review.txt`](./dir/ai-ml/sample-review.txt).
5. Choose **Analyze**.
6. In **Insights**, open **Sentiment**, **Entities**, and **Key phrases** tabs.

Reference: [Real-time analysis using built-in models](https://docs.aws.amazon.com/comprehend/latest/dg/realtime-console-analysis.html).

<details>
<summary>AWS CLI (Comprehend)</summary>

Dominant language:

```bash
aws comprehend detect-dominant-language \
  --region "$AWS_REGION" \
  --text "It is a beautiful day in Seattle."
```

Sentiment (set `--language-code` to match the text):

```bash
aws comprehend detect-sentiment \
  --region "$AWS_REGION" \
  --language-code en \
  --text "It is a beautiful day in Seattle."
```

Named entities:

```bash
aws comprehend detect-entities \
  --region "$AWS_REGION" \
  --language-code en \
  --text "Amazon Web Services is based in Seattle."
```

Docs: [Using the synchronous API](https://docs.aws.amazon.com/comprehend/latest/dg/using-api-sync.html).

</details>

---

## Amazon Translate

**Use when:** you need one string or document snippet translated to another language.

### Console

1. Open [Amazon Translate](https://console.aws.amazon.com/translate/).
2. Choose **Real-time translation** (wording may vary by console version).
3. Enter source text, pick **Source language** and **Target language** (or **Auto** for source where supported).
4. Read the translated output in the panel.

Reference: [Getting started with Amazon Translate](https://docs.aws.amazon.com/translate/latest/dg/getting-started.html).

<details>
<summary>AWS CLI (Translate)</summary>

```bash
aws translate translate-text \
  --region "$AWS_REGION" \
  --source-language-code en \
  --target-language-code es \
  --text "Hello, how are you?"
```

Auto-detect source (Region must support Comprehend-backed autodetect):

```bash
aws translate translate-text \
  --region "$AWS_REGION" \
  --source-language-code auto \
  --target-language-code fr \
  --text "Good morning"
```

Docs: [translate-text](https://docs.aws.amazon.com/cli/latest/reference/translate/translate-text.html).

</details>

**Tip:** Comprehend → Translate chain: detect language with Comprehend, then call Translate with that code instead of `auto`.

---

## Amazon Lex (V2)

**Use when:** you need a conversational bot (intents, slots) with a test UI before wiring mobile or web clients.

Lex has many CLI steps (`lexv2-models` create bot, locale, build, version, alias). The console is faster for a first bot.

### Console

1. Open [Amazon Lex](https://console.aws.amazon.com/lex/).
2. **Create bot** → **Traditional** → **Create a blank bot**.
3. Name the bot, accept or create the **IAM role**, set **Idle session timeout**, choose **Next**.
4. Add a **language** (for example **English (US)**).
5. Create at least one **Intent** with sample **Utterances** (for example intent `OrderFlowers`, utterance `I want to order flowers`).
6. **Build** the bot locale, then **Test** in the built-in test window.

Reference: [Creating a bot using the Lex V2 console](https://docs.aws.amazon.com/lexv2/latest/dg/create-bot-console.html).

<details>
<summary>AWS CLI (Lex — test only)</summary>

After the bot is **Built** and you have a **bot alias**, send text to the runtime API. Replace placeholders from the Lex console (**Bot ID**, **Bot alias ID**):

```bash
aws lexv2-runtime recognize-text \
  --region "$AWS_REGION" \
  --bot-id BOT_ID \
  --bot-alias-id ALIAS_ID \
  --locale-id en_US \
  --session-id demo-session-001 \
  --text "I want to order flowers"
```

List bots (find IDs):

```bash
aws lexv2-models list-bots --region "$AWS_REGION"
```

Full bot creation via CLI uses `create-bot`, `create-bot-locale`, intent APIs, `build-bot-locale`, `create-bot-version`, and `create-bot-alias`. Start from skeletons:

```bash
aws lexv2-models create-bot --generate-cli-skeleton input > create-bot.json
```

Docs: [Lex V2 API](https://docs.aws.amazon.com/lexv2/latest/APIReference/welcome.html), [recognize-text](https://docs.aws.amazon.com/cli/latest/reference/lexv2-runtime/recognize-text.html).

</details>

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Comprehend `UnsupportedLanguageException` | Use a [supported language code](https://docs.aws.amazon.com/comprehend/latest/dg/how-languages.html) and matching `--language-code` on entity/sentiment calls. |
| Translate autodetect fails | Use an explicit `--source-language-code` or a Region that supports autodetect. |
| Lex test returns `AccessDeniedException` | Bot alias must point to a **Built** locale; runtime needs `lex:RecognizeText` on the caller. |

---

## Next

Continue with [Part 2 — Polly, Transcribe, Rekognition, Textract](/aws-ai-ml-speech-vision-documents/).

---

# aws-apigateway-cognito-auth.md

---

title: "API Gateway with Amazon Cognito"
description: "Runbook for securing REST and HTTP APIs with Cognito User Pools (JWT authorizer) and Identity Pools (IAM/SigV4), including OAuth grants, trust policies, and scopes."
tags:
  - aws
  - cognito
  - user pools
  - identity pools
  - api-gateway
  - oauth
  - iam
---

## Overview

Amazon Cognito splits into two services that solve different problems:


| Service           | Purpose                                           | Typical API Gateway auth                                                    |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| **User Pool**     | Sign-up, sign-in, OAuth/OIDC tokens               | `COGNITO_USER_POOLS` authorizer (REST API) or **JWT authorizer** (HTTP API) |
| **Identity Pool** | Exchange tokens for **temporary AWS credentials** | `AWS_IAM` authorization + SigV4-signed requests                             |


**User Pools** answer *who is the caller* and issue JWTs. **Identity Pools** answer *what AWS resources can this caller access* by mapping federated identities to IAM roles.

```text
                    ┌──────────────────────┐
                    │   Cognito User Pool  │
                    │  Users · Groups      │
                    │  OAuth / OIDC        │
                    │  ID / Access tokens  │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────────┐ ┌─────────────┐ ┌──────────────────┐
     │  API Gateway   │ │  Identity   │ │  Other AWS APIs  │
     │  JWT authorizer│ │  Pool       │ │  (S3, DynamoDB)  │
     │  (Bearer token)│ │  → IAM creds│ │                  │
     └────────┬───────┘ └──────┬──────┘ └──────────────────┘
              │                │
              ▼                ▼
         Lambda / ECS      SigV4 to API Gateway
                          (AuthorizationType: AWS_IAM)
```



### Four concepts to keep straight

1. **Authentication** - Who is the caller? (User Pool sign-in)
2. **OAuth grant** - How does the app obtain a token?
3. **Scopes** - What is the access token allowed to do? (resource server + method scopes)
4. **IAM / Identity Pool** - What AWS APIs can the caller invoke with temporary credentials?

---



## Choose an authorization pattern



### Pattern A - User Pool authorizer (most common)

Use when you want clients to send a **Bearer JWT** in the `Authorization` header.

- **REST API:** `AuthorizationType: COGNITO_USER_POOLS`
- **HTTP API:** JWT authorizer (`authorizer-type JWT`)

Client flow: sign in → get token → `Authorization: Bearer <token>` → API Gateway validates JWT → backend runs.

**Token choice on REST API methods:**


| Method configuration                       | Token type       | What API Gateway checks                         |
| ------------------------------------------ | ---------------- | ----------------------------------------------- |
| No **Authorization scopes** on the method  | **ID token**     | Valid signature, issuer, expiry; user identity  |
| **Authorization scopes** set on the method | **Access token** | Valid token + at least one matching OAuth scope |


- **Access Token** - The standard choice for API authorization. Contains custom scopes (`PetStore/Read`, `PetStore/Write`). However, the Cognito authorizer only accepts access tokens when **OAuth Scopes** are configured on the API method.
- **ID Token** - Contains user identity claims. When no OAuth Scopes are configured on a method (as in our current setup), the Cognito authorizer treats the supplied token as an identity token.

> The Cognito authorizer's behavior depends on whether **OAuth Scopes** are configured on the API method. With **no scopes** (current setup), the authorizer runs in **identity token mode** - it validates an ID token's signature and issuer, and rejects access tokens. When you add scopes (e.g., `PetStore/Read`), the authorizer switches to **access token mode** - it validates the access token's scopes and rejects ID tokens. See ++[Control access to REST APIs using Amazon Cognito user pools as an authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)++  for details.

**Tip:** The REST API console test invoke for a Cognito authorizer requires an **ID token**. To test access-token scope validation, call the deployed API with a real client.

**Token validation regex** on the authorizer matches the `aud` claim - this only works with **ID tokens**. Access tokens do not contain `aud` in the same way; using the regex with an access token rejects the request.

References: [Integrate REST API with Cognito](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-enable-cognito-user-pool.html), [HTTP API JWT authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html), [Accessing resources after sign-in](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-accessing-resources-api-gateway-and-lambda.html)

### Pattern B - Identity Pool + IAM (SigV4)

Use when API methods use `AuthorizationType: AWS_IAM` and you need **IAM-level** access control (for example `execute-api:Invoke` on specific paths).

Client flow:

1. Sign in to User Pool → obtain **ID token**
2. Call `GetId` with the ID token in `Logins`
3. Call `GetCredentialsForIdentity` → temporary `AccessKeyId`, `SecretKey`, `SessionToken`
4. **Sign the HTTP request** with SigV4 (`service: execute-api`) and call API Gateway

**Important:** Identity Pool federation uses the **ID token** in the `Logins` map, not the access token:

```text
cognito-idp.<region>.amazonaws.com/<USER_POOL_ID>=<ID_TOKEN>
```

References: [Control access with IAM policies](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html), [Cognito IAM roles](https://docs.aws.amazon.com/cognito/latest/developerguide/role-trust-and-permissions.html)

---



## OAuth 2.0 grants (User Pool)

Cognito supports these grants via the hosted UI `/oauth2/authorize` and `/oauth2/token` endpoints (enabled when you add a Cognito domain).


| Grant                         | Use case                               | Tokens returned              | Notes                                           |
| ----------------------------- | -------------------------------------- | ---------------------------- | ----------------------------------------------- |
| **Authorization code**        | Web/mobile apps with a backend or PKCE | ID, access, refresh          | **Recommended** for interactive users           |
| **Authorization code + PKCE** | SPA, mobile (public clients)           | ID, access, refresh          | Successor to implicit grant                     |
| **Client credentials**        | Machine-to-machine (M2M)               | Access token only            | Requires app client **secret**; no user context |
| **Implicit**                  | Legacy browser apps                    | ID, access (in URL fragment) | **Deprecated** - use authorization code + PKCE  |


**App client rules (favorite):**

- **Client credentials** cannot share the same app client as authorization code or implicit grants.
- M2M scopes come from a **resource server** you define in the user pool (format: `identifier/scope`).
- Implicit grant exposes tokens in the URL fragment; AWS recommends disabling it on new app clients.

Reference: [OAuth grants in Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints-oauth-grants.html)

---



## REST API - create a Cognito authorizer



### Console / API settings

1. Create a User Pool and app client.
2. Add a Cognito domain (for OAuth endpoints).
3. In API Gateway → **Authorizers** → type **Cognito**.
4. Set **Token source** to `Authorization` (default).
5. On each method: `Authorization: COGNITO_USER_POOLS`, select authorizer, optionally set **Authorization scopes**.



### CLI example

```bash
aws apigateway create-authorizer \
  --rest-api-id API_ID \
  --name CognitoAuthorizer \
  --type COGNITO_USER_POOLS \
  --provider-arns "arn:aws:cognito-idp:REGION:ACCOUNT_ID:userpool/REGION_POOL_ID" \
  --identity-source "method.request.header.Authorization"
```

Up to **1,000 user pools** can be attached to a single `COGNITO_USER_POOLS` authorizer.

### CloudFormation (minimal)

```yaml
CogAuthorizer:
  Type: AWS::ApiGateway::Authorizer
  Properties:
    Name: CognitoAuthorizer
    RestApiId: !Ref Api
    Type: COGNITO_USER_POOLS
    IdentitySource: method.request.header.Authorization
    ProviderARNs:
      - !GetAtt UserPool.Arn

ApiGET:
  Type: AWS::ApiGateway::Method
  Properties:
    HttpMethod: GET
    RestApiId: !Ref Api
    ResourceId: !GetAtt Api.RootResourceId
    AuthorizationType: COGNITO_USER_POOLS
    AuthorizerId: !Ref CogAuthorizer
    # AuthorizationScopes: ["my-api/read"]  # uncomment for access-token scope checks
```

Reference: [Cognito authorizer with CloudFormation](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-cognito-authorizer-cfn.html)

### Lambda proxy - access token claims

With Lambda proxy integration, validated claims are available at:

```text
event.requestContext.authorizer.claims
```

Use **ID token** claims for user profile (`sub`, `email`, `cognito:groups`). Use **access token** when method scopes are configured.

---



## HTTP API - JWT authorizer

HTTP APIs use a **JWT authorizer** (not `COGNITO_USER_POOLS`). Configure issuer and audience from Cognito:

```bash
aws apigatewayv2 create-authorizer \
  --name cognito-jwt \
  --api-id API_ID \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration Audience=APP_CLIENT_ID,Issuer=https://cognito-idp.REGION.amazonaws.com/USER_POOL_ID
```

- **Issuer:** `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`
- **Audience:** app client ID (for access tokens, API Gateway falls back to `client_id` claim when `aud` is absent)
- Route-level `authorizationScopes` enforce OAuth scopes in the token

AWS recommends configuring scopes on routes so API Gateway treats tokens as **access tokens** rather than guessing token type.

---



## Obtain tokens



### M2M - client credentials grant

Requires a **dedicated app client** with client secret and client-credentials grant enabled. Define a resource server first, then request scopes like `my-api/read`.

```bash
# Option 1: client_secret_post (credentials in body)
curl -X POST "https://YOUR_DOMAIN.auth.REGION.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=APP_CLIENT_ID" \
  -d "client_secret=APP_CLIENT_SECRET" \
  -d "scope=my-api/read%20my-api/write"

# Option 2: client_secret_basic (recommended)
curl -X POST "https://YOUR_DOMAIN.auth.REGION.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "APP_CLIENT_ID:APP_CLIENT_SECRET" \
  -d "grant_type=client_credentials" \
  -d "scope=my-api/read"
```

Response (access token only - no ID or refresh token):

```json
{
  "access_token": "eyJra...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

Use the access token as `Authorization: Bearer <access_token>` when the API method has matching **Authorization scopes**.

Reference: [Token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)

### Interactive users - authorization code + PKCE (recommended)

1. Redirect to `/oauth2/authorize?response_type=code&client_id=...&redirect_uri=...&scope=openid+my-api/read&code_challenge=...&code_challenge_method=S256`
2. Exchange `code` at `/oauth2/token` with `grant_type=authorization_code` and `code_verifier`.

Returns ID, access, and refresh tokens. Prefer [Amplify Auth](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-integrate-apps.html) or an OIDC library instead of hand-rolling PKCE.

### API-based sign-in - `USER_PASSWORD_AUTH` (InitiateAuth)

Use for testing, legacy apps, or server-side auth. The app client must allow `ALLOW_USER_PASSWORD_AUTH` (and typically `ALLOW_REFRESH_TOKEN_AUTH`).

This calls the **regional IdP API**, not the OAuth domain:

```bash
aws cognito-idp initiate-auth \
  --region REGION \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id APP_CLIENT_ID \
  --auth-parameters USERNAME=user@example.com,PASSWORD='YourPassword'
```

Equivalent raw request:

```http
POST https://cognito-idp.REGION.amazonaws.com/
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth

{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "APP_CLIENT_ID",
  "AuthParameters": {
    "USERNAME": "user@example.com",
    "PASSWORD": "YourPassword"
  }
}
```

Response includes `AccessToken`, `IdToken`, `RefreshToken`, `ExpiresIn`, and `TokenType`.

**Note:** Tokens from `InitiateAuth` include the scope `aws.cognito.signin.user.admin` unless you use the OAuth `/oauth2/token` flow with custom resource-server scopes.

---



## Identity Pool - IAM roles and trust policies

Identity pools issue temporary credentials by assuming IAM roles. Each role needs:

1. A **trust policy** allowing `cognito-identity.amazonaws.com` with required conditions
2. A **permissions policy** granting AWS actions (for example `execute-api:Invoke`)



### Required trust policy conditions (2025+)

IAM **requires** `cognito-identity.amazonaws.com:aud` matching your identity pool ID. Wildcard `aud` values are rejected. AWS also recommends restricting `amr` to `authenticated` or `unauthenticated`.

#### Authenticated users

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "REGION:IDENTITY_POOL_ID"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "authenticated"
        }
      }
    }
  ]
}
```



#### Guest (unauthenticated) users

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "cognito-identity.amazonaws.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "cognito-identity.amazonaws.com:aud": "REGION:IDENTITY_POOL_ID"
        },
        "ForAnyValue:StringLike": {
          "cognito-identity.amazonaws.com:amr": "unauthenticated"
        }
      }
    }
  ]
}
```

**Security note:** Anyone who knows your identity pool ID can request guest credentials. Keep unauthenticated role permissions minimal.

Use the **enhanced authentication flow** (default) so Cognito - not the client app - selects the IAM role and applies scope-down policies.

Reference: [Identity pool security best practices](https://docs.aws.amazon.com/cognito/latest/developerguide/identity-pools-security-best-practices.html)

### Save trust policies locally

```bash
cat > cognito-authenticated-trust-policy.json <<'EOF'
{ ... paste authenticated trust policy ... }
EOF

cat > cognito-guest-trust-policy.json <<'EOF'
{ ... paste guest trust policy ... }
EOF
```

---



## Identity Pool - exchange ID token for AWS credentials

After User Pool sign-in, use the **ID token** to federate into the identity pool.

### Step 1 - Get identity ID

```bash
aws cognito-identity get-id \
  --identity-pool-id "REGION:IDENTITY_POOL_ID" \
  --logins "cognito-idp.REGION.amazonaws.com/USER_POOL_ID=$ID_TOKEN" \
  --region REGION
```



### Step 2 - Get temporary IAM credentials

```bash
aws cognito-identity get-credentials-for-identity \
  --identity-id "REGION:IDENTITY_ID" \
  --logins "cognito-idp.REGION.amazonaws.com/USER_POOL_ID=$ID_TOKEN" \
  --region REGION
```

Returns `Credentials.AccessKeyId`, `Credentials.SecretKey`, `Credentials.SessionToken`, and `Credentials.Expiration`.

### Step 3 - Call API Gateway with SigV4

Sign the request with:


| Field       | Value                                     |
| ----------- | ----------------------------------------- |
| Service     | `execute-api`                             |
| Region      | API region (for example `us-east-1`)      |
| Credentials | Temporary keys from step 2                |
| Host        | `API_ID.execute-api.REGION.amazonaws.com` |


Example URL:

```text
https://API_ID.execute-api.REGION.amazonaws.com/STAGE/resource-path
```

Use AWS SDK SigV4 signing (`@aws-sdk/signature-v4` in JavaScript, `botocore` in Python, etc.). Do not send the JWT in `Authorization` when using `AWS_IAM` - send a SigV4-signed request instead.

---



## IAM permissions for API invocation

Attach to the **authenticated** (or guest) identity pool role - not to end users directly.

### Allow invoke on a specific method

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "execute-api:Invoke",
      "Resource": "arn:aws:execute-api:REGION:ACCOUNT_ID:API_ID/STAGE/*/data"
    }
  ]
}
```

Resource ARN format:

```text
arn:aws:execute-api:{region}:{account-id}:{api-id}/{stage}/{verb}/{resource-path}
```

- `*` for stage, verb, or path acts as a wildcard
- Method must have `AuthorizationType: AWS_IAM` or the policy has no effect (method stays public)

Reference: [IAM policies to invoke API](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-control-access-using-iam-policies-to-invoke-api.html)

---



## Resource servers and scopes

To use custom scopes (for example `blog/read`) in access tokens:

1. In the User Pool, create a **resource server** with identifier (for example `blog`) and scopes (`read`, `write`).
2. Enable those scopes on the app client.
3. Request scopes in OAuth flows: `scope=blog/read blog/write`
4. On the API Gateway method, set **Authorization scopes** to `blog/read` (full `identifier/scope` name).

Client credentials and authorization-code flows can both request resource-server scopes; `InitiateAuth` alone does not.

Reference: [Scopes, M2M, and resource servers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)

---



## Backend integration example (DynamoDB via VTL)

When API Gateway integrates directly with DynamoDB (not Lambda proxy), map the request body in a **mapping template**:

```vtl
{
  "TableName": "$input.path('$.tableName')",
  "Item": {
    "userId": { "S": "$input.path('$.userId')" },
    "age": { "S": "$input.path('$.age')" }
  }
}
```

The caller still needs permission to invoke the API (via Cognito authorizer or IAM). DynamoDB access is granted to **API Gateway's execution role**, not the Cognito user directly.

---



## Enable Refresh Token Rotation

In the Amazon Cognito console , go to your Cognito User Pool.

Under `App clients`, select the `Managed Login` app client.

In the `App client` information section, click `Edit`.

Under `Authentication flows`, uncheck `ALLOW_REFRESH_TOKEN_AUTH` - rotation isn't compatible with this auth flow.

Under Advanced security configurations, check Enable refresh token rotation.

For Refresh token rotation grace period, enter 10 seconds. This brief grace period allows retries before the old token is revoked.

Reference: [https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/30-managed-login-authentication#step-7:-enable-refresh-token-rotation-(optional)](https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/30-managed-login-authentication#step-7:-enable-refresh-token-rotation-(optional))

---



### Cognito User ( Verify )

`FORCE_CHANGE_PASSWORD` => `CONFIRMED`

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id  \
  --username admin@example.com \
  --password Admin@123 \
  --permanent
```

---



## References

- [Control access with Cognito user pools (REST API)](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)
- [Call a REST API integrated with Cognito](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-invoke-api-integrated-with-cognito-user-pool.html)
- [HTTP API JWT authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html)
- [Cognito IAM roles and trust policies](https://docs.aws.amazon.com/cognito/latest/developerguide/role-trust-and-permissions.html)
- [OAuth 2.0 grants in Cognito](https://docs.aws.amazon.com/cognito/latest/developerguide/federation-endpoints-oauth-grants.html)
- [Token endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/token-endpoint.html)
- [Resource servers and scopes](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html)


---

# aws-apigateway-dynamodb-mapping.md

---
title: "API Gateway Mapping Templates for DynamoDB"
description: "Velocity Template Language (VTL) examples for API Gateway proxy integrations with DynamoDB-PutItem, GetItem, and custom JSON responses."
tags:
  - api-gateway
  - dynamodb
  - vtl
  - velocity
  - serverless
  - aws
---

## Overview

Use API Gateway as a proxy to DynamoDB with **Velocity Template Language (VTL)** mapping templates. API Gateway transforms HTTP requests into DynamoDB API calls and maps responses back to JSON for clients.

**Reference:** [Using Amazon API Gateway as a proxy for DynamoDB](https://aws.amazon.com/blogs/compute/using-amazon-api-gateway-as-a-proxy-for-dynamodb/)

### Prerequisites

| Setting | Value |
| --- | --- |
| Integration type | AWS Service |
| AWS service | DynamoDB |
| Actions | `PutItem`, `GetItem`, `Scan` |
| Execution role | API Gateway IAM role with DynamoDB permissions |

**Table:** `Users`

**Partition key:** `userId` (String)

## Create user - `PUT /users`

### Request

```http
PUT /users
Content-Type: application/json
```

```json
{
  "userId": "u123",
  "name": "Mausam",
  "age": 24
}
```

### Integration request mapping template

Set **Content-Type** to `application/json`, then use this VTL for DynamoDB `PutItem`:

```json
{
  "TableName": "Users",
  "Item": {
    "userId": { "S": "$input.path('$.userId')" },
    "name": { "S": "$input.path('$.name')" },
    "age": { "N": "$input.path('$.age')" }
  }
}
```

### Integration response mapping template

DynamoDB `PutItem` returns `{}`. Return a friendly message to the client:

```json
{
  "message": "User created successfully"
}
```

## Get user - `GET /users/{id}`

### Request

```http
GET /users/u123
```

Path parameter: `id` = `u123`

### Integration request mapping template

```json
{
  "TableName": "Users",
  "Key": {
    "userId": { "S": "$input.params('id')" }
  }
}
```

### DynamoDB response (raw)

```json
{
  "Item": {
    "userId": { "S": "u123" },
    "name": { "S": "Mausam" },
    "age": { "N": "24" }
  }
}
```

### Integration response mapping template

Flatten DynamoDB attribute types into plain JSON:

```json
{
  "userId": "$input.path('$.Item.userId.S')",
  "name": "$input.path('$.Item.name.S')",
  "age": $input.path('$.Item.age.N')
}
```

### Client response

```json
{
  "userId": "u123",
  "name": "Mausam",
  "age": 24
}
```

## List users - `GET /users`

### Request

```http
GET /users
```

### Integration request mapping template

```json
{
  "TableName": "Users"
}
```

Use DynamoDB action **Scan** for this route.

### Integration response mapping template

```json
#set($items = [])

#foreach($item in $input.path('$.Items'))
  #set($dummy = $items.add({
    "userId": $item.userId.S,
    "name": $item.name.S,
    "age": $item.age.N
  }))
#end

$util.toJson($items)
```

### Client response

```json
[
  {
    "userId": "u123",
    "name": "Mausam",
    "age": 24
  }
]
```

> **Note:** `Scan` reads the entire table. For production APIs, prefer `Query` with a key condition or use a GSI.

## IAM policy for API Gateway

Grant the API Gateway execution role access to the `Users` table:

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:PutItem",
    "dynamodb:GetItem",
    "dynamodb:Scan"
  ],
  "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/Users"
}
```

## Step Functions integration

### Integration request mapping template

Start a state machine execution from API Gateway:

- #1
```json
{
  "input": "$util.escapeJavaScript($input.body)"
  "stateMachineArn": "arn:aws:states:REGION:ACCOUNT_ID:stateMachine:STATE_MACHINE_NAME",
}
```

- #2
```json
#set($rawRequest = $input.json('$'))
{
  "input": "$util.escapeJavaScript($rawRequest)",
  "stateMachineArn": "arn:aws:states:us-east-1:271995869266:stateMachine:express-stat-flow"
}
```

### Integration response mapping template

Parse and return the Step Functions output:

To get the specific property from the response. eg `output` try:
```json
$input.path('$.output')
```

_this converts the response into JAVA Map Object (avoid)_
```json
#set($output = $util.parseJson($input.path('$.output')))
$output
```


## Quick reference

| Route | DynamoDB action | Path param | Key mapping |
| --- | --- | --- | --- |
| `PUT /users` | `PutItem` | - | Body → `Item` attributes |
| `GET /users/{id}` | `GetItem` | `id` | `$input.params('id')` |
| `GET /users` | `Scan` | - | Table name only |

**DynamoDB type suffixes:** `S` = String, `N` = Number, `B` = Binary. VTL maps client JSON into these typed attributes on the way in, and flattens them on the way out.

Ref: https://medium.com/@kruchkov.alexandr/a-deep-dive-into-aws-api-gateway-velocity-mapping-templates-9a6c9f4ed742
---

# aws-apigateway-websocket.md

---
title: "API Gateway WebSocket APIs"
description: "WebSocket route keys ($connect, $disconnect, $default), MOCK integration setup, CLI inspection commands, and Lambda handler patterns for custom routes."
tags:
  - api-gateway
  - websocket
  - lambda
  - aws
  
date: 2026-08-21
---

## Overview

A **WebSocket API** in API Gateway routes each client message to a backend integration using a **route key**. Three route keys are built in; you add custom keys (for example `message`, `subscribe`) for application actions.

| Route key | When it runs |
| --- | --- |
| `$connect` | During the WebSocket upgrade, before the connection is established |
| `$disconnect` | After the client disconnects |
| `$default` | When the incoming message does not match any other route key |
| Custom (e.g. `message`) | When the client sends a JSON body with `"action": "message"` (if route selection uses `request.body.action`) |

References:

- [WebSocket API routes](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-routes.html)
- [`$connect` and `$disconnect`](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html)
- [Integration requests](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-integration-requests.html)

---

## CLI inspection commands

Replace `API_ID`, `ROUTE_ID`, `INTEGRATION_ID`, and Region as needed.

```bash
# List routes
aws apigatewayv2 get-routes --api-id sjzk7q0onf --region us-east-1

# Check whether a route has a route response
aws apigatewayv2 get-route-responses --api-id sjzk7q0onf --route-id h6z3y2r --region us-east-1

# Inspect integration type and request templates
aws apigatewayv2 get-integration --api-id sjzk7q0onf --integration-id d4macp0 --region us-east-1
```

---

## What each route can read

| Route | `queryStringParameters` | Headers | `body` | `requestContext` |
| --- | --- | --- | --- | --- |
| `$connect` | Yes | Yes | No meaningful client message body (HTTP upgrade only) | Yes (`connectionId`, `routeKey`, etc.) |
| `$disconnect` | Limited | Limited | No | Yes (`disconnectStatusCode`, `disconnectReason`, …) |
| Custom routes | Yes | Yes | Yes | Yes |
| `$default` | Depends on integration | Depends on integration | Depends on integration | Yes |

On **`$connect`**, use query string parameters and headers for auth tokens (for example `?token=...`). The WebSocket handshake is an HTTP upgrade request, not an application message - do not expect a JSON body from the client at connect time.

On **custom route keys** (anything other than `$connect` / `$disconnect`), the Lambda event includes `body` and full `requestContext`.

---

## `$default` route with MOCK integration

Use MOCK when you want API Gateway to accept the connection or message without calling a backend service (for example a passthrough `$default` or a no-op `$connect`).

### Integration request

| Setting | Value |
| --- | --- |
| Integration type | `MOCK` |
| Request template | `{"statusCode": 200}` |

The request template **must** set `statusCode`. API Gateway uses it to select the matching integration response. Without a valid template/response pair, connections can fail with **500**.

Example request template (console often uses `application/json` as the template key):

```json
{"statusCode": 200}
```

![MOCK integration request template](./images/apigateway-websocket-mock-integration-request.png)

### Integration response

| Setting | Value |
| --- | --- |
| Response key | `/200/` (matches `statusCode: 200` from the request template) |
| Template selection expression | Optional - only needed when you define response templates |

![MOCK integration response](./images/apigateway-websocket-mock-integration-response.png)

**Notes**

- Response key `/200/` corresponds to `statusCode` **200** in the integration request template.
- For `$connect`, the client does not receive a normal HTTP response body, but the integration response is still required for MOCK integrations - otherwise the handshake fails.
- To return errors from MOCK, add another request template value (for example `{"statusCode": 400}`) and a matching integration response key `/400/`.

Example CLI integration payload:

```json
{
  "PassthroughBehavior": "WHEN_NO_MATCH",
  "IntegrationType": "MOCK",
  "RequestTemplates": {
    "application/json": "{\"statusCode\":200}"
  }
}
```

---

## Lambda handler - custom `message` route

Example for a custom route that reads `queryStringParameters`, validates a token, and returns `connectionId` / `routeKey`.

Use on **`$connect`** for auth, or on a custom route if the client sends messages with a body.

```python
import json


def lambda_handler(event, context):
    print("FULL EVENT:")
    print(json.dumps(event))

    connection_id = event["requestContext"]["connectionId"]
    route_key = event["requestContext"]["routeKey"]

    qs = event.get("queryStringParameters") or {}
    print("QUERY STRING:", qs)
    token = qs.get("token")

    print("Connection ID:", connection_id)
    print("Route:", route_key)
    print("Token provided:", bool(token))

    if not token:
        return {
            "statusCode": 401,
            "body": json.dumps({"message": "Missing token"}),
        }

    # Validate token here
    # ...

    return {
        "statusCode": 200,
        "body": json.dumps({
            "connectionId": connection_id,
            "routeKey": route_key,
        }),
    }
```

**`$connect` behavior:** returning `statusCode` **401** (or **403**) from the `$connect` integration **rejects** the WebSocket connection. Returning **200** allows it.

**Custom routes:** parse `event["body"]` (JSON string) for application payloads. Use `@connections` API (`post_to_connection`) to send messages back to the client.

---

## Common issues

| Symptom | Likely cause |
| --- | --- |
| 500 on WebSocket connect with MOCK | Missing integration request template or integration response key `/200/` |
| Route not invoked | `routeSelectionExpression` does not match client message (check `action` field in body) |
| Token not found in Lambda | Token sent in connect URL query string - only available on `$connect`, not later messages unless client resends |
| Cannot message client | Missing `execute-api:ManageConnections` on the Lambda role for `post_to_connection` |

---

## Related notes

- [API Gateway with Cognito](/aws-apigateway-cognito-auth/) - REST/HTTP auth patterns
- [Lambda Python runtime](/aws-lambda-python-runtime/) - packaging and handler basics

---

# aws-appconfig-freeform.md

---
title: "AWS AppConfig: Freeform Configuration"
description: "Daily playbook: Freeform profile, JSON Schema validators, hosted versions, deployment (release) with bake-time rollback."
tags:
  - appconfig
  - aws
  - configuration
  - json-schema
  - notes
date: 2026-09-06
links:
  - title: Creating feature flags and freeform configuration
    url: https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile.html
  - title: Validators
    url: https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-validators.html
  - title: Deployment strategies
    url: https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html
---

# AWS AppConfig - Freeform

Order: **Application** → **Environment** (`dev` / `prod`) → **Configuration profile** (`AWS.Freeform`) → **Hosted version** → **Start deployment**.

Prefer **hosted** store (URI `hosted`, ≤ 2 MB). Feature flags = on/off + attributes. Freeform = your JSON/YAML/text. This note = Freeform.

CloudWatch alarms on the **environment** → auto-rollback during deploy + bake time. Agent polls; apps do not hit GetConfiguration on every request.

| Piece | Job |
| --- | --- |
| Application | Namespace (folder) |
| Environment | Target group + alarms |
| Profile | Type + location + validators (max 2) |
| Version | Immutable snapshot of content |
| Deployment | Version + strategy + environment = **release** |

<details>
<summary>Create application + environment</summary>

```bash
export AWS_REGION=<region>

APP_ID=$(aws appconfig create-application \
  --name my-app \
  --query Id --output text)

ENV_ID=$(aws appconfig create-environment \
  --application-id "$APP_ID" \
  --name prod \
  --query Id --output text)
```

</details>

---

## Freeform

Profile type `AWS.Freeform`. Location URI `hosted` unless you point at S3 / SSM Parameter / SSM Document / Secrets Manager / CodePipeline.

Do not store secrets in Freeform JSON. Secrets Manager (or Parameter Store) for credentials; AppConfig for flags and tunables (`PORT`, `LOG_LEVEL`, `ENABLED`).

<details>
<summary>Create Freeform hosted profile</summary>

```bash
PROFILE_ID=$(aws appconfig create-configuration-profile \
  --application-id "$APP_ID" \
  --name app-settings \
  --location-uri hosted \
  --type AWS.Freeform \
  --query Id --output text)
```

Sample payload (`app-config.json`):

```json
{
  "PORT": 8080,
  "LOG_LEVEL": "INFO",
  "ENABLED": true
}
```

</details>

---

## Validators

Run **before** a version can deploy. Fail → no targets change.

| Type | Use |
| --- | --- |
| **JSON Schema** | Freeform only. Inline schema = **JSON Schema draft-04** (`4.X`). Feature flags already have a built-in schema. |
| **Lambda** | Freeform + feature flags. Semantic checks, other schema drafts, cross-field rules. Timeout **15 s** including cold start. Grant `appconfig.amazonaws.com` invoke. |

Need draft-07 → Lambda validator, not inline schema.

<details>
<summary>JSON Schema (draft-04) - PORT / LOG_LEVEL / ENABLED</summary>

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "properties": {
    "PORT": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65535
    },
    "LOG_LEVEL": {
      "type": "string",
      "enum": ["DEBUG", "INFO", "WARN", "ERROR"]
    },
    "ENABLED": {
      "type": "boolean"
    }
  },
  "required": ["PORT", "LOG_LEVEL", "ENABLED"],
  "additionalProperties": false
}
```

Attach on create (or update profile). `Content` = schema as a **string**.

```bash
aws appconfig create-configuration-profile \
  --application-id "$APP_ID" \
  --name app-settings \
  --location-uri hosted \
  --type AWS.Freeform \
  --validators '[{"Type":"JSON_SCHEMA","Content":"{\"\$schema\":\"http://json-schema.org/draft-04/schema#\",\"type\":\"object\",\"properties\":{\"PORT\":{\"type\":\"integer\",\"minimum\":1,\"maximum\":65535},\"LOG_LEVEL\":{\"type\":\"string\",\"enum\":[\"DEBUG\",\"INFO\",\"WARN\",\"ERROR\"]},\"ENABLED\":{\"type\":\"boolean\"}},\"required\":[\"PORT\",\"LOG_LEVEL\",\"ENABLED\"],\"additionalProperties\":false}"}]'
```

Console: profile → **Validators** → JSON Schema → paste schema → save **before** first bad deploy.

</details>

---

## Version

Each `create-hosted-configuration-version` = new immutable number (`1`, `2`, …). You **release** a version; you do not edit in place.

Bad JSON vs schema → version create / deploy fails. Fix file, new version.

<details>
<summary>Publish hosted configuration version</summary>

```bash
aws appconfig create-hosted-configuration-version \
  --application-id "$APP_ID" \
  --configuration-profile-id "$PROFILE_ID" \
  --content-type application/json \
  --content fileb://app-config.json \
  hosted-version.json

aws appconfig list-hosted-configuration-versions \
  --application-id "$APP_ID" \
  --configuration-profile-id "$PROFILE_ID"
```

`hosted-version.json` → `VersionNumber`.

</details>

---

## Release (deployment)

`start-deployment` = version + environment + **strategy**.

Predefined: `AppConfig.AllAtOnce` (lab), `AppConfig.Linear50PercentEvery30Seconds`, `AppConfig.Canary10Percent20Minutes`. Prod: linear/canary + **bake time** + CloudWatch alarm on error rate / latency.

Rollback: alarm during rollout or bake → previous version. Manual stop if you catch it first. Deploy **dev** first, then **prod**.

<details>
<summary>Start deployment + watch</summary>

```bash
aws appconfig start-deployment \
  --application-id "$APP_ID" \
  --environment-id "$ENV_ID" \
  --deployment-strategy-id AppConfig.AllAtOnce \
  --configuration-profile-id "$PROFILE_ID" \
  --configuration-version 1 \
  --description "release v1"

aws appconfig list-deployments \
  --application-id "$APP_ID" \
  --environment-id "$ENV_ID"
```

Strategy knobs: growth factor (step %), deploy time, bake time, linear vs exponential (`G*(2^N)`).

</details>

---

## Daily checks

| Symptom | First look |
| --- | --- |
| Deploy blocked / validation error | Schema vs payload types (`ENABLED` boolean not `"true"`); draft-04 only inline |
| App still old config | Agent poll interval; wrong environment; deployment not `COMPLETE` |
| Auto-rollback | CloudWatch alarm on environment; AppConfig rollback IAM |
| Lambda validator timeout | 15 s cap; cold start |

Docs: [validators](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-configuration-and-profile-validators.html) · [strategies](https://docs.aws.amazon.com/appconfig/latest/userguide/appconfig-creating-deployment-strategy.html)

---

# aws-appsync-graphql-task-manager.md

---
title: "AppSync GraphQL Task Manager"
description: "Cognito-authenticated AppSync GraphQL API with DynamoDB, JavaScript resolvers, user-scoped task access, and Admins group authorization."
tags:
  - appsync
  - graphql
  - cognito
  - dynamodb
  - aws
date: 2026-08-22
---

## Overview

Build a task manager API where users authenticate with Cognito, own their tasks, and members of an **Admins** group can read any task.


| Component                | Role                                        |
| ------------------------ | ------------------------------------------- |
| Amazon Cognito User Pool | Sign-in, JWT issuance, `Admins` group       |
| AWS AppSync              | GraphQL API with Cognito authorization      |
| Amazon DynamoDB          | Task storage (`owner` + `id` composite key) |


**End state:**

- Users authenticate with Cognito.
- Each task has an owner (`ctx.identity.sub`).
- Normal users manage only their own tasks.
- The **Admins** Cognito group can view and manage all tasks.
- Resolvers use **AppSync JavaScript** (`APPSYNC_JS`), not VTL.
- Test from the AppSync console and AWS CLI.



### Target architecture

```text
Client / GraphQL Explorer
        │
        ▼
Amazon Cognito User Pool
        │ JWT
        ▼
AWS AppSync GraphQL API
        │
        ▼
Amazon DynamoDB
```



### Authorization model

```text
                         Cognito User Pool
                                │
                   ┌────────────┼────────────┐
                   ▼            ▼            ▼
                 Alice          Bob         Admin
                   │             │             │
                   └─────────────┼─────────────┘
                                 ▼
                              AppSync
                                 │
                   ┌─────────────┴──────────────┐
                   │                            │
                   ▼                            ▼
              User resolvers              Admin resolvers
                   │                            │
                   │ ctx.identity.sub           │ groups includes Admins
                   ▼                            ▼
            owner = caller                 privileged operation
                   │                            │
                   └─────────────┬──────────────┘
                                 ▼
                              DynamoDB
```

---



## Prerequisites

Set shell variables before running CLI commands:

```bash
export AWS_REGION=us-east-1
export USER_POOL_ID=<your-user-pool-id>
export CLIENT_ID=<your-app-client-id>
export APPSYNC_URL=<your-appsync-graphql-url>
export TABLE_ARN=<your-dynamodb-table-arn>
```

---



## Cognito User Pool



### App client (SPA)

Create an app client **without** a client secret.

**Allowed auth flows:**

- `ALLOW_ADMIN_USER_PASSWORD_AUTH`
- `ALLOW_REFRESH_TOKEN_AUTH`



### Users

Create three users for testing: `alice`, `bob`, and `admin`.

### Create user

```bash
aws cognito-idp admin-create-user \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --user-attributes Name=email,Value=alice@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS \
  --region $AWS_REGION
```

Repeat for `bob@example.com` and `admin@example.com`, setting `email_verified` to `true` on each.

### Set permanent password

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --password "$ALICE_PASSWORD" \
  --permanent \
  --region $AWS_REGION
```



### Create Admins group

```bash
aws cognito-idp create-group \
  --group-name Admins \
  --user-pool-id $USER_POOL_ID \
  --region $AWS_REGION
```



### Add user to Admins group

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $USER_POOL_ID \
  --username admin@example.com \
  --group-name Admins \
  --region $AWS_REGION
```



### Get authentication token

```bash
aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters \
    USERNAME=alice@example.com,PASSWORD="$ALICE_PASSWORD" \
  --region $AWS_REGION
```

The response includes:

- **Access token**
- **ID token**
- **Refresh token**

Use the **ID token** consistently when sending Cognito authentication to AppSync.

```bash
export ALICE_ID_TOKEN=$(echo "$AUTH_RESULT" | jq -r '.AuthenticationResult.IdToken')
```



### Get user identity (sub)

```bash
aws cognito-idp admin-get-user \
  --user-pool-id $USER_POOL_ID \
  --username alice@example.com \
  --region $AWS_REGION
```

```bash
export ALICE_SUB="<alice-cognito-sub>"
export ALICE_TASK_ID="<alice-task-id>"
```

---



## DynamoDB table

Use as the AppSync data source.


| Attribute | Key | Value              |
| --------- | --- | ------------------ |
| `owner`   | PK  | Cognito user `sub` |
| `id`      | SK  | UUID               |


---



## AppSync GraphQL API

Console path: **AWS AppSync → Create API → GraphQL APIs**


| Setting            | Value                    |
| ------------------ | ------------------------ |
| API name           | `TaskManagerAPI`         |
| Authorization mode | Amazon Cognito User Pool |
| User pool          | Select your pool         |




### Schema (`schema.graphql`)

```graphql
type Task {
  id: ID!
  owner: String!
  title: String!
  description: String
  completed: Boolean!
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

input CreateTaskInput {
  title: String!
  description: String
}

input UpdateTaskInput {
  id: ID!
  title: String
  description: String
  completed: Boolean
}

type Query {
  getMyTask(id: ID!): Task
  listMyTasks: [Task!]!

  getTaskAsAdmin(owner: String!, id: ID!): Task
  listAllTasks: [Task!]!
}

type Mutation {
  createTask(input: CreateTaskInput!): Task!
  updateMyTask(input: UpdateTaskInput!): Task!
  deleteMyTask(id: ID!): Task!
}

type Schema {
  query: Query
  mutation: Mutation
}
```

`CreateTaskInput` intentionally omits `owner: String!`. The owner comes from `ctx.identity.sub`, not from client input.

### Operations


| Type     | Operation        | Scope        |
| -------- | ---------------- | ------------ |
| Mutation | `createTask`     | Current user |
| Query    | `getMyTask`      | Current user |
| Query    | `listMyTasks`    | Current user |
| Mutation | `updateMyTask`   | Current user |
| Mutation | `deleteMyTask`   | Current user |
| Query    | `getTaskAsAdmin` | Admins only  |
| Query    | `listAllTasks`   | Admins only  |




### Data access flow

```text
AppSync
   │ assumes
   ▼
IAM Role (AppSyncTaskManagerDynamoDBRole)
   │
   ▼
DynamoDB Tasks table
```

---



## IAM role for AppSync

Role name: `AppSyncTaskManagerDynamoDBRole`

Trust policy

```bash
cat << 'EOF' > appsync-iam-role-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "appsync.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
```



Permission policy (replace `TABLE_ARN`)

```bash
cat << 'EOF' > appsync-dynamodb-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "TaskTableAccess",
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan"
      ],
      "Resource": [
        "TABLE_ARN"
      ]
    }
  ]
}
EOF
```

Create the role and attach the inline policy:

```bash
aws iam create-role \
  --role-name AppSyncTaskManagerDynamoDBRole \
  --assume-role-policy-document file://appsync-iam-role-trust-policy.json

aws iam put-role-policy \
  --role-name AppSyncTaskManagerDynamoDBRole \
  --policy-name TaskManagerDynamoDBAccess \
  --policy-document file://appsync-dynamodb-policy.json
```



---



## Data source

Console: attach DynamoDB as a data source on the API.


| Setting          | Value                                            |
| ---------------- | ------------------------------------------------ |
| Data source type | Amazon DynamoDB table                            |
| Data source name | `TasksDataSource`                                |
| Region           | `us-east-1`                                      |
| Table            | `Tasks`                                          |
| IAM role         | `AppSyncTaskManagerDynamoDBRole` (existing role) |


---



## Resolvers (AppSync JavaScript)

Attach unit resolvers with runtime **APPSYNC_JS** and data source **TasksDataSource**.

Console path: **Schema → Mutation/Query → operation → Attach**


| Schema field            | Resolver file                                                              | DynamoDB operation                        |
| ----------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| `Mutation.createTask`   | `[dir/appsync/pr2/createTask.js](./dir/appsync/pr2/createTask.js)`         | `PutItem` - owner from `ctx.identity.sub` |
| `Query.getMyTask`       | `[dir/appsync/pr2/getMyTask.js](./dir/appsync/pr2/getMyTask.js)`           | `GetItem` - key scoped to caller          |
| `Query.listMyTasks`     | `[dir/appsync/pr2/listMyTasks.js](./dir/appsync/pr2/listMyTasks.js)`       | List caller's tasks                       |
| `Mutation.updateMyTask` | `[dir/appsync/pr2/updateTask.js](./dir/appsync/pr2/updateTask.js)`         | `UpdateItem` - key scoped to caller       |
| `Mutation.deleteMyTask` | `[dir/appsync/pr2/deleteMyTask.js](./dir/appsync/pr2/deleteMyTask.js)`     | `DeleteItem` - key scoped to caller       |
| `Query.getTaskAsAdmin`  | `[dir/appsync/pr2/getTaskAsAdmin.js](./dir/appsync/pr2/getTaskAsAdmin.js)` | `GetItem` - any `owner` + `id`            |
| `Query.listAllTasks`    | `[dir/appsync/pr2/listAllTasks.js](./dir/appsync/pr2/listAllTasks.js)`     | `Scan` - all tasks                        |


**Admin helper:** `[dir/appsync/pr2/isAdmin.js](./dir/appsync/pr2/isAdmin.js)` - checks `ctx.identity.groups` for membership. Import or inline in admin resolvers.

### Example: attach `Mutation.createTask`


| Setting       | Value             |
| ------------- | ----------------- |
| Data source   | `TasksDataSource` |
| Runtime       | `APPSYNC_JS`      |
| Resolver type | Unit              |
| Code          | `createTask.js`   |


Repeat for each field in the table above.

---



## Admin authorization

Admin queries read `ctx.identity.groups` from the Cognito JWT.

```text
Cognito JWT
   ↓
ctx.identity.groups
   ↓
Is caller in "Admins"?
   ├── Yes → continue
   └── No  → util.unauthorized()
```


| Caller                 | Allowed                          |
| ---------------------- | -------------------------------- |
| Admin (`Admins` group) | `getTaskAsAdmin`, `listAllTasks` |
| Normal user            | Own-task operations only         |




### Get admin ID token

```bash
ADMIN_AUTH=$(aws cognito-idp admin-initiate-auth \
  --user-pool-id $USER_POOL_ID \
  --client-id $CLIENT_ID \
  --auth-flow ADMIN_USER_PASSWORD_AUTH \
  --auth-parameters \
    USERNAME=admin@example.com,PASSWORD="Test@123" \
  --region $AWS_REGION)

export ADMIN_ID_TOKEN=$(echo "$ADMIN_AUTH" \
  | jq -r '.AuthenticationResult.IdToken')
```



### Admin query example

```graphql
query {
  getTaskAsAdmin(
    owner: "ALICE_SUB"
    id: "ALICE_TASK_ID"
  ) {
    id
    owner
    title
    description
    completed
    createdAt
    updatedAt
  }
}
```

---



## CLI testing

1. Obtain an ID token from Cognito (user or admin).
2. POST a GraphQL operation to the AppSync URL with `Authorization: <ID_TOKEN>`.



### List my tasks (alice)

```bash
cat << 'EOF' > appsync-query.json
{
  "query": "query { listMyTasks { id owner title completed } }"
}
EOF

curl \
  -X POST \
  "$APPSYNC_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $ALICE_ID_TOKEN" \
  --data @appsync-query.json
```



### List all tasks (admin)

```bash
cat << 'EOF' > list-all-query.json
{
  "query": "query { listAllTasks { id owner title completed } }"
}
EOF

curl \
  -X POST \
  "$APPSYNC_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: $ADMIN_ID_TOKEN" \
  --data @list-all-query.json
```



### Console testing

In the AppSync console **Queries** tab, sign in with user credentials and run operations against the schema.

---



## Pagination (extension)

To paginate `listMyTasks`, extend the schema and resolver to accept `limit` and `nextToken`.


| Argument    | First page           | Next page                    |
| ----------- | -------------------- | ---------------------------- |
| `limit`     | Page size (e.g. `2`) | Same                         |
| `nextToken` | `null`               | Token from previous response |


```graphql
query {
  listMyTasks(
    limit: 2
    nextToken: "PASTE_TOKEN_HERE"
  ) {
    items {
      id
      title
      completed
    }
    nextToken
  }
}
```

Update `listMyTasks` in the schema to return a connection type (`items` + `nextToken`) instead of `[Task!]!` before using this query shape.

---



## Notes

- **Group name casing:** Cognito group is `Admins`. Some resolver files check `'admins'` (lowercase). Align group name checks with the actual Cognito group name or authorization will fail silently.
- `listMyTasks` **resolver:** Verify the attached code queries by `ctx.identity.sub` (partition key), not a table `Scan` with an admin gate.
- **Token type:** AppSync Cognito auth expects the **ID token**, not the access token.


---

# aws-appsync-realtime-collaboration.md

---
title: "AppSync Real-Time Collaboration"
description: "Multi-user project tasks with Cognito auth, DynamoDB single-table design, pipeline resolvers with membership checks, and GraphQL subscriptions for live updates."
tags:
  - appsync
  - graphql
  - cognito
  - dynamodb
  - subscriptions
  - aws
  
date: 2026-08-23
---

## Overview

Extend the task manager into a **collaborative project workspace**. Multiple users belong to a project, share tasks, and receive **real-time updates** when another member creates or updates a task.

| Component | Role |
| --- | --- |
| Amazon Cognito User Pool | Authenticate users; identity via `ctx.identity.sub` |
| AWS AppSync | GraphQL API, pipeline resolvers, subscriptions |
| Amazon DynamoDB | Single-table store for projects, members, and tasks |

**End state:**

- Users authenticate with Cognito.
- Tasks belong to a **project**, not a single owner.
- Only project **members** can query or mutate project tasks.
- `createTask` and `updateTask` trigger subscriptions scoped by `projectId`.
- Subscribers receive live updates without polling.

---

## Target architecture

```text
                Cognito
                   │
                   ▼
User A ────────► AppSync ◄──────── User B
                   │  │
                   │  │ Subscription
                   │  └────────────────────► Real-time update
                   ▼
                DynamoDB
```

### Example project layout

```text
Project A
├── Alice    (member)
├── Bob      (member)
└── Charlie  (member)

Tasks
├── Task 1
├── Task 2
└── Task 3
```

### Mutation → subscription flow

```text
Alice
  │
  │ updateTask()
  ▼
AppSync
  │
  ├── DynamoDB update
  │
  └── onTaskUpdated(projectId)
          │
          ├── Bob receives update
          └── Charlie receives update
```

---

## DynamoDB single-table design

| Entity | PK | SK | Notes |
| --- | --- | --- | --- |
| Project | `PROJECT#<projectId>` | `METADATA` | Project record (optional) |
| Member | `PROJECT#<projectId>` | `MEMBER#<cognito-sub>` | Membership gate for auth |
| Task | `PROJECT#<projectId>` | `TASK#<taskId>` | Task items under a project |

Example keys:

```text
PK = PROJECT#project-001
SK = TASK#task-001
```

Task attributes stored on the item:

```text
projectId = project-001
id        = task-001
```

Entity types in this model:

- **Project**
- **Task**
- **Project membership**

---

## GraphQL schema

```graphql
type Project {
  id: ID!
  name: String!
  createdAt: AWSDateTime!
}

type Task {
  id: ID!
  projectId: ID!
  title: String!
  description: String
  status: TaskStatus!
  createdBy: String!
  createdAt: AWSDateTime!
  updatedAt: AWSDateTime!
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

input CreateTaskInput {
  projectId: ID!
  title: String!
  description: String
}

input UpdateTaskInput {
  projectId: ID!
  id: ID!
  title: String
  description: String
  status: TaskStatus
}

type Query {
  getProject(id: ID!): Project
  listProjectTasks(projectId: ID!): [Task!]!
}

type Mutation {
  createTask(input: CreateTaskInput!): Task!
    @aws_cognito_user_pools
  updateTask(input: UpdateTaskInput!): Task!
    @aws_cognito_user_pools
}

type Subscription {
  onTaskCreated(projectId: ID!): Task
    @aws_subscribe(mutations: ["createTask"])

  onTaskUpdated(projectId: ID!): Task
    @aws_subscribe(mutations: ["updateTask"])
}
```

`CreateTaskInput` has no `createdBy` field - `createdBy` is set from `ctx.identity.sub` in the resolver.

---

## Subscriptions

AppSync publishes subscription events when the linked mutation succeeds. Clients filter by `projectId`.

### Subscription definitions

```graphql
type Subscription {
  onTaskCreated(projectId: ID!): Task
    @aws_subscribe(mutations: ["createTask"])

  onTaskUpdated(projectId: ID!): Task
    @aws_subscribe(mutations: ["updateTask"])
}
```

### Client subscription example

```graphql
subscription {
  onTaskCreated(projectId: "project-001") {
    id
    projectId
    title
    status
    createdBy
  }
}
```

### End-to-end flow

```text
User B subscribes:

  onTaskUpdated(projectId: "project-001")
            │
            ▼
User A executes:

  updateTask(projectId: "project-001", ...)
            │
            ▼
Matching subscribers receive the update
```

When Alice creates a task:

```text
Alice creates task
       ↓
createTask mutation succeeds
       ↓
AppSync publishes subscription event
       ↓
Bob receives the new task
```

---

## Resolvers and pipeline functions

Every query and mutation runs a **membership check** before touching task data. Pipeline resolvers chain `checkMembership` first, then the operation function.

| Function | File | Purpose |
| --- | --- | --- |
| `checkMembership` | [`dir/appsync/pr3/checkMembership.js`](./dir/appsync/pr3/checkMembership.js) | `GetItem` on `MEMBER#<sub>`; reject if not a member |
| `createTask` | [`dir/appsync/pr3/createTask.js`](./dir/appsync/pr3/createTask.js) | `PutItem` with `TASK#<generated-id>` |
| `listProjectTasks` | [`dir/appsync/pr3/listProjectTasks.js`](./dir/appsync/pr3/listProjectTasks.js) | `Query` where `SK begins_with TASK#` |
| Pipeline passthrough | [`dir/appsync/pr3/resolver-code.js`](./dir/appsync/pr3/resolver-code.js) | Returns `ctx.prev.result` between pipeline stages |

### Membership check

`checkMembership` reads:

```text
PK = PROJECT#<projectId>
SK = MEMBER#<caller-sub>
```

If the item does not exist, the resolver returns a `MembershipError`.

### Pipeline resolver pattern

Every GraphQL resolver using a pipeline runs two functions in order:

```text
GraphQL Resolver
      │
      ▼
Function 1: Check Membership
      │
      ├── Not member → Unauthorized
      │
      └── Member
            │
            ▼
Function 2: Perform operation
```

### Cognito → pipeline → subscription

Mutations and queries go through the membership pipeline. Successful mutations fan out to subscribers on the same API:

```text
                 Cognito
                    │
                    ▼
                 AppSync
                    │
        ┌───────────┴────────────┐
        │                        │
        ▼                        ▼
Pipeline Resolver           Subscription
        │                        ▲
        ▼                        │
Check Membership              Mutation
        │                        │
        ▼                        │
DynamoDB Operation ────────────┘
```

### Create task flow

```text
checkMembership
   ↓
Alice's MEMBER item exists
   ↓
createTask function
   ↓
TASK#<generated-id> created
```

### List project tasks - pipeline resolver (Bob)

```text
Bob
 │
 ▼
listProjectTasks(projectId: "project-001")
 │
 ▼
Pipeline resolver
 │
 ├── 1. checkMembership
 │      │
 │      ├── GetItem:
 │      │   PK = PROJECT#project-001
 │      │   SK = MEMBER#<Bob-sub>
 │      │
 │      └── Item exists ✅
 │
 └── 2. listProjectTasks
        │
        └── DynamoDB Query:
            PK = PROJECT#project-001
            AND SK begins_with TASK#
                    │
                    ▼
               Task items (or empty)
                    │
                    ▼
            GraphQL returns [Task!]!
```

Attach pipeline functions in order: **checkMembership → operation function**.

---

## Authorization summary

| Caller | Requirement | Operations |
| --- | --- | --- |
| Cognito user | `MEMBER#<sub>` item exists for `projectId` | `listProjectTasks`, `createTask`, `updateTask` |
| Project member | Active subscription to `projectId` | `onTaskCreated`, `onTaskUpdated` |

Subscribers must be authenticated Cognito users. AppSync delivers events only to clients subscribed to the matching `projectId` argument.

---

## Notes

- **Single-table keys:** Resolver code uses `PROJECT#` / `TASK#` / `MEMBER#` prefixes - keep PK/SK patterns consistent across all functions.
- **`checkMembership` args:** Reads `projectId` from `ctx.args.projectId` or `ctx.args.input.projectId` so the same function works for queries and mutations.
- **Empty task list:** A valid member with no tasks yet returns an empty array, not an error.
- **Subscription auth:** Configure the API authorization mode (Cognito User Pools) on the subscription endpoint so only signed-in users can subscribe.

---

# aws-appsync-ticket-api-multi-auth.md

---
title: "AppSync Ticket API: Multi-Auth and EventBridge"
description: "Support ticket API with Cognito and IAM auth, Lambda-backed createTicket, DynamoDB pipeline for updateTicketStatus, and EventBridge event publishing."
tags:
  - appsync
  - graphql
  - cognito
  - iam
  - dynamodb
  - lambda
  - eventbridge
  - aws
  
date: 2026-08-24
---

## Overview

Build a **support ticket API** where frontend users authenticate with Cognito, a trusted backend uses IAM, ticket creation runs through Lambda for validation, and status changes publish events to EventBridge.

- **Cognito** - `createTicket`, `getTicket`, `updateTicket`
- **IAM (SigV4)** - `updateTicketStatus` (backend / AWS service caller)
- **Simple CRUD** → DynamoDB resolver
- **Validation / business rules** → Lambda resolver

```text
Frontend (Cognito JWT)  →  createTicket / getTicket / updateTicket
Backend (IAM SigV4)     →  updateTicketStatus
```

---

## DynamoDB

```bash
export TICKETS_TABLE=Tickets
```

| Key | Type |
| --- | --- |
| `ticketId` | PK (String) |

Operations: get by ID, create, update status.

---

## Multi-auth setup

| Mode | Caller | Operations |
| --- | --- | --- |
| **Default** - Cognito User Pools | Frontend user | `createTicket`, `getTicket`, `updateTicket` |
| **Additional** - AWS IAM | Trusted backend / AWS service | `updateTicketStatus` |

Annotate fields in the schema:

```graphql
createTicket(input: CreateTicketInput!): Ticket!
  @aws_cognito_user_pools

updateTicketStatus(input: UpdateTicketStatusInput!): Ticket!
  @aws_iam
```

### Enable IAM on the API

Console: **AppSync → your API → Settings → Authorization**

1. **Default authorization mode** - Amazon Cognito User Pool
2. **Additional authorization modes** - add **AWS IAM**

Or when creating the API, set `authenticationType: AMAZON_COGNITO_USER_POOLS` and add a second auth provider with `authenticationType: AWS_IAM`.

Only fields annotated with `@aws_iam` accept SigV4-signed requests. Cognito-only fields reject IAM callers and vice versa.

---

## Setup steps

### 1. Create the Lambda function

Deploy [`dir/appsync/pr4/lambda-TicketLambda.py`](./dir/appsync/pr4/lambda-TicketLambda.py) as `TicketLambda` (Python 3.12+).

Environment variable:

```bash
TICKETS_TABLE=Tickets
```

IAM policy on the Lambda execution role - allow `dynamodb:PutItem` on the `Tickets` table.

Grant AppSync permission to invoke the function:

```bash
aws lambda add-permission \
  --function-name TicketLambda \
  --statement-id appsync-invoke \
  --action lambda:InvokeFunction \
  --principal appsync.amazonaws.com \
  --source-arn "arn:aws:appsync:$AWS_REGION:$ACCOUNT_ID:apis/$TICKET_API_ID/*"
```

### 2. Create data sources

Console: **AppSync → Data sources → Create data source**

| Name | Type | Notes |
| --- | --- | --- |
| `TicketsDataSource` | DynamoDB | Table `Tickets`; use an IAM role AppSync can assume |
| `TicketLambdaDataSource` | Lambda | Function `TicketLambda` |
| `EventBridgeDataSource` | Amazon EventBridge | Event bus (default or custom) |

AppSync creates a service role per data source (or reuse one role with combined policies). The EventBridge role needs `events:PutEvents` on the target bus.

### 3. Create AppSync functions (pipeline building blocks)

Console: **AppSync → Functions → Create function**

Create one function per pipeline stage. Runtime **APPSYNC_JS**, each bound to the correct data source:

| Function name | Data source | Code file |
| --- | --- | --- |
| `UpdateTicketStatusFn` | `TicketsDataSource` | [`updateTicketStatus.js`](./dir/appsync/pr4/updateTicketStatus.js) |
| `GetUpdatedTicketFn` | `TicketsDataSource` | [`getTicketUpdatedTicket.js`](./dir/appsync/pr4/getTicketUpdatedTicket.js) |
| `PublishTicketStatusChangedFn` | `EventBridgeDataSource` | [`publishTicketStatusChanged.js`](./dir/appsync/pr4/publishTicketStatusChanged.js) |

Functions are reusable resolver steps - they do not map to a GraphQL field until attached in a pipeline.

### 4. Attach `createTicket` resolver (Lambda, Cognito)

Console: **Schema → Mutation → `createTicket` → Attach**

| Setting | Value |
| --- | --- |
| Resolver type | Unit |
| Data source | `TicketLambdaDataSource` |
| Runtime | APPSYNC_JS |
| Code | [`createTicket.js`](./dir/appsync/pr4/createTicket.js) |

This resolver passes `ctx.args.input` and `ctx.identity.sub` to Lambda. Only Cognito callers can invoke it (`@aws_cognito_user_pools` on the schema field).

### 5. Attach `updateTicketStatus` pipeline resolver (IAM)

Console: **Schema → Mutation → `updateTicketStatus` → Attach**

| Setting | Value |
| --- | --- |
| Resolver type | Pipeline |
| Before mapping | [`updateTicketPipeline.js`](./dir/appsync/pr4/updateTicketPipeline.js) (request passthrough) |
| After mapping | [`updateTicketPipeline.js`](./dir/appsync/pr4/updateTicketPipeline.js) (returns `ctx.stash.ticket`) |
| Functions (in order) | `UpdateTicketStatusFn` → `GetUpdatedTicketFn` → `PublishTicketStatusChangedFn` |

Pipeline execution:

```text
IAM caller → AppSync → Pipeline
  1. updateTicketStatus      UpdateItem (status, updatedAt)
  2. getTicketUpdatedTicket  GetItem → ctx.stash.ticket
  3. publishTicketStatusChanged  PutEvents → TicketStatusChanged
  → return ctx.stash.ticket
```

Only IAM-signed callers can invoke this mutation (`@aws_iam` on the schema field).

### 6. Call `updateTicketStatus` from a backend (SigV4)

Use AWS SDK credentials (instance role, access keys, or assumed role) to sign the GraphQL request against the AppSync HTTP endpoint with **AWS Signature Version 4** - not a Cognito JWT.

```bash
# Example: IAM-authenticated mutation via awscurl or SDK
# POST $APPSYNC_URL with SigV4 signing region = API region
```

The caller's IAM policy must allow `appsync:GraphQL` on the API ARN.

---

## `createTicket` - Lambda resolver

[`dir/appsync/pr4/createTicket.js`](./dir/appsync/pr4/createTicket.js) invokes Lambda with `input` and `ctx.identity.sub`.

[`dir/appsync/pr4/lambda-TicketLambda.py`](./dir/appsync/pr4/lambda-TicketLambda.py) handles:

- Title required, max 200 chars
- `priority = HIGH` if title contains `"urgent"`, else `NORMAL`
- Writes ticket with `status: OPEN`, `owner` from Cognito `sub`

```python
ticket = {
    "ticketId": str(uuid.uuid4()),
    "title": title,
    "status": "OPEN",
    "owner": identity["sub"],
    "priority": priority,  # HIGH | NORMAL
    ...
}
table.put_item(Item=ticket)
```

---

## `updateTicketStatus` - pipeline reference

| Step | File | What it does |
| --- | --- | --- |
| 1 | [`updateTicketStatus.js`](./dir/appsync/pr4/updateTicketStatus.js) | `UpdateItem` on `ticketId`; stashes `ticketId`, `status`, `updatedAt`; `ConditionalCheckFailed` → `NotFoundError` |
| 2 | [`getTicketUpdatedTicket.js`](./dir/appsync/pr4/getTicketUpdatedTicket.js) | `GetItem` using stashed `ticketId`; stores full item in `ctx.stash.ticket` |
| 3 | [`publishTicketStatusChanged.js`](./dir/appsync/pr4/publishTicketStatusChanged.js) | `PutEvents` with `source: ticket.api`, `detailType: TicketStatusChanged` |
| Final | [`updateTicketPipeline.js`](./dir/appsync/pr4/updateTicketPipeline.js) | Returns `ctx.stash.ticket` |

EventBridge `detail` payload:

```json
{
  "ticketId": "...",
  "status": "...",
  "owner": "...",
  "priority": "...",
  "updatedAt": "..."
}
```

Downstream rules (notifications, analytics, workflows) subscribe to the `TicketStatusChanged` event on the bus.

---

## Test IAM auth

[`dir/appsync/pr4/test_iam.py`](./dir/appsync/pr4/test_iam.py) signs and POSTs the `updateTicketStatus` mutation to AppSync using **SigV4** IAM credentials (not a Cognito JWT).
Run it after setting `TICKET_API_URL`, `TICKET_ID`, and `AWS_REGION` to verify the IAM-only pipeline returns the updated ticket.

Links to `./dir/...` and `./images/...` open in a **preview modal** (syntax-highlighted code or image). Links to other `.md` posts navigate normally.

```bash
export TICKET_API_URL=https://<api-id>.appsync-api.<region>.amazonaws.com/graphql
export TICKET_ID=<existing-ticket-id>
export AWS_REGION=us-east-1

python src/content/dir/appsync/pr4/test_iam.py
```

## Inspect the pipeline resolver

```bash
aws appsync get-resolver \
  --api-id $TICKET_API_ID \
  --type-name Mutation \
  --field-name updateTicketStatus \
  --region $AWS_REGION \
  --query 'resolver.{Kind:kind,Pipeline:pipelineConfig.functions,Code:code}'
```

---

## Notes

- AppSync needs an **EventBridge data source** and IAM permission for `events:PutEvents` on the pipeline function.
- `updateTicketStatus` is IAM-only - frontend users cannot call it even with a valid Cognito token.
- Step 2 exists because `UpdateItem` returns only updated attributes; EventBridge needs the full ticket (owner, priority, etc.).

---

# aws-architecture-reference-links.md

---
title: "AWS Architecture Reference Links"
description: "Curated Well-Architected, prescriptive guidance, workshops, and hands-on lab templates for EKS, networking, and data."
tags:
  - aws
  - architecture
  - well-architected
  - reference
  - workshops
  - eks
---
## Purpose

Curated source list for AWS architecture, operational best practices, and diagrams.

## Core references

- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)
- [AWS Prescriptive Guidance - Cloud Design Patterns](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/welcome.html)
- [AWS Architecture Icons](https://aws.amazon.com/architecture/icons/)
- [AWS Reference Architecture Diagrams](https://aws.amazon.com/architecture/reference-architecture-diagrams/)

## Service references

- [Amazon EKS User Guide](https://docs.aws.amazon.com/eks/latest/userguide/)
- [AWS Network Firewall Developer Guide](https://docs.aws.amazon.com/network-firewall/latest/developerguide/)
- [Amazon VPC Lattice User Guide](https://docs.aws.amazon.com/vpc-lattice/latest/ug/)

## Workshops

Workshop reference for decoupled microservices and catalog service patterns.

- [AWS Workshop Studio - microservices catalog](https://catalog.us-east-1.prod.workshops.aws/workshops/e8738cf6-6eb0-4d1d-9e98-ae240d229535/en-US)

**Related guides:** EKS, VPC Lattice, Application Auto Scaling, and RDS patterns covered in this site.

## Lab template

Reusable template for AWS CloudOps practice: build, break, diagnose, document, and tear down.

- Architecture sketch or AWS icon diagram
- Provisioning path: Terraform, CloudFormation, SAM, eksctl, or console steps
- Day-1 setup checklist
- Day-2 operations checklist
- Failure drill and expected symptoms
- Security review: IAM, logging, encryption, network exposure
- Cost controls and teardown checklist

### Suggested labs

- Private EC2 with SSM endpoints and no inbound SSH/RDP
- RDS connectivity drill with security-group failure and recovery
- Redshift COPY from S3 with SSE-KMS permission failure
- EKS workload using Pod Identity
- Network Firewall centralized inspection with Transit Gateway

## Cross-links

- [Kubernetes on AWS](/eks-cluster-operations-runbook)
- [Networking on AWS](/aws-networking-overview)
- [Data on AWS](/aws-data-rds-redshift-athena)

## WAF reference

- [WAF rate-based rules](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based-request-aggregation.html)
---

# aws-batch-fargate-quickstart.md

---
title: "AWS Batch on Fargate: Quick Start Guide"
description: "Step-by-step setup for AWS Batch with Fargate-IAM, security groups, ECR job image, compute environment, queue, submit job, pitfalls."
tags:
  - aws
  - batch
  - fargate
  - ecs
  - ecr
  - iam
  - vpc
resources:
  - title: Getting started with Batch and Fargate (AWS CLI)
    url: https://docs.aws.amazon.com/batch/latest/userguide/getting-started-with-fargate-using-the-aws-cli.html
  - title: Batch execution IAM role
    url: https://docs.aws.amazon.com/batch/latest/userguide/execution-IAM-role.html
  - title: Batch job IAM role
    url: https://docs.aws.amazon.com/batch/latest/userguide/job-IAM-role.html
  - title: Service-linked role for Batch
    url: https://docs.aws.amazon.com/batch/latest/userguide/using-service-linked-roles.html
---

Quick path to run **AWS Batch** on **Fargate**: one container job that reads invoice JSON from S3 and writes a summary back. Same flow works for ETL, rendering, or any batch workload.

## What you build

```mermaid
flowchart LR
  subgraph submit
    CLI[AWS CLI submit-job]
  end
  Q[Job queue]
  CE[Fargate compute environment]
  TASK[Batch task]
  S3[(S3 bucket)]
  CW[CloudWatch Logs]

  CLI --> Q --> CE --> TASK
  TASK --> S3
  TASK --> CW
```

| Component | Purpose |
| --- | --- |
| Compute environment | Fargate capacity (subnets + security groups) |
| Job queue | Holds jobs until scheduler places them |
| Job definition | Image, CPU/memory, env, IAM roles, networking |
| Job | One run of the definition |

Reference code: [`dir/aws-batch/`](./dir/aws-batch/) (`job.py`, `Dockerfile`, [`job-definition.json`](./dir/aws-batch/job-definition.json), [`sample-input.json`](./dir/aws-batch/sample-input.json)).

## Prerequisites

- AWS CLI configured (`aws sts get-caller-identity`)
- Docker (to build the job image)
- A VPC with **at least one subnet** (two AZs recommended for production)
- First-time Batch in the account: AWS creates **`AWSServiceRoleForBatch`** when you use the console or `create-compute-environment`; if creation fails, see [service-linked roles](https://docs.aws.amazon.com/batch/latest/userguide/using-service-linked-roles.html)

Set shell variables used below:

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export PROJECT=batch-invoice-demo
```

## Example: invoice summarizer

The container ([`job.py`](./dir/aws-batch/job.py)) expects:

| Env var | Example |
| --- | --- |
| `INPUT_BUCKET` | `my-batch-demo-bucket` |
| `INPUT_KEY` | `input/invoices.json` |
| `OUTPUT_KEY` | `output/summary.json` |

Upload sample input:

```bash
aws s3 mb s3://my-batch-demo-bucket --region "$AWS_REGION"
aws s3 cp src/content/dir/aws-batch/sample-input.json \
  s3://my-batch-demo-bucket/input/invoices.json
```

## Step 1 - Security group

Fargate tasks get ENIs in your subnets. The group must allow **outbound** traffic your task needs.

**Tutorial / public subnet shortcut** (pull from ECR/Docker Hub over the internet):

| Direction | Rule |
| --- | --- |
| Outbound | All traffic → `0.0.0.0/0` (or tighten to HTTPS `443` only if you use VPC endpoints for ECR and logs) |
| Inbound | None required for this job (no listeners) |

```bash
export VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

export BATCH_SG_ID=$(aws ec2 create-security-group \
  --group-name "${PROJECT}-sg" \
  --description "AWS Batch Fargate tasks" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)

# Default SG often has no egress in some accounts; ensure outbound HTTPS at minimum.
aws ec2 authorize-security-group-egress \
  --group-id "$BATCH_SG_ID" \
  --protocol -1 \
  --cidr 0.0.0.0/0 2>/dev/null || true
```

Pick subnets in that VPC (use **public** subnets if you set `assignPublicIp: ENABLED`):

```bash
export SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[0:2].SubnetId' --output text | tr '\t' ',')
```

> **Production:** Prefer **private subnets**, `assignPublicIp: DISABLED`, NAT gateway or [VPC endpoints](https://docs.aws.amazon.com/AmazonECR/latest/userguide/vpc-endpoints.html) for ECR, S3, and CloudWatch Logs. Public IP on tasks is fine for learning only.

## Step 2 - IAM roles

### Execution role (required for Fargate)

Trust **ECS tasks**; attach **`AmazonECSTaskExecutionRolePolicy`** (image pull + `awslogs`).

```bash
cat > /tmp/batch-exec-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name BatchEcsTaskExecutionRole \
  --assume-role-policy-document file:///tmp/batch-exec-trust.json

aws iam attach-role-policy \
  --role-name BatchEcsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
```

### Job role (task role - S3 access)

Trust **ECS tasks**; inline policy for the demo bucket only.

```bash
cat > /tmp/batch-job-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ecs-tasks.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name BatchInvoiceJobRole \
  --assume-role-policy-document file:///tmp/batch-job-trust.json

cat > /tmp/batch-job-s3.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:GetObject", "s3:PutObject"],
    "Resource": "arn:aws:s3:::my-batch-demo-bucket/*"
  }]
}
EOF

aws iam put-role-policy \
  --role-name BatchInvoiceJobRole \
  --policy-name S3InvoiceAccess \
  --policy-document file:///tmp/batch-job-s3.json
```

Your user/role still needs Batch API permissions (e.g. `AWSBatchFullAccess` for the lab, or a tighter custom policy).

## Step 3 - Build image and push to ECR

```bash
export ECR_REPO=invoice-summarizer

aws ecr create-repository --repository-name "$ECR_REPO" --region "$AWS_REGION" 2>/dev/null || true

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t "$ECR_REPO" src/content/dir/aws-batch
docker tag "$ECR_REPO:latest" \
  "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
docker push "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"
```

## Step 4 - Compute environment

Managed Fargate environment (aligned with [AWS CLI tutorial](https://docs.aws.amazon.com/batch/latest/userguide/getting-started-with-fargate-using-the-aws-cli.html)):

1.  Go to **AWS Batch > Compute environments > Create**.
2.  Name: `${PROJECT}-fargate`.
3.  Provisioning model: **Fargate**.
4.  Network configuration: Select your VPC, the subnets you noted earlier, and the Security Group created in Step 1.
5.  Click **Create**. Wait for the status to turn **VALID**.

<details>
<summary>Create Compute Environment</summary>
```bash
aws batch create-compute-environment \
  --compute-environment-name "${PROJECT}-fargate" \
  --type MANAGED \
  --state ENABLED \
  --compute-resources "type=FARGATE,maxvCpus=4,subnets=${SUBNET_IDS},securityGroupIds=${BATCH_SG_ID}"

aws batch describe-compute-environments \
  --compute-environments "${PROJECT}-fargate" \
  --query 'computeEnvironments[0].status' \
  --output text
```
</details>

Wait until status is **`VALID`** (not `CREATING` or `INVALID`).

## Step 5 - Job queue

1.  Go to **AWS Batch > Job queues > Create**.
2.  Name: `${PROJECT}-queue`.
3.  Priority: `10`.
4.  Connected compute environments: Select the `${PROJECT}-fargate` environment created in Step 4.
5.  Click **Create**.

<details>
<summary>Create Job Queue</summary>

```bash
aws batch create-job-queue \
  --job-queue-name "${PROJECT}-queue" \
  --state ENABLED \
  --priority 10 \
  --compute-environment-order "order=1,computeEnvironment=${PROJECT}-fargate"
```
</details>

All compute environments on one queue must share the same provisioning model (do not mix Fargate and EC2 on the same queue).

## Step 6 - Job definition

Register from the template ([`job-definition.json`](./dir/aws-batch/job-definition.json)) after substituting account, region, and image:


1.  Go to **AWS Batch > Job definitions > Create**.
2.  Name: `invoice-summarizer`.
3.  Platform compatibility: **Fargate**.
4.  Container details:
    *   **Image:** Paste your ECR URI from Step 3.
    *   **Execution role:** Select `BatchEcsTaskExecutionRole`.
    *   **Job role:** Select `BatchInvoiceJobRole`.
    *   **Resource requirements:** vCPU `0.25`, Memory `512 MB`.
    *   **Environment variables:** Add `INPUT_BUCKET`, `INPUT_KEY`, and `OUTPUT_KEY` with their respective values.
    *   **Network configuration:** Check **Assign public IP**.
    *   **Log configuration:** Driver `awslogs`, Options: `awslogs-group: /aws/batch/job`, `awslogs-region: us-east-1`.
5.  Click **Create**.


<details>
<summary>Register Job Definition</summary>

```bash
export IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest"

aws batch register-job-definition \
  --job-definition-name invoice-summarizer \
  --type container \
  --platform-capabilities FARGATE \
  --container-properties "{
    \"image\": \"$IMAGE\",
    \"resourceRequirements\": [
      {\"type\": \"VCPU\", \"value\": \"0.25\"},
      {\"type\": \"MEMORY\", \"value\": \"512\"}
    ],
    \"executionRoleArn\": \"arn:aws:iam::${AWS_ACCOUNT_ID}:role/BatchEcsTaskExecutionRole\",
    \"jobRoleArn\": \"arn:aws:iam::${AWS_ACCOUNT_ID}:role/BatchInvoiceJobRole\",
    \"environment\": [
      {\"name\": \"INPUT_BUCKET\", \"value\": \"my-batch-demo-bucket\"},
      {\"name\": \"INPUT_KEY\", \"value\": \"input/invoices.json\"},
      {\"name\": \"OUTPUT_KEY\", \"value\": \"output/summary.json\"}
    ],
    \"networkConfiguration\": {\"assignPublicIp\": \"ENABLED\"},
    \"logConfiguration\": {
      \"logDriver\": \"awslogs\",
      \"options\": {
        \"awslogs-group\": \"/aws/batch/job\",
        \"awslogs-region\": \"$AWS_REGION\",
        \"awslogs-stream-prefix\": \"invoice-summarizer\"
      }
    }
  }"
```
</details>

Fargate minimums: **0.25 vCPU** and **512 MiB** memory. Use valid [CPU/memory pairs](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-cpu-memory-error.html).

## Step 7 - Submit and monitor

1.  Go to **AWS Batch > Jobs > Submit job**.
2.  Job name: `invoice-run-1`.
3.  Job queue: Select `${PROJECT}-queue`.
4.  Job definition: Select `invoice-summarizer`.
5.  Click **Submit**.
6.  Refresh the **Jobs** list to see the status change from `SUBMITTED` → `RUNNING` → `SUCCEEDED`.

<details>
<summary>Submit Job</summary>

```bash
export JOB_ID=$(aws batch submit-job \
  --job-name invoice-run-1 \
  --job-queue "${PROJECT}-queue" \
  --job-definition invoice-summarizer \
  --query jobId --output text)

echo "Job ID: $JOB_ID"

# Check status
aws batch describe-jobs --jobs "$JOB_ID" \
  --query 'jobs[0].status' --output text
```
</details>

Typical states: `SUBMITTED` → `PENDING` → `RUNNABLE` → `STARTING` → `RUNNING` → `SUCCEEDED` | `FAILED`.

On failure:

```bash
aws batch describe-jobs --jobs "$JOB_ID" \
  --query 'jobs[0].{status:status,reason:statusReason,container:container}'
```

## Step 8 - Verify output

1.  Go to **S3** and open `my-batch-demo-bucket/output/summary.json` to see the result.
2.  Go to **CloudWatch > Log groups > /aws/batch/job**. Click the latest stream to view stdout/stderr from your container.

<details>
<summary>Check Results</summary>

```bash
# Check S3 output
aws s3 cp s3://my-batch-demo-bucket/output/summary.json -

# Check Logs
LOG_STREAM=$(aws batch describe-jobs --jobs "$JOB_ID" \
  --query 'jobs[0].attempts[0].container.logStreamName' --output text)

aws logs get-log-events \
  --log-group-name /aws/batch/job \
  --log-stream-name "$LOG_STREAM"
```
</details>

Log group `/aws/batch/job` is created when the first job emits logs.

## Cleanup (order matters)

<details>
<summary>Delete Resources</summary>

```bash
# 1. Disable and Delete Queue
aws batch update-job-queue --job-queue "${PROJECT}-queue" --state DISABLED
aws batch delete-job-queue --job-queue "${PROJECT}-queue"

# 2. Disable and Delete Compute Environment
aws batch update-compute-environment --compute-environment "${PROJECT}-fargate" --state DISABLED
aws batch delete-compute-environment --compute-environment "${PROJECT}-fargate"

# 3. Delete IAM Roles
aws iam delete-role-policy --role-name BatchInvoiceJobRole --policy-name S3InvoiceAccess
aws iam delete-role --role-name BatchInvoiceJobRole
aws iam detach-role-policy --role-name BatchEcsTaskExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role --role-name BatchEcsTaskExecutionRole

# 4. Delete S3 Bucket
aws s3 rb s3://my-batch-demo-bucket --force

# 5. Delete Security Group
aws ec2 delete-security-group --group-id "$BATCH_SG_ID"
```
</details>


Deregister job definitions separately if you want them gone (`aws batch deregister-job-definition`).

## Common pitfalls

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Job stuck **`RUNNABLE`** | Compute env not `VALID`, or no Fargate capacity / wrong subnets | `describe-compute-environments`; fix SG/subnets; check `maxvCpus` |
| **`CannotPullContainerError`** | No route to ECR (private subnet, no NAT/endpoints, public IP off) | NAT + endpoints, or public subnet + `assignPublicIp: ENABLED` |
| **`ResourceInitializationError`** (logs) | Missing or wrong **execution role** | `executionRoleArn` + `AmazonECSTaskExecutionRolePolicy` |
| S3 **AccessDenied** in task | Missing **job role** or wrong bucket ARN | `jobRoleArn` + least-privilege S3 policy |
| Compute env **`INVALID`** | Subnet not in VPC, bad SG, or missing Batch service-linked role | Fix networking; confirm `AWSServiceRoleForBatch` |
| Job **`FAILED`** immediately | Bad image URI, wrong platform | `platformCapabilities: FARGATE` must match Fargate CE |
| Queue blocked (Windows) | Windows job on Linux-only Fargate env | Match OS; Fargate Spot does not support Windows |
| Overrides ignored | vCPU/memory only in deprecated fields | Use `resourceRequirements` in definition and `containerOverrides.resourceRequirements` on submit |
| Long-running Fargate job killed | [14-day Fargate limit](https://docs.aws.amazon.com/batch/latest/userguide/job_retries.html) | Split work or use EC2 compute environment |

## EC2 vs Fargate (when to switch)

| | Fargate | EC2 compute environment |
| --- | --- | --- |
| Ops | No instances to manage | You manage AMI, scaling, ECS agent |
| Best for | Short jobs, quick start, variable sizes | GPU, very large memory, long runtimes, Spot fleets |
| Networking | Per-task ENI in your subnets | Instance ENI + host mode considerations |

Official walkthrough (busybox, no ECR): [Getting started with AWS Batch and Fargate using the AWS CLI](https://docs.aws.amazon.com/batch/latest/userguide/getting-started-with-fargate-using-the-aws-cli.html).

---

# aws-checklist-appconfig-s3.md

---
title: "AWS Checklist: AppConfig Schema and S3 Bucket Hygiene"
description: "Short checklist: AppConfig JSON schema, S3 lifecycle / CRR / versioning / tags."
tags:
  - aws
  - appconfig
  - s3
  - notes
date: 2026-09-06
---

## APP CONFIG

- JSON Validator and Schema
- Version Control
```json
{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "properties": {
        "PORT": {
        "type": "integer",
        "minimum": 1,
        "maximum": 65535
        },
        "LOG_LEVEL": {
        "type": "string",
        "enum": ["DEBUG", "INFO", "WARN", "ERROR"]
        },
        "ENABLED": {
        "type": "boolean"
        }
    },
    "required": ["PORT", "LOG_LEVEL", "ENABLED"],
    "additionalProperties": false
}
```

---


## S3 Bucket

- Lifecycle Policy (IA or Archive)
- Cross-Region Replication
- Bucket Version
- Tags

---
---

# aws-cicd-codepipeline-codebuild-codedeploy.md

---
title: "AWS CI/CD: CodePipeline, CodeBuild, and CodeDeploy"
description: Quick-reference patterns for CodePipeline, CodeBuild, and CodeDeploy setups.
tags:
  - codepipeline
  - codebuild
  - codedeploy
  - lambda
  - sam
  - ecs
  - ec2
  - s3
  - cloudfront
  - cicd
---

# AWS CI/CD Notes - CodePipeline, CodeBuild & CodeDeploy

Quick-reference patterns for common CodePipeline setups. Each example lists the stages, what each service does, and the minimum IAM/buildspec pieces.

---

## Core pattern

```text
Source → Build (CodeBuild) → [Manual approval] → Deploy (CodeDeploy) → [SNS notification]
```

| Service | Role |
|---|---|
| **CodePipeline** | Orchestrates stages and artifacts between steps |
| **CodeBuild** | Runs buildspec (compile, test, package, push) |
| **CodeDeploy** | Rolling/blue-green deploy to EC2, ECS, Lambda, on-prem |
| **Manual approval** | Human gate before production deploy |
| **SNS** | Email/Slack on pipeline state change |

**Typical pipeline stages:**

1. **Source** - CodeCommit, GitHub, or S3 zip
2. **Build** - CodeBuild project (buildspec.yml)
3. **Approval** - Manual approval action (optional)
4. **Deploy** - CodeDeploy application + deployment group
5. **Notification** - EventBridge rule → SNS on `FAILED` / `SUCCEEDED`

**SNS notification (EventBridge):**

```bash
aws events put-rule \
  --name codepipeline-state-change \
  --event-pattern '{"source":["aws.codepipeline"],"detail-type":["CodePipeline Pipeline Execution State Change"]}'

aws sns create-topic --name pipeline-notifications
# Subscribe email, then add SNS as EventBridge target
```

---

## appspec.yaml

CodeDeploy reads `appspec.yaml` (or `appspec.yml`) from the **root of the deployment artifact**. It defines what to deploy, where it goes, and which lifecycle hooks to run.

```text
CodeBuild artifact/
├── appspec.yaml      ← required at root
├── app files...
└── scripts/          ← hook scripts referenced below
```

**Deployment lifecycle (EC2):**

```text
BeforeInstall → Install (copy files) → AfterInstall
  → ApplicationStop → Start → ApplicationStart → ValidateService
```

### EC2 / on-premises

```yaml
# appspec.yaml
version: 0.0
os: linux
files:
  - source: /
    destination: /var/www/my-app
    file_exists_behavior: OVERWRITE
hooks:
  BeforeInstall:
    - location: scripts/before_install.sh
      timeout: 300
      runas: root
  ApplicationStop:
    - location: scripts/stop.sh
      timeout: 60
      runas: root
  ApplicationStart:
    - location: scripts/start.sh
      timeout: 60
      runas: root
  ValidateService:
    - location: scripts/validate.sh
      timeout: 120
      runas: root
```

Example hook script (`scripts/start.sh`):

```bash
#!/bin/bash
systemctl restart my-app
```

Include `appspec.yaml` and scripts in the CodeBuild artifact:

```yaml
# buildspec.yml
artifacts:
  files:
    - appspec.yaml
    - scripts/**/*
    - dist/**/*
```

### ECS (blue/green with ALB)

```yaml
# appspec.yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: <TASK_DEFINITION_ARN>
        LoadBalancerInfo:
          ContainerName: my-app
          ContainerPort: 8080
        PlatformVersion: LATEST
```

CodeBuild outputs `imagedefinitions.json`; CodeDeploy uses `appspec.yaml` alongside it to shift ALB traffic to the new task set.

### Lambda (alias traffic shifting)

```yaml
# appspec.yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: my-function
        Alias: live
        CurrentVersion: 1    # populated by CodeDeploy during deployment
        TargetVersion: 2
```

Used with SAM/CodeDeploy for blue/green Lambda deploys - traffic shifts from `live` alias current version to target version, with optional pre/post traffic hooks.

---

## 1. Lambda with SAM

```text
Source (CodeCommit/GitHub) → Build (sam build + sam package) → Deploy (CloudFormation / CodeDeploy for Lambda)
```

**With CodeBuild + CodeDeploy (full pipeline):**

```yaml
# buildspec.yml
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
    commands:
      - pip install aws-sam-cli
  build:
    commands:
      - sam build
      - sam package --s3-bucket <artifact-bucket> --output-template-file packaged.yaml
artifacts:
  files:
    - packaged.yaml
```

- **CodeDeploy** uses `appspec.yaml` for Lambda alias traffic shifting (blue/green). See [appspec.yaml](#appspecyaml).
- Deployment group type: **Lambda**.

**Without CodeDeploy - CloudFormation deploy stage:**

```yaml
# buildspec.yml (post_build)
post_build:
  commands:
    - sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
        --stack-name my-lambda-stack \
        --s3-bucket <artifact-bucket> \
        --capabilities CAPABILITY_IAM
```

CodePipeline deploy stage uses **CloudFormation** action instead of CodeDeploy. Simpler for small functions.

**Without CodeBuild - SAM CLI locally or in CodePipeline source only:**

```bash
sam build && sam deploy --guided
```

Fine for dev. No pipeline; no audit trail of builds.

**Minimal combo notes:**

| Skip | What you lose |
|---|---|
| CodePipeline | No orchestration, manual triggers |
| CodeBuild | No managed build environment; run SAM locally |
| CodeDeploy | No blue/green alias shifting; use `sam deploy` (direct CFN update) |

---

## 2. Static site - S3 zip → S3 dest → CloudFront invalidation

```text
Source (S3 zip) → Build (unzip + sync) → Deploy (S3 destination) → Invalidate CloudFront
```

Source bucket holds a zip with a `src/` folder of static assets.

```yaml
# buildspec.yml
version: 0.2
phases:
  install:
    commands:
      - yum install -y unzip
  build:
    commands:
      - unzip source.zip -d output/
      - aws s3 sync output/src/ s3://<destination-bucket>/ --delete
  post_build:
    commands:
      - aws cloudfront create-invalidation \
          --distribution-id <distribution-id> \
          --paths "/*"
```

**Pipeline stages:**

1. **Source** - S3 bucket `source-bucket`, object key `source.zip` (or trigger on upload)
2. **Build** - CodeBuild syncs extracted `src/` to `destination-bucket`
3. **No CodeDeploy** - S3 is the deploy target; buildspec handles it

**CodeBuild role needs:**

- `s3:GetObject` on source bucket
- `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` on destination bucket
- `cloudfront:CreateInvalidation` on the distribution

**Variant - no CodeBuild:** Lambda triggered by S3 `ObjectCreated` on the zip, extracts and syncs. Good for small sites; CodeBuild better for larger builds and logs.

---

## 3. Deploy to ECS

```text
Source → Build (docker build + push ECR) → Deploy (CodeDeploy to ECS)
```

```yaml
# buildspec.yml
version: 0.2
phases:
  pre_build:
    commands:
      - REPO_URI=<ecr-repo>
      - aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
      - IMAGE_TAG=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c1-8)
  build:
    commands:
      - docker build -t <ecr-repo>:$IMAGE_TAG .
      - docker push <ecr-repo>:$IMAGE_TAG
  post_build:
    commands:
      - printf '[{"name":"<container name ecs taskdef>","imageUri":"%s"}]' $REPO_URI:$IMAGE_TAG > imagedefinitions.json
artifacts:
  files:
    - imagedefinitions.json
```

**CodeDeploy for ECS:**

- Create ECS application (compute platform: **ECS**)
- Deployment group references cluster + service + ALB listener (blue/green) or rolling update
- Pipeline deploy stage: **Amazon ECS (CodeDeploy-to-ECS)** action, input artifact = `imagedefinitions.json` + `appspec.yaml`

**Without CodeDeploy:** use **ECS deploy** action in CodePipeline (direct service update). Faster setup; no blue/green traffic shifting.

---

## 4. Deploy to EC2

```text
Source → Build (package artifact) → Deploy (CodeDeploy agent on EC2)
```

**Requires on each EC2 instance:**

- CodeDeploy agent installed and running
- Instance tagged to match the deployment group

```yaml
# buildspec.yml
version: 0.2
phases:
  build:
    commands:
      - npm ci && npm run build
artifacts:
  files:
    - appspec.yaml
    - scripts/**/*
    - '**/*'
  base-directory: dist
```

See [appspec.yaml](#appspecyaml) for the full EC2 example with lifecycle hooks.

**CodeDeploy setup:**

1. Create application (compute platform: **EC2 / on-premises**)
2. Create deployment group - tag filter e.g. `Environment=prod`
3. Pipeline deploy stage: **CodeDeploy** action

**Without CodeBuild:** push a pre-built zip to S3 as source; CodeDeploy deploys it directly (no compile step).

**Without CodeDeploy:** use SSM Run Command or user-data script in buildspec to `scp`/`rsync` to EC2. Loses rollback hooks and deployment history.

---

## Quick comparison

| Target | Build | Deploy mechanism | Blue/green |
|---|---|---|---|
| Lambda (SAM) | CodeBuild + `sam build` | CodeDeploy or CloudFormation | CodeDeploy alias shifting |
| Static site | CodeBuild unzip + `s3 sync` | S3 (in buildspec) | N/A |
| ECS | CodeBuild + Docker → ECR | CodeDeploy-to-ECS | Yes (with ALB) |
| EC2 | CodeBuild package | CodeDeploy agent | Rolling (in-place) |

---

# aws-cli-snippets.md

---
title: "AWS and Kubernetes CLI Snippets"
description: "Quick-reference kubectl, eksctl, ECR, FSx, EBS, and VPC Flow Logs commands for EKS day-2 operations."
tags:
  - cli
  - kubectl
  - eksctl
  - eks
  - ecr
  - snippets
  - aws
---
## Purpose

Short command snippets only. Move long scripts or project-specific samples into dedicated pages.

## kubectl triage

```bash
kubectl get nodes -o wide
kubectl get pods -A
kubectl get svc -A
kubectl describe pod <pod>
kubectl logs deployment/<deployment> -f
kubectl get events -A --sort-by=.lastTimestamp
```

## EKS context

```bash
aws eks update-kubeconfig --region <region> --name <cluster>
kubectl config current-context
aws sts get-caller-identity
```

## eksctl cluster

```bash
eksctl create cluster \
  --name <cluster> \
  --region <region> \
  --nodegroup-name <nodegroup> \
  --node-type t3.medium \
  --nodes 2
```

## ECR login

```bash
aws ecr get-login-password --region <region> | \
  docker login --username AWS --password-stdin \
  <account-id>.dkr.ecr.<region>.amazonaws.com
```

## Cross-links

- [Kubernetes on AWS](/eks-cluster-operations-runbook) - EKS operations runbook
- [ShopSphere on Amazon EKS](/eks-shopsphere-walkthrough/) - full walkthrough with Pod Identity
- [AWS AI/ML (1) Text and chatbots](/aws-ai-ml-text-and-chatbots/) - Comprehend, Translate, Lex
- [AWS AI/ML (2) Speech and documents](/aws-ai-ml-speech-vision-documents/) - Polly, Transcribe, Rekognition, Textract
- [AWS AI/ML (3) Search and recommendations](/aws-ai-ml-search-and-recommendations/) - Kendra, Personalize

## FSx and EBS setup

### Mount FSx ONTAP

> **Note:** Allow inbound NFS port 2049 from the EC2 security group on the FSx security group.

```bash
mkdir -p /mnt/fsx
sudo mount -t nfs -o nfsvers=4.1 <fsx-dns-name>:/vol1 /mnt/fsx
```

### Mount EBS

```bash
## Attach volume on device, e.g. /dev/sdf
lsblk

sudo mkfs.ext4 /dev/nvme1n1
sudo mkdir -p /mnt/ebs && sudo mount /dev/nvme1n1 /mnt/ebs
sudo chmod 777 /mnt/ebs
```

### Sync directories

```bash
sudo rsync -av /mnt/fsx/ /mnt/ebs/
```

See the [rsync guide](https://linuxize.com/post/how-to-use-rsync-for-local-and-remote-data-transfer-and-synchronization/) for options.

## DynamoDB capacity units

Quick reference. Full details: [AWS read/write capacity units](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html#read-write-capacity-units).

**Read capacity**

- 1 RCU = 1 strongly consistent read per second for items up to 4 KB
- 2 eventually consistent reads per second consume 1 RCU for items up to 4 KB
- Items larger than 4 KB: round up (item size / 4 KB) reads

**Write capacity**

- 1 WCU = 1 write per second for items up to 1 KB
- Items larger than 1 KB: round up (item size / 1 KB) writes

**Example (5 KB average item size)**

- Eventually consistent read: 1 RCU/s
- Strongly consistent read: 2 RCU/s
- Standard write: 5 WCU/s

## VPC Flow Logs

### Create log group and IAM role

```powershell
aws logs create-log-group --log-group-name "/aws/vpc/vpc-b-flowlogs"

$TrustPolicy = '{"Version":"2012-10-17","Statement":[{"Sid":"","Effect":"Allow","Principal":{"Service":"vpc-flow-logs.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
$RoleArn = aws iam create-role --role-name "VPCFlowLogsToCloudWatchRole" --assume-role-policy-document $TrustPolicy --query "Role.Arn" --output text

$PermissionsPolicy = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["logs:CreateLogStream","logs:PutLogEvents","logs:DescribeLogGroups","logs:DescribeLogStreams"],"Resource":"*"}]}'
aws iam put-role-policy --role-name "VPCFlowLogsToCloudWatchRole" --policy-name "VPCFlowLogsPolicy" --policy-document $PermissionsPolicy
```

### Create flow logs

```powershell
## CloudWatch Logs
aws ec2 create-flow-logs `
    --resource-type VPC `
    --resource-ids $VpcB `
    --traffic-type ALL `
    --log-destination-type cloudwatch-logs `
    --log-group-name "<cloudwatch-log-group-name>" `
    --deliver-logs-permission-arn $RoleArn `
    --max-aggregation-interval 60

## S3
aws ec2 create-flow-logs `
    --resource-type VPC `
    --resource-ids $VpcB `
    --traffic-type ALL `
    --log-destination-type s3 `
    --log-destination "arn:aws:s3:::<bucket-name>"
```

## Misc snippets

### Dockerfile (Tomcat on ECR public image)

```dockerfile
FROM public.ecr.aws/docker/library/tomcat:8.5.93-jdk8-corretto-al2
ADD ROOT.war /usr/local/tomcat/webapps/
EXPOSE 8080
CMD ["/usr/local/tomcat/bin/catalina.sh", "run"]
```

### SNS publish

```python
sns = boto3.client("sns")
sns.publish(
    TopicArn=SNS_TOPIC_ARN,
    Message=json.dumps(message),
    Subject="KMS Policy Change Proposed",
)
```
---

# aws-cloud-design-patterns.md

---
title: "Cloud Design Patterns in Plain English"
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

**AWS:** API Gateway, ALB, CloudFront - path or host to Lambda/ECS vs the old app. Use with ACL. [Guide](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html)

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


---

# aws-cognito-keycloak-federation.md

---
title: "Amazon Cognito and Keycloak Federation"
description: "Keycloak on EKS with RDS PostgreSQL, Cognito OIDC federation, and how app pods validate Cognito JWTs."
tags:
  - keycloak
  - eks
  - cognito
  - auth
  - oidc
  - rds
links:
  - title: AWS workshop - third-party IdP authentication
    url: https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/60-third-party-idp-authentication
  - title: Cognito - OIDC identity providers
    url: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html
  - title: Keycloak - Configuring the database
    url: https://www.keycloak.org/server/db
  - title: Keycloak - Securing applications and services
    url: https://www.keycloak.org/docs/latest/securing_apps/
  - title: Amazon RDS for PostgreSQL
    url: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html
---

## Overview

**Goal:** Employees sign in with **Keycloak** (your IdP). Your product still issues **Cognito** JWTs so API Gateway, ALB, and pods validate one issuer.

```text
 Browser / SPA          Amazon Cognito              Keycloak on EKS              RDS
      │                        │                         │                      │
      │  /oauth2/authorize     │                         │                      │
      ├───────────────────────►│                         │                      │
      │                        │  redirect (OIDC)        │                      │
      │                        ├────────────────────────►│ ALB → pods           │
      │                        │                         ├─────────────────────►│ PostgreSQL
      │                        │  auth code back         │   realms, users,     │ (private)
      │                        │◄────────────────────────┤   sessions           │
      │  Cognito JWT           │                         │                      │
      │◄───────────────────────┤                         │                      │
      ▼                        │                         │                      │
  App pods (same/other EKS) ◄── Bearer Cognito access token (not Keycloak token)
```

| Piece | Role |
| --- | --- |
| **Keycloak (EKS)** | Corporate IdP UI + OIDC endpoints behind **ALB + HTTPS** |
| **Amazon RDS (PostgreSQL)** | Durable store for Keycloak data (users, realms, clients) - **only Keycloak talks to RDS** |
| **Cognito User Pool** | OAuth/OIDC front door for *your* app; federates to Keycloak |
| **App client** | OAuth client registered in Cognito (callback URLs, secrets) |
| **Hosted UI** | Cognito login page with “Sign in with Keycloak” button |
| **EKS app workload** | Validates **Cognito** JWT (JWKS). Does **not** query RDS for login |

**Pods:** Human login goes Browser → Cognito → Keycloak. Pods trust **Cognito JWKS** only. For machine identity (no human), use a **separate** Cognito app client (client credentials) or **IRSA** for AWS APIs - Keycloak federation is for people, not kube ServiceAccounts.

---

## Keycloak words (30-second map)

Think of Keycloak like a mini “company login server.”

| Term | Plain meaning | Tiny example |
| --- | --- | --- |
| **Realm** | Isolated tenant (users, clients, themes). | `corp` = one company; `demo` = lab sandbox |
| **Client** | An application allowed to use OAuth/OIDC. | `cognito-federation` = Cognito is the OAuth client |
| **Client authentication** | Client has a **secret** (confidential client). | Cognito needs `client_secret` at token endpoint |
| **Redirect URI** | Where Keycloak sends the browser after login. | `https://YOUR_DOMAIN.auth.REGION.amazoncognito.com/oauth2/idpresponse` |
| **Standard flow** | Authorization code flow (browser login). | Always **on** for Cognito federation |
| **Scopes** | What user info Keycloak may release. | `openid email profile` |
| **User** | Account that can sign in. | `alice` / password in dev only |
| **Issuer** | Base URL of the realm for OIDC discovery. | `https://keycloak.example.com/realms/corp` |
| **OpenID Endpoint Configuration** | `.well-known/openid-configuration` JSON. | Cognito reads this when you set **Issuer URL** |

**Cognito words that pair with the above:**

| Cognito term | Pairs with Keycloak |
| --- | --- |
| **User pool** | Your app’s user directory + token issuer |
| **Identity provider (OIDC)** | Registers Keycloak issuer + client id/secret |
| **Attribute mapping** | Copy `email`, `sub`, etc. from Keycloak token into Cognito profile |
| **Hosted UI domain** | `https://<prefix>.auth.<region>.amazoncognito.com` |
| **Federated username** | Often `<ProviderName>_<sub>` (e.g. `Keycloak_a1b2c3…`) |

---

## Part 1 - Keycloak on EKS + Amazon RDS

**Order:** RDS PostgreSQL (private) → store DB password in Secrets Manager → deploy Keycloak on **same VPC** as EKS → **ALB Ingress** + ACM → public hostname → Cognito OIDC issuer URL.

Cognito must reach Keycloak over **HTTPS** on the internet (or at least a URL AWS can call). App pods in EKS **never** connect to RDS for auth; only Keycloak pods use JDBC to RDS.

```text
Internet ──► ALB (ACM cert) ──► Keycloak Deployment (namespace keycloak)
                                      │
                                      └── JDBC :5432 ──► RDS PostgreSQL (private subnets)
```

| RDS choice | Notes |
| --- | --- |
| **Engine** | PostgreSQL 15+ (Keycloak [supports](https://www.keycloak.org/server/db) PostgreSQL, MariaDB, MySQL) |
| **Access** | **Not** publicly accessible; same VPC as EKS worker nodes |
| **HA** | Multi-AZ for production; single-AZ OK for lab |
| **Name / user** | DB `keycloak`, user `keycloak` (match Helm / `KC_DB_*` below) |

---

### Step 1 - Create RDS PostgreSQL (console)

1. **RDS** → **Create database** → **Standard create** → **PostgreSQL**.
2. **Templates:** Dev/Test for lab, Production for real use.
3. **Settings:** DB identifier `keycloak-db`, master username `keycloakadmin` (or use default `postgres` and create app user later).
4. **Credentials:** Secrets Manager or self-managed strong password.
5. **Instance:** `db.t4g.small` or larger if many users.
6. **Storage:** gp3, enable storage autoscaling if you expect growth.
7. **Connectivity**
   - VPC = **EKS cluster VPC**
   - **No** public access
   - DB subnet group = private subnets
   - Create or pick security group `rds-keycloak-sg`
8. **Additional configuration**
   - Initial database name: `keycloak`
9. Create database. Note **Endpoint** hostname.

**Security group rules**

| Direction | Rule |
| --- | --- |
| RDS `rds-keycloak-sg` inbound | TCP **5432** from **EKS node security group** (or cluster security group / pod ENI SG if you use custom networking) |
| RDS outbound | Default (or restrict to Keycloak SG only) |

<details>
<summary>AWS CLI - RDS PostgreSQL instance (minimal lab)</summary>

```bash
export AWS_REGION=us-east-1
export VPC_ID=vpc-xxxxxxxx
export EKS_NODE_SG=sg-xxxxxxxx   # SG attached to worker nodes

RDS_SG=$(aws ec2 create-security-group \
  --group-name rds-keycloak-sg \
  --description "Keycloak RDS" \
  --vpc-id "$VPC_ID" \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress \
  --group-id "$RDS_SG" \
  --protocol tcp --port 5432 --source-group "$EKS_NODE_SG"

aws rds create-db-instance \
  --db-instance-identifier keycloak-db \
  --engine postgres \
  --engine-version 16.4 \
  --db-instance-class db.t4g.small \
  --allocated-storage 20 \
  --master-username keycloak \
  --master-user-password 'Generate-Strong-Password-Here' \
  --db-name keycloak \
  --vpc-security-group-ids "$RDS_SG" \
  --no-publicly-accessible \
  --backup-retention-period 7

aws rds describe-db-instances \
  --db-instance-identifier keycloak-db \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

</details>

<details>
<summary>SQL - optional separate app user (if master user is postgres)</summary>

Connect from a bastion or `kubectl run` psql pod in the VPC:

```sql
CREATE USER keycloak WITH PASSWORD 'app-user-password';
CREATE DATABASE keycloak OWNER keycloak;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;
```

Keycloak creates its own tables on first start (`start` / `start-optimized`).

</details>

---

### Step 2 - Store DB password for Kubernetes

**Console:** **Secrets Manager** → **Store a new secret** → **Credentials for Amazon RDS database** → select `keycloak-db` → secret name `keycloak/rds`.

**In cluster:** sync with [External Secrets Operator](https://external-secrets.io/) or create a Secret manually before Helm install.

<details>
<summary>kubectl - DB secret (manual)</summary>

```bash
kubectl create namespace keycloak

kubectl create secret generic keycloak-db \
  --namespace keycloak \
  --from-literal=password='Generate-Strong-Password-Here'
```

</details>

---

### Step 3 - Deploy Keycloak on EKS (Helm + ALB)

Prerequisites: [AWS Load Balancer Controller](https://kubernetes-sigs.github.io/aws-load-balancer-controller/) on the cluster, **public** subnets tagged for ALB, **ACM certificate** for `auth.example.com`.

1. `kubectl create namespace keycloak` (if not done).
2. Install chart with **embedded PostgreSQL disabled** and **externalDatabase** pointing at RDS.
3. Set public hostname so OIDC issuer is stable (Cognito caches discovery from this URL).
4. Wait for Ingress → ALB → target healthy → `https://auth.example.com` loads admin console.

<details>
<summary>Helm - Bitnami Keycloak + external RDS + ALB Ingress</summary>

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

export RDS_HOST=keycloak-db.xxxxxxxxxxxx.us-east-1.rds.amazonaws.com
export ACM_CERT_ARN=arn:aws:acm:us-east-1:ACCOUNT:certificate/xxxxxxxx

helm upgrade --install keycloak bitnami/keycloak \
  --namespace keycloak \
  --set auth.adminUser=admin \
  --set auth.adminPassword='ChangeMe-Admin-123' \
  --set production=true \
  --set proxy=edge \
  --set postgresql.enabled=false \
  --set externalDatabase.host="$RDS_HOST" \
  --set externalDatabase.port=5432 \
  --set externalDatabase.user=keycloak \
  --set externalDatabase.database=keycloak \
  --set externalDatabase.existingSecret=keycloak-db \
  --set externalDatabase.existingSecretPasswordKey=password \
  --set ingress.enabled=true \
  --set ingress.ingressClassName=alb \
  --set ingress.hostname=auth.example.com \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/scheme"=internet-facing \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/target-type"=ip \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/certificate-arn"="$ACM_CERT_ARN" \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/listen-ports"='[{"HTTPS":443}]'
```

Route 53 (or your DNS): **CNAME** `auth.example.com` → ALB DNS name from `kubectl get ingress -n keycloak`.

</details>

<details>
<summary>Manifest - official Keycloak image + env (RDS + hostname)</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak
  namespace: keycloak
spec:
  replicas: 2
  selector:
    matchLabels:
      app: keycloak
  template:
    metadata:
      labels:
        app: keycloak
    spec:
      containers:
        - name: keycloak
          image: quay.io/keycloak/keycloak:26.0
          args: ["start"]
          env:
            - name: KC_DB
              value: postgres
            - name: KC_DB_URL_HOST
              value: keycloak-db.xxxxx.us-east-1.rds.amazonaws.com
            - name: KC_DB_URL_DATABASE
              value: keycloak
            - name: KC_DB_USERNAME
              value: keycloak
            - name: KC_DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-db
                  key: password
            - name: KC_HOSTNAME
              value: https://auth.example.com
            - name: KC_PROXY_HEADERS
              value: xforwarded
            - name: KC_HTTP_ENABLED
              value: "true"
            - name: KC_BOOTSTRAP_ADMIN_USERNAME
              value: admin
            - name: KC_BOOTSTRAP_ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: keycloak-admin
                  key: password
          ports:
            - containerPort: 8080
```

Pair with Service + ALB Ingress (same annotations as Helm example). Run **at least two replicas** in production; sessions and realm data live in RDS so pods are disposable.

</details>

---

### Step 4 - Keycloak admin UI (realm bootstrap)

1. Open `https://auth.example.com/admin`.
2. Login with bootstrap admin user.
3. Realm dropdown → **Create realm** → name `corp` → **Create** (stay out of `master` for app config).
4. **Realm settings** → **OpenID Endpoint Configuration** → confirm issuer:

```text
https://auth.example.com/realms/corp
```

Use that exact value later in Cognito **Issuer URL** (Part 4).

<details>
<summary>Local Docker only - UI practice without EKS (not for Cognito federation)</summary>

```bash
docker run -d --name keycloak -p 8080:8080 \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin \
  -e KC_BOOTSTRAP_ADMIN_PASSWORD='ChangeMe-Admin-123' \
  quay.io/keycloak/keycloak:26.0 start-dev
```

`start-dev` = in-memory DB, HTTP. Use only to learn Keycloak screens. **Cognito integration needs EKS (or EC2) + HTTPS issuer**, not laptop localhost.

</details>

---

## Part 2 - Keycloak setup for Cognito

Do these **inside realm `corp`**, before touching AWS.

### Step A - Create OIDC client for Cognito

1. **Clients** → **Create client**.
2. **General settings**
   - Client type: **OpenID Connect**
   - Client ID: `cognito-federation`
3. **Capability config**
   - Client authentication: **On** (confidential client)
   - Authorization: **Off** (unless you use Keycloak authorization services)
   - Authentication flow: enable **Standard flow** only
4. **Login settings** (you will fill redirect after Cognito domain exists)
   - Valid redirect URIs: placeholder `https://example.com/oauth2/idpresponse` for now
   - Web origins: `+` (allow redirect origin) or your Cognito domain origin
5. **Save** → open client → **Credentials** tab → copy **Client secret** (needed in Cognito).

### Step B - Test user

1. **Users** → **Create new user**
   - Username: `alice`
   - Email: `alice@example.com` (optional but helps mapping)
   - Email verified: **On**
2. **Credentials** tab → **Set password** → temporary **Off** → password e.g. `Alice-Dev-123`.

### Step C - Issuer URL (write this down)

**Realm settings** → **OpenID Endpoint Configuration** → note **issuer** (no trailing slash):

```text
https://auth.example.com/realms/corp
```

Must match what browsers and Cognito fetch from `/.well-known/openid-configuration` on your **ALB hostname** (Part 1).

<details>
<summary>Keycloak Admin CLI (kcadm) - create client + user</summary>

```bash
# Inside Keycloak container or with kcadm on PATH
/opt/keycloak/bin/kcadm.sh config credentials \
  --server https://auth.example.com \
  --realm master \
  --user admin \
  --password 'ChangeMe-Admin-123'

/opt/keycloak/bin/kcadm.sh create realms -s realm=corp -s enabled=true

/opt/keycloak/bin/kcadm.sh create clients -r corp \
  -s clientId=cognito-federation \
  -s protocol=openid-connect \
  -s publicClient=false \
  -s standardFlowEnabled=true \
  -s 'redirectUris=["https://YOUR_PREFIX.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"]' \
  -s 'webOrigins=["+"]'

# Client secret (replace INTERNAL_ID from clients list)
/opt/keycloak/bin/kcadm.sh get clients -r corp -q clientId=cognito-federation --fields id,secret
```

</details>

---

## Part 3 - Cognito User Pool + Hosted UI

Region example: `us-east-1`. Replace `ACCOUNT`, `REGION`, and names.

### Step 1 - User pool

1. **Amazon Cognito** → **User pools** → **Create user pool**.
2. **Sign-in experience**
   - Cognito user pool sign-in: **Email** or **Username** (pick one; federation still works).
   - Federated sign-in: leave defaults.
3. **Security** - MFA off for lab.
4. **Sign-up** - disable self-registration if this pool is employees-only.
5. **Required attributes** - enable **email** if you map email from Keycloak.
6. Name pool e.g. `corp-federated` → create.

### Step 2 - Domain (Hosted UI)

1. Pool → **App integration** → **Domain**.
2. **Cognito domain** → prefix e.g. `corp-kc-demo` (must be unique).
3. Note full domain:

```text
https://corp-kc-demo.auth.us-east-1.amazoncognito.com
```

### Step 3 - App client (your SPA or test app)

1. **App integration** → **App clients** → **Create app client**.
2. Name: `web-spa`.
3. **Confidential client** if you have a backend that holds a secret; **Public client** for pure SPA + PKCE.
4. **Allowed callback URLs:** `https://jwt.io` (quick test) or `https://app.example.com/callback`.
5. **Allowed sign-out URLs:** same origin as app.
6. **OAuth 2.0 grant types:** Authorization code grant.
7. **OpenID Connect scopes:** `openid`, `email`, `profile` (and custom resource scopes later if needed).
8. Save **Client ID** (and secret if confidential).

### Step 4 - Hosted UI identity provider list

1. **App integration** → **App client** → **Edit hosted UI**.
2. **Identity providers:** enable **Cognito user pool** (optional) and your Keycloak provider (next section).
3. **OAuth 2.0 grant types** and scopes aligned with step 3.

<details>
<summary>AWS CLI - user pool, domain, app client</summary>

```bash
export AWS_REGION=us-east-1

POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name corp-federated \
  --policies 'PasswordPolicy={MinimumLength=8,RequireUppercase=false,RequireLowercase=false,RequireNumbers=false,RequireSymbols=false}' \
  --auto-verified-attributes email \
  --query 'UserPool.Id' --output text)

aws cognito-idp create-user-pool-domain \
  --domain corp-kc-demo-$(aws sts get-caller-identity --query Account --output text | tail -c 7) \
  --user-pool-id "$POOL_ID"

CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name web-spa \
  --generate-secret \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --callback-urls 'https://jwt.io' \
  --logout-urls 'https://jwt.io' \
  --supported-identity-providers COGNITO \
  --query 'UserPoolClient.ClientId' --output text)

echo "POOL_ID=$POOL_ID CLIENT_ID=$CLIENT_ID"
```

</details>

---

## Part 4 - Wire Keycloak as Cognito OIDC IdP

### Console

1. User pool → **Sign-in experience** → **Federated identity provider sign-in** → **Add identity provider** → **OpenID Connect (OIDC)**.
2. **Provider name:** `Keycloak` (appears on Hosted UI; used as `identity_provider=Keycloak`).
3. **Client ID:** `cognito-federation` (from Keycloak).
4. **Client secret:** from Keycloak client **Credentials**.
5. **Authorized scopes:** `openid email profile`.
6. **Issuer URL:** `https://auth.example.com/realms/corp` (Keycloak on EKS, Part 1).
   - Cognito fetches `/.well-known/openid-configuration` from this issuer.
7. **Attributes request method:** `GET` (Keycloak default). If token/userinfo fails, try `POST`.
8. **Attribute mapping** (minimum):

| User pool attribute | OpenID Connect attribute |
| --- | --- |
| email | email |
| username | sub |
| name | name |

9. **Save**.

### Fix Keycloak redirect URI (critical)

Back in Keycloak client **Valid redirect URIs**, set **exactly**:

```text
https://<your-cognito-domain-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
```

Example:

```text
https://corp-kc-demo.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
```

No trailing slash. Multiple pools → one URI per pool domain.

<details>
<summary>AWS CLI - create OIDC IdP + enable on app client</summary>

```bash
export POOL_ID=us-east-1_XXXXXXXXX
export CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
export KC_ISSUER='https://keycloak.example.com/realms/corp'
export KC_CLIENT_ID=cognito-federation
export KC_CLIENT_SECRET='paste-from-keycloak'

aws cognito-idp create-identity-provider \
  --user-pool-id "$POOL_ID" \
  --provider-name Keycloak \
  --provider-type OIDC \
  --provider-details \
    client_id="$KC_CLIENT_ID",client_secret="$KC_CLIENT_SECRET",oidc_issuer="$KC_ISSUER",authorize_scopes="openid email profile",attributes_request_method=GET \
  --attribute-mapping email=email,username=sub,name=name

aws cognito-idp update-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-id "$CLIENT_ID" \
  --supported-identity-providers COGNITO Keycloak \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --allowed-o-auth-flows-user-pool-client \
  --callback-urls 'https://jwt.io' \
  --logout-urls 'https://jwt.io'
```

</details>

**Cognito requirement:** External OIDC IdPs must support **`client_secret_post`** at the token endpoint. Keycloak confidential clients do. See [Cognito OIDC IdP](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html).

---

## Part 5 - End-to-end test (browser)

### Hosted UI URL template

```text
https://<domain>.auth.<region>.amazoncognito.com/oauth2/authorize
  ?client_id=<CLIENT_ID>
  &response_type=code
  &scope=openid+email+profile
  &redirect_uri=<URL_ENCODED_CALLBACK>
  &identity_provider=Keycloak
```

- `identity_provider=Keycloak` skips Cognito local password and jumps to Keycloak.
- Omit it to show Cognito + federated buttons.

### What should happen

1. Browser opens Cognito Hosted UI → **Keycloak** (or direct redirect).
2. Keycloak login → `alice` / password.
3. Browser lands on `redirect_uri` with `?code=...`.
4. App exchanges code at Cognito **token endpoint** (server-side or PKCE from SPA).
5. Response includes **ID token**, **access token**, **refresh token** issued by **Cognito** (`iss` = Cognito pool).

### First login side effect

Cognito **creates a shadow user** in the pool (federated profile). Later tokens use Cognito signing keys even though password lives in Keycloak.

<details>
<summary>curl - token exchange (confidential client + secret)</summary>

```bash
export DOMAIN='corp-kc-demo.auth.us-east-1.amazoncognito.com'
export CLIENT_ID='...'
export CLIENT_SECRET='...'
export REDIRECT_URI='https://jwt.io'
export AUTH_CODE='paste-code-from-redirect'

curl -sS -X POST "https://${DOMAIN}/oauth2/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=authorization_code" \
  -d "client_id=${CLIENT_ID}" \
  -d "client_secret=${CLIENT_SECRET}" \
  -d "code=${AUTH_CODE}" \
  -d "redirect_uri=${REDIRECT_URI}" | jq .
```

</details>

---

## Part 6 - How EKS pods use this

Keycloak usually runs in namespace `keycloak` on the **same cluster** as your apps, but a **different** Deployment. App pods talk to **Cognito JWKS**; only Keycloak pods open **JDBC to RDS**.

Separate three cases. Mixing them causes “why is my pod calling Keycloak?” confusion.

### Case A - User-facing API in a pod (most common)

```text
User browser ──► Cognito (+ Keycloak login once) ──► access_token (Cognito)
       │
       └──► Ingress/ALB ──► Pod validates JWT with Cognito JWKS
```

| Do | Don’t |
| --- | --- |
| Validate `Authorization: Bearer <access_token>` | Send Keycloak token to the pod |
| Check `iss`, `exp`, `aud`/`client_id`, scopes | Mount Keycloak admin password in the pod |
| Cache JWKS from `https://cognito-idp.<region>.amazonaws.com/<poolId>/.well-known/jwks.json` | Assume `sub` format matches Keycloak’s raw `sub` without checking Cognito mapping |

**Username in Cognito** is often `Keycloak_<keycloak-sub>`. Authorize on `cognito:groups`, custom claims, or app roles - not on Keycloak group names unless you map them (advanced: SAML or custom Lambda triggers).

<details>
<summary>Pod Deployment - pass pool metadata as env (app validates JWT)</summary>

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  template:
    spec:
      containers:
        - name: api
          image: your-api:latest
          env:
            - name: COGNITO_REGION
              value: us-east-1
            - name: COGNITO_USER_POOL_ID
              value: us-east-1_XXXXXXXXX
            - name: COGNITO_CLIENT_ID
              value: xxxxxxxxxxxxxxxxxxxxxxxxxx
          ports:
            - containerPort: 8080
```

Your framework middleware downloads JWKS once, validates every request. Reference pattern: [EKS microservice access tokens (Cognito)](https://aws.amazon.com/blogs/security/access-token-security-for-microservice-apis-on-amazon-eks/).

</details>

### Case B - Pod calls **AWS** APIs (S3, DynamoDB, etc.)

Use **IRSA** (IAM Roles for Service Accounts). Identity chain is **Kubernetes ServiceAccount → STS → IAM**, not Cognito and not Keycloak.

```text
Pod ── projected SA token (aud=sts.amazonaws.com) ──► AssumeRoleWithWebIdentity ──► AWS API
```

Humans may still use Cognito+Keycloak for the **web app**; batch workers use IRSA. No federation change required.

### Case C - Machine-to-machine HTTP (no human in browser)

Keycloak federation does **not** help nightly jobs. Options:

| Pattern | When |
| --- | --- |
| **Cognito app client** + client credentials (if enabled for your pool/client) | Service calls your API with Cognito-issued M2M token |
| **Keycloak service account** (client credentials to Keycloak) | Only if the **resource owner is Keycloak**, not Cognito |
| **IRSA** | AWS resource access from the cluster |

Do **not** embed `alice` password in a pod to “simulate” federation.

<details>
<summary>Optional - ALB authenticate with Cognito (ingress annotation idea)</summary>

ALB can authenticate users against Cognito before traffic hits pods. Users still federate to Keycloak at Cognito Hosted UI; pods receive requests only after ALB session is established (pattern varies by controller version). Prefer in-app JWT validation when you need fine-grained scopes inside the service.

</details>

---

## Troubleshooting (fast)

| Symptom | Likely fix |
| --- | --- |
| `redirect_uri_mismatch` at Keycloak | Cognito `/oauth2/idpresponse` URI exact match in Keycloak client |
| Cognito “Invalid issuer” | Issuer URL must match discovery document; HTTPS in prod; no trailing `/` |
| Login works, email empty | Keycloak user has email; scope includes `email`; attribute mapping `email=email` |
| Token rejected in pod | Validate **Cognito** JWT, not Keycloak; check `iss` and `token_use` (`access` vs `id`) |
| Cognito cannot reach localhost Keycloak | Keycloak on EKS + public ALB + ACM; issuer = `https://auth.example.com/realms/corp` |
| Keycloak pod `Connection refused` to RDS | RDS in same VPC; SG allows **5432** from node/pod SG; correct endpoint hostname |
| Keycloak starts but empty / migration errors | DB name `keycloak`, user has privileges; password matches Secret; use `start` not `start-dev` with RDS |
| Wrong issuer in tokens | `KC_HOSTNAME` / Ingress hostname must match DNS; check OpenID Endpoint Configuration in realm |

---

## Production checklist (short)

1. **RDS:** Multi-AZ, automated backups, encryption at rest, minor version auto-upgrade, enough storage for session/realm growth.
2. **EKS:** Keycloak ≥ 2 replicas, PDB, HPA optional; ALB TLS 1.2+; restrict admin console (IP allow list or VPN-only internal ALB + separate public hostname for `/realms/*` only if you split paths).
3. **Network:** RDS never public; rotate DB password via Secrets Manager + rolling restart.
4. Rotate Keycloak **Cognito federation** client secret; update Cognito IdP.
5. Restrict callback/logout URLs to real app origins (not `jwt.io`).
6. MFA in Keycloak (or corporate IdP upstream).
7. **App pods:** Cognito JWT validation only; IRSA for AWS APIs; no RDS credentials in application Deployments.

---

## References

- [AWS workshop - third-party IdP authentication](https://catalog.workshops.aws/workshops/137bc34c-33d9-43a8-bf8f-2d4f6c22c333/en-US/60-third-party-idp-authentication)
- [Cognito - OIDC identity providers](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-idp.html)
- [Keycloak - Configuring the database](https://www.keycloak.org/server/db)
- [Keycloak - Securing applications](https://www.keycloak.org/docs/latest/securing_apps/)
- [Amazon RDS for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)

---

# aws-data-rds-redshift-athena.md

---
title: "AWS Data Services: RDS, Redshift, and Athena"
description: "Operational runbooks for Amazon RDS day-2 checks, Redshift COPY loads from S3, and Athena tables for VPC Flow Logs forensics."
tags:
  - rds
  - redshift
  - athena
  - s3
  - databases
  - analytics
  - aws
---

## Overview

Operational checklists and copy-paste patterns for three common data workflows on AWS:

| Section | Use when |
| --- | --- |
| [Amazon RDS](#amazon-rds) | Connecting to managed databases, backups, SSL, and performance triage |
| [Redshift COPY from S3](#redshift-copy-from-s3) | Loading warehouse data from S3 with IAM roles |
| [Athena forensics](#athena-forensics) | Querying VPC Flow Logs stored in S3 |

---

## Amazon RDS

Day-2 checklist for connectivity, backups, SSL, and performance triage on Amazon RDS.

### Connectivity checklist

- **Publicly accessible** alone is not enough - verify subnet routes, security groups, and NACL return traffic.
- Prefer **private subnets** with inbound rules from the application security group only.
- Confirm **SSL** requirements and engine-specific parameters such as `rds.force_ssl` when enforced.

### Operations checklist

- Set **backup retention**, deletion protection, and final snapshot behavior deliberately.
- Track parameter group changes that enter `pending-reboot`.
- Enable **CloudWatch metrics** plus Database Insights or Performance Insights depending on engine support.

### Export data with the MySQL client

```bash
mysql -h <endpoint> -P 3306 -u <user> -p --ssl-ca=global-bundle.pem <db> \
  -e "SELECT * FROM products" > products.csv
```

### References

- [RDS Performance Insights](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PerfInsights.html)
- [Connecting to an RDS DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_CommonTasks.Connect.html)

---

## Redshift COPY from S3

Load data from Amazon S3 into Amazon Redshift using the `COPY` command and an IAM role (no long-lived access keys).

### Recommended `COPY` pattern

```sql
COPY target_table
FROM 's3://bucket/prefix/'
IAM_ROLE 'arn:aws:iam::<account-id>:role/<redshift-copy-role>'
FORMAT AS JSON 'auto'
REGION '<bucket-region>';
```

Replace `FORMAT AS JSON 'auto'` with `CSV`, `PARQUET`, or other formats as needed.

### Pre-flight checklist

| Check | Why it matters |
| --- | --- |
| Use `IAM_ROLE` | Avoids embedding access keys in SQL or secrets |
| Grant `s3:GetObject` and `s3:ListBucket` | Role must read the source prefix |
| Include KMS permissions | Required when objects use SSE-KMS |
| Use manifest files | Controlled, repeatable multi-file loads |
| Load via staging tables | Validate rows before merging to production tables |
| Set `REGION` | Required when the S3 bucket is in a different Region than the cluster |

### References

- [Redshift COPY command](https://docs.aws.amazon.com/redshift/latest/dg/r_COPY.html)
- [COPY from Amazon S3](https://docs.aws.amazon.com/redshift/latest/dg/copy-parameters-data-source-s3.html)
- [COPY credentials and permissions](https://docs.aws.amazon.com/redshift/latest/dg/loading-data-access-permissions.html)

---

## Athena forensics

Query **VPC Flow Logs** (and similar log data) in S3 with Amazon Athena. For full OrderFlow query samples, see [OrderFlow snippets](/eks-orderflow-cli-snippets/).

### VPC Flow Logs external table

Point the table `LOCATION` at your log prefix. Partition by `date` to limit scan cost.

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS vpc_flow_logs (
  version int,
  account_id string,
  interface_id string,
  srcaddr string,
  dstaddr string,
  srcport int,
  dstport int,
  protocol bigint,
  packets bigint,
  bytes bigint,
  start bigint,
  `end` bigint,
  action string,
  log_status string
)
PARTITIONED BY (`date` date)
ROW FORMAT DELIMITED FIELDS TERMINATED BY ' '
LOCATION 's3://DOC-EXAMPLE-BUCKET/AWSLogs/{account_id}/vpcflowlogs/{region_code}/'
TBLPROPERTIES ("skip.header.line.count"="1");
```

After creating the table, add partitions (or use partition projection) before running queries:

```sql
ALTER TABLE vpc_flow_logs ADD IF NOT EXISTS
  PARTITION (`date`='2026-06-01')
  LOCATION 's3://DOC-EXAMPLE-BUCKET/AWSLogs/123456789012/vpcflowlogs/us-east-1/2026/06/01/';
```

### Example query - top talkers by bytes

```sql
SELECT srcaddr, dstaddr, SUM(bytes) AS total_bytes
FROM vpc_flow_logs
WHERE `date` = DATE '2026-06-01'
  AND action = 'ACCEPT'
GROUP BY srcaddr, dstaddr
ORDER BY total_bytes DESC
LIMIT 20;
```

---

# aws-dynamodb-dax.md

---
title: "DynamoDB Accelerator (DAX): Use and Integrate"
description: "Swap the DynamoDB client for a DAX client: cluster in a VPC, IAM, Lambda packaging, item vs query cache, write-through, and when to call DynamoDB directly for strong reads."
tags:
  - dynamodb
  - dax
  - lambda
  - caching
  - aws
  - notes
date: 2026-08-29
---

## Integration in one change

DAX is a **write-through** cache for DynamoDB **inside a VPC**. The API is the DynamoDB data-plane API. You do **not** invent cache keys: replace `boto3.client("dynamodb")` with `amazondax.AmazonDaxClient` (or the Java `ClusterDaxAsyncClient`) and keep `GetItem` / `PutItem` / `Query` as they are.

```text
App (same DynamoDB API)
        │
        ▼
 DAX cluster  (item cache + query cache)
        │  miss / write
        ▼
     DynamoDB
```

**Reference:** [`dir/lambda/lambda-dax.py`](./dir/lambda/lambda-dax.py) - eventual reads through DAX, strong reads through DynamoDB.

Not a general cache (lists, TTL keys, pub/sub). For that pattern see [Valkey + Lambda + DynamoDB](./elastic-cache-valkey-lambda.md).

---

## What gets cached

| Path | Cache | Hit key |
| --- | --- | --- |
| `GetItem`, `BatchGetItem` (eventual) | Item cache | Primary key |
| `Query`, `Scan` (eventual) | Query cache | Full request parameters |
| `ConsistentRead=true` | None | Passed to DynamoDB, **not** stored |
| `TransactGetItems` | None | Same - skip DAX |

Writes through DAX (`PutItem`, `UpdateItem`, `DeleteItem`, `BatchWriteItem`): DynamoDB first, then **item** cache. Success only if **both** succeed.

Writes through DAX **do not** refresh the **query** cache. Query/Scan results live until **TTL** (cluster default often 5 minutes) or eviction. Tune query TTL or avoid caching large scans.

Production: **≥ 3 nodes**. 1–2 nodes are not fault-tolerant.

---

## Cluster (once)

1. **Subnet group** - private subnets in the VPC the app (or Lambda ENIs) use.  
2. **Security group** - inbound **TCP 8111** (no TLS) or **9111** (encryption in transit) from the app SG.  
3. **IAM service role on the cluster** - DynamoDB `GetItem`/`PutItem`/… on the tables DAX will touch. DAX assumes this role to talk to DynamoDB.  
4. Create cluster: node type, size, encryption at rest, encryption in transit (set at **create**; cannot flip later). Copy the **cluster endpoint**.  
   - Unencrypted: `dax://…` port **8111**  
   - TLS: `daxs://…` port **9111**

TLS cannot be mixed on the same cluster. Client must match.

---

## App IAM vs cluster IAM

Calls go to **DAX**, not `dynamodb.amazonaws.com`.

| Principal | Actions | Resource |
| --- | --- | --- |
| Cluster role | `dynamodb:GetItem`, `PutItem`, `Query`, … | Table ARNs |
| App / Lambda role | `dax:GetItem`, `dax:PutItem`, `dax:Query`, … | Cluster ARN |

`dynamodb:GetItem` on the Lambda role does **not** authorize a DAX `GetItem`. Strong reads that bypass DAX still need `dynamodb:GetItem` on the table.

---

## Python client

Package is **not** in the Lambda runtime. `pip install amazon-dax-client` into the deployment zip or a layer (`# pip install amazon-dax-client -t package` in [`lambda-dax.py`](./dir/lambda/lambda-dax.py)).

Create the client **once** at module scope (warm starts reuse the connection).

```python
import amazondax
import boto3
import os

dax = amazondax.AmazonDaxClient(
    endpoints=[os.environ["DAX_ENDPOINT"]],
    region_name=os.environ["AWS_REGION"],
)
dynamodb = boto3.client("dynamodb")  # strong reads / transactions only
```

TLS endpoint example: `daxs://my-cluster.xxxx.dax-clusters.us-east-1.amazonaws.com`.

Java 2.x: `ClusterDaxAsyncClient` with `url` = cluster URL, then the same `getItem` calls - [modify an existing app](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.client.modify-your-app.html).

---

## Lambda

DAX has **no public endpoint**. Attach Lambda to the **same VPC**, private subnets that can reach the DAX SG, execution role `AWSLambdaVPCAccessExecutionRole` plus `dax:*` on the cluster.

Env: `TABLE_NAME`, `DAX_ENDPOINT`.

[`lambda-dax.py`](./dir/lambda/lambda-dax.py) routes:

| Path | Client | Why |
| --- | --- | --- |
| `/eventual` | `dax.get_item` | Cache hit or miss → DynamoDB, then item cache |
| `/strong` | `dynamodb.get_item(..., ConsistentRead=True)` | DAX would only proxy and not cache |

Do not send strong/transactional reads to DAX: extra hop, no cache benefit.

---

## Writes from the app

Use **`dax.put_item` / `update_item` / `delete_item`** so the item cache stays aligned. If another writer uses the DynamoDB API only, DAX item cache is stale until TTL. Query cache stays stale regardless until TTL.

---

## Fit

**Use DAX** for high `GetItem`/`BatchGetItem` (and simple Query) rate, eventual consistency OK, same DynamoDB API.

**Skip DAX** for mostly strong reads, transactions, write-heavy with many Query shapes, or cache-aside with custom keys - use DynamoDB directly or [Valkey](./elastic-cache-valkey-lambda.md).

---

## References

- [How DAX works](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.concepts.html)
- [Consistency, item vs query cache](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.consistency.html)
- [When DAX is a fit](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/evaluate-dax-suitability.html)
- [DAX clients](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.client.html)
- [Encryption in transit](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAXEncryptionInTransit.html)
- [Lambda + DAX (re:Post)](https://repost.aws/knowledge-center/dax-cluster-lambda-function)

---

# aws-ec2-vcpu-explained.md

---
title: "What Is a vCPU on Amazon EC2?"
description: "How virtual CPUs map to physical cores on Intel, AMD, and Graviton instances-and how vCPU limits affect EC2 capacity."
tags:
  - ec2
  - compute
  - vcpu
  - graviton
  - aws
---## Overview

A **vCPU (virtual Central Processing Unit)** is a logical unit of compute capacity, not a physical object. It represents a time-share on a physical CPU core, managed by a hypervisor.

> If a physical processor core is a worker, a **vCPU is an assigned task slot** for that worker.

## vCPU in general virtualization

In virtualization (VMware, VirtualBox, cloud platforms), the system maps virtual resources to physical hardware. Physical CPUs with **Simultaneous Multithreading (SMT)** - Hyper-Threading on Intel - can often run two execution threads per core.

## vCPU in AWS

AWS uses vCPUs as the standard unit for EC2 instance capacity and account limits.

- **Intel/AMD instances:** one physical core typically equals **two vCPUs** (SMT enabled).
- **AWS Graviton (ARM):** no SMT - **one vCPU equals one physical core**.
- **Account limits:** total vCPU quota caps how many instances you can run across types.

### Example: m5.xlarge

1. **Specification:** 4 vCPUs
2. **Physical mapping:** 2 physical cores
3. **Math:** 2 cores × 2 threads/core = 4 vCPUs
---

# aws-ecr-lifecycle-policy.md

---
title: "Amazon ECR: Repository Settings and Lifecycle Policy"
description: "Scan on push, tag mutability, resource tags, and a lifecycle policy that expires untagged, branch, and excess production images - with prefix rules split (ECR matches all prefixes on a rule)."
tags:
  - ecr
  - lifecycle
  - container-security
  - aws
  - notes
date: 2026-08-29
---

## Repository

| Setting | Lab / prod |
| --- | --- |
| Scan on push | `true` (basic). Registry-level **enhanced** scanning (Inspector) is the current default to configure at the registry, not only per repo. |
| Resource tags | `Environment=Prod`, `ManagedBy=Manual` |
| Tag mutability | **Immutable** for prod (retag fails with `ImageTagAlreadyExistsException`). **Mutable** only if you need overwrite (e.g. pull-through cache). Mutability is repo-wide. |

```bash
aws ecr create-repository \
  --repository-name myapp \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability IMMUTABLE \
  --tags Key=Environment,Value=Prod Key=ManagedBy,Value=Manual
```

---

## Lifecycle policy

Rules run by `rulePriority` (lower first). `expire` deletes the **image**, not a single tag.

**Do not** put `test-`, `dev-`, and `feature-` in one `tagPrefixList`. ECR selects images that match **all** prefixes on that rule. Same for `prod-` and `v`. One prefix per tagged rule.

| Priority | Match | Action |
| --- | --- | --- |
| 1 | Untagged | Expire after **7** days |
| 2 | Tags `test-*` | Expire after **14** days |
| 3 | Tags `dev-*` | Expire after **14** days |
| 4 | Tags `feature-*` | Expire after **14** days |
| 5 | Tags `prod-*` | Keep **20** newest (`imageCountMoreThan`) |
| 6 | Tags `v*` (prefix `v`) | Keep **20** newest |

Prefix `v` matches `v1.2.3` and also `vendor-foo`. Use `v` only if that is acceptable, or switch to `tagPatternList` (e.g. `v[0-9]*`) if the registry supports it for your rule.

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Untagged images (dangling layers) after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "test- tags after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["test-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 3,
      "description": "dev- tags after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["dev-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 4,
      "description": "feature- tags after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["feature-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 5,
      "description": "Keep 20 newest prod- tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 6,
      "description": "Keep 20 newest tags with prefix v",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    }
  ]
}
```

```bash
aws ecr put-lifecycle-policy \
  --repository-name myapp \
  --lifecycle-policy-text file://ecr-lifecycle.json
```

---

## References

- [Lifecycle policies](https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html)
- [Policy properties](https://docs.aws.amazon.com/AmazonECR/latest/userguide/lifecycle_policy_parameters.html)
- [Tag immutability](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html)
- [Enhanced scanning](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-scanning-enhanced.html)
- [EKS-oriented notes](/eks-ecr-best-practices/)

---

# aws-ecs-codepipeline-cicd.md

---
title: "ECS and Lambda CI/CD with CodePipeline"
description: "BuildSpec, AppSpec, and task definition patterns for ECS blue/green deployments and Lambda pipelines with Amazon ECR."
tags:
  - ecs
  - lambda
  - cicd
  - codepipeline
  - codebuild
  - codedeploy
  - ecr
  - aws
---
1. ECS CodePipeline (#ECS CodePipeline)
2. Lambda CodePipeline (#Lambda)

## ECS CodePipeline

https://docs.aws.amazon.com/codepipeline/latest/userguide/tutorials.html

```yaml
## buildspec.yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws --version
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      # Updated to your repository name: my-org/app
      # Add $AWS_ACCOUNT_ID in CodeBuild environment
      - REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/my-org/app
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Build started on `date`
      - echo Building the Docker image...
      - docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker images...
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - echo Writing image definitions file...
      # IMPORTANT: See the note below regarding the "name" field
      - printf '[{"name":"my-app-container","imageUri":"%s"}]' $REPOSITORY_URI:$IMAGE_TAG > imagedefinitions.json
artifacts:
    files: imagedefinitions.json
```

### To add Amazon ECR permissions to the CodeBuild role

1. Open the IAM console at https://console.aws.amazon.com/iam/.
2. In the left navigation pane, choose **Roles**.
3. In the search box, type **codebuild-** and choose the role that was created by the CodePipeline wizard. For this tutorial, the role name is **codebuild-hello-world-service-role**.
4. On the **Summary** page, choose **Attach policies**.
5. Select the box to the left of the **AmazonEC2ContainerRegistryPowerUser** policy, and choose **Attach policy**.
6.  You will need to add `AWS_ACCOUNT_ID` to your CodeBuild environment variables. (e.g., `123456789012`)

### With CodeBuild and CodeDeploy

1. **CodeBuild** builds the Docker image, pushes it to ECR, and outputs an `imageDetail.json` file containing the new image URI.
2. **CodeDeploy** takes that image URI, plugs it into your Task Definition, and handles the deployment to your ECS Service (usually doing a Blue/Green deployment to shift traffic safely).

To make this work, three files in the root of your repository: your `buildspec.yaml`, an `appspec.yaml`, and your `taskdef.json`.

### 1. `buildspec.yaml`

For CodeDeploy to ECS, the standard artifact is `imageDetail.json` rather than `imagedefinitions.json`.

```yaml
version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws --version
      - aws ecr get-login-password --region $AWS_DEFAULT_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com
      - REPOSITORY_URI=$AWS_ACCOUNT_ID.dkr.ecr.$AWS_DEFAULT_REGION.amazonaws.com/my-org/app
      - COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)
      - IMAGE_TAG=${COMMIT_HASH:=latest}
  build:
    commands:
      - echo Build started on `date`
      - echo Building the Docker image...
      - docker build -t $REPOSITORY_URI:latest .
      - docker tag $REPOSITORY_URI:latest $REPOSITORY_URI:$IMAGE_TAG
  post_build:
    commands:
      - echo Build completed on `date`
      - echo Pushing the Docker images...
      - docker push $REPOSITORY_URI:latest
      - docker push $REPOSITORY_URI:$IMAGE_TAG
      - echo Writing image detail file for CodeDeploy...
      # CodeDeploy uses imageDetail.json to map the new image URI to task definition
      - printf '{"ImageURI":"%s"}' $REPOSITORY_URI:$IMAGE_TAG > imageDetail.json

artifacts:
    files:
      - imageDetail.json
      - appspec.yaml
      - taskdef.json
```

### 2. `appspec.yaml`

CodeDeploy requires an AppSpec file to know which Task Definition and Container to update. Must create this file in the root of your repository alongside your `buildspec.yaml`.

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: "<TASK_DEFINITION>" # CodeDeploy will automatically replace this dynamically
        LoadBalancerInfo:
          ContainerName: "my-app-container" # IMPORTANT: This must match the container name in your taskdef.json exactly
          ContainerPort: 80 # Update this to the port your app actually listens on (e.g., 80, 8080, 3000)
```

*(Note: Do not hardcode `my-app-taskdef` in the `<TASK_DEFINITION>` placeholder above. Leave it exactly as `<TASK_DEFINITION>`. CodeDeploy dynamically injects the correct ARN during the pipeline run).*

### 3. `taskdef.json`

Need your task definition saved as a JSON file in your repository. You can get your current one by running:
`aws ecs describe-task-definition --task-definition my-app-taskdef --query taskDefinition > taskdef.json`

Make sure the container name in this JSON matches the `ContainerName` in your `appspec.yaml` (e.g., `"name": "my-app-container"`). You can leave the `"image"` field as a placeholder (like `"<IMAGE1_NAME>"`); CodeDeploy will overwrite it with the URI from your `imageDetail.json`.

### 4. Tying it together in CodePipeline

When you set up your AWS CodePipeline via the console:

1. **Source Stage:** Connect to GitHub/Bitbucket/CodeCommit.
2. **Build Stage:** Point it to your CodeBuild project. Ensure the output artifact is named something like `BuildArtifact`.
3. **Deploy Stage:** * **Action Provider:** Choose **Amazon ECS (Blue/Green)** (which uses CodeDeploy under the hood).
    - **Input Artifacts:** Select `BuildArtifact`.
    - **Amazon ECS cluster:** `my-cluster`
    - **Amazon ECS service:** `my-app-service`
    - **AppSpec file:** Choose `BuildArtifact`, and type `appspec.yaml`.
    - **Task Definition:** Choose `BuildArtifact`, and type `taskdef.json`.
    - **Dynamically update task definition image:** Choose `BuildArtifact`, and enter `IMAGE1_NAME` as the placeholder, and select `imageDetail.json` as the file.

---

## Lambda CI/CD Pipeline 

## Step 1: Create IAM Roles

Create the following IAM roles.

<details>
<summary><strong>1. Lambda Execution Role</strong></summary>

Create a role named:

```text
lab-lambda-role
```

Attach managed policy:

```text
AWSLambdaBasicExecutionRole
```

Purpose:

Allows Lambda to write logs to CloudWatch.

</details>

---

<details>
<summary><strong>2. CodeBuild Role</strong></summary>

Create:

```text
lab-codebuild-role
```

Attach the following custom policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:PutObject"
      ],
      "Resource": "arn:aws:s3:::lab-artifact-bucket-258109618781/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GitPull"
      ],
      "Resource": "arn:aws:codecommit:us-east-1:258109618781:lab-sample-repo"
    },
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:PublishVersion",
        "lambda:GetAlias"
      ],
      "Resource": "arn:aws:lambda:us-east-1:258109618781:function:lab-sample-lambda"
    }
  ]
}
```

Purpose:

* Pull source code from CodeCommit
* Package Lambda code
* Publish new Lambda versions
* Upload artifacts to S3

</details>

---

<details>
<summary><strong>3. CodeDeploy Role</strong></summary>

Create:

```text
lab-codedeploy-role
```

Attach AWS managed policy:

```text
AWSCodeDeployRoleForLambda
```

Additional S3 access:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion"
      ],
      "Resource": "arn:aws:s3:::lab-artifact-bucket-258109618781/*"
    }
  ]
}
```

</details>

---

<details>
<summary><strong>4. CodePipeline Role</strong></summary>

Create:

```text
lab-codepipeline-role
```

Attach the following policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketVersioning",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::lab-artifact-bucket-258109618781",
        "arn:aws:s3:::lab-artifact-bucket-258109618781/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GetBranch",
        "codecommit:GetCommit",
        "codecommit:GetUploadArchiveStatus",
        "codecommit:UploadArchive",
        "codecommit:GitPull"
      ],
      "Resource": "arn:aws:codecommit:us-east-1:258109618781:lab-sample-repo"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:BatchGetBuilds",
        "codebuild:StartBuild"
      ],
      "Resource": "arn:aws:codebuild:us-east-1:258109618781:project/lab-sample-build"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codedeploy:CreateDeployment",
        "codedeploy:GetDeployment",
        "codedeploy:GetDeploymentConfig",
        "codedeploy:GetApplicationRevision",
        "codedeploy:RegisterApplicationRevision",
        "codedeploy:GetApplication"
      ],
      "Resource": "*"
    }
  ]
}
```

</details>

---

## Step 2: Create an S3 Artifact Bucket

Create an S3 bucket.

```text
lab-artifact-bucket-258109618781
```

Purpose:

CodePipeline stores source code and build artifacts in this bucket.

---

## Step 3: Create the Lambda Function

Create a Lambda function.

```text
Name: lab-sample-lambda
Runtime: Python 3.9
Execution Role: lab-lambda-role
```

Sample code:

```python
def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello World"
    }
```

After creation:

1. Publish Version 1.
2. Create alias:

```text
Alias Name: live
Version: 1
```

The alias is important because CodeDeploy shifts traffic between versions using this alias.

---

## Step 4: Create a CodeCommit Repository

Create repository:

```text
lab-sample-repo
```

Clone it locally:

```bash
git clone <repository-clone-url>
cd lab-sample-repo
```

---

## Step 5: Add Lambda Source Code

Project structure:

```text
lab-sample-repo/
│
├── index.py
├── buildspec.yml
└── appspec.yml
```

---

## Step 6: Create buildspec.yml

This file tells CodeBuild what to do.

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.9

  build:
    commands:
      - echo "Getting current version..."
      - export CURRENT_VERSION=$(aws lambda get-alias --function-name lab-sample-lambda --name live --query "FunctionVersion" --output text)

      - echo "Current version is $CURRENT_VERSION"

      - echo "Packaging Lambda function..."
      - zip -r lambda.zip index.py

      - echo "Updating Lambda code and publishing version..."
      - aws lambda update-function-code --function-name lab-sample-lambda --zip-file fileb://lambda.zip --publish > result.json

      - export NEW_VERSION=$(jq -r '.Version' result.json)

      - echo "New version is $NEW_VERSION"

      - sed -i "s/CURRENT_VERSION/$CURRENT_VERSION/g" appspec.yml
      - sed -i "s/TARGET_VERSION/$NEW_VERSION/g" appspec.yml

artifacts:
  files:
    - appspec.yml
```

What happens here?

1. Read current Lambda alias version.
2. Package source code.
3. Update Lambda code.
4. Publish a new Lambda version.
5. Replace placeholders in `appspec.yml`.
6. Send deployment artifact to CodeDeploy.

---

## Step 7: Create appspec.yml

CodeDeploy uses this file to know what to deploy.

```yaml
version: 0.0

Resources:
  - myLambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: "lab-sample-lambda"
        Alias: "live"
        CurrentVersion: "CURRENT_VERSION"
        TargetVersion: "TARGET_VERSION"
```

During build:

```text
CURRENT_VERSION -> 1
TARGET_VERSION  -> 2
```

CodeDeploy then moves the alias from version 1 to version 2.

---

## Step 8: Create CodeBuild Project

Create project:

```text
Name: lab-sample-build
Source Provider: CodePipeline
Environment: Managed Image
Operating System: Amazon Linux
Runtime: Standard
Service Role: lab-codebuild-role
Artifacts: CodePipeline
```

No source repository needs to be specified because CodePipeline will supply it.

---

## Step 9: Create CodeDeploy Application

Create application.

```text
Name: lab-sample-deploy
Compute Platform: AWS Lambda
```

---

## Step 10: Create Deployment Group

Create deployment group.

```text
Name: lab-sample-dg
Application: lab-sample-deploy
Service Role: lab-codedeploy-role
Deployment Config:
CodeDeployDefault.LambdaAllAtOnce
```

Deployment style:

```text
Blue/Green
```

For production systems you may prefer:

```text
CodeDeployDefault.LambdaLinear10PercentEvery1Minute
```

or

```text
CodeDeployDefault.LambdaCanary10Percent5Minutes
```

---

## Step 11: Create CodePipeline

Create pipeline:

```text
Pipeline Name: lab-sample-pipeline
Role: lab-codepipeline-role
Artifact Store: lab-artifact-bucket-258109618781
```

Add stages:

## Source Stage

```text
Provider: AWS CodeCommit
Repository: lab-sample-repo
Branch: main
```

---

## Build Stage

```text
Provider: AWS CodeBuild
Project: lab-sample-build
```

---

## Deploy Stage

```text
Provider: AWS CodeDeploy
Application: lab-sample-deploy
Deployment Group: lab-sample-dg
```

Save pipeline.

---

## Step 12: Push Code

Commit and push.

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

The pipeline should start automatically.

---

## Step 13: Verify the Deployment

Open CodePipeline.

Expected flow:

```text
Source  -> Succeeded
Build   -> Succeeded
Deploy  -> Succeeded
```

Open Lambda.

You should see:

```text
Version 1
Version 2
Version 3
...
```

Alias:

```text
live -> latest deployed version
```

Invoke the Lambda:

```json
{
  "statusCode": 200,
  "body": "Hello from CI/CD Pipeline!"
}
```
---

# aws-ecs-service-connect-vs-discovery.md

---
title: "ECS Service Connect vs Cloud Map Service Discovery"
description: "When to use Service Connect vs Cloud Map, wiring, and common failure modes on ECS."
tags:
  - ecs
  - service-connect
  - cloud-map
  - service-discovery
  - aws
  - notes
date: 2026-09-12
---

# ECS Service Connect vs Service Discovery: A Practical Guide

When you run multiple services on Amazon ECS, they need a way to find each other. AWS offers two related but different mechanisms: **ECS Service Connect** and **ECS Service Discovery** (Cloud Map). They look similar in the console, but they solve different problems and fail in different ways.

This guide explains what each one does, when to choose which, how to wire them up, and the caveats that usually cause "nothing works" in real clusters.

---

## TL;DR

| | **Service Connect** | **Service Discovery (Cloud Map)** |
|---|---|---|
| **Best for** | Microservice-to-microservice HTTP/gRPC inside ECS | Any workload that needs a stable DNS name (ECS or not) |
| **DNS style** | Short names injected into task (`orders`, `payments`) | FQDN in a private zone (`my-service.my-namespace`) |
| **Proxy / mesh** | Yes - Envoy sidecar per task | No - plain DNS A/AAAA records |
| **Observability** | Built-in metrics, retries, outlier detection | DNS only |
| **Works across ECS only?** | Yes (same SC namespace) | Yes - any resource in the VPC can query DNS |

**Rule of thumb:** Use **Service Connect** when ECS services call each other by name and you want AWS-managed connectivity. Use **Service Discovery** when you need a DNS record that anything in the VPC can resolve - or when the caller is not part of Service Connect.

---

## What Is ECS Service Connect?

Service Connect is a **service mesh layer** built into ECS. When enabled on a service, ECS adds an **Envoy-based sidecar** (`ecs-service-connect-*` container) to each task.

That sidecar:

1. Registers the service in a Cloud Map **HTTP namespace**
2. Injects **DNS aliases** into the task (via `/etc/hosts` and local DNS)
3. Proxies traffic between services using the aliases you define

### Example topology

```
frontend-service  ──http://orders:8081──►  orders-service
orders-service    ──http://payments:8082──► payments-service
```

Each **server** service declares a client alias:

```json
{
  "portName": "orders-8081-tcp",
  "discoveryName": "orders",
  "clientAliases": [
    { "port": 8081, "dnsName": "orders" }
  ]
}
```

Each **client** service enables Service Connect on the **same namespace** but leaves `services: []` empty.

### Requirements

- Fargate platform 1.4+ or compatible EC2 capacity
- `awsvpc` network mode
- Named port mappings on the task definition (`name`, `appProtocol: http`)
- All communicating services in the **same Service Connect namespace**
- Service Connect enabled on **both** client and server services

---

## What Is ECS Service Discovery?

Service Discovery uses **AWS Cloud Map** to register task IP addresses and expose them as **DNS records** in a private hosted zone.

When you attach a service registry to an ECS service:

```
ecs-app-service.ecs-app  →  10.0.151.157
```

Any resource in the associated VPC that uses the VPC DNS resolver (`169.254.169.253` at `AmazonProvidedDNS`) can resolve that name - including ECS tasks, EC2 instances, and Lambda functions in the VPC.

Service Discovery does **not** add a sidecar. It does **not** proxy traffic. It is DNS + health-checked registration, full stop.

---

## When to Use Service Connect

Choose Service Connect when:

- **All callers are ECS services** in the same cluster/namespace
- You want **short, stable names** (`orders`, `payments`) instead of FQDNs
- You need **L7 features**: retries, timeouts, outlier detection, request metrics
- You are building an **internal microservice mesh** (API → API → API)
- You use **HTTP or gRPC** and port names are already on your task definitions

### Good fit

- Frontend → Orders → Payments chain on Fargate
- Internal REST/gRPC APIs with no public load balancer
- Replacing hard-coded IPs or manual `/etc/hosts` entries

### Poor fit

- Legacy apps outside ECS that cannot use Service Connect DNS injection
- Non-HTTP protocols where SC's L7 proxy adds no value
- Services that must be reachable by name from on-prem over VPN without ECS involvement

---

## When to Use Service Discovery

Choose Service Discovery when:

- Callers may **not** have Service Connect enabled (mixed environments)
- You need a **real DNS name** in Route 53 (`service.namespace`)
- The workload is registered from ECS but consumed by **other VPC resources**
- You already have an **ALB/NLB** and only need stable backend discovery
- You want the simplest possible "give me a DNS name for this task IP" setup

### Good fit

- Pipeline-deployed app reachable at `ecs-app-service.ecs-app:8000`
- Shared services consumed by ECS, batch jobs, and EC2 in the same VPC
- Gradual migration: old apps use Cloud Map DNS while new apps adopt Service Connect

### Poor fit

- You need automatic retries, circuit breaking, or per-route metrics (use SC or add app-level logic)
- You expect DNS to update in running containers without redeploying clients (same limitation as SC for dynamic discovery)

---

## How to Set Up Service Connect (Step by Step)

### 1. Create a Cloud Map HTTP namespace

In the ECS console or CLI, create a namespace (e.g. `my-app`, type **HTTP**). Service Connect uses this as its registry.

```bash
aws servicediscovery create-http-namespace --name my-app --region us-east-1
```

### 2. Define named port mappings on task definitions

Port mappings must have a **name** and **appProtocol**:

```json
{
  "containerPort": 8081,
  "hostPort": 8081,
  "protocol": "tcp",
  "name": "orders-8081-tcp",
  "appProtocol": "http"
}
```

The `portName` in Service Connect config must match this name exactly.

### 3. Enable Service Connect on the server service

For `orders-service`:

```bash
aws ecs update-service \
  --cluster ecs-app-cluster \
  --service orders-service \
  --task-definition orders:4 \
  --service-connect-configuration file://sc-orders.json \
  --force-new-deployment
```

`sc-orders.json`:

```json
{
  "enabled": true,
  "namespace": "arn:aws:servicediscovery:REGION:ACCOUNT:namespace/ns-xxxxx",
  "services": [
    {
      "portName": "orders-8081-tcp",
      "discoveryName": "orders",
      "clientAliases": [
        { "port": 8081, "dnsName": "orders" }
      ]
    }
  ]
}
```

### 4. Enable Service Connect on client services

For `frontend-service` (client only):

```json
{
  "enabled": true,
  "namespace": "arn:aws:servicediscovery:REGION:ACCOUNT:namespace/ns-xxxxx",
  "services": []
}
```

### 5. Deploy in the right order

1. Deploy **server** services first (orders, payments)
2. Wait until they are stable
3. Deploy **client** services last (frontend)

See caveats below - order matters.

### 6. Verify from inside a task

```bash
aws ecs execute-command \
  --cluster ecs-app-cluster \
  --task TASK_ID \
  --container frontend \
  --interactive \
  --command '/bin/sh'
```

Inside the container:

```sh
cat /etc/hosts          # should list orders, payments
curl http://orders:8081/
curl http://payments:8082/
```

---

## How to Set Up Service Discovery (Step by Step)

### 1. Create a Cloud Map private DNS namespace

Type **DNS_PRIVATE**, associated with your VPC (e.g. namespace `ecs-app`).

```bash
aws servicediscovery create-private-dns-namespace \
  --name ecs-app \
  --vpc VPC_ID \
  --region us-east-1
```

### 2. Create a Cloud Map service

Note the **service name** - it becomes the left part of the DNS record.

- Service name: `ecs-app-service`
- Full DNS: `ecs-app-service.ecs-app`

### 3. Attach the registry to your ECS service

```bash
aws ecs create-service \
  --cluster ecs-app-cluster \
  --service-name ecs-app-td-service \
  --task-definition ecs-app-td:4 \
  --service-registries registryArn=arn:aws:servicediscovery:...:service/srv-xxxxx \
  ...
```

Or in the console: **Service discovery** → select namespace + service name during service creation.

### 4. Verify DNS from any task in the VPC

```sh
nslookup ecs-app-service.ecs-app
curl http://ecs-app-service.ecs-app:8000/health
```

### 5. Match the name your app expects

If your code or docs say `ecs-service-app.ecs-app` but Cloud Map registered `ecs-app-service`, DNS will fail with **NXDOMAIN**. The fix is either rename the Cloud Map service or update the client.

---

## Common Caveats (Read These First)

### 1. Service Connect DNS is injected at startup - not live-updated

This is the most common production surprise.

Service Connect writes aliases to `/etc/hosts` (and related config) when the **task starts**. If a client task starts **before** a server registers its alias, the client will **not** see that name until it is **redeployed**.

**Symptom:** `socket.gaierror: Name or service not known` or `curl: (6) Could not resolve host`.

**Fix:** Force a new deployment on **client** services after all server services are healthy:

```bash
aws ecs update-service --cluster CLUSTER --service frontend-service --force-new-deployment
```

**Prevention:** Deploy servers first, clients last. In CloudFormation/Terraform, use explicit dependencies.

Reference: [AWS containers-roadmap #2692](https://github.com/aws/containers-roadmap/issues/2692)

---

### 2. Client alias must match what your app calls

Service Connect registers exactly the `dnsName` you configure - not what you wish you configured.

| Configured alias | App env var | Result |
|---|---|---|
| `payments.my-app` | `PAYMENTS_HOST=payments` | **Fails** |
| `payments` | `PAYMENTS_HOST=payments` | **Works** |
| `orders` | `ORDERS_HOST=orders` | **Works** |

Always align `clientAliases[].dnsName` with `ORDERS_HOST`, `PAYMENTS_HOST`, or hard-coded URLs in code.

---

### 3. `portName` must match the task definition port mapping name

Task definition:

```json
"name": "payments-8082-tcp"
```

Service Connect config must use the same string:

```json
"portName": "payments-8082-tcp"
```

A typo like `payments-8081-tcp` for container port 8082 will break registration silently or fail deployment validation.

---

### 4. Do not mix up namespace types

| Namespace type | Used by | DNS behaviour |
|---|---|---|
| **HTTP** | Service Connect | Aliases in task `/etc/hosts`, not Route 53 |
| **DNS_PRIVATE** | Service Discovery | Route 53 records in VPC (`*.namespace`) |

Using a DNS_PRIVATE namespace for Service Connect (or vice versa) leads to confusing failures. Keep them separate unless you know exactly what you are doing.

---

### 5. Service Discovery name ≠ ECS service name

Cloud Map service name defines DNS, not the ECS service name.

- ECS service: `ecs-app-td-service-tajcbsjq`
- Cloud Map service: `ecs-app-service`
- DNS: `ecs-app-service.ecs-app`

The random suffix on the ECS service name is irrelevant to DNS.

---

### 6. Both require network prerequisites

- Tasks in **same VPC** (or peered VPCs with DNS resolution enabled)
- **Security groups** must allow traffic on target ports between tasks
- Private subnets need **NAT** (or VPC endpoints) for image pull - unrelated to SC but often confused with "networking broken"
- VPC **enableDnsSupport** and **enableDnsHostnames** should be true for Service Discovery

---

### 7. Service Connect does not replace a load balancer for public traffic

Internal mesh:

```
frontend ──SC──► orders ──SC──► payments   ✅
```

Public browser access:

```
Internet ──???──► frontend   ❌ (no ALB attached)
```

Attach an ALB/NLB to services that need external ingress. Service Connect handles **east-west** traffic inside the mesh.

---

### 8. Health checks and base images matter

If you use container health checks with `curl`, the binary must exist in the image. `python:3.14-slim` does not include `curl`; `python:3.14` does.

Failed health checks cause task churn and can interrupt Service Connect registration timing - which feeds back into caveat #1.

---

### 9. Logging and debugging

- Service Connect sidecar logs go to the log group configured on the **service** SC config (e.g. `/ecs/frontend-service`)
- Application logs go to the task definition `logConfiguration`
- If the app container has no log config, you only see Envoy logs - not Flask/app errors

Enable app logging on every task definition you need to debug.

---

### 10. ECS Exec requires extra setup

Interactive debugging (`aws ecs execute-command`) needs:

- SSM Session Manager plugin on your machine
- `enableExecuteCommand: true` on the service
- Task role + execution role permissions for SSM

Without Exec, you are limited to CloudWatch logs and `describe-*` API calls.

---

## Use Case Matrix

| Scenario | Recommended approach |
|---|---|
| 3 Flask microservices calling each other on Fargate | **Service Connect** |
| CodePipeline app reachable from other VPC services by DNS | **Service Discovery** |
| Service A (ECS) calls Service B (ECS) with retries/timeouts | **Service Connect** |
| Lambda in VPC calls an ECS backend | **Service Discovery** (or ALB) |
| Public web app + internal APIs | **ALB** for public + **Service Connect** for internal |
| Multi-cluster or cross-account calls | **Cloud Map DNS** or **ALB** - SC namespace is per-cluster |
| gRPC between ECS services | **Service Connect** with `appProtocol: grpc` |

---

## Reference Architecture (Combined)

It is normal to use **both** in one cluster:

```
┌─────────────────────────────────────────────────────────────┐
│                     ecs-app-cluster                         │
│                                                             │
│  Service Connect namespace: my-app (HTTP)                   │
│  ┌──────────┐    SC     ┌──────────┐    SC    ┌──────────┐│
│  │ frontend │ ────────► │  orders  │ ───────► │ payments ││
│  └──────────┘           └──────────┘          └──────────┘│
│                                                             │
│  Service Discovery namespace: ecs-app (DNS_PRIVATE)         │
│  ┌──────────────────────┐                                 │
│  │ ecs-app-td-service     │  DNS: ecs-app-service.ecs-app   │
│  └──────────────────────┘                                 │
└─────────────────────────────────────────────────────────────┘
```

Microservices talk via **short SC names**. The pipeline app is reachable via **Cloud Map FQDN** from anywhere in the VPC.

---

## Deployment Checklist

Before declaring Service Connect "working":

- [ ] HTTP namespace created
- [ ] All services use named port mappings with `appProtocol`
- [ ] Server services have correct `clientAliases` (`dnsName` + `port`)
- [ ] Client services have SC enabled, same namespace, `services: []`
- [ ] App env vars match `dnsName` values
- [ ] Server services deployed and stable **before** clients
- [ ] Client services force-redeployed after servers exist
- [ ] Security groups allow ports 8080/8081/8082 (or your ports)
- [ ] `cat /etc/hosts` inside client task shows expected entries
- [ ] `curl http://orders:PORT/` works from client container
- [ ] ALB attached if external access is required

Before declaring Service Discovery "working":

- [ ] DNS_PRIVATE namespace associated with correct VPC
- [ ] Cloud Map service name matches what clients call
- [ ] ECS service has `serviceRegistries` attached
- [ ] Route 53 record visible: `aws route53 list-resource-record-sets --hosted-zone-id ZONE_ID`
- [ ] `nslookup your-service.your-namespace` resolves from a VPC task
- [ ] Security groups allow traffic on the target port

---

## Quick Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Name or service not known` for SC name | Client task started before server registered | Redeploy client service |
| `Name or service not known` for FQDN | Wrong Cloud Map service name | Fix name or update client URL |
| SC config looks right, still fails | `dnsName` mismatch with app env | Align alias and env vars |
| Tasks cycle unhealthy | Health check uses missing `curl` | Use full base image or install curl |
| DNS resolves, connection refused | Security group or wrong port | Open SG; verify containerPort |
| Works task-to-task by IP, not by name | SC not enabled on client or server | Enable SC on both sides |
| External users cannot reach service | No load balancer | Attach ALB/NLB |

---

## Further Reading

- [Amazon ECS Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html)
- [Using service discovery](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)
- [Troubleshoot Service Connect (AWS re:Post)](https://repost.aws/knowledge-center/ecs-troubleshoot-service-connect)
- [Service Connect dynamic /etc/hosts feature request](https://github.com/aws/containers-roadmap/issues/2692)

---

*Based on a real ECS Fargate setup: `frontend-service` → `orders-service` → `payments-service` (Service Connect) and `ecs-app-td-service` (Service Discovery on `ecs-app-service.ecs-app`).*

---

# aws-elasticache-valkey-lambda.md

---
title: "ElastiCache for Valkey: Lambda Caching Pattern"
description: "Cache-aside with Lambda, ElastiCache for Valkey, and DynamoDB - VPC setup, TLS client, TTL keys, invalidation, and advanced caching patterns."
tags:
  - elasticache
  - valkey
  - lambda
  - dynamodb
  - caching
  - redis
  - aws
  - notes
date: 2026-08-24
---

## Overview

Cache product reads in **Amazon ElastiCache for Valkey** so Lambda does not hit **DynamoDB** on every request. On a cache miss, load from the database, store in Valkey with a TTL, then return.

```text
Client
   │
   ▼
API Gateway / ALB
   │
   ▼
Lambda (VPC - private subnet)
   │
   ├──────── Cache HIT ───────► ElastiCache for Valkey
   │
   └──────── Cache MISS
              │
              ▼
           DynamoDB  (via Gateway endpoint)
              │
              ▼
         Populate cache → return
```

**Example API**

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/products/{id}` | Cache-aside by `product:{id}` |
| `GET` | `/products?category=electronics` | Cache-aside by `category:{name}` |
| `PUT` | `/products/{id}` | Write DynamoDB, invalidate cache keys |
| `DELETE` | `/products/{id}` | Delete DynamoDB, invalidate cache key |

**Reference implementation:** [`dir/valkey/valkey-lambda-dynamdb.py`](./dir/valkey/valkey-lambda-dynamdb.py)

---

## Valkey basics (what you store)

Valkey is a **key/value** store. Values are usually JSON strings.

| Concept | Example in this pattern |
| --- | --- |
| Namespaced keys | `product:123`, `category:electronics` |
| TTL | `EX 300` → expire after 5 minutes |
| Serialization | `json.dumps()` on write, `json.loads()` on read |
| TLS | Required in transit for ElastiCache Serverless / encryption in transit |

**Key naming convention**

```text
product:123
category:electronics:page:1
user:456:preferences
```

Keep keys predictable - your invalidation logic depends on them.

---

## Infrastructure setup

Lambda runs in a **VPC private subnet** to reach Valkey. DynamoDB is a public AWS API, so add a **DynamoDB Gateway VPC endpoint** (no NAT required for DynamoDB traffic).

### 1. Subnets

| Subnet | Purpose |
| --- | --- |
| **Private subnet A** | Lambda ENI, ElastiCache subnet group |
| **Private subnet B** | Second AZ for ElastiCache multi-AZ (recommended) |

Lambda and Valkey must be in subnets that can route to each other inside the VPC.

### 2. Security groups (use separate SGs)

| Security group | Attached to | Inbound | Outbound |
| --- | --- | --- | --- |
| `sg-lambda` | Lambda | - | TCP `6379` → `sg-valkey` |
| `sg-valkey` | ElastiCache cluster | TCP `6379` from `sg-lambda` | - |

Rule of thumb: **only Lambda SG can talk to Valkey on 6379**. Do not expose Valkey to `0.0.0.0/0`.

### 3. ElastiCache for Valkey

| Setting | Value |
| --- | --- |
| Engine | Valkey |
| Subnet group | Private subnets above |
| Security group | `sg-valkey` |
| Port | `6379` (default) |
| Encryption in transit | Enabled (TLS) |

Note the **primary endpoint** hostname - Lambda uses it as `VALKEY_ENDPOINT`.

### 4. DynamoDB Gateway endpoint

Create a **Gateway** endpoint for `com.amazonaws.<region>.dynamodb` and associate it with the **private route tables** used by Lambda subnets.

Without this, a VPC Lambda cannot reach DynamoDB unless you add a NAT Gateway.

### 5. Lambda configuration

| Setting | Value |
| --- | --- |
| VPC | Private subnets |
| Security group | `sg-lambda` |
| Layer / package | `redis` (or `valkey-glide`) in deployment package |
| Env vars | `VALKEY_ENDPOINT`, `DYNAMODB_TABLE` |

Environment variables:

```bash
VALKEY_ENDPOINT=my-cluster.xxxxxx.use1.cache.amazonaws.com
VALKEY_PORT=6379
DYNAMODB_TABLE=ProductsTable
```

### 6. Python client (TLS)

```python
import os
import redis

cache = redis.Redis(
    host=os.environ.get("VALKEY_ENDPOINT"),
    port=int(os.environ.get("VALKEY_PORT", 6379)),
    ssl=True,
    ssl_cert_reqs="required",
    decode_responses=True,
    # socket_timeout=2,
    # socket_connect_timeout=2,
)
```

---

## Cache-aside - worked example

**Request:** `GET /products/123`

Think of it as a short conversation between Lambda and Valkey:

```text
Lambda:  GET product:123
Valkey:  (nil)          ← miss

Lambda:  read DynamoDB id=123
Lambda:  SET product:123 <json> EX 300
Lambda:  return product to client
```

**Next request (within 5 minutes):**

```text
Lambda:  GET product:123
Valkey:  {"id":"123",...}   ← hit
Lambda:  return immediately (no DynamoDB call)
```

### Step-by-step

1. Build key: `product:123`
2. `GET product:123` from Valkey
3. **HIT** → parse JSON, return `{ "source": "cache", ... }`
4. **MISS** → `GetItem` from DynamoDB
5. `SETEX product:123 300 <json>`
6. Return `{ "source": "db", ... }`

### Category query example

`GET /products?category=electronics`

```text
Key:     category:electronics
Miss:    Query GSI category-index on DynamoDB
Set:     SETEX category:electronics 300 <items-json>
```

On `PUT` or `DELETE`, delete related keys so clients never see stale data:

```text
PUT /products/123  →  DEL product:123, category:electronics
DELETE /products/123  →  DEL product:123
```

---

## Code walkthrough

[`dir/valkey/valkey-lambda-dynamdb.py`](./dir/valkey/valkey-lambda-dynamdb.py) implements the pattern above.

| Function | What it does |
| --- | --- |
| `cache_get` / `cache_set` / `cache_delete` | Thin wrappers; failures degrade gracefully (skip cache) |
| `get_product` | Cache-aside for `product:{id}` |
| `get_by_category` | Cache-aside for `category:{name}` |
| `put_product` | DynamoDB write + invalidate product and category keys |
| `delete_product` | DynamoDB delete + invalidate product key |
| `lambda_handler` | Routes `GET` / `PUT` / `DELETE` by path and query |

**TTL:** `cache_set` uses `setex(key, 300, ...)` - 5 minutes.

**Warm start:** `redis.Redis(...)` and `boto3.resource('dynamodb')` are created at module scope so subsequent invocations reuse connections.

---

## Advanced patterns (when to level up)

### Distributed lock (thundering herd)

Many concurrent misses on the same hot key can all hit DynamoDB at once. Use a short-lived lock:

```text
GET product:123  →  miss
SET lock:product:123 NX EX 10   ← only one winner

Winner:  read DB → populate cache → DEL lock
Losers:  wait/retry GET product:123
```

### Stale-while-revalidate

Serve slightly old data to protect the database under load.

| Window | Behavior |
| --- | --- |
| **Fresh** (0–5 min) | Return cached value |
| **Stale** (5–7 min) | Return stale value + refresh in background |
| **Expired** (>7 min) | Block on backend fetch |

Example TTL split: fresh **5 min**, stale window **+2 min**.

### Hot key mitigation

Add a local in-process cache (LRU) in front of Valkey for keys hit thousands of times per second:

```text
Request → in-memory cache → Valkey → DynamoDB
```

### Read-through vs cache-aside

| Pattern | Who loads on miss? |
| --- | --- |
| **Cache-aside** (this note) | Your application code |
| **Read-through** | Caching layer calls a loader automatically |

Cache-aside gives you full control; read-through reduces boilerplate in large apps.

### Write strategies

| Strategy | Flow | Best when |
| --- | --- | --- |
| **Write-around** | Write DB only; invalidate or ignore cache | Data rarely read after write |
| **Write-through** | Write cache, then DB | Next read must see new value immediately |
| **Write-behind** | Write cache, return; async worker persists to DB | High write throughput, brief durability lag OK |

This Lambda sample uses **write-around + explicit invalidation** on `PUT`/`DELETE`.

---

## Quick test checklist

1. Deploy Valkey in private subnets; confirm TLS endpoint.
2. Deploy Lambda in same VPC with `sg-lambda` → `sg-valkey` on port 6379.
3. Add DynamoDB Gateway endpoint to private route tables.
4. `GET /products/123` twice - first response `"source": "db"`, second `"source": "cache"`.
5. `PUT /products/123` - next `GET` should miss cache and reload from DynamoDB.

---

## Notes

- **Env var naming:** The sample code reads port from `VALKEY_HOST`; use `VALKEY_PORT` in new deployments for clarity.
- **Cache failures:** `cache_get` / `cache_set` swallow errors and fall back to DynamoDB - good for resilience, but log failures in production.
- **Category cache:** Invalidating `category:{name}` on every product update avoids stale list results; tune if categories are huge.
- **Serverless Valkey:** Same client pattern; ensure Lambda SG can reach the serverless cache endpoint on 6379 with TLS.

---

# aws-eventbridge-patterns.md

---
title: "Amazon EventBridge Integration Patterns"
description: "EventBridge rules, event patterns, input transformers, archive/replay, pipes, scheduler, and DLQs."
tags:
- eventbridge
- serverless
- aws

- sqs
- dynamodb
---

## Overview

EventBridge is the **event bus** layer: producers publish events; **rules** match **event patterns** and route to **targets** (Lambda, SQS, SNS, Step Functions, API destinations, etc.).


| Feature               | Use when                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **Rules + event bus** | Route events between AWS services or custom apps on a bus                                  |
| **Input transformer** | Reshape event JSON before it hits the target                                               |
| **Archive & replay**  | Store events and replay them for testing or recovery                                       |
| **Pipes**             | Point-to-point integration with optional filtering/enrichment (e.g. DynamoDB stream → SQS) |
| **Scheduler**         | Cron/rate schedules that invoke targets (one-off or recurring)                             |
| **DLQ (SQS)**         | Capture events a target failed to process                                                  |


See also: [Lambda event pipeline](/aws-lambda-event-pipeline/) and [serverless order pipeline](/aws-serverless-sam-guide/) for end-to-end examples.

---

## Event pattern operators

Rules filter events with JSON **event patterns**. Values are usually arrays - a match if **any** value matches.

```json
{
  "source": ["aws.ec2", "aws.fargate"],
  "detail-type": ["EC2 Instance State-change Notification"]
}
```

**Common operators** (full list in [AWS docs](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-pattern-operators.html)):


| Operator       | Matches when                                   |
| -------------- | ---------------------------------------------- |
| *(default)*    | Field equals one of the values in the array    |
| `prefix`       | String starts with prefix                      |
| `suffix`       | String ends with suffix                        |
| `anything-but` | Value is **not** in the list                   |
| `numeric`      | Number comparisons (`=`, `<`, `>`, `<=`, `>=`) |
| `cidr`         | IP in CIDR range                               |
| `exists`       | Field present (`true`) or absent (`false`)     |


**Example - exclude test events:**

```json
{
  "source": [{ "anything-but": ["aws.test"] }]
}
```

### Pattern gotchas

**Dot notation** - EventBridge joins nested keys with `.` when compiling patterns. These two patterns are **equivalent**:

```json
{ "detail": { "state": { "status": ["running"] } } }
```

```json
{ "detail": { "state.status": ["running"] } }
```

Both match events whether the payload uses nested objects or flat dotted keys. Do not rely on this behavior staying identical forever - prefer one style consistently.

**Duplicate keys** - Invalid in practice. If a pattern repeats a key, EventBridge keeps only the **last** value:

```json
{
  "source": ["aws.s3"],
  "source": ["aws.sns"]
}
```

Behaves the same as `"source": ["aws.sns"]`.

---

## Input transformer

Reshape the event payload sent to a target without writing a Lambda in between.

**Where:** Rule → Target → **Input transformer**


| Field              | Purpose                                                  |
| ------------------ | -------------------------------------------------------- |
| **Input paths**    | JSON map of placeholder names → JSONPath expressions     |
| **Input template** | Output shape; use `<placeholder>` for substituted values |


**Example**

Sample event (optional, for testing in console):

```json
{
  "detail": {
    "instance-id": "i-0123456789",
    "state": "RUNNING"
  }
}
```

Input paths:

```json
{
  "instance": "$.detail.instance-id",
  "state": "$.detail.state"
}
```

Template:

```json
{
  "instance": <instance>,
  "state": <state>
}
```

Output delivered to target:

```json
{
  "instance": "i-0123456789",
  "state": "RUNNING"
}
```

---

## Archive and replay

Use archives to **store** matching events and **replay** them later (debugging, backfills, demos).

### Steps

1. **Create an archive** - name it, pick the event bus, optional event pattern filter.
2. **Capture events** - archive uses its own rule; you can also attach a rule to the same pattern. Send a test event to verify.
3. **Replay** - pick archive, set start/end time window, start replay (events re-injected onto the bus).

### Send a test event (console)

1. EventBridge → **Event buses** → Default bus → **Actions** → **Send events**
2. Event source: `TestEvent`
3. Detail type: `customerCreated`
4. Event detail: `{}`
5. **Send**

### Start a replay (console)

1. EventBridge → **Replays** → **Start new replay**
2. Name: e.g. `ReplayTest`
3. Source: your archive
4. Time frame: start **before** test events were sent; end = now
5. **Start replay**

[Tutorial: archive and replay](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-tutorial-archive-replay.html)

---

## EventBridge Pipes

**Pipe** = single-source, single-target integration with optional filter, enrichment, and input transformation.


| vs Rules                | Pipes                                                         |
| ----------------------- | ------------------------------------------------------------- |
| Many targets per rule   | One source → one target                                       |
| Event bus in the middle | Direct connect (lower latency, simpler for streaming sources) |


**Common source:** DynamoDB streams, Kinesis, SQS, MQ.

**Shortcut:** DynamoDB stream → filter → SQS (no Lambda poller boilerplate).

**Quick example (SAM)** - stream on table, pipe to queue:

```yaml
OrderPipe:
  Type: AWS::Pipes::Pipe
  Properties:
    Name: order-ddb-to-sqs
    RoleArn: !GetAtt PipeRole.Arn
    Source: !GetAtt OrdersTable.StreamArn
    SourceParameters:
      DynamoDBStreamParameters:
        StartingPosition: LATEST
        BatchSize: 10
      FilterCriteria:
        Filters:
          - Pattern: '{"eventName": ["INSERT"]}'
    Target: !GetAtt OrderQueue.Arn
```

`PipeRole` needs trust for `pipes.amazonaws.com` plus `dynamodb:DescribeStream`, `dynamodb:GetRecords`, `dynamodb:GetShardIterator`, `dynamodb:ListStreams`, and `sqs:SendMessage` on the queue.

[Tutorial: DynamoDB stream to SQS](https://docs.aws.amazon.com/eventbridge/latest/userguide/pipes-tutorial-create-dynamodb-sqs.html)

---

## EventBridge Scheduler

Managed **cron/rate** scheduling that invokes targets directly (Lambda, SQS, SNS, EventBridge bus, etc.).


| vs CloudWatch Events / old rules | Scheduler                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| Rule on default bus              | Dedicated scheduler with flexible windows, time zones, one-off schedules |
| Good for event routing           | Good for **when** to fire, not **what** matched on the bus               |


Use Scheduler when you need recurring jobs or one-time delayed invocations without maintaining EventBridge rules on a cron pattern.

---

## Dead-letter queue (DLQ)

When a target fails after retries, EventBridge can send the failed event to an **SQS standard queue**.


| Rule       | Detail                                                          |
| ---------- | --------------------------------------------------------------- |
| Queue type | **Standard SQS only** - FIFO is not supported                   |
| Permission | EventBridge service principal must be allowed `sqs:SendMessage` |


**Queue policy snippet** (replace account, queue, rule ARNs):

```json
{
  "Sid": "Dead-letter queue permissions",
  "Effect": "Allow",
  "Principal": {
    "Service": "events.amazonaws.com"
  },
  "Action": "sqs:SendMessage",
  "Resource": "arn:aws:sqs:us-west-2:123456789012:MyEventDLQ",
  "Condition": {
    "ArnEquals": {
      "aws:SourceArn": "arn:aws:events:us-west-2:123456789012:rule/MyTestRule"
    }
  }
}
```

**Configure on rule:** Target → **Dead-letter queue** → select the SQS queue.


## EventBridge CLI Commands
Ref: https://docs.aws.amazon.com/cli/v1/userguide/cli_eventbridge_code_examples.html

List Rules
```bash
aws events list-rules
```

Put Rule
```bash
aws events put-rule --name "xyz-auto-recover-rule" --event-pattern "{\"detail-type\":[\"EC2 Instance State-change Notification\"],\"source\":[\"aws.ec2\"],\"detail\":{\"state\":[\"terminated\"]}}"
```

Put Target
```bash
aws events put-targets --rule "xyz-auto-recover-rule" --targets "Id"="1","Arn"="arn:aws:lambda:us-east-1:643461123615:function:xyz-auto-recover"
```
---

# aws-iam-policies-triage.md

---
title: "IAM Policies: Examples and Triage Guide"
description: "Copy-paste trust, identity, resource, boundary, SCP, session, and VPC endpoint policies with a rapid troubleshooting checklist."
tags:
  - iam
  - policies
  - security
  - kms
  - s3
  - sqs
  - sns
  - aws
---
## How to use

1. Identify the **service** (S3, SQS, SNS, KMS, STS, EC2, VPC endpoints, Organizations).
2. Decide the **policy type**: identity, resource, trust, or guardrail (boundary, SCP, session, endpoint).
3. Run the **rapid triage checklist** at the bottom before editing anything.

## Policy types

### 1) Identity-based policy (User/Group/Role permissions)

- Attached to IAM user/group/role
- Grants/denies API actions

### 2) Resource-based policy (resource permissions)

Common examples:

- S3 bucket policy
- SNS topic policy
- SQS queue policy
- KMS key policy
- Lambda permission policy (AddPermission)

### 3) Trust policy (AssumeRole policy)

- Controls **who can assume** a role
- Very common trick: correct principal but wrong condition (ExternalId/MFA/OIDC claims)

### 4) Permissions boundary

- Caps maximum permissions for a principal
- Common “why is my Allow not working?” cause

### 5) SCP (Service Control Policy) (Organizations)

- Org/OU/account-level deny guardrail
- **Deny wins** over everything

### 6) Session policy (AssumeRole session)

- Passed during AssumeRole; further restricts the session

### 7) VPC endpoint policy

- Restricts what can pass through an endpoint (Gateway or Interface)

### 8) KMS grants

- Temporary delegated permissions; common in services that need to use a CMK

## Policy blocks (copy/paste)

### A) Trust policies (AssumeRole)

#### A1) Cross-account trust (basic)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeFromAccount",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

#### A2) Trust with ExternalId

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeWithExternalId",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::111122223333:role/competitor-runner" },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": { "sts:ExternalId": "challenge-external-id" }
      }
    }
  ]
}
```

#### A3) Deny AssumeRole unless MFA present

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAssumeWithoutMfa",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sts:AssumeRole",
      "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
    }
  ]
}
```

### B) S3 bucket policy blocks

#### B1) Enforce TLS (deny non-HTTPS)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

#### B2) Restrict to a VPC endpoint (gateway endpoint)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyViaVpce",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": ["arn:aws:s3:::BUCKET", "arn:aws:s3:::BUCKET/*"],
      "Condition": { "StringNotEquals": { "aws:sourceVpce": "vpce-xxxxxxxx" } }
    }
  ]
}
```

#### B3) Require SSE-KMS on PutObject

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnencryptedUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET/*",
      "Condition": {
        "StringNotEquals": { "s3:x-amz-server-side-encryption": "aws:kms" }
      }
    }
  ]
}
```

### C) SNS topic policy blocks

#### C1) Allow S3 to publish to SNS (with SourceArn + SourceAccount)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3Publish",
      "Effect": "Allow",
      "Principal": { "Service": "s3.amazonaws.com" },
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:REGION:ACCOUNT_ID:TOPIC",
      "Condition": {
        "StringEquals": { "aws:SourceAccount": "ACCOUNT_ID" },
        "ArnLike": { "aws:SourceArn": "arn:aws:s3:::BUCKET" }
      }
    }
  ]
}
```

### D) SQS queue policy blocks

#### D1) Allow receive/delete for a role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowConsumerRole",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:role/consumer-role" },
      "Action": [
        "sqs:GetQueueUrl",
        "sqs:GetQueueAttributes",
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:ChangeMessageVisibility"
      ],
      "Resource": "arn:aws:sqs:REGION:ACCOUNT_ID:QUEUE"
    }
  ]
}
```

#### D2) Require TLS for SQS (deny non-HTTPS)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "sqs:*",
      "Resource": "arn:aws:sqs:REGION:ACCOUNT_ID:QUEUE",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

### E) KMS key policy blocks

#### E1) Allow an IAM role to use the key

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRoleUseKey",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:role/app-role" },
      "Action": [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey"
      ],
      "Resource": "*"
    }
  ]
}
```

#### E2) Allow CreateGrant for AWS resources

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowGrantForAwsResource",
      "Effect": "Allow",
      "Principal": { "AWS": "arn:aws:iam::ACCOUNT_ID:role/app-role" },
      "Action": ["kms:CreateGrant", "kms:ListGrants", "kms:RevokeGrant"],
      "Resource": "*",
      "Condition": { "Bool": { "kms:GrantIsForAWSResource": "true" } }
    }
  ]
}
```

### F) Permissions boundary patterns

#### F1) Allow role creation only when boundary is attached

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCreateRoleWithBoundaryOnly",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:PutRolePermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT_ID:policy/BoundaryPolicy"
        }
      }
    }
  ]
}
```

### G) SCP blocks (Org guardrails)

#### G1) Deny disabling CloudTrail

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyDisableCloudTrail",
      "Effect": "Deny",
      "Action": ["cloudtrail:StopLogging", "cloudtrail:DeleteTrail", "cloudtrail:UpdateTrail"],
      "Resource": "*"
    }
  ]
}
```

#### G2) Deny S3 public ACLs

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPublicAcls",
      "Effect": "Deny",
      "Action": ["s3:PutBucketAcl", "s3:PutObjectAcl"],
      "Resource": "*",
      "Condition": {
        "StringEquals": { "s3:x-amz-acl": ["public-read", "public-read-write", "authenticated-read"] }
      }
    }
  ]
}
```

## Rapid triage checklist

- [ ]  Confirm identity: `aws sts get-caller-identity`
- [ ]  Check explicit **Deny** (IAM, bucket/queue/topic policy, SCP, permission boundary)
- [ ]  If AssumeRole: trust policy principal + conditions (ExternalId/MFA/OIDC)
- [ ]  If resource access: resource policy + KMS key policy (if encrypted)
- [ ]  If in VPC: endpoint policy + DNS + SG/NACL return traffic
- [ ]  Validate by simulating: IAM Policy Simulator (when available)
---

# aws-iam-policy-conditions.md

---
title: "IAM Policy Conditions Reference"
description: "Common IAM policy condition keys and copy-paste examples for S3 encryption, date/time, tags, IP, MFA, region, and other scenarios."
tags:
  - iam
  - policies
  - conditions
  - s3
  - security
  - aws
---

## Overview

IAM policies evaluate **Effect**, **Action**, **Resource**, and optionally **Condition**. On  condition blocks are the differentiator - same Allow/Deny structure, different keys.

**Evaluation order (simplified):**

1. Explicit **Deny** always wins.
2. **Allow** applies only if no matching Deny exists.
3. Default is implicit deny.

See also the broader [IAM Policy Examples and Triage Guide](/aws-iam-policies-triage/) for trust policies, SCPs, boundaries, and service-specific blocks.

## Condition operators (quick reference)

| Operator | Use when |
| --- | --- |
| `StringEquals` / `StringNotEquals` | Exact string match (region, tag value, encryption header) |
| `StringLike` / `StringNotLike` | Wildcards (`*`, `?`) - ARNs, prefixes, principal patterns |
| `StringEqualsIfExists` | Apply only if the key is present in the request |
| `Bool` / `BoolIfExists` | True/false flags (`aws:SecureTransport`, MFA) |
| `IpAddress` / `NotIpAddress` | Source IP CIDR allow/deny |
| `DateGreaterThan` / `DateLessThan` / `DateEquals` | Time windows (`aws:CurrentTime`) |
| `NumericLessThan` / `NumericGreaterThan` | Numbers (MFA age, access key age) |
| `Null` | Key missing from request (`true` = must be absent) |
| `ArnEquals` / `ArnLike` | ARN matching (`aws:SourceArn`) |
| `ForAllValues:*` | Every value in a multi-value key must match |
| `ForAnyValue:*` | At least one value must match |

**Common global condition keys:**

- `aws:CurrentTime` - ISO 8601 timestamp (e.g. `2026-01-01T00:00:00Z`)
- `aws:SourceIp` - caller IP
- `aws:SecureTransport` - `true` when request uses HTTPS/TLS
- `aws:RequestedRegion` - target region of the API call
- `aws:PrincipalArn` / `aws:userid` - who is calling
- `aws:MultiFactorAuthPresent` - MFA used for this session
- `aws:MultiFactorAuthAge` - seconds since MFA (often paired with `NumericLessThan`)
- `aws:PrincipalTag/<key>` - tag on the IAM principal
- `aws:RequestTag/<key>` - tag being applied in the request (create/tag operations)
- `aws:ResourceTag/<key>` - tag on the resource being accessed
- `aws:SourceVpce` - VPC endpoint ID (gateway or interface)
- `aws:SourceAccount` - account that owns the calling resource
- `aws:PrincipalOrgID` - AWS Organizations ID

---

## S3 - require encryption on upload

Bucket policy pattern: **Deny** `PutObject` unless the correct encryption header is present. Two statements cover wrong header and missing header.

### SSE-S3 (AES256)

```json
{
  "Version": "2012-10-17",
  "Id": "PutObjPolicy",
  "Statement": [
    {
      "Sid": "DenyIncorrectEncryptionHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "AES256"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "Null": {
          "s3:x-amz-server-side-encryption": "true"
        }
      }
    }
  ]
}
```

### SSE-KMS

```json
{
  "Version": "2012-10-17",
  "Id": "PutObjPolicy",
  "Statement": [
    {
      "Sid": "DenyIncorrectEncryptionHeader",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption": "aws:kms"
        }
      }
    },
    {
      "Sid": "DenyUnencryptedObjectUploads",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "Null": {
          "s3:x-amz-server-side-encryption": "true"
        }
      }
    }
  ]
}
```

### Require a specific KMS key

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyPutObjectWithoutSpecificKmsKey",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringNotEquals": {
          "s3:x-amz-server-side-encryption-aws-kms-key-id": "arn:aws:kms:REGION:ACCOUNT_ID:key/KEY_ID"
        }
      }
    }
  ]
}
```

---

## Date and time conditions

Restrict access to a maintenance window, temporary contractor access, or a compliance audit period.

### Allow only between two dates

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAccessDuringMaintenanceWindow",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "DateGreaterThan": {
          "aws:CurrentTime": "2026-06-01T00:00:00Z"
        },
        "DateLessThan": {
          "aws:CurrentTime": "2026-06-30T23:59:59Z"
        }
      }
    }
  ]
}
```

### Deny access after a cutoff date

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAfterContractEnd",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "DateGreaterThan": {
          "aws:CurrentTime": "2026-12-31T23:59:59Z"
        }
      }
    }
  ]
}
```

**Note:** `aws:CurrentTime` uses **UTC** in `YYYY-MM-DDTHH:MM:SSZ` format. `DateGreaterThan` means "current time is after this value."

---

## Tag-based conditions

Tags appear in three contexts - know which key to use:

| Key pattern | Applies to |
| --- | --- |
| `aws:RequestTag/<key>` | Tag being set on create (`RunInstances`, `CreateRole`, etc.) |
| `aws:ResourceTag/<key>` | Tag already on the resource being accessed |
| `aws:PrincipalTag/<key>` | Tag on the IAM user or role making the call |
| `aws:TagKeys` | List of tag key names in the request |

### Require `Environment=Production` tag when launching EC2

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowRunInstancesWithEnvironmentTag",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestTag/Environment": "Production"
        }
      }
    }
  ]
}
```

### Allow terminate only on instances tagged `Owner=TeamA`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowTerminateOwnedInstances",
      "Effect": "Allow",
      "Action": "ec2:TerminateInstances",
      "Resource": "arn:aws:ec2:REGION:ACCOUNT_ID:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:ResourceTag/Owner": "TeamA"
        }
      }
    }
  ]
}
```

### Deny if request tries to remove the `CostCenter` tag

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUntagCostCenter",
      "Effect": "Deny",
      "Action": [
        "ec2:DeleteTags",
        "s3:DeleteObjectTagging",
        "s3:DeleteBucketTagging"
      ],
      "Resource": "*",
      "Condition": {
        "ForAnyValue:StringEquals": {
          "aws:TagKeys": "CostCenter"
        }
      }
    }
  ]
}
```

### Allow S3 access only when principal has `Department=Finance`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowFinancePrincipals",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::finance-reports",
        "arn:aws:s3:::finance-reports/*"
      ],
      "Condition": {
        "StringEquals": {
          "aws:PrincipalTag/Department": "Finance"
        }
      }
    }
  ]
}
```

**Note:** `aws:RequestTag` is checked at **creation** time. `ec2:ResourceTag` / `aws:ResourceTag` is checked on the **existing** resource.

---

## IP address and network conditions

### Allow only from corporate CIDR

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowFromCorporateNetwork",
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "IpAddress": {
          "aws:SourceIp": ["203.0.113.0/24", "198.51.100.10/32"]
        }
      }
    }
  ]
}
```

### Deny access outside VPC endpoint (private S3 access)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyUnlessFromVpce",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-0123456789abcdef0"
        }
      }
    }
  ]
}
```

### Require HTTPS (deny insecure transport)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyInsecureTransport",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:*",
      "Resource": [
        "arn:aws:s3:::BUCKET_NAME",
        "arn:aws:s3:::BUCKET_NAME/*"
      ],
      "Condition": {
        "Bool": {
          "aws:SecureTransport": "false"
        }
      }
    }
  ]
}
```

**Note:** `aws:SourceIp` is the caller's IP. For API calls **through a VPC endpoint**, also consider `aws:sourceVpce`. Combine with `aws:SecureTransport` for defense in depth.

---

## MFA conditions

### Deny all actions unless MFA is present

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyAllExceptWithMfa",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice",
        "iam:EnableMFADevice",
        "iam:ListMFADevices",
        "iam:ListUsers",
        "iam:ListVirtualMFADevices",
        "iam:ResyncMFADevice",
        "sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": {
        "BoolIfExists": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

### Require MFA refreshed within the last hour (3600 seconds)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyIfMfaTooOld",
      "Effect": "Deny",
      "Action": [
        "ec2:TerminateInstances",
        "rds:DeleteDBInstance"
      ],
      "Resource": "*",
      "Condition": {
        "NumericGreaterThan": {
          "aws:MultiFactorAuthAge": "3600"
        }
      }
    }
  ]
}
```

**Note:** Use `BoolIfExists` when the key may be absent (e.g. role sessions without MFA). `aws:MultiFactorAuthAge` only applies when MFA was used.

---

## Region and account restrictions

### Allow actions only in `eu-west-1` and `eu-central-1`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyEuRegions",
      "Effect": "Allow",
      "Action": "ec2:*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": ["eu-west-1", "eu-central-1"]
        }
      }
    }
  ]
}
```

### Deny access outside your Organization

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOutsideOrg",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringNotEquals": {
          "aws:PrincipalOrgID": "o-abc1234567"
        }
      }
    }
  ]
}
```

### S3 bucket policy - allow only from a specific account

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCrossAccountFromTrustedAccount",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:root"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalAccount": "111122223333"
        }
      }
    }
  ]
}
```

---

## Instance type, ARN, and prefix conditions

### Restrict EC2 to `t3.micro` and `t3.small`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlySmallInstances",
      "Effect": "Allow",
      "Action": "ec2:RunInstances",
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringEquals": {
          "ec2:InstanceType": ["t3.micro", "t3.small"]
        }
      }
    }
  ]
}
```

### Allow S3 read only under `reports/` prefix

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowReadReportsPrefix",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::BUCKET_NAME/*",
      "Condition": {
        "StringLike": {
          "s3:prefix": "reports/*"
        }
      }
    }
  ]
}
```

### Allow assume role only for a specific role name pattern

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAssumeAppRoles",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/app-*"
    }
  ]
}
```

---

## IAM-specific scenarios

### Deny access keys older than 90 days

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DenyOldAccessKeys",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "NumericGreaterThan": {
          "iam:AccessKeyAge": "90"
        }
      }
    }
  ]
}
```

### Allow `PassRole` only to EC2 service

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowPassRoleToEc2",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::ACCOUNT_ID:role/EC2InstanceRole",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ec2.amazonaws.com"
        }
      }
    }
  ]
}
```

### Require permissions boundary when creating a role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCreateRoleWithBoundary",
      "Effect": "Allow",
      "Action": ["iam:CreateRole", "iam:PutRolePermissionsBoundary"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "iam:PermissionsBoundary": "arn:aws:iam::ACCOUNT_ID:policy/DeveloperBoundary"
        }
      }
    }
  ]
}
```

---

## Cheat sheet

| Scenario | Condition key / operator |
| --- | --- |
| Time-bound access | `DateGreaterThan` / `DateLessThan` + `aws:CurrentTime` |
| Require tag at launch | `aws:RequestTag/<key>` + `StringEquals` |
| Control by resource tag | `aws:ResourceTag/<key>` or `ec2:ResourceTag/<key>` |
| Principal must have tag | `aws:PrincipalTag/<key>` |
| Corporate IP only | `IpAddress` + `aws:SourceIp` |
| HTTPS only | `Bool` + `aws:SecureTransport: false` (in a Deny) |
| VPC endpoint only | `StringEquals` / `StringNotEquals` + `aws:sourceVpce` |
| MFA required | `BoolIfExists` + `aws:MultiFactorAuthPresent` |
| MFA not too old | `NumericLessThan` + `aws:MultiFactorAuthAge` |
| Region lock | `StringEquals` + `aws:RequestedRegion` |
| Org membership | `StringEquals` + `aws:PrincipalOrgID` |
| S3 encryption header | `s3:x-amz-server-side-encryption` + `StringNotEquals` / `Null` |
| Specific KMS key on upload | `s3:x-amz-server-side-encryption-aws-kms-key-id` |
| Instance type limit | `ec2:InstanceType` + `StringEquals` |
| PassRole to a service | `iam:PassedToService` + `StringEquals` |

---

# aws-iam-roles-and-endpoints.md

---
title: "IAM Roles, Policies, and VPC Endpoints"
description: "Identity and resource-based IAM policies, cross-account AssumeRole, sts:AssumeRole allow/deny patterns, and VPC endpoint policies for S3 and DynamoDB."
tags:
  - iam
  - policies
  - roles
  - sts
  - s3
  - lambda
  - dynamodb
  - vpc-endpoint
  - aws
  - notes
date: 2026-08-25
---

## Overview

AWS authorization uses several policy types that work together. An **identity-based policy** says what a user or role *can do*. A **resource-based policy** says who can access *this resource*. A **VPC endpoint policy** adds a boundary for traffic that goes through a private endpoint.


| Policy type        | Attached to                              | Answers                              |
| ------------------ | ---------------------------------------- | ------------------------------------ |
| **Identity-based** | User, group, role                        | What can this principal do?          |
| **Resource-based** | S3 bucket, Lambda function, SNS topic, … | Who can access this resource?        |
| **Trust policy**   | IAM role                                 | Who can assume this role?            |
| **VPC endpoint**   | Gateway / Interface endpoint             | What can pass through this endpoint? |


See also: [IAM Policy Examples and Triage Guide](/aws-iam-policies-triage/) for SCPs, boundaries, and troubleshooting.

---



## Identity-based policies

JSON documents that control which actions an identity (user, group, or role) can perform on which resources, under optional conditions.

### Managed vs inline


| Type                 | Description                                                      |
| -------------------- | ---------------------------------------------------------------- |
| **AWS managed**      | AWS-maintained; attach to users, groups, roles                   |
| **Customer managed** | Your reusable policy; attach to multiple identities              |
| **Inline**           | Embedded on one user, group, or role; deleted with that identity |


---



## Grant access to assume a role

To let a user **switch into** another role, the originating account attaches an identity policy that allows `sts:AssumeRole` on the target role ARN.

### Developers can assume `UpdateData`

Attach to role **Developer** (or group `Developers`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::111122223333:role/UpdateData"
    }
  ]
}
```



### Analysts cannot assume `UpdateData`

Attach to role **Analyst**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::111122223333:role/UpdateData"
    }
  ]
}
```

**Result:** `Developers` can switch to `UpdateData`; `Analyst` cannot. Explicit **Deny** wins over Allow.

The target role also needs a **trust policy** allowing the originating account or principal - identity policy alone is not enough.

### Switch role (CLI)

```bash
aws sts assume-role \
  --role-arn "arn:aws:iam::999999999999:role/UpdateData" \
  --role-session-name "David-ProdUpdate"
```

Export the temporary credentials from the response:

```json
{
  "Credentials": {
    "AccessKeyId": "AKIAIOSFODNN7EXAMPLE",
    "SecretAccessKey": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    "SessionToken": "AQoDYXdzEGcaEXAMPLE...",
    "Expiration": "2014-12-11T23:08:07Z"
  }
}
```

```bash
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
```

---



## Resource-based policies

JSON documents attached **to a resource** (not to a user). They grant a specified **principal** permission to perform actions on **that resource**.

Evaluation: both the identity policy **and** the resource policy must allow the action (unless the principal is in the same account and the resource policy alone is sufficient for some services).

### S3 bucket - allow an application role to read objects

**Use case:** A Lambda execution role needs read access to a specific bucket. You can grant it in the bucket policy (resource-based) instead of (or in addition to) the role's identity policy.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppRoleRead",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::111122223333:role/MyAppLambdaRole"
      },
      "Action": [
        "s3:ListBucket",
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::my-app-bucket",
        "arn:aws:s3:::my-app-bucket/*"
      ]
    }
  ]
}
```



### Lambda - allow API Gateway to invoke a function

**Use case:** REST API integration invokes a Lambda. The function resource policy trusts API Gateway as principal.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAPIGatewayInvoke",
      "Effect": "Allow",
      "Principal": {
        "Service": "apigateway.amazonaws.com"
      },
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:111122223333:function:MyFunction",
      "Condition": {
        "ArnLike": {
          "AWS:SourceArn": "arn:aws:execute-api:us-east-1:111122223333:abc123/*"
        }
      }
    }
  ]
}
```

Console and CLI (`aws lambda add-permission`) create the same resource-based statement on the function.

---



## VPC endpoint policies

A **resource-based policy on the endpoint** controls which principals can use the endpoint and which destination actions/resources are reachable **through that endpoint**.

Endpoint policies do **not** replace identity or destination resource policies - they add an extra gate for traffic entering via the endpoint.

### S3 Gateway endpoint



#### Allow access to one bucket

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-to-specific-bucket",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::bucket_name",
        "arn:aws:s3:::bucket_name/*"
      ]
    }
  ]
}
```



#### Restrict to a specific IAM role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-to-specific-IAM-role",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "ArnEquals": {
          "aws:PrincipalArn": "arn:aws:iam::111122223333:role/role_name"
        }
      }
    }
  ]
}
```



#### Restrict to callers from one account

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-callers-from-specific-account",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalAccount": "111122223333"
        }
      }
    }
  ]
}
```

---



### DynamoDB Gateway endpoint



#### Deny unless traffic comes from a specific endpoint

Use on the **DynamoDB table resource policy** (or identity policy) with `aws:sourceVpce`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-from-specific-endpoint",
      "Effect": "Deny",
      "Principal": "*",
      "Action": "dynamodb:*",
      "Resource": "arn:aws:dynamodb:us-east-1:111111111111:table/*",
      "Condition": {
        "StringNotEquals": {
          "aws:sourceVpce": "vpce-11aa22bb"
        }
      }
    }
  ]
}
```

Requests not routed through `vpce-11aa22bb` are denied, even if other policies allow access.

#### Restrict endpoint policy to one role or account

Use the same **ArnEquals** / **PrincipalAccount** condition patterns as the S3 endpoint examples above.

#### Allow access to one table via endpoint policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "Allow-access-to-specific-table",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "dynamodb:Batch*",
        "dynamodb:Delete*",
        "dynamodb:DescribeTable",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Update*"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:123456789012:table/table_name"
    }
  ]
}
```

---

## Common Condition blocks (copy-paste)

Drop these into any statement's `"Condition"` key. Pair with your own `Effect`, `Action`, `Resource`, and `Principal`.

See also: [IAM Policy Conditions](/aws-iam-policy-conditions/) for full statements and operator reference.

### Principal and account

**Specific IAM role only**

```json
"Condition": {
  "ArnEquals": {
    "aws:PrincipalArn": "arn:aws:iam::111122223333:role/MyAppRole"
  }
}
```

**Any principal in one account**

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalAccount": "111122223333"
  }
}
```

**Principal has a specific IAM tag**

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalTag/Department": "Engineering"
  }
}
```

**Caller is in an AWS Organization**

```json
"Condition": {
  "StringEquals": {
    "aws:PrincipalOrgID": "o-abc1234567"
  }
}
```

### Network and transport

**HTTPS / TLS only**

```json
"Condition": {
  "Bool": {
    "aws:SecureTransport": "true"
  }
}
```

**Allow from specific IP range**

```json
"Condition": {
  "IpAddress": {
    "aws:SourceIp": ["203.0.113.0/24", "198.51.100.10/32"]
  }
}
```

**Deny if not from corporate CIDR**

```json
"Condition": {
  "NotIpAddress": {
    "aws:SourceIp": "203.0.113.0/24"
  }
}
```

**Traffic must use a specific VPC endpoint**

```json
"Condition": {
  "StringEquals": {
    "aws:sourceVpce": "vpce-11aa22bb"
  }
}
```

**Deny if request did not come through the endpoint**

```json
"Condition": {
  "StringNotEquals": {
    "aws:sourceVpce": "vpce-11aa22bb"
  }
}
```

### Region, time, and MFA

**Restrict API calls to one Region**

```json
"Condition": {
  "StringEquals": {
    "aws:RequestedRegion": "us-east-1"
  }
}
```

**Allow only during a time window (UTC)**

```json
"Condition": {
  "DateGreaterThan": {
    "aws:CurrentTime": "2026-01-01T08:00:00Z"
  },
  "DateLessThan": {
    "aws:CurrentTime": "2026-01-01T18:00:00Z"
  }
}
```

**Require MFA for this session**

```json
"Condition": {
  "Bool": {
    "aws:MultiFactorAuthPresent": "true"
  }
}
```

**MFA must be fresh (within 1 hour = 3600 seconds)**

```json
"Condition": {
  "NumericLessThan": {
    "aws:MultiFactorAuthAge": "3600"
  }
}
```

### Source ARN (cross-service)

**Lambda invoke only from one API Gateway API**

```json
"Condition": {
  "ArnLike": {
    "AWS:SourceArn": "arn:aws:execute-api:us-east-1:111122223333:abc123/*"
  }
}
```

**Event only from one S3 bucket**

```json
"Condition": {
  "StringEquals": {
    "AWS:SourceArn": "arn:aws:s3:::my-app-bucket"
  }
}
```

**Source account that owns the calling resource**

```json
"Condition": {
  "StringEquals": {
    "aws:SourceAccount": "111122223333"
  }
}
```

### S3-specific

**List only objects under a prefix**

```json
"Condition": {
  "StringLike": {
    "s3:prefix": ["logs/*", "app/*"]
  }
}
```

**Require SSE-S3 on upload**

```json
"Condition": {
  "StringEquals": {
    "s3:x-amz-server-side-encryption": "AES256"
  }
}
```

**Deny upload when encryption header is missing**

```json
"Condition": {
  "Null": {
    "s3:x-amz-server-side-encryption": "true"
  }
}
```

### Tags on resources and requests

**Resource must have tag**

```json
"Condition": {
  "StringEquals": {
    "aws:ResourceTag/Environment": "Production"
  }
}
```

**Deny delete unless resource is tagged `Backup=true`**

```json
"Condition": {
  "StringNotEquals": {
    "aws:ResourceTag/Backup": "true"
  }
}
```

**Create request must include tag**

```json
"Condition": {
  "StringEquals": {
    "aws:RequestTag/CostCenter": "12345"
  }
}
```

### Operator cheat sheet

| Operator | Example use |
| --- | --- |
| `StringEquals` | Exact match - Region, account ID, tag value |
| `StringNotEquals` | Exclude a value - deny outside endpoint |
| `StringLike` | Wildcards - ARN prefix, S3 prefix |
| `ArnEquals` / `ArnLike` | Principal or source ARN |
| `Bool` | `aws:SecureTransport`, MFA present |
| `IpAddress` / `NotIpAddress` | Source IP CIDR |
| `DateGreaterThan` / `DateLessThan` | Time windows |
| `NumericLessThan` | MFA age, numeric limits |
| `Null` | Key must be absent (`"true"`) |

---

# aws-iot-core.md

---
title: "AWS IoT Core: MQTT, Policies, and Rules Engine"
description: "Thing, X.509 cert, policy, MQTT publish/subscribe, rules to Lambda, shadows, and common connect/policy failures."
tags:
  - iot
  - iot-core
  - mqtt
  - aws
  - lambda
  - notes
date: 2026-09-12
links:
  - title: How AWS IoT works
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-gs.html
  - title: IoT policies
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-policy-actions.html
  - title: Rules engine
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-rules.html
  - title: Device Shadow
    url: https://docs.aws.amazon.com/iot/latest/developerguide/iot-device-shadows.html
---

# AWS IoT Core

**Device path:** register **Thing** → create **X.509 cert** → **IoT policy** on cert → MQTT over TLS to **data endpoint** → **topics** → optional **Rules** → Lambda / DynamoDB / SQS / Timestream.

**Cloud path:** IAM principal calls **`iot-data`** API (`Publish`, `UpdateThingShadow`) - not the same auth as devices.

Use **Data-ATS** endpoint (`…-ats.iot.<region>.amazonaws.com`, port **8883**). Thing name = MQTT **client ID** when policy scopes `client/${iot:Connection.Thing.ThingName}`.

| Piece | Job |
| --- | --- |
| Thing | Logical device id in registry |
| Certificate | Device identity (TLS mutual auth) |
| IoT policy | Allows `Connect` / `Publish` / `Subscribe` / `Receive` on ARNs |
| Topic | MQTT routing (`device/<thing>/telemetry`) |
| Rule | SQL on topic payload → action |
| Shadow | JSON state document (`$aws/things/<name>/shadow/...`) |

<details>
<summary>Env + data endpoint</summary>

```bash
export AWS_REGION=<region>
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text
```

Download [Amazon Root CA 1](https://www.amazontrust.com/repository/AmazonRootCA1.pem) for devices (`AmazonRootCA1.pem`).

</details>

---

## 1. Thing + certificate + policy

Order matters: **policy exists** → **cert created** → **attach policy to cert** → **attach cert to thing**.

Duplicate thing name in same Region → `ResourceAlreadyExistsException`. Delete test things between tutorials or use unique names.

<details>
<summary>Create thing, cert, and attach</summary>

```bash
THING_NAME=my-sensor-01

aws iot create-thing --thing-name "$THING_NAME"

aws iot create-keys-and-certificate --set-as-active \
  --certificate-pem-outfile device.cert.pem \
  --public-key-outfile device.public.key \
  --private-key-outfile device.private.key \
  --query certificateArn --output text > cert-arn.txt

CERT_ARN=$(cat cert-arn.txt)

aws iot attach-thing-principal --thing-name "$THING_NAME" --principal "$CERT_ARN"
```

</details>

<details>
<summary>IoT policy (thing-scoped topics)</summary>

Replace `<region>` and `<account>`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "iot:Connect",
      "Resource": "arn:aws:iot:<region>:<account>:client/${iot:Connection.Thing.ThingName}"
    },
    {
      "Effect": "Allow",
      "Action": ["iot:Publish", "iot:Receive"],
      "Resource": "arn:aws:iot:<region>:<account>:topic/device/${iot:Connection.Thing.ThingName}/*"
    },
    {
      "Effect": "Allow",
      "Action": "iot:Subscribe",
      "Resource": "arn:aws:iot:<region>:<account>:topicfilter/device/${iot:Connection.Thing.ThingName}/*"
    }
  ]
}
```

```bash
aws iot create-policy --policy-name "${THING_NAME}-policy" --policy-document file://iot-policy.json
aws iot attach-policy --policy-name "${THING_NAME}-policy" --target "$CERT_ARN"
```

Policy on **certificate** (or Cognito identity), not on the thing object alone.

</details>

---

## 2. Publish telemetry (device)

Topic must match policy. QoS **0** or **1** (IoT Core supports QoS 0 and 1, not 2).

<details>
<summary>mosquitto_pub (quick test)</summary>

```bash
ENDPOINT=$(aws iot describe-endpoint --endpoint-type iot:Data-ATS --query endpointAddress --output text)

mosquitto_pub \
  --cafile AmazonRootCA1.pem \
  --cert device.cert.pem \
  --key device.private.key \
  -h "$ENDPOINT" -p 8883 -q 1 \
  -i "$THING_NAME" \
  -t "device/${THING_NAME}/telemetry" \
  -m '{"temp_c":22.5}'
```

Console: **MQTT test client** → subscribe `device/#` → watch messages.

</details>

<details>
<summary>Python (X.509) example</summary>

`./content/dir/iot/mqtt-publish-telemetry.py`

```bash
pip install awsiotsdk
python ./content/dir/iot/mqtt-publish-telemetry.py \
  --endpoint "$ENDPOINT" \
  --cert device.cert.pem --key device.private.key --ca AmazonRootCA1.pem \
  --thing-name "$THING_NAME"
```

</details>

<details>
<summary>Cloud publish (IAM, not device cert)</summary>

Backend or test from CLI with your **IAM** user/role:

```bash
aws iot-data publish \
  --topic "device/${THING_NAME}/telemetry" \
  --qos 1 \
  --payload '{"temp_c":23.0,"source":"cli"}' \
  --cli-binary-format raw-in-base64-out
```

Requires IAM `iot:Publish` on the topic ARN. Does not prove device cert wiring.

</details>

---

## 3. Rules engine → Lambda

Rule SQL selects fields from incoming messages. Rule execution role needs permission to invoke Lambda (and write to downstream resources).

<details>
<summary>Topic rule payload + create</summary>

`rule-temp-lambda.json`:

```json
{
  "sql": "SELECT topic(2) AS thingName, temp_c, ts FROM 'device/+/telemetry' WHERE temp_c > 30",
  "description": "Hot readings to Lambda",
  "actions": [
    {
      "lambda": {
        "functionArn": "arn:aws:lambda:<region>:<account>:function:IotHotTelemetry"
      }
    }
  ],
  "ruleDisabled": false,
  "awsIotSqlVersion": "2016-03-23"
}
```

```bash
aws iot create-topic-rule --rule-name HotTelemetryToLambda --topic-rule-payload file://rule-temp-lambda.json
```

Lambda resource policy must allow `iot.amazonaws.com` to invoke. Rule errors → CloudWatch Logs log group **`AWSIotLogsV2`** (enable logging in IoT settings if empty).

</details>

<details>
<summary>Rule → DynamoDB (pattern)</summary>

```json
{
  "sql": "SELECT * FROM 'device/+/telemetry'",
  "actions": [
    {
      "dynamoDBv2": {
        "roleArn": "arn:aws:iam::<account>:role/IotRuleDynamoRole",
        "putItem": {
          "tableName": "DeviceTelemetry"
        }
      }
    }
  ]
}
```

Partition key in table must match what SQL exposes (often `thingName` from `topic(n)` or a field in JSON).

</details>

---

## 4. Device Shadow (optional)

Reported state from device; desired state from cloud. Classic shadow topics:

- Update reported: `$aws/things/<thingName>/shadow/update`
- Get: `$aws/things/<thingName>/shadow/get`

Policy must allow `iot:Publish` / `iot:Subscribe` on `$aws/things/${iot:Connection.Thing.ThingName}/shadow/*` if you use shadows with thing-scoped policies.

<details>
<summary>Shadow update payload</summary>

```json
{
  "state": {
    "reported": {
      "temp_c": 22.5,
      "connected": true
    }
  }
}
```

```bash
aws iot-data update-thing-shadow \
  --thing-name "$THING_NAME" \
  --payload file://shadow-reported.json \
  --cli-binary-format raw-in-base64-out
```

</details>

---

## 5. Daily checks

| Symptom | First look |
| --- | --- |
| `CONNECT` fails / TLS handshake | Wrong endpoint (use **ATS**); clock skew; CA file |
| `Not authorized` on connect | Policy not attached to **cert**; client ID ≠ thing name when policy uses ThingName variable |
| `Not authorized` on publish | Topic string mismatch vs policy ARN (typo, missing level, wrong `topic` vs `topicfilter`) |
| Cert rejected | Cert inactive or revoked; using cert from another account/Region |
| Rule never fires | SQL topic filter vs actual topic; `ruleDisabled`; no message reaching broker |
| Lambda not invoked | Rule role + Lambda resource policy; check **`AWSIotLogsV2`** |
| Shadow access denied | Shadow `$aws/things/...` ARNs missing in IoT policy |

```bash
aws iot list-things
aws iot list-thing-principals --thing-name "$THING_NAME"
aws iot list-principal-policies --principal "$CERT_ARN"
aws iot get-topic-rule --rule-name HotTelemetryToLambda
```

Docs: [troubleshoot MQTT](https://docs.aws.amazon.com/iot/latest/developerguide/diagnosing-connectivity-issues.html) · [policy variables](https://docs.aws.amazon.com/iot/latest/developerguide/basic-policy-variables.html)

---

# aws-kinesis-streams-analytics.md

---
title: "Amazon Kinesis Data Streams and Analytics"
description: "Reference videos and AWS resources for Kinesis Data Streams, producer/consumer patterns, and Kinesis Data Analytics."
tags:
  - kinesis
  - streaming
  - analytics
  - data
  - aws
---
## Overview

Curated AWS and community resources for Kinesis Data Streams, Kinesis Data Analytics, and streaming ingestion patterns.

## AWS references

- [DynamoDB Streams vs Kinesis Data Streams (AWS video)](https://aws.amazon.com/video/watch/d3ccecf9e23/)
- [Process streaming data with Kinesis Analytics (AWS video)](https://aws.amazon.com/tr/video/watch/dd4e9e0d092/)

## Video tutorials

- [Kinesis Data Streams overview (YouTube)](https://www.youtube.com/watch?v=ziEEdL1egPk)
- [Kinesis producer and consumer patterns (YouTube)](https://www.youtube.com/watch?v=McxSsTmbp00)
- [Kinesis Analytics SQL applications (YouTube)](https://www.youtube.com/watch?v=8jlAoB1GmNs)
---

# aws-lab-notes.md

---
title: "AWS Lab Notes: EventBridge, RDS, Backup, and JAM"
description: "Lab notes: RDS logs, EventBridge, Backup, SSM, jam EKS incident fixes."
tags:
  - aws
  - labs
  - eventbridge
  - rds
  - cloudwatch
  - sqs
  - lambda
  - backup
  - jam
  - eks
date: 2026-08-20
---

## Cedar policy rules (AWS Amazon Verified Permissions)

Lab section for [Cedar](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html) policy syntax used with AWS Verified Permissions and similar services. Add policy examples from the lab here.

---

## RDS audit logs to CloudWatch

Publish MySQL/MariaDB logs from RDS to CloudWatch Logs.

1. Open the RDS instance in the console.
2. Under **Log exports**, choose which logs to publish (for example audit, error, general, slow query).

![RDS log exports](./images/rds-cloudwatch-log-exports.png)

Reference: [Publishing MySQL logs to CloudWatch](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_LogAccess.Procedural.UploadtoCloudWatch.html)

---

## Export CloudWatch Logs to S3

Create an export task from CloudWatch Logs to S3. The destination bucket needs a policy that allows the CloudWatch Logs service principal.

Reference: [Export log data to S3 (console)](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/S3ExportTasksConsole.html)

<details>
<summary>Bucket policy template</summary>

Replace bucket name, account IDs, Region, and log group ARN.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudWatchLogsGetBucketAcl",
      "Action": "s3:GetBucketAcl",
      "Effect": "Allow",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket",
      "Principal": { "Service": "logs.us-east-1.amazonaws.com" },
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": ["<ACCOUNT_ID>"]
        },
        "ArnLike": {
          "aws:SourceArn": [
            "arn:aws:logs:<REGION>:<ACCOUNT_ID>:log-group:/aws/rds/instance/<DB_INSTANCE>/audit:*"
          ]
        }
      }
    },
    {
      "Sid": "AllowCloudWatchLogsPutObject",
      "Action": "s3:PutObject",
      "Effect": "Allow",
      "Resource": "arn:aws:s3:::amzn-s3-demo-bucket/*",
      "Principal": { "Service": "logs.us-east-1.amazonaws.com" },
      "Condition": {
        "StringEquals": {
          "s3:x-amz-acl": "bucket-owner-full-control",
          "aws:SourceAccount": ["<ACCOUNT_ID>"]
        },
        "ArnLike": {
          "aws:SourceArn": [
            "arn:aws:logs:<REGION>:<ACCOUNT_ID>:log-group:/aws/rds/instance/<DB_INSTANCE>/audit:*"
          ]
        }
      }
    }
  ]
}
```

</details>

---

## DynamoDB stream to SQS (EventBridge Pipes)

Point-to-point pipe from DynamoDB streams to SQS without a custom poller Lambda.

![Serverless order fulfillment workflow (payment queue and Step Functions)](./images/serverless-order-fulfillment-workflow.png)

See also: [EventBridge notes](/aws-eventbridge-patterns/) for pipes, filters, and IAM.

---

## Notifications: EventBridge → FIFO SQS → Lambda

**Task checklist**

1. A FIFO queue exists with content-based deduplication enabled.
2. An EventBridge rule targets the FIFO queue with `MessageGroupId` set.
3. Lambda is triggered by the FIFO queue.
4. The old standard queue is not in the active pipeline.

```python
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

events_client = boto3.client("events")


def lambda_handler(event, context):
    for record in event.get("Records", []):
        body = json.loads(record["body"])
        detail = body.get("detail", {})
        match_id = detail.get("matchId", "unknown")
        users = detail.get("users", [])

        logger.info(f"MATCH! Processing notification for matchId={match_id}, users={users}")

        # BUG: detail-type is "matchCompleted" but downstream rule
        # rt-log-notification-sent expects "notificationSent"
        events_client.put_events(
            Entries=[{
                "Source": "redthread.notifications",
                "DetailType": "matchCompleted",
                "Detail": json.dumps({
                    "matchId": match_id,
                    "users": users,
                    "status": "sent",
                }),
            }]
        )

    return {"statusCode": 200}
```

**Fix:** align `DetailType` with the downstream rule (`notificationSent` if that is what the rule matches).

---

## EventBridge rules (`put-rule`)

References:

- [Create a rule](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule.html)
- [Event pattern operators](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-pattern-operators.html)
- [Pattern best practices](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-patterns-best-practices.html)

Custom event bus: `register-device-event-bus`

### Single-device registration

**Requirement:**

```json
{
  "registration-type": "single-device",
  "device-count": 1
}
```

- All the requests that are having `registration-type` starting with `single` **AND**
- The requests having `device-count` equals to `1`

**Rule:**

```json
{
  "detail": {
    "registration-type": [{ "prefix": { "equals-ignore-case": "single" } }],
    "device-count": [1]
  }
}
```

```bash
aws events put-rule \
  --name "eb-register-single-device-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"registration-type":[{"prefix":{"equals-ignore-case":"single"}}],"device-count":[1]}}'
```

### Bulk device - count 1–99 in any region, or any count in `eu-west-1`

**Requirement:**

```json
{
  "registration-type": "bulk-device",
  "device-count": 99,
  "region": "us-east-1"
}
```

**AND**

```json
{
  "registration-type": "bulk-device",
  "device-count": 100,
  "region": "eu-west-1"
}
```

- All requests that are having `registration-type` value starting with `bulk` **AND**
- The device-count value between `1 and 99` for `any region` **OR** the requests having region value `eu-west-1` (i.e., in case of eu-west-1 the `device-count` value can exceed 100)

**Rule:**

```json
{
  "detail": {
    "registration-type": [{ "prefix": { "equals-ignore-case": "bulk" } }],
    "$or": [
      { "device-count": [{ "numeric": [">=", 1, "<=", 99] }] },
      { "region": ["eu-west-1"] }
    ]
  }
}
```

```bash
aws events put-rule \
  --name "eb-register-bulk-device-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"registration-type":[{"prefix":{"equals-ignore-case":"bulk"}}],"$or":[{"device-count":[{"numeric":[">=",1,"<=",99]}]},{"region":["eu-west-1"]}]}}'
```

### Bulk device - count greater than 100 outside `eu-west-1`

**Requirement:**

```json
{
  "registration-type": "bulk-device",
  "device-count": 100,
  "region": "us-east-1"
}
```

**AND**

```json
{
  "registration-type": "bulk-device",
  "device-count": 100,
  "region": "ap-southeast-1"
}
```

- The requests having registration-type value starting with bulk
- The requests having device-count greater than 100 **AND** requests having region value other than eu-west-1

**Rule:**

```json
{
  "detail": {
    "registration-type": [{ "prefix": { "equals-ignore-case": "bulk" } }],
    "device-count": [{ "numeric": [">=", 100] }],
    "region": [{ "anything-but": "eu-west-1" }]
  }
}
```

```bash
aws events put-rule \
  --name "eb-register-bulk-device-with-priority-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"registration-type":[{"prefix":{"equals-ignore-case":"bulk"}}],"device-count":[{"numeric":[">=",100]}],"region":[{"anything-but":"eu-west-1"}]}}'
```

### Privileged customers → Lambda

**Requirement:**

```json
{
  "privileged": "true"
}
```

- Route the requests containing the `privileged` property to lambda function mentioned above

**Rule:**

```json
{
  "detail": {
    "privileged": ["true"]
  }
}
```

```bash
aws events put-rule \
  --name "eb-reward-privileged-customer-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"privileged":["true"]}}'
```

### Image URL validation

**Requirement:**

```json
{
  "image-url": "https://sampleurl.com/sample.png"
}
```

- The value for image-url should have a value **AND**
- The value for image-url property should end with `.png` / `.jpeg` / `.jpg` / `.gif`

**Rule:**

```json
{
  "detail": {
    "image-url": [
      { "suffix": ".png" },
      { "suffix": ".jpeg" },
      { "suffix": ".jpg" },
      { "suffix": ".gif" }
    ]
  }
}
```

```bash
aws events put-rule \
  --name "eb-save-image-rule" \
  --event-bus-name "register-device-event-bus" \
  --event-pattern '{"detail":{"image-url":[{"suffix":".png"},{"suffix":".jpeg"},{"suffix":".jpg"},{"suffix":".gif"}]}}'
```

---

## Backup and restore

### AWS Backup IAM policies

| Action | AWS managed policy |
| --- | --- |
| Backup | `AWSBackupServiceRolePolicyForBackup` |
| Restore | `AWSBackupServiceRolePolicyForRestores` |

### EventBridge target (auto-recover)

```bash
aws events put-targets \
  --rule "xyz-auto-recover-rule" \
  --targets "Id"="1","Arn"="arn:aws:lambda:<REGION>:<ACCOUNT_ID>:function:xyz-auto-recover"
```

### Flows (lab step numbers)

**Backup:** EC2 enters `running` → EventBridge Rule 1 → Backup Lambda → backup in vault  
`1 → 4 → 2 → 6`

**Restore:** EC2 terminated → EventBridge Rule 2 → Recover Lambda → retrieve from vault → new EC2  
`1 → 5 → 3 → 6 → 1`


---

## Windows / RDP and IMDS

Symptom: Windows instance cannot reach IMDS at `169.254.169.254`.

Gateway IP is the subnet default route for `0.0.0.0` in `route print`. Prefer [IMDSv2](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/configuring-instance-metadata-service.html).

```powershell
route print
route DELETE 169.254.169.254
route -p ADD 169.254.169.254 MASK 255.255.255.255 <SUBNET_GATEWAY_IP>

iwr -Uri 'http://169.254.169.254/latest/meta-data/'

netsh winhttp reset proxy
W32tm /resync /force
Restart-Service AmazonSSMAgent
```

Always restart the SSM agent after network/proxy changes: `Restart-Service AmazonSSMAgent`.

---

## Systems Manager (SSM)

RDP down, SSM up (or SSM instead of RDP): agent on the AMI, instance role `AmazonSSMManagedInstanceCore`, outbound **TCP 443** via NAT or Interface endpoints.

SSM agent **offline**: missing role, no path to SSM APIs, no VPC endpoints on a private subnet, SG/NACL blocking 443.

| Need | What |
| --- | --- |
| Role | `AmazonSSMManagedInstanceCore` on the instance |
| Endpoints | `ssm`, `ec2messages`, `ssmmessages` in `com.amazonaws.<region>.*` |
| Endpoint SG | Inbound **443** from instance SG / VPC CIDR |
| Placement | Endpoints in the instance’s subnets (or routed to them) |

Template: [`dir/ssm-vpc-endpoint.yaml`](./dir/ssm-vpc-endpoint.yaml)

---

## CloudWatch Agent

Instance role: `CloudWatchAgentServerPolicy`. [IAM](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/create-iam-roles-for-cloudwatch-agent.html) · [Install](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/install-CloudWatch-Agent-on-EC2-Instance.html)

Linux (AL2 / yum):

```bash
sudo yum install amazon-cloudwatch-agent
cd /opt/aws/amazon-cloudwatch-agent/bin
sudo ./amazon-cloudwatch-agent-ctl -a start -m ec2 -c default -s
```

Windows: install from the same install doc; start the **Amazon CloudWatch Agent** service.

---

## ACM Private CA

CA chain (trust store):

```bash
aws acm-pca get-certificate-authority-certificate \
  --certificate-authority-arn arn:aws:acm-pca:<region>:<account-id>:certificate-authority/<ca-id> \
  --output text > ca_certificate.pem
```

Issued cert:

```bash
aws acm-pca get-certificate \
  --certificate-authority-arn "<CA_ARN>" \
  --certificate-arn "<CERT_ARN>" \
  --query 'Certificate' --output text > cert.pem
```

Chain for that cert: `--query 'CertificateChain'` → `cert_chain.pem`.

[get-certificate-authority-certificate](https://docs.aws.amazon.com/cli/latest/reference/acm-pca/get-certificate-authority-certificate.html) · [get-certificate](https://docs.aws.amazon.com/cli/latest/reference/acm-pca/get-certificate.html)

---

## AWS Config (Guard)

SG open to the world (`0.0.0.0/0` / `::/0`). Managed check for CodeBuild plaintext AWS creds in env: [`codebuild-project-envvar-awscred-check`](https://docs.aws.amazon.com/config/latest/developerguide/codebuild-project-envvar-awscred-check.html).

<details>
<summary>Guard rules (lab)</summary>

```guard
rule check_ip_protocol_and_port_range_validity
{
    let any_ip_permissions = this.configuration.ipPermissions[
        some ipv4Ranges[*].cidrIp == "0.0.0.0/0" or
        some ipv6Ranges[*].cidrIpv6 == "::/0"
        ipProtocol != "udp"
    ]

    when %any_ip_permissions !empty
    {
        %any_ip_permissions {
            this.ipProtocol != "-1"
            this.InputParameters.TcpBlockedPorts[*] {
                this.fromPort > this or
                this.toPort < this
                <<
                    result: NON_COMPLIANT
                    message: Blocked TCP port was allowed in range
                >>
            }
        }
    }
}

rule ipv4_unrestricted_inbound when this.configuration.ipPermissions[*].ipv4Ranges !empty {
    this.configuration.ipPermissions[*].ipv4Ranges[*].cidrIp != "0.0.0.0/0"
    <<
        result: NON_COMPLIANT
        message: IPv4 Source address cannot be 0.0.0.0/0
    >>
}

rule ipv6_unrestricted_inbound when this.configuration.ipPermissions[*].ipv6Ranges !empty {
    this.configuration.ipPermissions[*].ipv6Ranges[*].cidrIpv6 != "::/0"
    <<
        result: NON_COMPLIANT
        message: IPv6 Source address cannot be ::/0
    >>
}
```

</details>

---

## Traffic mirroring

VXLAN to the target: target SG inbound **UDP 4789**. Session Manager → monitor host:

```bash
sudo tcpdump -lnvX icmp
```

---

## KMS grant (CodeBuild)

```bash
aws kms create-grant \
  --key-id KEY_ARN \
  --grantee-principal arn:aws:iam::ACCOUNT_ID:role/locksmith-codebuild-role \
  --operations Decrypt GenerateDataKey \
  --name locksmith-codebuild-s3-access \
  --region us-east-1
```

---

## DynamoDB (boto3)

```python
from boto3.dynamodb.conditions import Key
from boto3.dynamodb.types import TypeDeserializer

d = TypeDeserializer()
item = {k: d.deserialize(value=v) for k, v in raw.items()}

results = dynamo_table.query(KeyConditionExpression=Key("CustID").eq(cust_id))
row = results["Items"][0] if results["Items"] else None

dynamo_table.put_item(Item=cust_profile)
```

---

## FSx ONTAP and EBS

FSx SG: inbound **NFS 2049** from the EC2 SG.

```bash
sudo mkdir -p /mnt/fsx
sudo mount -t nfs -o nfsvers=4.1 <fsx-dns-name>:/vol1 /mnt/fsx
```

EBS: attach volume, `lsblk` for the device (often `/dev/nvme1n1`, not `/dev/sdf`). `mkfs` **wipes** the volume.

```bash
lsblk
sudo mkfs.ext4 /dev/nvme1n1
sudo mkdir -p /mnt/ebs
sudo mount /dev/nvme1n1 /mnt/ebs
```

Copy FSx → EBS: `sudo rsync -av /mnt/fsx/ /mnt/ebs/`

---

## Redshift COPY (JSON)

[COPY JSON examples (`auto ignorecase`)](https://docs.aws.amazon.com/redshift/latest/dg/r_COPY_command_examples.html#copy-from-json-examples-using-auto-ignorecase)

---

## Jam EKS (`app` ns)

Cluster: `jam-eks-cluster`. Four breaks. DNS ok ≠ traffic ok ≠ IAM ok.

### 1. Frontend CrashLoop → bad `DATABASE_HOST`

Cause: env `DATABASE_HOST=wrong-db-host` → hostname no resolve → exit 1.

```bash
kubectl set env deployment/frontend-app DATABASE_HOST=database-service -n app
kubectl rollout status deployment/frontend-app -n app
```

### 2. Service 0 endpoints → selector mismatch

Cause: Service `backend-api-svc` selector `app: backend`. Pods = `app: backend-api`.

```bash
kubectl patch svc backend-api-svc -n app --type=json \
  -p='[{"op":"replace","path":"/spec/selector","value":{"app":"backend-api"}}]'
kubectl get endpoints backend-api-svc -n app
```

Expect: pod IPs under `ENDPOINTS`.

### 3. DNS ok, wget hang → NetworkPolicy

Cause: `backend-network-policy` on `app: backend-api`. Ingress only from `app: admin-panel`. Frontend = `app: frontend` → drop.

```bash
kubectl patch networkpolicy backend-network-policy -n app --type=json \
  -p='[{"op":"add","path":"/spec/ingress/1","value":{"from":[{"podSelector":{"matchLabels":{"app":"frontend"}}}],"ports":[{"port":8080,"protocol":"TCP"}]}}]'

FE=$(kubectl get pod -n app -l app=frontend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n app "$FE" -- wget -T 5 -qO- http://backend-api-svc.app.svc.cluster.local:8080
```

Expect: `catalog: 42 products ready`.

### 4. S3 `AccessDenied` → IRSA `sub` wrong SA

Cause: role `jam-eks-backend-pod-role` trust `sub` = `system:serviceaccount:app:backend`. Pods use SA `backend-api`. STS no match.

```bash
aws eks describe-cluster --name jam-eks-cluster --query "cluster.identity.oidc.issuer" --output text
```

```bash
aws iam update-assume-role-policy \
  --role-name jam-eks-backend-pod-role \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {
          "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.eks.<REGION>.amazonaws.com/id/<OIDC_ID>"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
          "StringEquals": {
            "oidc.eks.<REGION>.amazonaws.com/id/<OIDC_ID>:aud": "sts.amazonaws.com",
            "oidc.eks.<REGION>.amazonaws.com/id/<OIDC_ID>:sub": "system:serviceaccount:app:backend-api"
          }
        }
      }
    ]
  }'
```

No restart. Config-loader retry ~30s.

```bash
kubectl logs -n app -l app=backend-api --tail=20
```

Expect: `[config-loader] SUCCESS`.

---

# aws-lambda-codepipeline-codedeploy.md

---
title: "Lambda CI/CD with CodePipeline and CodeDeploy"
description: "End-to-end Lambda deployment pipeline using CodeCommit, CodeBuild, CodePipeline, and CodeDeploy canary traffic shifting."
tags:
  - lambda
  - cicd
  - codepipeline
  - codebuild
  - codedeploy
  - codecommit
  - aws
---
## Overview

Pipeline for Lambda deployments using CodePipeline, CodeBuild, and CodeDeploy canary traffic shifting.

## Resources

```text
AWS CodeCommit  → Source repository
AWS CodeBuild   → Build and package
CodeDeploy      → Lambda deployment
CodePipeline    → Pipeline orchestration
AWS Lambda      → Application
```

## Architecture

```text
Developer → CodeCommit → CodePipeline → CodeBuild
  → zip lambda code + appspec.yml → S3 artifact bucket
  → CodeDeploy → new Lambda version → alias (prod) with traffic shift
```

## Why use CodeDeploy with Lambda?

**Without CodeDeploy:** code push updates Lambda and routes 100% traffic immediately - bad deployments affect all users and rollback is manual.

**With CodeDeploy:** traffic shifts gradually (e.g. 10% → 50% → 100% over 10 minutes). Health check failures trigger automatic rollback.

## Repository structure

```text
lambda-api/
├── src/lambda_function.py
├── appspec.yml
├── buildspec.yml
└── requirements.txt
```

## Sample Lambda

```python
def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello from Lambda",
    }
```

## CodeDeploy AppSpec

```yaml
version: 0.0
Resources:
  - LambdaFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: shop-api
        Alias: prod
        CurrentVersion: 1
        TargetVersion: 2
```

CodeDeploy updates versions automatically during deployment.

## BuildSpec

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
  build:
    commands:
      - pip install -r requirements.txt -t package
      - cp src/lambda_function.py package/
      - cd package && zip -r ../lambda.zip . && cd ..
artifacts:
  files:
    - lambda.zip
    - appspec.yml
```

## Create Lambda alias

CodeDeploy deploys to aliases, not `$LATEST`.

```bash
aws lambda publish-version --function-name shop-api
aws lambda create-alias \
  --function-name shop-api \
  --name prod \
  --function-version 1
```

## Create CodeDeploy application

```bash
aws deploy create-application \
  --application-name shop-api \
  --compute-platform Lambda
```

## Create deployment group

```bash
aws deploy create-deployment-group \
  --application-name shop-api \
  --deployment-group-name prod-group \
  --service-role-arn arn:aws:iam::<ACCOUNT>:role/CodeDeployRole \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes
```

### Deployment strategies

| Strategy | Description |
| --- | --- |
| `LambdaAllAtOnce` | 100% immediately |
| `LambdaCanary10Percent5Minutes` | 10% then wait 5 min |
| `LambdaCanary10Percent10Minutes` | 10% then wait 10 min |
| `LambdaLinear10PercentEvery1Minute` | Gradual linear rollout |

For production, `Canary10Percent5Minutes` is a sensible default.

## Pipeline stages

```text
Stage 1 - Source:  CodeCommit
Stage 2 - Build:   CodeBuild
Stage 3 - Deploy:  CodeDeploy Lambda
```

## Optional validation hook

```python
def lambda_handler(event, context):
    # health check
    return "success"
```

CodeDeploy invokes this validation Lambda before completing traffic shift. On failure: deployment fails, rollback starts, traffic restores.

## IAM roles needed

**CodePipeline role:** CodeCommit, CodeBuild, S3, CodeDeploy

**CodeBuild role:** CloudWatch Logs, S3, Lambda

**CodeDeploy role:** managed policy `AWSCodeDeployRoleForLambda`
---

# aws-lambda-event-pipeline.md

---
title: "Lambda Event-Driven Pipeline Patterns"
description: "EventBridge, SQS, DynamoDB, and RDS event pipeline patterns."
categories:
  - Lambda
  - AWS
  - EventBridge
---
## Overview

Reference implementation for an event-driven order pipeline: EventBridge publishes events, SQS workers write to DynamoDB, and analytics Lambdas persist to RDS.

## Producer Lambda

Publishes an order event to EventBridge.

```python
import json
import boto3
import uuid

eventbridge = boto3.client("events")

def lambda_handler(event, context):
    order = {
        "orderId": str(uuid.uuid4()),
        "userId": "user-101",
        "amount": 250,
        "status": "CREATED",
    }

    eventbridge.put_events(
        Entries=[
            {
                "Source": "app.orders",
                "DetailType": "OrderCreated",
                "Detail": json.dumps(order),
                "EventBusName": "default",
            }
        ]
    )

    return {"statusCode": 200, "body": json.dumps(order)}
```

## SQS worker Lambda

Consumes from SQS and writes to DynamoDB. SNS wraps the message inside the SQS body.

```python
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("OrdersTable")

def lambda_handler(event, context):
    for record in event["Records"]:
        body = json.loads(record["body"])
        message = json.loads(body["Message"])

        table.put_item(
            Item={
                "orderId": message["orderId"],
                "userId": message["userId"],
                "amount": message["amount"],
                "status": message["status"],
            }
        )

    return {"statusCode": 200}
```

## DynamoDB table structure

```text
Table Name: OrdersTable
Partition Key: orderId (String)
```

## Analytics Lambda

Reads events from EventBridge and inserts into PostgreSQL or MySQL RDS.

```python
import json
import os
import pymysql

connection = pymysql.connect(
    host=os.environ["DB_HOST"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    database=os.environ["DB_NAME"],
)

def lambda_handler(event, context):
    detail = event["detail"]
    cursor = connection.cursor()

    query = """
        INSERT INTO order_analytics (order_id, user_id, amount, status)
        VALUES (%s, %s, %s, %s)
    """

    cursor.execute(
        query,
        (detail["orderId"], detail["userId"], detail["amount"], detail["status"]),
    )
    connection.commit()

    return {"statusCode": 200}
```

## RDS table

```sql
CREATE TABLE order_analytics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(255),
    user_id VARCHAR(255),
    amount INT,
    status VARCHAR(50)
);
```

## DynamoDB read Lambda

Fetch an order by ID.

```python
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("OrdersTable")

def lambda_handler(event, context):
    order_id = event["pathParameters"]["id"]
    response = table.get_item(Key={"orderId": order_id})

    return {
        "statusCode": 200,
        "body": json.dumps(response.get("Item", {})),
    }
```

## RDS read Lambda

Fetch analytics records.

```python
import json
import os
import pymysql

connection = pymysql.connect(
    host=os.environ["DB_HOST"],
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    database=os.environ["DB_NAME"],
)

def lambda_handler(event, context):
    cursor = connection.cursor()
    cursor.execute("SELECT * FROM order_analytics LIMIT 10")
    rows = cursor.fetchall()

    return {"statusCode": 200, "body": json.dumps(rows, default=str)}
```

## Required IAM permissions

### DynamoDB Lambda role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem", "dynamodb:GetItem"],
      "Resource": "*"
    }
  ]
}
```

### EventBridge producer role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["events:PutEvents"],
      "Resource": "*"
    }
  ]
}
```

### SQS consumer Lambda role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```
---

# aws-lambda-python-runtime.md

---
title: "AWS Lambda Python Runtime and Packaging"
description: "Python Lambda handler patterns, deployment packages, virtual environments, layers, and packaging notes for boto3 and third-party dependencies."
tags:
  - lambda
  - python
  - boto3
  - serverless
  - aws
  
date: 2026-08-20
---

## Overview

Lambda Python runtimes include **Boto3** and **Botocore** in the execution environment. You can import them without adding them to a deployment package for simple functions.

| Approach | Use when |
| --- | --- |
| **Handler only (.zip)** | No third-party dependencies beyond the runtime SDK |
| **`pip install --target`** | Bundle dependencies into a `.zip` deployment package |
| **Virtual environment** | Isolate dependencies locally before zipping `site-packages` |
| **Lambda layer** | Share dependencies across multiple functions |

AWS recommends packaging **all** dependencies (including Boto3) when you need predictable versions. Mixing a custom `urllib3` (or other transitive dependency) with the runtime SDK can cause version misalignment. See [Runtime-included SDK versions](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html#python-sdk-included).

---

## Example handler

Writes order details to S3 using an environment variable for the bucket name.

```python
import json
import os
import logging
import boto3

logger = logging.getLogger()
logger.setLevel("INFO")

s3_client = boto3.client("s3")
bucket_name = os.environ.get("CONTENT_BUCKET")


def upload_to_s3(key, content):
    try:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=content,
        )
    except Exception as e:
        logger.error(f"Failed to upload content: {e}")
        raise


def lambda_handler(event, context):
    try:
        if isinstance(event, str):
            event = json.loads(event)

        order_id = event.get("order_id")
        amount = event.get("amount")

        if not bucket_name:
            raise ValueError("Missing required bucket")

        content = (
            f"OrderId: {order_id}\n"
            f"Amount: {amount}\n"
        )

        key = f"order/{order_id}.txt"
        upload_to_s3(key, content)

        logger.info(f"Saved to S3 {key} with OrderId: {order_id}")

        return {
            "statusCode": 200,
            "message": "Success",
        }
    except Exception as e:
        logger.error(f"Error processing order: {e}")
        raise
```

**Corrections from draft:** use `isinstance(event, str)` (not `typeof`), and log `{e}` directly in f-strings.

---

## Deployment package with `pip --target`

Install dependencies into a `package/` folder, zip them at the archive root, then add your handler `.py` file.

### Bash

```bash
pip install --target ./package boto3

cd package
zip -r ../my_deployment_package.zip .
cd ..

zip my_deployment_package.zip lambda_function.py
```

### PowerShell

```powershell
pip install --target .\package boto3

Push-Location package
Compress-Archive -Path * -DestinationPath ..\my_deployment_package.zip
Pop-Location

Compress-Archive -Path lambda_function.py -Update -DestinationPath .\my_deployment_package.zip
```

`lambda_function.py` must sit at the **root** of the `.zip` alongside installed packages.

---

## Deployment package with a virtual environment

### Bash

```bash
cd my_function
python3 -m venv my_virtual_env
source ./my_virtual_env/bin/activate

pip install boto3
pip show <package_name>   # optional: confirm install location

deactivate

cd my_virtual_env/lib/python3.x/site-packages
zip -r ../../../../my_deployment_package.zip .

cd ../../../../
zip my_deployment_package.zip lambda_function.py
```

Replace `python3.x` with your venv Python version (for example `python3.14`).

### PowerShell

```powershell
cd my_function
python -m venv my_virtual_env
.\my_virtual_env\Scripts\Activate.ps1

pip install boto3
pip show <package_name>

deactivate

cd my_virtual_env\Lib\site-packages
Compress-Archive -Path * -DestinationPath ..\..\..\..\my_deployment_package.zip

cd ..\..\..\..
Compress-Archive -Path lambda_function.py -Update -DestinationPath .\my_deployment_package.zip
```

On Windows, venv packages live under `Lib\site-packages` (not `lib/python3.x/site-packages`).

---

## Lambda layers

Use a layer when multiple functions share the same dependencies.

### Install dependencies into `python/`

```bash
pip install requests -t python/
```

For packages with **native (C/C++)** extensions (for example NumPy, Pandas), target the Lambda Linux platform:

```bash
pip install numpy \
  --platform manylinux2014_x86_64 \
  --only-binary=:all: \
  -t python/
```

Use `manylinux2014_aarch64` for **arm64** functions. For full `pip` flags, see [Working with .zip file archives for Python](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html).

### Create the layer archive

**Bash:**

```bash
zip -r layer.zip python/
```

**PowerShell:**

```powershell
Compress-Archive -Path .\python -DestinationPath .\layer.zip
```

### Required directory layout

```text
python/                 # required top-level folder
├── requests/
├── boto3/
├── numpy/
└── (transitive dependencies)
```

If you build from a venv, paths may look like `python/lib/python3.x/site-packages/`. Lambda accepts any layout as long as **`python/` is at the root of the `.zip`**.

---

## Notes

### `__pycache__` folders

Do **not** include `__pycache__` directories in deployment packages or layers. AWS documents this as a packaging best practice - see [Using `__pycache__` folders](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html#python-package-pycache).

### Pure Python vs native wheels

- **Pure Python** packages: `pip install --target ./package <name>` on your build machine is usually enough.
- **Native extensions**: use `--platform`, `--implementation cp`, `--python-version`, and `--only-binary=:all:` so wheels match the Lambda execution environment.

### References

- [Lambda Python runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
- [Python deployment packages (.zip)](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html)
- [Python Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/python-layers.html)

---

# aws-lambda-rds-iam-auth.md

---
title: "Lambda and RDS: IAM Database Authentication"
description: "EventBridge, SQS, DynamoDB, and RDS event pipeline patterns."
categories:
  - Lambda
  - AWS
  - EventBridge
  - RDS
  - MySQL
  - PgSQL
  - psycorg
  - pymysql
---


## Policy

Reference: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.IAMPolicy.html

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "rds-db:connect"
            ],
            "Resource": [
                "arn:aws:rds-db:us-east-1:271995869266:dbuser:*/admin"
            ]
        }
    ]
}
```

## IAM Authenticate the User

Reference: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.DBAccounts.html

- MySQL
`CREATE USER 'jane_doe' IDENTIFIED WITH AWSAuthenticationPlugin AS 'RDS';`

- PostgreSQL
`CREATE USER db_userx; 
GRANT rds_iam TO db_userx;`

## Code Example

./content/dir/lambda/lambda-rds-pymysql.py
./content/dir/lambda/lambda-rds-psycorg.py

---

# aws-monitoring-grafana-prometheus.md

---
title: "Monitoring with Grafana and Prometheus"
description: Set up Grafana and Prometheus on EKS with CloudWatch observability.
tags:
  - eks
  - prometheus
  - grafana
  - cloudwatch
  - helm
  - monitoring
  - observability
  - oidc
---

# Monitoring with Grafana and Prometheus

## Monitoring With CloudWatch Observability

* **Policy Required:** `CloudWatchAgentServerPolicy`

## Monitoring With Grafana and Prometheus

1. Helm Install
```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-4
chmod 700 get_helm.sh
./get_helm.sh
```
---
1. Create an IAM OIDC provider for your cluster:
```bash
eksctl utils associate-iam-oidc-provider --region <region> --cluster <cluster-name> --approve
```
2. Create an IAM policy for monitoring (for example CloudWatch).
3. Create a Kubernetes service account and associate it with the IAM role:
```bash
eksctl create iamserviceaccount \
  --name <service-account-name> \
  --namespace <namespace> \
  --cluster <cluster-name> \
  --attach-policy-arn arn:aws:iam::<account-id>:policy/<policy-name> \
  --approve
```
---
### 1. Create a Prometheus Namespace

```bash
kubectl create namespace prometheus
```

### 2. Add the Prometheus Community Chart Repository

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
```

### 3. Deploy Prometheus ( Adds Prometheus by default )

For ephemeral storage: data lost when pods are recreated:  `prometheus.prometheusSpec.storageSpec.emptyDir={}` 

```bash
helm install prometheus \
>   prometheus-community/kube-prometheus-stack \
>   -n prometheus \
>   --create-namespace \
>   --set crds.enabled=true
```

- avoid
  - ` --set alertmanager.persistence.storageClass="gp2"`
  - `--set server.persistentVolume.storageClass="gp2"`

```bash
# Check its status
kubectl --namespace prometheus get pods -l "release=prometheus"

# Get Grafana 'admin'
kubectl --namespace prometheus get secrets prometheus-grafana -o jsonpath="{.data.admin-password}" | base64 -d ; echo

# Access Grafana on local instance
export POD_NAME=$(kubectl --namespace prometheus get pod -l "app.kubernetes.io/name=grafana,app.kubernetes.io/instance=prometheus" -oname)
  kubectl --namespace prometheus port-forward $POD_NAME 3000 # 9000:3000
  
# Get Grafana 'admin'
kubectl get secret --namespace prometheus -l app.kubernetes.io/component=admin-secret -o jsonpath="{.items[0].data.admin-password}" | base64 --decode ; echo

```

### 4. Verify the Deployment

```bash
kubectl get pods -n prometheus
```

### 5. Port Forward the Prometheus Console

Use `kubectl` to port forward the Prometheus console to your local machine:

```bash
kubectl --namespace=prometheus port-forward deploy/prometheus-server 9090
```

You can then access the Prometheus console at:

```text
http://localhost:9090
```
---
### Add Grafana
```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install grafana-k8s-monitoring grafana/k8s-monitoring -n <namespace> --create-namespace
```


## debug

```bash
kubectl get events -n prometheus --sort-by=.lastTimestamp

# Check Alertmanager
kubectl describe pod prometheus-alertmanager-0 -n prometheus
```
```bash
# remove everything
kubectl delete namespace prometheus
```
---

# aws-network-firewall-centralized-egress.md

---
title: "AWS Network Firewall for Centralized Egress"
description: "Rule groups, policies, endpoints, stateless vs stateful processing, domain lists, Suricata, TLS inspection, managed rules, and logging - with the centralized TGW lab as the multi-VPC pattern."
tags:
  - network-firewall
  - vpc
  - suricata
  - networking
  - aws
  - notes
date: 2026-08-29
---

## What it is

Layer 4–7 inspection in the VPC data path. Not a replacement for security groups or NACLs: those stay on ENIs and subnets. Network Firewall sits **on the route** (you steer CIDRs to a firewall endpoint).

| Piece | Role |
| --- | --- |
| Rule group | Stateless (per packet, 5-tuple) or stateful (flow + Suricata) |
| Firewall policy | Ordered groups, default actions, optional TLS inspection config |
| Firewall | One policy, bound to a **primary VPC** and subnet mappings |
| Firewall endpoint | Per-AZ `vpce` in a **dedicated** subnet. Cannot inspect that subnet |

Create empty **firewall subnets** (one AZ each). Put no workloads there. Extra endpoints (same AZ, same or other VPCs) use **VPC endpoint associations**; extra VPCs may only use AZs that already have a primary mapping. Capacity: **100 Gbps per AZ**, shared across endpoints on that firewall in the AZ.

---

## How a packet is filtered

[Policy processing](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policy-processing.html):

1. **Stateless** engine - rule groups by priority (lowest first). Match → drop, pass (skip stateful), or **forward to stateful**.
2. If **no** stateless match: **stateless default** (full packet vs UDP fragment). Default must be **forward to stateful** if you want Suricata/domain lists at all. Other protocols’ fragments are dropped.
3. **Stateful** engine (Suricata) - flow-aware. Logs apply here only.

**Stateful rule order** on the policy:

| Mode | Behavior |
| --- | --- |
| **Strict order** (recommended) | Your sequence, then a **default** you set (drop/pass/alert). |
| **Action order** (legacy “default”) | All `pass`, then `drop`/`reject`, then `alert`. First match wins. Unmatched traffic **passes**. |

Unlike security groups, the stateful engine’s action-order default is **allow**.

---

## Stateful rule groups

| Kind | Use |
| --- | --- |
| Domain list | HTTP `Host` and/or TLS **SNI** (no extra DNS lookup). Wildcard `.example.com`. Allowlist or denylist. |
| 5-tuple / standard | Port, protocol, CIDR in flow context |
| Suricata IPS | Compatible signatures (`pass` / `drop` / `reject` / `alert`) |
| AWS managed | Active threat defense; domain/IP lists; threat signatures. Most at no extra rule-group charge. Override a group to **alert** before enforce. Marketplace groups exist separately. |

SNI/Host can be spoofed; pair with IP rules if that matters. Domain lists do **not** decrypt TLS.

Lab allowlist (CloudFormation): [`inspection.yaml`](./dir/vpc/egress-firewall/inspection.yaml) - `ALLOWLIST` + `TLS_SNI` + `.amazonaws.com`.

Workshop-style Suricata (HTTP host, TLS SNI, then drop other established TCP):

<details>
<summary><strong>Example Suricata rules</strong></summary>

```text
pass http any any -> any any (http.host; dotprefix; content:".amazonaws.com"; endswith; msg:"Permit HTTP to amazonaws.com"; sid:1000001; rev:1;)

pass tls any any -> any any (tls.sni; content:"aws.amazon.com"; startswith; nocase; endswith; msg:"Permit HTTPS to aws.amazon.com"; sid:1000002; rev:1;)

drop tcp any any -> any any (flow:established,to_server; msg:"Deny other TCP"; sid:1000003; rev:1;)
```

`sid` values must be unique in the group. The drop rule does not cover UDP/ICMP. Under **action order**, all `pass` rules run before `drop`.

</details>

---

## TLS inspection (decrypt)

Optional. Separate from SNI matching. Attach a **TLS inspection configuration** to a **new** policy, then to the firewall. ACM certificates required.

| Direction | Certificate |
| --- | --- |
| Inbound | Server cert in ACM per domain you decrypt |
| Outbound | **CA** you import to ACM; firewall mints certs to the client. Trust that CA on clients. |

After decrypt, HTTP keywords apply; most TLS keywords except `tls.sni` do not match decrypted flows. Scope is 5-tuple (often `:443`). Client Hello **without SNI**, Encrypted Client Hello / encrypted SNI, and some TLS 1.3 cases: connection **RST**. Self-signed downstream certs are not supported for outbound verification (public Mozilla roots). Optional revocation checks on outbound. Billing: **advanced inspection** traffic + endpoints.

---

## Routing

Firewall does nothing until route tables send traffic through the endpoint **and back**. Typical single-VPC internet path: workload subnet `0.0.0.0/0` → `vpce`; IGW/NAT edge RT for the workload CIDR → same `vpce`; firewall subnet RT → IGW/NAT and `local`.

Steer **both directions** if you need both inspected. Use the endpoint in the **same AZ** as the workload. Multi-AZ stateful inspection behind Transit Gateway: **appliance mode** on the inspection attachment - [egress + TGW lab](./vpc-egress-tgw-firewall.md).

**Models:** firewall in each VPC (distributed) vs inspection VPC on TGW (centralized). Same policy object; different routing.

---

## Logging and metrics

Stateful only (traffic that was forwarded). Destinations: CloudWatch Logs, S3, Firehose.

| Log type | Content |
| --- | --- |
| FLOW | Flows the stateful engine saw |
| ALERT | `drop` / `reject` / `alert` matches |
| TLS | TLS inspection events (needs TLS inspection) |

Enable before you need forensics. CloudWatch metrics cover both engines at a coarser grain.

---

## Order of work

1. Firewall subnets (empty) per AZ.  
2. Rule groups → policy (stateless default **forward to SFE**; prefer **strict** order).  
3. Firewall + subnet mappings.  
4. Routes (and TGW tables if centralized).  
5. Logging.  
6. Optional: managed groups (alert mode first), TLS inspection, VPC endpoint associations.

---

## References

- [What is Network Firewall](https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html)
- [Components](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-components.html)
- [How traffic is filtered](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policy-processing.html)
- [Subnet layout](https://docs.aws.amazon.com/network-firewall/latest/developerguide/vpc-config-subnets.html)
- [Route tables](https://docs.aws.amazon.com/network-firewall/latest/developerguide/vpc-config-route-tables.html)
- [Domain lists](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-domain-names.html)
- [Suricata rule groups](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html)
- [Managed rule groups](https://docs.aws.amazon.com/network-firewall/latest/developerguide/nwfw-managed-rule-groups.html)
- [TLS inspection](https://docs.aws.amazon.com/network-firewall/latest/developerguide/tls-inspection-configurations.html)
- [Logging](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-logging.html)
- [Deployment models (blog)](https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/)
- [Centralized egress lab](./vpc-egress-tgw-firewall.md)
- [Networking on AWS](./networking-on-aws.md)

---

# aws-networking-overview.md

---
title: "AWS Networking Overview"
description: "Runbook for Network Firewall, Transit Gateway hub-and-spoke, VPC Lattice, and centralized inspection routing patterns."
tags:
  - vpc
  - networking
  - transit-gateway
  - network-firewall
  - vpc-lattice
  - aws
---
## Overview

Runbook for AWS Network Firewall designs, especially centralized inspection with Transit Gateway and VPC route tables. See also [VPC Lattice](#vpc-lattice) for service-to-service connectivity.

### Quick checklist

- Confirm firewall endpoints exist in every inspected AZ.
- Check route tables: traffic must route through the correct firewall endpoint or TGW attachment.
- Enable flow and alert logs before incident testing.
- Validate stateless default actions and stateful rule-group order.

### References

- [Network Firewall logs to CloudWatch](https://docs.aws.amazon.com/network-firewall/latest/developerguide/logging-cw-logs.html)
- [Network Firewall logs to S3](https://docs.aws.amazon.com/network-firewall/latest/developerguide/logging-s3.html)
- [Network Firewall CloudWatch metrics](https://docs.aws.amazon.com/network-firewall/latest/developerguide/monitoring-cloudwatch.html)

## Transit Gateway and Network Firewall



## **Original references (from Notion)**

> Original links preserved from your Notion page. **All diagrams below use public AWS-hosted URLs** (AWS blogs + AWS documentation) so they render without authentication.
> 

### **Centralized traffic filtering**

[**Deploy centralized traffic filtering using AWS Network Firewall | Amazon Web Services**](https://aws.amazon.com/blogs/networking-and-content-delivery/deploy-centralized-traffic-filtering-using-aws-network-firewall/)

![Figure 2 - Network Firewall deployment automation architecture (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2021/06/18/figure2.png)

---

### **Deployment models**

[**Deployment models for AWS Network Firewall | Amazon Web Services**](https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/)

![Inspection VPC overview - deployment models (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/inspection-vpc-overview-high-res.png)

![North-south central egress model (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/north-south-central-egress-high-res.png)

![East-west inspection model (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/east-west-inspection-model-high-res.png)

---

### **Transit Gateway getting started**

[**Tutorials: Get started with AWS Transit Gateway - Amazon VPC**](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-getting-started.html#step-test-tgw)

![Figure 3 - Example architecture before solution deployment (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2021/06/18/figure3.png)

![Figure 4 - Example architecture after solution deployment (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2021/06/18/figure4.png)

---

### **Egress VPC with TGW + CDK**

[**Building an egress VPC with AWS Transit Gateway and the AWS CDK | Amazon Web Services**](https://aws.amazon.com/blogs/networking-and-content-delivery/building-an-egress-vpc-with-aws-transit-gateway-and-the-aws-cdk/)

![Transit Gateway egress VPC architecture (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/03/16/TG-architecture-overview-1.png)

---

### **Outbound inspection (NAT + IGW)**

[**Outbound traffic inspection through a NAT gateway and internet gateway - AWS Prescriptive Guidance**](https://docs.aws.amazon.com/prescriptive-guidance/latest/inline-traffic-inspection-third-party-appliances/outbound-traffic-inspection-nat-gateway.html)

![Outbound traffic inspection via NAT gateway (AWS Prescriptive Guidance)](https://docs.aws.amazon.com/images/prescriptive-guidance/latest/inline-traffic-inspection-third-party-appliances/images/4-outbound-inspection.png)

---

### **Additional diagrams**

![Multi-AZ Network Firewall deployment (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/anfw-multiaz-deployment-high-res.png)

![Inspection VPC traffic flow (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/inspection-vpc-traffic-flow-high-res.png)

---

### **Security groups**

[**Control traffic to your AWS resources using security groups - Amazon Virtual Private Cloud**](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html#AddRemoveRules)

![Protected VPC with Network Firewall endpoints (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/anfw-protected-vpc-high-res.png)

---

## **Transit Gateway routing (from Notion)**

[**How AWS Transit Gateway works - Amazon VPC**](https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-routing-overview)

[**Transit gateway route tables in AWS Transit Gateway - Amazon VPC**](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-route-tables.html#enable-tgw-route-propagation)

---

## **Operational checklist (from Network Firewall parent)**

From [Network Firewall](https://www.notion.so/357cd8b2d8788031bafed18fae78a192) parent page:

- [ ]  Verify route tables: subnet → TGW attachment routes
- [ ]  Verify Network Firewall endpoints are in the correct AZ/subnets
- [ ]  Verify security groups + NACLs for inspection subnets
- [ ]  Log destinations: CloudWatch Logs / S3 (enable before incidents)
- [ ]  Stateless vs stateful rule groups: order + default action
- [ ]  Test reachability with Reachability Analyzer when possible

---

## Architecture mental model

```mermaid
flowchart TB
    subgraph Spokes["Spoke VPCs (workloads)"]
        S1[Spoke VPC A]
        S2[Spoke VPC B]
    end

    subgraph Hub["Hub / Inspection VPC"]
        TGW_ATT[TGW VPC Attachment]
        NFW[AWS Network Firewall endpoints]
        NAT[NAT Gateway]
        IGW[Internet Gateway]
    end

    TGW[AWS Transit Gateway]

    S1 --> TGW
    S2 --> TGW
    TGW --> TGW_ATT
    TGW_ATT --> NFW
    NFW --> NAT
    NAT --> IGW
    IGW --> Internet((Internet))

    S1 -. east-west .-> S2
```

| Layer | Controls |
| --- | --- |
| **VPC route table** | Sends traffic *toward* TGW (spokes) or *toward* firewall subnets (hub) |
| **TGW route table** | Decides which attachment receives traffic (segmentation, egress steering) |
| **Network Firewall policy** | Allow/deny at L3–L7 (stateless + stateful rule groups) |
| **Security groups / NACLs** | Endpoint ENI reachability; stateless NACLs can break return traffic |

**Golden rules**

1. **Symmetric routing** - return path must mirror forward path (especially through firewall + NAT).
2. **One inspection path per flow** - avoid hairpinning or double-NAT unless designed.
3. **AZ affinity** - firewall endpoints and NAT in the same AZ as the traffic source when possible.
4. **TGW route table = segmentation** - separate RTs to block spoke-to-spoke while allowing shared egress.

---

## **Deployment patterns**

### **Pattern 1 - Centralized inspection VPC (hub)**

All internet-bound and (optionally) east-west traffic is steered to a dedicated **inspection VPC** with Network Firewall endpoints, then to NAT/IGW.

| Use when | Pros | Cons |
| --- | --- | --- |
| Multi-account / multi-VPC hub-and-spoke | Single policy enforcement point, easier auditing | Inspection VPC is a blast-radius / capacity choke point |
| Regulated egress | Consistent logging and filtering | Cross-AZ charges if not designed carefully |

**Reference:** [Deploy centralized traffic filtering using AWS Network Firewall](https://aws.amazon.com/blogs/networking-and-content-delivery/deploy-centralized-traffic-filtering-using-aws-network-firewall/)

![Centralized inspection VPC (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/inspection-vpc-overview-high-res.png)

---

### **Pattern 2 - Distributed (per-VPC) firewall**

Network Firewall deployed in each VPC; TGW used only for connectivity.

| Use when | Pros | Cons |
| --- | --- | --- |
| Strong isolation between tenants | No shared inspection choke point | Policy drift across VPCs |
| Lower cross-VPC traffic through hub | Simpler per-VPC routing | Higher operational overhead |

**Reference:** [Deployment models for AWS Network Firewall](https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/)

---

### **Pattern 3 - Egress VPC (TGW + NAT, firewall inline)**

Spokes send `0.0.0.0/0` (and RFC1918 if needed) to TGW → hub inspection VPC → NAT → IGW.

| Component | Role |
| --- | --- |
| Spoke RT | `0.0.0.0/0 → TGW` |
| TGW RT (spoke) | Default or hub CIDR → inspection VPC attachment |
| Inspection VPC RT | Firewall subnet → NAT → IGW |
| Hub TGW RT | Routes back to spoke CIDRs |

**Reference:** [Building an egress VPC with AWS Transit Gateway and the AWS CDK](https://aws.amazon.com/blogs/networking-and-content-delivery/building-an-egress-vpc-with-aws-transit-gateway-and-the-aws-cdk/)

![Egress VPC pattern with Transit Gateway (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/03/16/TG-architecture-overview-1.png)

---

### **Pattern 4 - East-west inspection between spokes**

Spoke A → TGW → inspection VPC (Network Firewall) → TGW → Spoke B.

Requires explicit TGW routes (no silent propagation) and SG rules allowing peer CIDRs **after** firewall policy permits.

---

## **TGW routing deep dive**

### **How TGW decides where to send packets**

1. Packet arrives at a **TGW attachment** (VPC, VPN, Direct Connect, peering).
2. TGW uses the **route table associated with that attachment** (association).
3. Longest-prefix match selects the target attachment.
4. Optional **route propagation** auto-adds routes (often disabled in production for control).

**Docs**

- [How Transit Gateway works](https://docs.aws.amazon.com/vpc/latest/tgw/how-transit-gateways-work.html#tgw-routing-overview)
- [Transit gateway route tables](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-route-tables.html)
- [Enable/disable route propagation](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-route-tables.html#enable-tgw-route-propagation)
- [Blackhole routes](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-blackhole-route.html)

![East-west cross-region inspection with TGW (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/east-west-cross-region-inspection-model-high-res.png)

### **Segmentation example (spokes isolated, shared egress)**

| Route table | Associated with | Routes |
| --- | --- | --- |
| `tgw-rt-spoke-a` | Spoke A attachment | `10.0.0.0/16 → hub`, `0.0.0.0/0 → hub`, **no** route to Spoke B |
| `tgw-rt-spoke-b` | Spoke B attachment | `10.0.0.0/16 → hub`, `0.0.0.0/0 → hub`, **no** route to Spoke A |
| `tgw-rt-hub` | Hub / inspection attachment | `10.1.0.0/16 → A`, `10.2.0.0/16 → B` |

> **Mental model:** TGW route table = *who can talk to whom*; VPC route table = *how to reach TGW*.
> 

---

## **Network Firewall essentials**

### **Components**

| Component | Purpose |
| --- | --- |
| **Firewall policy** | Ordered rule groups + default actions |
| **Stateful rule group** | Connection-aware allow/deny (Suricata-compatible) |
| **Stateless rule group** | 5-tuple matching; runs first |
| **Firewall** | Binds policy to VPC |
| **Firewall endpoints** | AZ-local ENIs in dedicated subnets |

**Docs**

- [Network Firewall components](https://docs.aws.amazon.com/network-firewall/latest/developerguide/architecture-general.html)
- [Firewall policies](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-policies.html)
- [Stateful vs stateless rules](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-stateless-rulegroups.html)
- [Logging](https://docs.aws.amazon.com/network-firewall/latest/developerguide/logging.html)

![Network Firewall multi-AZ endpoint deployment (AWS blog)](https://d2908q01vomqb2.cloudfront.net/5b384ce32d8cdef02bc3a139d4cac0a22bb029e8/2020/11/17/anfw-multiaz-deployment-high-res.png)

### **Routing in the inspection VPC (typical)**

```
Spoke → TGW → Inspection VPC subnet
              → Route: 0.0.0.0/0 or peer CIDR → Firewall endpoint
              → Firewall endpoint subnet RT → NAT (egress) or back to TGW (east-west)
```

### **Rule evaluation order (simplified)**

1. **Stateless** rules (custom + AWS managed)
2. **Stateful** rules
3. **Default action** in policy (drop or forward)

> Enable **alert** and **flow** logs to S3 or CloudWatch **before** go-live.
> 

---

## **Hub-and-spoke egress (related concept)**

From your [Hub-and-spoke network](https://www.notion.so/344cd8b2d87880a8b9d4c756a073b946) notes - applies directly when adding a firewall:

### **Part 1 - All VPCs communicate; internet only via hub**

| Goal | Route pattern |
| --- | --- |
| Spoke ↔ Spoke | Spoke RT: peer CIDR → TGW; TGW RT: both spokes in same or hub RT |
| Spoke → Internet | Spoke RT: `0.0.0.0/0 → TGW`; Hub: NAT + IGW |
| Hub → Internet | Private RT: `0.0.0.0/0 → NAT`; Public RT: `0.0.0.0/0 → IGW` |

**With firewall:** insert Network Firewall **between** TGW attachment subnets and NAT for egress; update RTs so traffic hits firewall endpoints first.

### **Part 2 - Spokes isolated (no b ↔ c), shared egress**

- Separate TGW route tables per spoke (`tgw-rt-b`, `tgw-rt-c`)
- Hub RT has routes to both; spoke RTs have **no** cross-spoke routes
- Disable automatic propagation if it re-opens east-west paths

---

## **Troubleshooting playbook**

### **Symptom: No connectivity spoke → internet**

| # | Check |
| --- | --- |
| 1 | Spoke VPC RT: `0.0.0.0/0 → TGW` |
| 2 | TGW RT: route to inspection/hub attachment |
| 3 | Inspection VPC RT: traffic routed to **firewall endpoint** subnets |
| 4 | Firewall policy: default action not dropping unexpectedly |
| 5 | Post-firewall RT: `0.0.0.0/0 → NAT` |
| 6 | NAT in public subnet, EIP attached |
| 7 | Public RT: `0.0.0.0/0 → IGW` |
| 8 | SG on firewall endpoint ENIs: allow required ports |
| 9 | NACLs: not blocking ephemeral return ports |

### **Symptom: Spoke ↔ spoke works when it should not**

| # | Check |
| --- | --- |
| 1 | Separate TGW route tables - no route between spoke CIDRs |
| 2 | Route propagation disabled or scoped |
| 3 | Correct association: each attachment → intended RT only |

### **Symptom: Intermittent / one-AZ failures**

| # | Check |
| --- | --- |
| 1 | Firewall endpoint per AZ used by workloads |
| 2 | NAT Gateway AZ matches active traffic path |
| 3 | TGW attachment subnets span required AZs |

### **Tools**

- [VPC Reachability Analyzer](https://docs.aws.amazon.com/vpc/latest/reachability/what-is-reachability-analyzer.html)
- [VPC Flow Logs](https://docs.aws.amazon.com/vpc/latest/userguide/flow-logs.html)
- [Network Firewall logging](https://docs.aws.amazon.com/network-firewall/latest/developerguide/logging.html)
- TGW **Route analyzer** (console) for effective routes

---

## **Additional reference links**

### **AWS Transit Gateway**

| Topic | Link |
| --- | --- |
| What is a transit gateway? | [https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html](https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html) |
| TGW attachments | [https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-vpc-attachments.html) |
| Appliance mode | [https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-appliance-scenario.html](https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-appliance-scenario.html) |
| Inter-Region peering | [https://docs.aws.amazon.com/vpc/latest/tgw/tgw-peering.html](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-peering.html) |
| Quotas | [https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-quotas.html](https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-quotas.html) |

### **AWS Network Firewall**

| Topic | Link |
| --- | --- |
| Developer Guide | [https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html](https://docs.aws.amazon.com/network-firewall/latest/developerguide/what-is-aws-network-firewall.html) |
| Creating a firewall | [https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-creating.html](https://docs.aws.amazon.com/network-firewall/latest/developerguide/firewall-creating.html) |
| Suricata-compatible rules | [https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html](https://docs.aws.amazon.com/network-firewall/latest/developerguide/stateful-rule-groups-ips.html) |
| AWS managed rule groups | [https://docs.aws.amazon.com/network-firewall/latest/developerguide/aws-managed-rule-groups.html](https://docs.aws.amazon.com/network-firewall/latest/developerguide/aws-managed-rule-groups.html) |
| Monitoring | [https://docs.aws.amazon.com/network-firewall/latest/developerguide/monitoring-cloudwatch.html](https://docs.aws.amazon.com/network-firewall/latest/developerguide/monitoring-cloudwatch.html) |

### **Prescriptive & architecture guidance**

| Topic | Link |
| --- | --- |
| Inline traffic inspection (third-party appliances) | [https://docs.aws.amazon.com/prescriptive-guidance/latest/inline-traffic-inspection-third-party-appliances/welcome.html](https://docs.aws.amazon.com/prescriptive-guidance/latest/inline-traffic-inspection-third-party-appliances/welcome.html) |
| Centralized egress with TGW | [https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-the-internet.html](https://docs.aws.amazon.com/whitepapers/latest/building-scalable-secure-multi-vpc-network-infrastructure/centralized-access-to-the-internet.html) |
| AWS Security Reference Architecture | [https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html) |
| Well-Architected - Security pillar | [https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html) |

### **Blogs (same series as Notion)**

| Title | Link |
| --- | --- |
| Centralized traffic filtering | [https://aws.amazon.com/blogs/networking-and-content-delivery/deploy-centralized-traffic-filtering-using-aws-network-firewall/](https://aws.amazon.com/blogs/networking-and-content-delivery/deploy-centralized-traffic-filtering-using-aws-network-firewall/) |
| Deployment models | [https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/](https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/) |
| Egress VPC with TGW + CDK | [https://aws.amazon.com/blogs/networking-and-content-delivery/building-an-egress-vpc-with-aws-transit-gateway-and-the-aws-cdk/](https://aws.amazon.com/blogs/networking-and-content-delivery/building-an-egress-vpc-with-aws-transit-gateway-and-the-aws-cdk/) |
| Automating Network Firewall with CDK | [https://aws.amazon.com/blogs/networking-and-content-delivery/automating-aws-network-firewall-deployments-with-aws-cdk/](https://aws.amazon.com/blogs/networking-and-content-delivery/automating-aws-network-firewall-deployments-with-aws-cdk/) |
| East-west inspection with TGW | [https://aws.amazon.com/blogs/networking-and-content-delivery/centralized-inspection-of-east-west-traffic-using-aws-transit-gateway/](https://aws.amazon.com/blogs/networking-and-content-delivery/centralized-inspection-of-east-west-traffic-using-aws-transit-gateway/) |

### **Public architecture diagrams (AWS blogs & documentation)**


### **Related (WAF - application layer, from parent page)**

[**AWS WAF for Application Load Balancers**](https://aws.amazon.com/blogs/aws/aws-web-application-firewall-waf-for-application-load-balancers/)

> **Note:** AWS WAF protects HTTP/S at ALB/API Gateway/CloudFront. **Network Firewall** operates at VPC perimeter (L3–L7). Use both in layered defense.
> 

---

## **Quick comparison: Network Firewall vs WAF vs SG**

| Control | Layer | Scope |
| --- | --- | --- |
| Security Group | Instance ENI | Allow/deny per ENI |
| Network ACL | Subnet | Stateless subnet boundary |
| **Network Firewall** | VPC / TGW hub | Centralized IDS/IPS-style filtering |
| **AWS WAF** | ALB / CloudFront / API GW | HTTP/S application attacks |

---

## VPC Lattice

Notes for Amazon VPC Lattice service-to-service connectivity, authorization, and observability across VPCs and accounts.

### Key concepts

- A **service network** is the logical boundary for services and resource configurations.
- Clients reach the network through VPC association or a service-network VPC endpoint.
- Use auth policies and observability deliberately; connectivity is not authorization.

### When to consider

- Microservices that span VPCs/accounts and need simpler application networking.
- Modernization paths where service discovery, connectivity, and monitoring should be centralized.

### References

- [VPC Lattice service networks](https://docs.aws.amazon.com/vpc-lattice/latest/ug/service-networks.html)
- [VPC Lattice reference architecture (PDF)](https://docs.aws.amazon.com/pdfs/architecture-diagrams/latest/amazon-vpc-lattice-use-cases/amazon-vpc-lattice-use-cases.pdf)
---

# aws-prometheus-alerts-sns-sqs.md

---
title: "Prometheus Alerts with SNS and SQS"
description: Wire Prometheus Alertmanager to SNS and SQS on EKS.
tags:
  - eks
  - prometheus
  - alertmanager
  - sns
  - sqs
  - pod-identity
  - iam
  - monitoring
---
# Prometheus Alerts with SNS and SQS

## 1. Create SNS topic

```bash
aws sns create-topic \
  --name eks-prometheus-alerts \
  --region us-east-1
```

## 2. Allow Alertmanager to publish to SNS

```bash
cat <<EOF > sns-publish-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "arn:aws:sns:us-east-1:123456789012:eks-prometheus-alerts"
    }
  ]
}
EOF
```

## 3. Create IAM role for Pod Identity

### Trust policy

```bash
cat <<EOF > alertmanager-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "pods.eks.amazonaws.com"
      },
      "Action": [
        "sts:AssumeRole",
        "sts:TagSession"
      ]
    }
  ]
}
EOF
```

### Create role and policy

```bash
aws iam create-role \
  --role-name EKS-Alertmanager-SNS \
  --assume-role-policy-document file://alertmanager-trust-policy.json

aws iam create-policy \
  --policy-name PrometheusAlertmanagerSNSPolicy \
  --policy-document file://sns-publish-policy.json
```

**Attach the policy to the role:**

```bash
aws iam attach-role-policy \
  --role-name EKS-Alertmanager-SNS \
  --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/PrometheusAlertmanagerSNSPolicy
```

## 4. Use EKS Pod Identity for Alertmanager

Ensure the `eks-pod-identity-agent` add-on is installed:

```bash
kubectl get pods -n kube-system | grep eks-pod-identity-agent
```

**Verify the Alertmanager service account:**

This guide uses the `prometheus` namespace and `prometheus-kube-prometheus-alertmanager` service account. The namespace and service account name can differ depending on how kube-prometheus-stack was installed.

```bash
kubectl get sa -n prometheus

kubectl get pod \
  -n prometheus \
  alertmanager-prometheus-kube-prometheus-alertmanager-0 \
  -o jsonpath='{.spec.serviceAccountName}{"\n"}'
```

**Create the Pod Identity association.** Replace `<CLUSTER_NAME>` and `<ACCOUNT_ID>`:

This links the Alertmanager service account to the IAM role so the pod can publish to SNS without static credentials.

```bash
aws eks create-pod-identity-association \
  --cluster-name <CLUSTER_NAME> \
  --namespace prometheus \
  --service-account prometheus-kube-prometheus-alertmanager \
  --role-arn arn:aws:iam::<ACCOUNT_ID>:role/EKS-Alertmanager-SNS \
  --region us-east-1
```

Pod Identity credentials are injected when a pod starts. An already-running Alertmanager pod will not use the association until it is restarted.

```bash
kubectl rollout restart statefulset \
  alertmanager-prometheus-kube-prometheus-alertmanager \
  -n prometheus
```

**Verify the association:**

```bash
aws eks list-pod-identity-associations \
  --cluster-name <CLUSTER_NAME> \
  --region us-east-1
```

## 5. Alertmanager configuration

```yaml
# values.yaml
alertmanager:
  alertmanagerSpec:
    serviceAccountName: prometheus-kube-prometheus-alertmanager

  config:
    global:
      resolve_timeout: 5m

    route:
      receiver: sns
      group_by:
        - alertname
        - namespace
        - pod
      group_wait: 30s
      group_interval: 5m
      repeat_interval: 1h

    receivers:
      - name: sns
        sns_configs:
          - topic_arn: arn:aws:sns:us-east-1:<ACCOUNT_ID>:eks-prometheus-alerts
            sigv4:
              region: us-east-1
            send_resolved: true
```

**Apply:**

```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  -f values.yaml
```

## 6. Verify

Wait for the Alertmanager rollout:

```bash
kubectl rollout status statefulset \
  alertmanager-prometheus-kube-prometheus-alertmanager \
  -n prometheus
```

Confirm Alertmanager received AWS credentials from Pod Identity:

```bash
kubectl exec -n prometheus \
  alertmanager-prometheus-kube-prometheus-alertmanager-0 \
  -- env | grep AWS
```


---

# aws-serverless-sam-guide.md

---
title: "Serverless on AWS with AWS SAM"
description: "11-phase walkthrough building an event-driven order pipeline with SAM, Lambda, HTTP API, EventBridge, SQS, and DynamoDB."
tags:
  - serverless
  - sam
  - lambda
  - eventbridge
  - sqs
  - dynamodb
  - aws
---
> Build and operate an event-driven serverless order pipeline with AWS SAM - Lambda, HTTP API, EventBridge, SQS, DynamoDB, and safe deployments.


## What you build

A minimal **order events** system:

1. **Producer API** accepts orders and publishes `OrderCreated` to EventBridge
2. **SQS + worker Lambda** processes messages and writes to DynamoDB
3. **Analytics Lambda** (optional) persists events to RDS for reporting
4. **SAM** packages and deploys everything; **CodeDeploy** canaries production releases

## Architecture

```mermaid
flowchart LR
    Client[Client] --> API[HTTP API]
    API --> Prod[Producer Lambda]
    Prod --> EB[EventBridge]
    EB --> SQS[SQS Queue]
    SQS --> Worker[Worker Lambda]
    Worker --> DDB[(DynamoDB)]
    EB --> Analytics[Analytics Lambda]
    Analytics --> RDS[(RDS)]
```

## Phase 01: 01-sam-project-setup

## Objective

Initialize an AWS SAM application for the order-events pipeline with a clear directory layout and shared `Globals` for Lambda runtime settings.

## Architecture

```
order-serverless/
├── template.yaml          # SAM/CloudFormation
├── samconfig.toml         # deploy defaults (optional, gitignored if sensitive)
├── src/
│   ├── producer/
│   ├── worker/
│   └── analytics/
├── events/                # sample payloads for local invoke
└── tests/
```

## Commands

```bash
sam init
## Runtime: python3.12
## Template: Hello World with API Gateway
## Name: order-serverless

cd order-serverless
sam validate
```

## Manifests

### Minimal `template.yaml` skeleton

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31
Description: Order events - SAM walkthrough

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Architectures: [x86_64]
    Tracing: Active
    Environment:
      Variables:
        LOG_LEVEL: INFO

Resources:
  # Functions and event sources added in later phases
```

### `samconfig.toml` (after first guided deploy)

```toml
version = 0.1
[default.deploy.parameters]
stack_name = "order-serverless"
resolve_s3 = true
capabilities = "CAPABILITY_IAM"
confirm_changeset = true
```

## Verification

```bash
sam validate --lint
## Expected: template is valid
```

## Troubleshooting

### `Transform AWS::Serverless-2016-10-31` not found

Install/update [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) and ensure AWS credentials target the intended account/Region.

---

## Phase 02: 02-lambda-functions

## Objective

Define the **producer Lambda** that accepts order payloads and publishes to EventBridge, with an execution role scoped to `events:PutEvents` only.

## Architecture

```
API Gateway event
  → ProducerFunction (Python 3.12)
  → events:PutEvents (default bus)
  → returns 200 + order JSON
```

## Commands

```bash
sam build
sam local invoke ProducerFunction --event events/create-order.json
```

### Sample event (`events/create-order.json`)

```json
{
  "body": "{\"userId\":\"user-101\",\"amount\":250}",
  "requestContext": { "http": { "method": "POST" } }
}
```

## Manifests

### SAM function resource

```yaml
ProducerFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.lambda_handler
    CodeUri: src/producer/
    Description: Publishes OrderCreated events
    Policies:
      - EventBridgePutEventsPolicy:
          EventBusName: default
```

### Handler (from [Lambda event pipeline](/aws-lambda-event-pipeline))

```python
import json
import boto3
import uuid

eventbridge = boto3.client("events")

def lambda_handler(event, context):
    body = json.loads(event.get("body") or "{}")
    order = {
        "orderId": str(uuid.uuid4()),
        "userId": body.get("userId", "unknown"),
        "amount": body.get("amount", 0),
        "status": "CREATED",
    }
    eventbridge.put_events(
        Entries=[{
            "Source": "app.orders",
            "DetailType": "OrderCreated",
            "Detail": json.dumps(order),
            "EventBusName": "default",
        }]
    )
    return {"statusCode": 200, "body": json.dumps(order)}
```

## Verification

```bash
sam local invoke ProducerFunction --event events/create-order.json
## Expected: statusCode 200, body contains orderId

## After deploy (Phase 07):
aws logs tail /aws/lambda/order-serverless-ProducerFunction --since 5m
```

## Troubleshooting

### `AccessDeniedException` on PutEvents

SAM policy missing or wrong `EventBusName`. For custom buses, scope the policy to that bus ARN.

### Handler import errors locally

Run `sam build` before `sam local invoke` so dependencies are copied into `.aws-sam/build`.

## Phase 03: 03-http-api-gateway

## Objective

Expose the producer Lambda through an **HTTP API** (API Gateway v2) with `POST /orders`, explicit CORS, and automatic Lambda proxy integration via SAM events.

## Architecture

```
Client POST /orders
  → HTTP API (v2)
  → Lambda proxy integration
  → ProducerFunction
```

## Commands

```bash
sam local start-api
curl -s -X POST http://127.0.0.1:3000/orders \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-101","amount":250}'
```

## Manifests

```yaml
ProducerFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.lambda_handler
    CodeUri: src/producer/
    Events:
      CreateOrder:
        Type: HttpApi
        Properties:
          ApiId: !Ref OrderHttpApi
          Path: /orders
          Method: POST

OrderHttpApi:
  Type: AWS::Serverless::HttpApi
  Properties:
    StageName: $default
    CorsConfiguration:
      AllowOrigins: ["https://app.example.com"]
      AllowMethods: [GET, POST, OPTIONS]
      AllowHeaders: [Content-Type, Authorization]
      MaxAge: 300

Outputs:
  ApiEndpoint:
    Value: !Sub "https://${OrderHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
```

## Verification

```bash
## Local
sam local start-api
curl -i -X POST http://127.0.0.1:3000/orders -d '{"userId":"u1","amount":99}'

## Deployed
curl -i -X POST "$API_ENDPOINT/orders" -H "Content-Type: application/json" \
  -d '{"userId":"u1","amount":99}'
```

## Troubleshooting

### CORS preflight fails

Ensure `OPTIONS` is in `AllowMethods` and the stage CORS config matches the browser origin exactly (no trailing slash mismatch).

### 403 from API Gateway

Check Lambda resource policy created by SAM and that the route `Method`/`Path` match the client request.

## Phase 04: 04-eventbridge

## Objective

Route `OrderCreated` events from the default bus to an **SQS queue** (and optionally an analytics Lambda) using EventBridge rules with explicit `eventPattern` filters.

## Architecture

```
Producer PutEvents
  → default event bus
  → Rule: OrderCreatedRule
      ├── Target: OrderQueue (SQS)
      └── Target: AnalyticsFunction (optional)
```

## Commands

```bash
## After deploy - put a test event
aws events put-events --entries '[
  {
    "Source": "app.orders",
    "DetailType": "OrderCreated",
    "Detail": "{\"orderId\":\"test-1\",\"userId\":\"u1\",\"amount\":10,\"status\":\"CREATED\"}"
  }
]'

aws sqs get-queue-attributes --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages
```

## Manifests

```yaml
OrderQueue:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: order-events
    VisibilityTimeout: 60
    RedrivePolicy:
      deadLetterTargetArn: !GetAtt OrderDLQ.Arn
      maxReceiveCount: 3

OrderDLQ:
  Type: AWS::SQS::Queue
  Properties:
    QueueName: order-events-dlq

OrderCreatedRule:
  Type: AWS::Events::Rule
  Properties:
    EventBusName: default
    EventPattern:
      source: [app.orders]
      detail-type: [OrderCreated]
    Targets:
      - Id: OrderQueueTarget
        Arn: !GetAtt OrderQueue.Arn

OrderQueuePolicy:
  Type: AWS::SQS::QueuePolicy
  Properties:
    Queues: [!Ref OrderQueue]
    PolicyDocument:
      Statement:
        - Effect: Allow
          Principal: { Service: events.amazonaws.com }
          Action: sqs:SendMessage
          Resource: !GetAtt OrderQueue.Arn
          Condition:
            ArnEquals:
              aws:SourceArn: !GetAtt OrderCreatedRule.Arn
```

### Event schema

| Field | Type | Example |
|-------|------|---------|
| `source` | string | `app.orders` |
| `detail-type` | string | `OrderCreated` |
| `detail.orderId` | string | UUID |
| `detail.userId` | string | `user-101` |
| `detail.amount` | number | `250` |
| `detail.status` | string | `CREATED` |

## Verification

```bash
aws events list-rules --event-bus-name default --name-prefix Order
aws sqs receive-message --queue-url $QUEUE_URL --max-number-of-messages 1
```

## Troubleshooting

### Rule matches but queue empty

Missing or incorrect **SQS queue policy** allowing `events.amazonaws.com`. The `aws:SourceArn` condition must match the rule ARN.

### Events on bus but rule not triggered

`eventPattern` is case-sensitive - `detail-type` must match `DetailType` from `put_events` exactly.

## Phase 05: 05-sqs-lambda-triggers

## Objective

Connect **OrderQueue** to a **worker Lambda** via an event source mapping with tuned batch size, visibility timeout, and DLQ handling.

## Architecture

```
SQS OrderQueue
  → event source mapping (batch up to 10)
  → WorkerFunction
  → DynamoDB PutItem (Phase 06)
  → DeleteMessage on success
```

## Commands

```bash
sam build
sam local invoke WorkerFunction --event events/sqs-order.json
```

### Sample SQS event (`events/sqs-order.json`)

```json
{
  "Records": [{
    "body": "{\"Message\":\"{\\\"orderId\\\":\\\"ord-1\\\",\\\"userId\\\":\\\"u1\\\",\\\"amount\\\":99,\\\"status\\\":\\\"CREATED\\\"}\"}"
  }]
}
```

## Manifests

```yaml
WorkerFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.lambda_handler
    CodeUri: src/worker/
    Policies:
      - SQSPollerPolicy:
          QueueName: !GetAtt OrderQueue.QueueName
      - DynamoDBCrudPolicy:
          TableName: !Ref OrdersTable
    Events:
      OrderQueueEvent:
        Type: SQS
        Properties:
          Queue: !GetAtt OrderQueue.Arn
          BatchSize: 10
          MaximumBatchingWindowInSeconds: 5
          FunctionResponseTypes:
            - ReportBatchItemFailures
```

### Worker handler pattern

```python
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("OrdersTable")

def lambda_handler(event, context):
    failures = []
    for record in event["Records"]:
        try:
            body = json.loads(record["body"])
            # EventBridge → SQS wraps in SNS-style Message when using rule target
            detail = json.loads(body.get("Message", body))
            table.put_item(Item={
                "orderId": detail["orderId"],
                "userId": detail["userId"],
                "amount": detail["amount"],
                "status": detail["status"],
            })
        except Exception:
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}
```

## Verification

```bash
aws lambda list-event-source-mappings --function-name WorkerFunction
## Expected: State Enabled, EventSourceArn = OrderQueue

aws dynamodb scan --table-name OrdersTable --max-items 3
```

## Troubleshooting

### Messages return to queue repeatedly

- **Visibility timeout** on the queue must exceed Lambda **timeout** (e.g. queue 60s, Lambda 30s).
- Unhandled exceptions without `ReportBatchItemFailures` retry the whole batch.

### Partial batch failures

Enable `FunctionResponseTypes: ReportBatchItemFailures` and return failed `messageId` values only.

## Phase 06: 06-dynamodb

## Objective

Create **OrdersTable** with `orderId` as partition key, wire the worker for writes, and add an optional **read Lambda** behind `GET /orders/{id}`.

## Architecture

```
WorkerFunction → PutItem (OrdersTable)
ReadFunction   → GetItem  (OrdersTable) ← GET /orders/{id}
```

## Commands

```bash
aws dynamodb describe-table --table-name OrdersTable
aws dynamodb get-item --table-name OrdersTable \
  --key '{"orderId":{"S":"ord-1"}}'
```

## Manifests

```yaml
OrdersTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: OrdersTable
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: orderId
        AttributeType: S
    KeySchema:
      - AttributeName: orderId
        KeyType: HASH
    SSESpecification:
      SSEEnabled: true

ReadFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.lambda_handler
    CodeUri: src/read/
    Policies:
      - DynamoDBReadPolicy:
          TableName: !Ref OrdersTable
    Events:
      GetOrder:
        Type: HttpApi
        Properties:
          ApiId: !Ref OrderHttpApi
          Path: /orders/{id}
          Method: GET
```

### Read handler

```python
import json
import boto3

table = boto3.resource("dynamodb").Table("OrdersTable")

def lambda_handler(event, context):
    order_id = event["pathParameters"]["id"]
    resp = table.get_item(Key={"orderId": order_id})
    item = resp.get("Item")
    if not item:
        return {"statusCode": 404, "body": json.dumps({"error": "not found"})}
    return {"statusCode": 200, "body": json.dumps(item, default=str)}
```

## Verification

| Step | Expected |
|------|----------|
| Worker processes message | Item in `OrdersTable` |
| `GET /orders/{id}` | 200 with order JSON |
| Unknown id | 404 |

## Troubleshooting

### `ValidationException` on put_item

Attribute names in `Item` must match table key schema (`orderId` String).

### Hot partition on single orderId pattern

For high-cardinality order IDs (UUIDs), single-table partition key is fine. Add GSI only when access patterns require queries by `userId` or `status`.

## Phase 07: 07-sam-build-deploy

## Objective

Build the SAM app, test locally, deploy to AWS with `sam deploy --guided`, and capture outputs (API URL, queue ARN, table name).

## Architecture

```
sam build → .aws-sam/build/
sam deploy → CloudFormation stack order-serverless
  → Lambda functions, HTTP API, SQS, DynamoDB, EventBridge rule
```

## Commands

### Build and test

```bash
sam build --use-container   # optional: match Lambda Linux env
sam local invoke ProducerFunction --event events/create-order.json
sam local start-api
```

### Guided first deploy

```bash
sam deploy --guided
## Stack name: order-serverless
## Region: us-east-1
## Confirm changesets: Y
## Allow IAM role creation: Y
## Save arguments to samconfig.toml: Y (if safe for repo)
```

### Subsequent deploys

```bash
sam build && sam deploy
```

### Stack outputs

```bash
aws cloudformation describe-stacks --stack-name order-serverless \
  --query 'Stacks[0].Outputs'
```

## Manifests

Add outputs to `template.yaml`:

```yaml
Outputs:
  ApiEndpoint:
    Description: HTTP API base URL
    Value: !Sub "https://${OrderHttpApi}.execute-api.${AWS::Region}.amazonaws.com"
  OrdersTableName:
    Value: !Ref OrdersTable
  OrderQueueUrl:
    Value: !Ref OrderQueue
```

## Verification

```bash
export API=$(aws cloudformation describe-stacks --stack-name order-serverless \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)

curl -s -X POST "$API/orders" -H "Content-Type: application/json" \
  -d '{"userId":"deploy-test","amount":42}'

aws dynamodb scan --table-name OrdersTable --max-items 1
```

## Troubleshooting

### Changeset failed: circular dependency

EventBridge rule + SQS policy sometimes need explicit `DependsOn`. Add `DependsOn: OrderCreatedRule` on the queue policy resource.

### Deployment bucket errors

Use `resolve_s3 = true` in `samconfig.toml` or pass `--resolve-s3` so SAM creates a managed artifacts bucket.

### `sam local` works, deployed Lambda fails

Missing env vars or IAM policies - compare `.aws-sam/build/template.yaml` synthesized policies with CloudWatch Logs.

## Phase 08: 08-versions-concurrency

## Objective

Prepare Lambda functions for safe releases: **published versions**, a **prod alias**, and optional **reserved concurrency** to protect downstream systems.

## Architecture

```
$LATEST (dev only)
  → publish-version → v1, v2, ...
  → alias prod → points to v2
  → CodeDeploy shifts traffic prod: v1 → v2 (Phase 10)
```

## Commands

```bash
FUNC=order-serverless-ProducerFunction

aws lambda publish-version --function-name $FUNC
aws lambda create-alias \
  --function-name $FUNC \
  --name prod \
  --function-version 1

## Reserved concurrency (cap max parallel executions)
aws lambda put-function-concurrency \
  --function-name $FUNC \
  --reserved-concurrent-executions 50

## Provisioned concurrency (optional, low-latency steady load)
aws lambda put-provisioned-concurrency-config \
  --function-name $FUNC \
  --qualifier prod \
  --provisioned-concurrent-executions 5
```

## Manifests

### SAM `AutoPublishAlias` (simplifies versioning)

```yaml
ProducerFunction:
  Type: AWS::Serverless::Function
  Properties:
    Handler: app.lambda_handler
    CodeUri: src/producer/
    AutoPublishAlias: prod
    DeploymentPreference:
      Type: Canary10Percent5Minutes
```

> `DeploymentPreference` requires CodeDeploy setup - detailed in Phase 10.

## Verification

```bash
aws lambda list-versions-by-function --function-name $FUNC
aws lambda get-alias --function-name $FUNC --name prod
aws lambda get-function-concurrency --function-name $FUNC
```

## Troubleshooting

### Alias still on old version after deploy

`AutoPublishAlias` creates new versions on deploy but CodeDeploy controls traffic shift. Check deployment status in CodeDeploy console.

### Throttling despite low traffic

Account-level concurrency limit (1000 default) or reserved concurrency on **other** functions can starve this function - review account concurrency dashboard.

## Phase 09: 09-application-auto-scaling

## Objective

Configure **Application Auto Scaling** for non-Lambda workloads in hybrid architectures: ECS services, DynamoDB provisioned capacity, and custom **SQS backlog per task** metrics.

## Architecture

```
CloudWatch metric (CPU, queue depth, RCU)
  → Application Auto Scaling policy
  → ECS DesiredCount / DynamoDB capacity
```

Lambda scales automatically - this phase covers services that sit alongside Lambda (e.g. OrderFlow ECS workers).

## Commands

### ECS target tracking

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/orderflow-cluster/orderflow-worker \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 1 --max-capacity 10

aws application-autoscaling put-scaling-policy \
  --service-namespace ecs \
  --resource-id service/orderflow-cluster/orderflow-worker \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-name cpu-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://ecs-cpu-scaling.json
```

### DynamoDB table auto scaling (provisioned mode)

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id table/OrdersTable \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --min-capacity 5 --max-capacity 100

aws application-autoscaling put-scaling-policy \
  --service-namespace dynamodb \
  --resource-id table/OrdersTable \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --policy-name read-target-tracking \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "DynamoDBReadCapacityUtilization"
    },
    "ScaleInCooldown": 60,
    "ScaleOutCooldown": 60
  }'
```

> For new projects, **on-demand** DynamoDB (Phase 06) avoids capacity planning; use this when cost optimization requires provisioned mode.

## Manifests

### ECS SQS backlog scaling (`ecs-sqs-scaling.json`)

Full file: [Serverless snippets](/aws-serverless-sam-snippets).

```json
{
  "TargetValue": 100.0,
  "CustomizedMetricSpecification": {
    "MetricName": "ApproximateNumberOfMessagesVisible",
    "Namespace": "AWS/SQS",
    "Dimensions": [{ "Name": "QueueName", "Value": "orderflow-orders" }],
    "Statistic": "Average"
  },
  "ScaleInCooldown": 120,
  "ScaleOutCooldown": 60
}
```

Divide queue depth by **running task count** in custom metrics for accurate per-worker scaling (CloudWatch metric math or embedded metric format).

## Verification

```bash
aws application-autoscaling describe-scalable-targets \
  --service-namespace ecs

aws application-autoscaling describe-scaling-policies \
  --service-namespace ecs \
  --resource-id service/orderflow-cluster/orderflow-worker
```

## Troubleshooting

### Policy never scales out

- **Register scalable target** before attaching policy.
- Metric dimensions must match the resource exactly (queue name, table name, cluster/service id).
- For SQS, scale on **backlog per consumer**, not raw depth, when task count changes.

### Oscillation (flapping)

Increase `ScaleInCooldown` / `ScaleOutCooldown`. Use target tracking for steady metrics; step scaling for sharp thresholds.

## Phase 10: 10-cicd-codedeploy

## Objective

Automate Lambda releases with **CodePipeline** and **CodeDeploy canary** traffic shifting on the `prod` alias - no instant 100% cutover.

## Architecture

```
Git push
  → CodePipeline
  → CodeBuild (sam build / zip)
  → S3 artifact
  → CodeDeploy → prod alias 10% → 50% → 100%
  → CloudWatch alarms trigger rollback on errors
```

## Commands

```bash
aws deploy create-application \
  --application-name order-serverless \
  --compute-platform Lambda

aws deploy create-deployment-group \
  --application-name order-serverless \
  --deployment-group-name prod \
  --service-role-arn arn:aws:iam::ACCOUNT:role/CodeDeployLambdaRole \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes
```

### Deployment strategies

| Config | Behavior |
|--------|----------|
| `LambdaAllAtOnce` | 100% immediately |
| `LambdaCanary10Percent5Minutes` | 10% for 5 min, then full |
| `LambdaLinear10PercentEvery1Minute` | Linear 10%/min |

## Manifests

### `appspec.yml`

```yaml
version: 0.0
Resources:
  - MyFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: order-serverless-ProducerFunction
        Alias: prod
        CurrentVersion: 1
        TargetVersion: 2
```

### SAM with canary (alternative to standalone pipeline)

```yaml
ProducerFunction:
  Type: AWS::Serverless::Function
  Properties:
    AutoPublishAlias: prod
    DeploymentPreference:
      Type: Canary10Percent5Minutes
      Alarms:
        - !Ref AliasErrorAlarm
      Hooks:
        PreTraffic: !Ref PreTrafficHookFunction
```

### BuildSpec (CodeBuild)

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.12
    commands:
      - pip install aws-sam-cli
  build:
    commands:
      - sam build
      - sam package --output-template-file packaged.yaml --resolve-s3
artifacts:
  files:
    - packaged.yaml
    - appspec.yml
```

Full pipeline steps: [AWS Lambda CI/CD post](/aws-lambda-codepipeline-codedeploy).

## Verification

```bash
aws deploy list-deployments \
  --application-name order-serverless \
  --deployment-group-name prod \
  --max-items 3

aws lambda get-alias \
  --function-name order-serverless-ProducerFunction \
  --name prod
```

Trigger a pipeline run and confirm canary percentage increases in the CodeDeploy console before reaching 100%.

## Troubleshooting

### Deployment stuck at 10%

Pre-traffic hook Lambda failing or CloudWatch alarm in `Alarms` list breaching. Check hook logs and alias error rate metrics.

### Rollback occurred

CodeDeploy reverted `prod` alias to previous version - inspect deployment events and fix failing version before retry.

## Phase 11: 11-observability-operations

## Objective

Operate the serverless stack with structured logging, actionable alarms, X-Ray tracing, and a concise incident runbook.

## Architecture

```
Lambda (Tracing: Active)
  → X-Ray segments
  → CloudWatch Logs (/aws/lambda/*)
  → CloudWatch Metrics (Errors, Duration, Throttles, ConcurrentExecutions)
  → Alarms → SNS ops topic
```

## Commands

### Tail logs

```bash
aws logs tail /aws/lambda/order-serverless-ProducerFunction --follow
aws logs tail /aws/lambda/order-serverless-WorkerFunction --since 1h --filter-pattern ERROR
```

### Key metrics

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=order-serverless-WorkerFunction \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 300 --statistics Sum
```

### SQS DLQ depth

```bash
aws cloudwatch get-metric-statistics \
  --namespace AWS/SQS \
  --metric-name ApproximateNumberOfMessagesVisible \
  --dimensions Name=QueueName,Value=order-events-dlq \
  --start-time $(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 3600 --statistics Maximum
```

## Manifests

### Error alarm (SAM)

```yaml
WorkerErrorAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: order-worker-errors
    MetricName: Errors
    Namespace: AWS/Lambda
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 1
    Threshold: 1
    ComparisonOperator: GreaterThanOrEqualToThreshold
    Dimensions:
      - Name: FunctionName
        Value: !Ref WorkerFunction
    AlarmActions:
      - !Ref OpsTopic

OpsTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: order-serverless-ops
```

### Structured log line (Python)

```python
import json, logging
logger = logging.getLogger()
logger.info(json.dumps({"event": "order_processed", "orderId": order_id}))
```

## Verification

| Check | Tool |
|-------|------|
| API returns 201 | `curl POST /orders` |
| Worker errors | CloudWatch `Errors` metric |
| DLQ empty | SQS `ApproximateNumberOfMessages` on DLQ |
| Trace end-to-end | X-Ray service map |

## Troubleshooting runbook

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| API 502 | Lambda timeout or crash | Check function logs, increase timeout |
| Queue depth growing | Worker throttled or failing | Logs + DLQ; scale concurrency or fix bug |
| DynamoDB throttling | On-demand spike or hot key | Review access pattern; consider GSI |
| Canary rollback | Error alarm breached | CodeDeploy events; revert alias |

## Production checklist

- [ ] X-Ray tracing enabled on all functions
- [ ] Alarms on Errors, Duration p99, DLQ depth
- [ ] Log retention set (not indefinite)
- [ ] Least-privilege IAM per function
- [ ] `prod` alias + CodeDeploy canary for releases
- [ ] API CORS locked to known origins
- [ ] Secrets in Secrets Manager / SSM, not env plaintext

---
---

# aws-serverless-sam-snippets.md

---
title: "AWS Serverless SAM and CLI Snippets"
description: "SAM build, deploy, local invoke, scaling policy, and CodeDeploy commands for the serverless order-events project."
tags:
  - serverless
  - sam
  - lambda
  - codedeploy
  - cli
  - snippets
  - aws
---
Copy-paste snippets for [Serverless on AWS](/aws-serverless-sam-guide).

## SAM workflow

```bash
sam validate --lint
sam build
sam local invoke ProducerFunction --event events/create-order.json
sam local start-api
sam deploy --guided
sam deploy   # after samconfig.toml exists
```

## Combined template excerpt

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Tracing: Active

Resources:
  OrderHttpApi:
    Type: AWS::Serverless::HttpApi

  OrdersTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: orderId
          AttributeType: S
      KeySchema:
        - AttributeName: orderId
          KeyType: HASH

  OrderQueue:
    Type: AWS::SQS::Queue
    Properties:
      VisibilityTimeout: 60
```

## ECS CPU target tracking policy

```json
{
  "TargetValue": 70.0,
  "PredefinedMetricSpecification": {
    "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
  },
  "ScaleInCooldown": 120,
  "ScaleOutCooldown": 60
}
```

## ECS SQS backlog policy

```json
{
  "TargetValue": 100.0,
  "CustomizedMetricSpecification": {
    "MetricName": "ApproximateNumberOfMessagesVisible",
    "Namespace": "AWS/SQS",
    "Dimensions": [
      { "Name": "QueueName", "Value": "order-events" }
    ],
    "Statistic": "Average"
  },
  "ScaleInCooldown": 120,
  "ScaleOutCooldown": 60
}
```

## Lambda alias and concurrency

```bash
aws lambda publish-version --function-name order-serverless-ProducerFunction
aws lambda create-alias \
  --function-name order-serverless-ProducerFunction \
  --name prod \
  --function-version 1

aws lambda put-function-concurrency \
  --function-name order-serverless-WorkerFunction \
  --reserved-concurrent-executions 25
```

## CodeDeploy canary deploy group

```bash
aws deploy create-deployment-group \
  --application-name order-serverless \
  --deployment-group-name prod \
  --service-role-arn arn:aws:iam::ACCOUNT:role/CodeDeployLambdaRole \
  --deployment-config-name CodeDeployDefault.LambdaCanary10Percent5Minutes
```
---

# aws-verified-permissions-cognito-apigw.md

---
title: "Amazon Verified Permissions with Cognito and API Gateway"
description: "Group-based API access with Amazon Verified Permissions, Cognito User Pool groups, Cedar policies, and API Gateway authorizers."
tags:
  - avp
  - verified-permissions
  - api-gateway
  - cognito
  - cedar
  - aws
  
date: 2026-08-24
---

## Overview

Use **Amazon Verified Permissions (AVP)** with **Amazon Cognito** groups to authorize API Gateway requests. Policies in Cedar define which user pool groups can call which routes.

| Component | Role |
| --- | --- |
| Cognito User Pool | Users, groups, JWT access tokens |
| API Gateway | REST routes with authorizer |
| Verified Permissions | Policy store, Cedar `permit` rules |

Reference: [Amazon Verified Permissions](https://docs.aws.amazon.com/verifiedpermissions/latest/userguide/what-is-avp.html)

---

## Users and groups

| User | Group |
| --- | --- |
| `admin@example.com` | `admins` |
| `alice@example.com` | - |
| `bob@example.com` | `employee` |

Groups: `admins`, `employee`

---

## API Gateway routes

API: `prod`

| Method | Path | Who can access |
| --- | --- | --- |
| `GET` | `/private` | `admins`, or users **not** in `admins` or `employee` |
| `GET` | `/private/admins` | `admins` only |
| `GET` | `/private/employees` | `admins` and `employee` |

```text
prod
 └── /
      └── private
            ├── GET  /private
            ├── GET  /private/admins
            └── GET  /private/employees
```

---

## Verified Permissions setup

### 1. Register API actions

Console: **AVP → Policy store → Schema → Actions**

Create actions that map to API Gateway operations:

| Action name | Principal types | Resource types |
| --- | --- | --- |
| `get /private` | `User` | `Application` |
| `post /private` | `User` | `Application` |
| `get /private/admins` | `User` | `Application` |
| `get /private/employees` | `User` | `Application` |

Example action: **post /private** - applies to principal type `User`, resource type `Application`.

Replace `us-east-1_du9KuRt50` in policies below with your User Pool ID.

### 2. Create Cedar policies

Console: **AVP → Policy store → Policies → Create policy**

#### Policy 1 - Users outside `admins` and `employee`

Allow `GET` and `POST` on `/private` when the principal is in neither group.

```cedar
permit(
  principal,
  action in [
    cognitoauth::Action::"get /private",
    cognitoauth::Action::"post /private"
  ],
  resource
)
when {
  !(principal in cognitoauth::UserGroup::"us-east-1_du9KuRt50|employee") &&
  !(principal in cognitoauth::UserGroup::"us-east-1_du9KuRt50|admins")
};
```

#### Policy 2 - Users in `admins`

Allow `GET` on `/private/admins` and `/private/employees`.

```cedar
permit(
  principal in cognitoauth::UserGroup::"us-east-1_du9KuRt50|admins",
  action in [
    cognitoauth::Action::"get /private",
    cognitoauth::Action::"get /private/admins",
    cognitoauth::Action::"get /private/employees"
  ],
  resource
);
```

Add a separate policy for the `employee` group on `get /private/employees` if employees should access that route without being admins.

---

## Testing

### Generate a Cognito access token

**App client settings**

- Authentication flow: `ALLOW_USER_PASSWORD_AUTH`

**Token request**

| Field | Value |
| --- | --- |
| URL | `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_du9KuRt50` |
| Method | `POST` |

Headers:

```http
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth
```

Body:

```json
{
  "AuthFlow": "USER_PASSWORD_AUTH",
  "ClientId": "3csb2ppugj180apt0pabrl52v3",
  "AuthParameters": {
    "USERNAME": "admin@example.com",
    "PASSWORD": "Test@123"
  },
  "ClientMetadata": {}
}
```

Use the **AccessToken** from the response (not the ID token) when calling API Gateway with a Cognito/AVP authorizer.

### Call API Gateway

Attach the authorizer to the API, then send:

```http
Authorization: <AccessToken>
```

Test each user (`admin@example.com`, `alice@example.com`, `bob@example.com`) against `/private`, `/private/admins`, and `/private/employees` to confirm allow/deny matches the Cedar policies.

---

## Notes

- **Policy 2 label in raw notes** said "employee" but the Cedar policy uses the `admins` group - the policy above matches the Cedar snippet.
- **Group ARN format:** `cognitoauth::UserGroup::"<region>_<userPoolId>|<groupName>"`.
- **Action names** must match the schema action strings exactly (method + path).
- Replace `ClientId`, User Pool ID, and passwords with your environment values before testing.

---

# aws-vpc-cloudformation.md

---
title: "Build an AWS VPC with CloudFormation"
description: Deploy a lab VPC with public and private subnets using CloudFormation.
tags:
  - vpc
  - cloudformation
  - subnets
  - nat-gateway
  - security-group
  - aws
---

# VPC with CloudFormation

Deploy a lab VPC with public and private subnets using [vpc-with-cloudformation.yaml](./files/vpc-with-cloudformation.yaml).

The base template creates:

- 1 VPC (`10.0.0.0/16` by default)
- 2 public subnets and 2 private subnets across 2 AZs
- Internet Gateway and route tables

## Step 1 - Set variables

```bash
export STACK_NAME="lab-vpc-stack"
export YAML_FILE="vpc-with-cloudformation.yaml"
export AWS_REGION="$(aws configure get region)"
```

Optional parameter overrides:

```bash
export VPC_NAME="lab-vpc"
export VPC_CIDR="10.0.0.0/16"
```

## Step 2 - Add InstanceSG (optional)

Paste into `Resources`, after `PrivateSubnet1BRouteAssociation`:

```yaml
  InstanceSG:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupName: InstanceSG
      GroupDescription: Security group for EC2 instances in the VPC
      VpcId: !Ref VPC
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0
      Tags:
        - Key: Name
          Value: InstanceSG
```

Add this to `Outputs`:

```yaml
  InstanceSG:
    Value: !Ref InstanceSG
```

## Step 3 - Add NAT Gateway (optional)

> **Optional.** Skip if private subnets do not need outbound internet. Use **regional** or **zonal** - not both.

### Option A - Regional NAT (single NAT, lower cost)

Paste into `Resources`, after `PrivateSubnet1BRouteAssociation` (or after `InstanceSG` if added):

```yaml
  NatGatewayEIP:
    Type: AWS::EC2::EIP
    DependsOn: AttachGateway
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-eip"

  NatGateway:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP.AllocationId
      SubnetId: !Ref PublicSubnet1A
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-gateway"

  PrivateDefaultRoute:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway
```

### Option B - Zonal NAT (one NAT per AZ, higher availability)

Remove `PrivateSubnet1ARouteAssociation` and `PrivateSubnet1BRouteAssociation` from the template, then paste:

```yaml
  NatGatewayEIP1A:
    Type: AWS::EC2::EIP
    DependsOn: AttachGateway
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-eip-1a"

  NatGatewayEIP1B:
    Type: AWS::EC2::EIP
    DependsOn: AttachGateway
    Properties:
      Domain: vpc
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-eip-1b"

  NatGateway1A:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP1A.AllocationId
      SubnetId: !Ref PublicSubnet1A
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-gateway-1a"

  NatGateway1B:
    Type: AWS::EC2::NatGateway
    Properties:
      AllocationId: !GetAtt NatGatewayEIP1B.AllocationId
      SubnetId: !Ref PublicSubnet1B
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-nat-gateway-1b"

  PrivateRouteTable1A:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-private-rt-1a"

  PrivateRouteTable1B:
    Type: AWS::EC2::RouteTable
    Properties:
      VpcId: !Ref VPC
      Tags:
        - Key: Name
          Value: !Sub "${VpcName}-private-rt-1b"

  PrivateDefaultRoute1A:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable1A
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway1A

  PrivateDefaultRoute1B:
    Type: AWS::EC2::Route
    Properties:
      RouteTableId: !Ref PrivateRouteTable1B
      DestinationCidrBlock: 0.0.0.0/0
      NatGatewayId: !Ref NatGateway1B

  PrivateSubnet1ARouteAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      RouteTableId: !Ref PrivateRouteTable1A
      SubnetId: !Ref PrivateSubnet1A

  PrivateSubnet1BRouteAssociation:
    Type: AWS::EC2::SubnetRouteTableAssociation
    Properties:
      RouteTableId: !Ref PrivateRouteTable1B
      SubnetId: !Ref PrivateSubnet1B
```

## Step 4 - Deploy the stack

```bash
aws cloudformation deploy \
  --stack-name "${STACK_NAME}" \
  --template-file "${YAML_FILE}" \
  --region "${AWS_REGION}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    VpcName="${VPC_NAME:-lab-vpc}" \
    VpcCidr="${VPC_CIDR:-10.0.0.0/16}"
```

## Step 5 - Verify outputs (optional)

```bash
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --region "${AWS_REGION}" \
  --query "Stacks[0].Outputs"
```

Confirm these outputs exist:

- `VpcId`
- `PublicSubnet1A`, `PublicSubnet1B`
- `PrivateSubnet1A`, `PrivateSubnet1B`
- `InstanceSG` (if Step 2 was applied)

---

# aws-vpc-egress-only-transit-gateway.md

---
title: "Egress-Only IPv6 with VPC and Transit Gateway"
description: Notes on egress-only VPC routing with AWS Transit Gateway.
tags:
  - vpc
  - transit-gateway
  - egress
  - networking
  - aws
---

# Egress Only VPC Transit Gateway

VPC A ( Dev )

Subnets: 
    - 2 public & 2 private
    - 2 Transit Gateway Subnet

Security Group
    - Default VPC
    - TransitGateway VPC  ( is it required ? )

Route Table
    - private
    - public
    - transit ( is it required ? )


VPC B ( Prod )
- same as VPC A

VPC C ( Egress )

Subnets: 
    - 2 public & 2 private
    - 2 Transit Gateway Subnet

Security Group
    - Default VPC
    - TransitGateway VPC

Transit Gateway
    
    - Attachment
      - VPC A
      - VPC B
      - VPC C
        - Appliance Mode ( If cross zone required - I'm not sure )

Transite Gateway Route Table
    - Isolated-Route-Table
      - Association
        - VPC A, VPC B
      - Propagation
        - VPC C
    - Egress-Route-Table
      - 
---

# aws-vpc-egress-transit-gateway-firewall.md

---
title: "Centralized Egress with Transit Gateway and Network Firewall"
description: "Inspect spoke internet traffic in a dedicated inspection VPC, then NAT out from an egress VPC. CloudFormation order, TGW association vs propagation, appliance mode, and the templates in dir/vpc/egress-firewall."
tags:
  - vpc
  - transit-gateway
  - network-firewall
  - egress
  - networking
  - aws
  - notes
date: 2026-08-29
---

## Pattern

Spokes have no IGW and no NAT. Internet-bound packets go **Transit Gateway → inspection VPC (Network Firewall) → egress VPC (NAT + IGW)**.

![Centralized traffic filtering](./images/centralized-traffic-filtering-using-aws-network-firewall.png)

![This lab](./images/vpc-egress-transit-gateway-firewall.svg)

Templates: [`dir/vpc/egress-firewall/`](./dir/vpc/egress-firewall/tgw.yaml)

| VPC | CIDR (defaults) | Role |
| --- | --- | --- |
| spoke-a | `10.0.0.0/16` | Workloads. Private `0.0.0.0/0` → TGW |
| spoke-b | `10.1.0.0/16` | Same, different CIDRs |
| inspection | `10.3.0.0/16` | TGW subnets + firewall subnets (two AZs) |
| egress | `192.168.0.0/16` | TGW subnets + public NAT/IGW |

Network Firewall is created in the **firewall subnets**. AWS places a **Gateway Load Balancer endpoint** (`vpce-…`) in each of those subnets. TGW subnet route tables send `0.0.0.0/0` to the endpoint **in the same AZ**.

---

## Traffic

```text
Spoke private subnet
        │  0.0.0.0/0 → TGW
        ▼
 TGW spoke route table
        │  0.0.0.0/0 → inspection attachment
        ▼
 Inspection TGW subnet
        │  0.0.0.0/0 → firewall vpce (same AZ)
        ▼
 Network Firewall
        │  0.0.0.0/0 → TGW
        ▼
 TGW inspection route table
        │  0.0.0.0/0 → egress attachment
        ▼
 Egress TGW subnet → NAT → IGW → internet
```

Return: NAT public RT `10.0.0.0/8` → TGW; **egress** TGW table uses **spoke propagations** (spoke CIDRs → spoke attachments). This stack does not hairpin return through inspection.

Spoke CIDRs are **blackholed** on the spoke TGW table, so spoke-a cannot reach spoke-b via TGW.

---

## TGW tables

Default association and propagation are **off** ([`tgw.yaml`](./dir/vpc/egress-firewall/tgw.yaml)). Every attachment is associated to one table; extra CIDRs appear only from **routes** or **propagations** ([`routing.yaml`](./dir/vpc/egress-firewall/routing.yaml)).

| Term | Meaning |
| --- | --- |
| Association | Which table this attachment **looks up** |
| Propagation | Copy that attachment’s CIDR **into** a table |
| Static route | Explicit next hop (or blackhole) |

| Table | Associated attachments | How packets leave |
| --- | --- | --- |
| Spoke | spoke-a, spoke-b | `0.0.0.0/0` → inspection. Blackhole each spoke CIDR |
| Inspection | inspection VPC | `0.0.0.0/0` → egress. Spokes **propagated** (return to workloads) |
| Egress | egress VPC | Spokes **propagated** (return from NAT) |

---

## Appliance mode

![Single-AZ vs multi-AZ](./images/anfw-single-az-deployment-diagram.png)

Firewall state is per endpoint. If TGW sends the forward flow to AZ-a and the return to AZ-b, the session breaks. **Appliance mode** on the **inspection** VPC attachment pins both directions of a flow to one AZ.

Already set in [`inspection.yaml`](./dir/vpc/egress-firewall/inspection.yaml) (`ApplianceModeSupport: enable`). Spoke and egress attachments leave it **disabled**. Equivalent after the fact:

```bash
aws ec2 modify-transit-gateway-vpc-attachment \
  --transit-gateway-attachment-id tgw-attach-INSPECTION \
  --options ApplianceModeSupport=enable
```

---

## Firewall policy

[`inspection.yaml`](./dir/vpc/egress-firewall/inspection.yaml): stateless default **forward to stateful**. Stateful group: **ALLOWLIST** `TLS_SNI` `.amazonaws.com`. Anything else that hits the stateful engine is not on that allowlist.

---

## Deploy

Run from `dir/vpc/egress-firewall/`. TGW first. Inspection, egress, and spokes in parallel. **Routing last** (needs all attachment exports).

```bash
aws cloudformation deploy --stack-name egress-fw-tgw \
  --template-file tgw.yaml

aws cloudformation deploy --stack-name egress-fw-inspection \
  --template-file inspection.yaml --parameter-overrides TgwStackName=egress-fw-tgw

aws cloudformation deploy --stack-name egress-fw-egress \
  --template-file egress.yaml --parameter-overrides TgwStackName=egress-fw-tgw

aws cloudformation deploy --stack-name egress-fw-spoke-a \
  --template-file spoke.yaml \
  --parameter-overrides TgwStackName=egress-fw-tgw VpcName=spoke-a-vpc VpcCidr=10.0.0.0/16

aws cloudformation deploy --stack-name egress-fw-spoke-b \
  --template-file spoke.yaml \
  --parameter-overrides TgwStackName=egress-fw-tgw VpcName=spoke-b-vpc VpcCidr=10.1.0.0/16 \
    PrivateSubnetACidr=10.1.11.0/24 PrivateSubnetBCidr=10.1.12.0/24 \
    TgwSubnetACidr=10.1.21.0/28 TgwSubnetBCidr=10.1.22.0/28

aws cloudformation deploy --stack-name egress-fw-routing \
  --template-file routing.yaml
```

[`egress.yaml`](./dir/vpc/egress-firewall/egress.yaml) uses **one NAT** in AZ-a for both TGW subnets. [`spoke.yaml`](./dir/vpc/egress-firewall/spoke.yaml) is reused per spoke.

---

## Check

- Spoke private RT: `0.0.0.0/0` → TGW  
- Inspection TGW RT (per AZ): `0.0.0.0/0` → firewall `vpce` in that AZ  
- Inspection firewall RT: `0.0.0.0/0` → TGW  
- Egress TGW RT: `0.0.0.0/0` → NAT; public RT: `0.0.0.0/0` → IGW and `10.0.0.0/8` → TGW  
- Inspection attachment: appliance mode **enable**  
- From a spoke instance: TLS to a `*.amazonaws.com` name should pass; other destinations should fail the allowlist  

---

## References

- [Deploy centralized traffic filtering using AWS Network Firewall](https://aws.amazon.com/blogs/networking-and-content-delivery/deploy-centralized-traffic-filtering-using-aws-network-firewall/)
- [Deployment models for AWS Network Firewall](https://aws.amazon.com/blogs/networking-and-content-delivery/deployment-models-for-aws-network-firewall/)
- [Appliance mode](https://docs.aws.amazon.com/vpc/latest/tgw/transit-gateway-appliance-scenario.html)
- [TGW route tables](https://docs.aws.amazon.com/vpc/latest/tgw/tgw-route-tables.html)
- [Networking on AWS](./networking-on-aws.md)

---

# aws-vpc-lattice-application-networking.md

---
title: "VPC Lattice Application Networking"
description: "Order-management lab: ECS then service network, Lattice services, security groups, EKS in VPC-A, EC2/Lambda, and RDS/private resources via resource configurations."
tags:
  - vpc-lattice
  - networking
  - ecs
  - eks
  - ec2
  - rds
  - aws
  - notes
date: 2026-08-29
---

## Lattice objects

![VPC Lattice logical architecture](./images/vpc-lattice-logical-architecture.png)

| Object | Role |
| --- | --- |
| Service network | Boundary for associated services and resource configurations |
| Service | Listeners → rules → target groups |
| Listener | HTTP, HTTPS, or TLS on a port |
| Rule / default rule | Forward to a target group |
| Target group | Instance, IP, Lambda, ALB, Kubernetes |

---

## What this lab deploys

![VPC Lattice application networking](./images/vpc-lattice-application-networking.png)

| Diagram | Lab | Lattice object | Source |
| --- | --- | --- | --- |
| Left VPC / Service-1 ECS | Order service, VPC-A | Service | [`ecs-order-service/`](./dir/vpc/vpc-lattice-networking/ecs-order-service/app.py) |
| Left VPC / Service-2 ECS Fargate | Same app, Fargate launch type | Service | same |
| Left VPC / Service-3 EKS | Inventory, VPC-A | Service | [`eks-inventory-service/`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/app.py) |
| Service-6 Lambda | Notifications | Service (Lambda TG) | [`lambda-notification-service/`](./dir/vpc/vpc-lattice-networking/lambda-notification-service/lambda_function.py) |
| Right VPC / Service-5 EC2 ASG | Customers, VPC-B | Service | [`ec2-customer-service/`](./dir/vpc/vpc-lattice-networking/ec2-customer-service/app.py) |
| RDS | PostgreSQL, VPC-B | Resource configuration | [`rds/init.sql`](./dir/vpc/vpc-lattice-networking/rds/init.sql) |
| VPC Resource | Private config API, VPC-B | Resource configuration | [`private-config-resource/`](./dir/vpc/vpc-lattice-networking/private-config-resource/app.py) |

Green arrows: VPC → service network. Purple arrows: service or resource-configuration → service network.

Apps listen on **8080**. Local compose ports: [`docker-compose.yml`](./dir/vpc/vpc-lattice-networking/docker-compose.yml). Lattice HTTP listeners use **:80** → target **8080**.

---

## 1. ECS Order Service (VPC-A)

1. Build/push [`ecs-order-service/Dockerfile`](./dir/vpc/vpc-lattice-networking/ecs-order-service/Dockerfile) to ECR.
2. Task definition: container port **8080**, named `portMappings` entry (needed for Lattice `portName`).
3. ECS cluster + service in VPC-A private subnets (Fargate or EC2). Do not attach an ALB.
4. Task security group: allow **8080** from the Lattice prefix list after step 4 (create the SG now; add the prefix-list rule then).

Health: `GET /health`. Routes: `GET /orders`, `GET /orders/{id}`, `POST /orders`.

---

## 2. Service network

VPC → **PrivateLink and Lattice** → **Service networks** → **Create**.

| Field | Value |
| --- | --- |
| Name | `lattice-sn` |
| Auth type | None |

CLI:

```bash
aws vpc-lattice create-service-network --name lattice-sn
```

VPC association (clients in that VPC can call associated services/resources). Attach a security group on the association (inbound HTTP **80** from the VPC CIDR). Associate **VPC-A** now; associate **VPC-B** when that VPC exists.

```bash
aws vpc-lattice create-service-network-vpc-association \
  --service-network-identifier lattice-sn \
  --vpc-identifier vpc-VPC-A \
  --security-group-ids sg-ASSOCIATION-A
```

---

## 3. Lattice service for orders

1. Target group: type **IP**, protocol **HTTP**, port **8080**, VPC-A.
2. ECS service: enable VPC Lattice (`vpcLatticeConfigurations`: target group ARN, `portName` from the task definition, role with `AmazonECSInfrastructureRolePolicyForVpcLattice`). ECS registers task IPs. Rolling deployments only.
3. Lattice service (e.g. `order-service`) + listener **HTTP :80** → that target group.
4. Service association:

```bash
aws vpc-lattice create-service-network-service-association \
  --service-network-identifier lattice-sn \
  --service-identifier svc-ORDER
```

Copy the service domain (`svc-….vpc-lattice-svcs.<region>.on.aws`).

---

## 4. Security groups

| Attachment | Inbound / outbound |
| --- | --- |
| Service-network VPC association | Inbound TCP **80** from that VPC’s client CIDR |
| ECS task SG | Inbound TCP **8080** from `com.amazonaws.<region>.vpc-lattice` |
| Client (if outbound is restricted) | Outbound TCP **80** to the same prefix list |

Do not use the client SG as the source on targets. Packets to targets come from Lattice.

---

## 5. EKS Inventory Service (VPC-A)

Same service network. Cluster subnets in VPC-A.

1. Build/push [`eks-inventory-service/Dockerfile`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/Dockerfile).
2. Apply [`eks-inventory-service/k8s/deployment.yaml`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/k8s/deployment.yaml) (replace `REPLACE_WITH_ECR_IMAGE`). ClusterIP **80** → pod **8080**. `GET /health`, `GET /inventory/{sku}`.
3. Follow [VPC Lattice on EKS with Gateway API](/eks-vpc-lattice-gateway-api/): controller install, **`defaultServiceNetwork=lattice-sn`**, VPC association, Gateway, HTTPRoute, TargetGroupPolicy (`/health` on port **8080**).
4. `HTTPRoute` `backendRefs` → Kubernetes Service `inventory-service` port **80**; path prefix **`/inventory`** matches the app.
5. Pod / node security group: inbound TCP **8080** from `com.amazonaws.<region>.vpc-lattice` (plus prefix-list rules on the cluster/node SG per controller deploy guide).

If you skip the controller: IP target group HTTP **8080** in VPC-A, Lattice service HTTP **80**, `create-service-network-service-association` to `lattice-sn`, and register pod IPs yourself (they change on reschedule).

---

## 6. EC2 Customer Service (VPC-B)

1. Associate VPC-B with `lattice-sn` (association SG: inbound **80** from VPC-B CIDR).
2. Instance in a private subnet. [`user-data.sh`](./dir/vpc/vpc-lattice-networking/ec2-customer-service/user-data.sh) runs uvicorn **8080**. App: [`ec2-customer-service/app.py`](./dir/vpc/vpc-lattice-networking/ec2-customer-service/app.py) - `GET /customers/{id}`.
3. Instance target group HTTP **8080**. Lattice service `customer-service`, listener HTTP **80**. Associate with `lattice-sn`.
4. Instance SG: inbound **8080** from the Lattice prefix list.

```text
ECS order-service (VPC-A)
        │ HTTP :80
        ▼
   lattice-sn
        │
        ▼
 customer-service → instance TG → EC2 :8080
```

---

## 7. Lambda notification service

Create the function from [`lambda_function.py`](./dir/vpc/vpc-lattice-networking/lambda-notification-service/lambda_function.py). Target group type **Lambda**. Lattice service, HTTP listener, associate with `lattice-sn`. No VPC, no prefix-list SG.

---

## 8. RDS and private config (resource configurations, VPC-B)

Not Lattice services. Path: associated VPC → `lattice-sn` → resource configuration → **resource gateway** in VPC-B → target. Source IP on the target is the gateway ENI.

**RDS**

1. Load [`rds/init.sql`](./dir/vpc/vpc-lattice-networking/rds/init.sql).
2. Resource gateway `rds-resource` in VPC-B. SG `rds-resource-sg`: outbound TCP **5432** to RDS.
3. RDS SG `rds-pgql`: inbound **5432** from `rds-resource-sg`.
4. Resource configuration `orders-db` (RDS ARN or IP:5432) on that gateway. Associate `orders-db` with `lattice-sn`.
5. Client DNS: service-network resource association (ARN configs can keep the RDS hostname if private DNS is on).

**VPC Resource** ([`private-config-resource/app.py`](./dir/vpc/vpc-lattice-networking/private-config-resource/app.py) on **8080**, `GET /config`)

Same gateway or a second one. Resource configuration type IP, port **8080**. Target SG: inbound **8080** from the resource-gateway SG (not the Lattice service prefix list).

---

## 9. Call through Lattice

Replace hosts in [`requests/sample-requests.sh`](./dir/vpc/vpc-lattice-networking/requests/sample-requests.sh) with Lattice service domains (and the resource-association DNS for RDS / config). Run from an instance in VPC-A or VPC-B (both associated).

---

## References

- [Create a service network](https://docs.aws.amazon.com/vpc-lattice/latest/ug/service-networks.html)
- [Security groups / prefix lists](https://docs.aws.amazon.com/vpc-lattice/latest/ug/security-groups.html)
- [ECS and VPC Lattice](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-vpc-lattice.html)
- [AWS Gateway API Controller (EKS)](https://www.gateway-api-controller.eks.aws.dev/)
- [Resource gateways](https://docs.aws.amazon.com/vpc-lattice/latest/ug/resource-gateway.html)
- [Path-based HTTP lab](/aws-vpc-lattice-path-routing-lab/)
- [EKS Gateway API + Lattice](/eks-vpc-lattice-gateway-api/)

---

# aws-vpc-lattice-path-routing-lab.md

---
title: "VPC Lattice Path-Based Routing Lab"
description: "Hands-on VPC Lattice setup with EC2 and Lambda backends, target groups, path-based routing, weighted default action, and service network VPC association."
tags:
  - vpc-lattice
  - ec2
  - lambda
  - networking
  - aws
  - notes
date: 2026-08-27
---

## Overview

Amazon **VPC Lattice** provides application-layer connectivity between services across VPCs and accounts. This lab exposes one Lattice service with two backends - an EC2 Flask app and a Lambda function - then routes by path prefix and weighted default action.

![VPC Lattice logical architecture](./images/vpc-lattice-logical-architecture.png)

| Component | Role |
| --- | --- |
| EC2 instance | HTTP backend on port `8080` |
| Lambda function | Serverless backend |
| Target groups | Register EC2 and Lambda targets |
| Lattice service | Listener, routing rules, auth policy |
| Service network | VPC association and client access |

**Traffic flow**

```text
Client (EC2 in associated VPC)
        │
        ▼
Service network association
        │
        ▼
VPC Lattice service (listener :80 / :443)
        │
        ├─ /to-instance ──► instance target group ──► EC2 :8080
        ├─ /to-lambda   ──► lambda target group   ──► Lambda
        └─ default      ──► 90% instance / 10% lambda
```

---

## Backends

### Backend A: EC2 instance (Flask)

Run a simple Flask app on an EC2 instance in the **same VPC** you will associate with the service network.

**Reference app:** [`dir/lambda/flask/simple/simple.py`](./dir/lambda/flask/simple/simple.py)

```python
from flask import Flask

app = Flask(__name__)

@app.route('/')
def index():
    return 'Hello from the EC2 instance'

@app.route('/<path:path>')
def some_path(path):
    return f'Hello from the EC2 instance at path "{path}"'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080)
```

**`requirements.txt`**

```text
flask
```

**Deploy on the instance**

```bash
# 1. Install dependencies
pip3 install -r requirements.txt

# 2. Run the application in the background
nohup python3 app.py > app.log 2>&1 &

# 3. Verify locally
curl http://localhost:8080/test
```

> **Security group:** Allow inbound TCP **8080** from the VPC CIDR (or the AWS managed prefix list for VPC Lattice).

### Backend B: Lambda function

Create a standard Python 3.x Lambda that returns a simple HTTP response (for example via Lambda Function URLs or a minimal handler compatible with Lattice Lambda targets).

---

## Target groups

Create two target groups in VPC Lattice:

| Target group | Type | Protocol / port | Target |
| --- | --- | --- | --- |
| `instance-lattice-tg` | Instance | HTTP / `8080` | EC2 instance running Flask |
| `lambda-lattice-tg` | Lambda function | - | Configured Lambda function |

---

## Lattice service

### Auth policy (IAM)

Attach an auth policy that allows clients to invoke the service. For a lab, start permissive and tighten later.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": "vpc-lattice-svcs:Invoke",
      "Resource": "*"
    }
  ]
}
```

### Access logs

Enable access logs on the service (CloudWatch Logs or S3) before testing routing rules.

### Listeners and routing rules

Create an **HTTP** listener on port **80** (or **HTTPS** on **443**) with:

| Priority | Condition | Action |
| --- | --- | --- |
| Rule 1 | Path prefix `/to-instance` | Forward 100% → `instance-lattice-tg` |
| Rule 2 | Path prefix `/to-lambda` | Forward 100% → `lambda-lattice-tg` |
| Default | (no match) | Forward 90% → `instance-lattice-tg`, 10% → `lambda-lattice-tg` |

> **Weighted default:** Target weights must sum to exactly **100%**.

---

## Service network

1. Create or select a **service network**.
2. Associate the Lattice **service** created above.
3. **Associate a VPC** - choose the VPC where your client EC2 instance lives.
4. Attach a **security group** to the service network VPC association:
   - Inbound: allow HTTP **80** / HTTPS **443** from the VPC CIDR.
5. Copy the **service domain name** from the service association details, for example:

   ```text
   svc-0abc123def456789a.abc123.vpc-lattice-svcs.us-east-1.on.aws
   ```

   See [AWS: finding the service domain name](https://d2908q01vomqb2.cloudfront.net/da4b9237bacccdf19c0760cab7aec4a8359010b0/2022/11/20/vpc-lattice-service-domain-name.png).

---

## Test from a client EC2 instance

Run `curl` from an instance in the associated VPC:

```bash
# Path-based rules
curl "http://${LATTICE_SERVICE_DOMAIN}/to-instance/hello"
curl "http://${LATTICE_SERVICE_DOMAIN}/to-lambda/hello"

# Default weighted routing (repeat to observe distribution)
curl "http://${LATTICE_SERVICE_DOMAIN}/"
```

Replace `${LATTICE_SERVICE_DOMAIN}` with the domain name from the service network association.

---

## References

- [VPC Lattice service networks](https://docs.aws.amazon.com/vpc-lattice/latest/ug/service-networks.html)
- [VPC Lattice use cases (PDF)](https://docs.aws.amazon.com/pdfs/architecture-diagrams/latest/amazon-vpc-lattice-use-cases/amazon-vpc-lattice-use-cases.pdf)
- [Networking on AWS - VPC Lattice](./networking-on-aws.md#vpc-lattice)

---

# aws-vpc-transit-gateway.md

---
title: "Amazon VPC Transit Gateway (Reference Links)"
description: VPC Transit Gateway
tags:
    - vpc
    - transit gateway
    - networking
---

Reference:
 - Creating a single internet exit point from multiple VPCs Using AWS Transit Gateway
 - Building an egress VPC with AWS Transit Gateway and the AWS CDK
 - Building a Scalable and Secure Multi-VPC AWS Network Infrastructure
---

# dir\ecs-service-connect\Readme.md


---

# dir\vpc\vpc-lattice-networking\README.md

# Simple VPC Lattice Demo Application

## Components

| Component | Runtime | Endpoint |
|---|---|---|
| order-service | ECS | `GET /orders`, `POST /orders` |
| inventory-service | EKS | `GET /inventory/{sku}` |
| customer-service | EC2 | `GET /customers/{id}` |
| notification-service | Lambda | API Gateway/Lambda Function URL style handler |
| RDS | PostgreSQL | `customers`, `orders`, `inventory` sample data |
| private-config-resource | EC2/private VPC resource | `GET /config` |

The services intentionally contain simple HTTP APIs. Deploy each workload privately, expose it through its load balancer/service endpoint, and register that endpoint with VPC Lattice.

## Local test

Each container service can run with Docker Compose:

```bash
docker compose up --build
```

Then test:

```bash
curl http://localhost:8081/orders
curl http://localhost:8082/inventory/SKU-001
curl http://localhost:8083/customers/CUST-001
curl http://localhost:8084/config
```

## Suggested Lattice mapping

- ECS order-service -> VPC Lattice Service
- EKS inventory-service -> VPC Lattice Service
- EC2 customer-service -> VPC Lattice Service
- Lambda notification-service -> VPC Lattice Service / Lambda target group
- RDS -> Resource Configuration
- private-config-resource -> Resource Configuration

The application code does not implement networking policy. VPC Lattice service association, auth policy, resource configuration, and VPC association are infrastructure concerns.

---

# dir\vpc-lattic-eks\README.md

# VPC Lattice on `lab-cluster` — two Python apps + private hosted zone

**Assumes:** EKS cluster `lab-cluster`, worker VPC, and `kubectl` access already exist. This lab does **not** create VPC or EKS.

| App | Namespace | Lattice path | Role |
| --- | --- | --- | --- |
| `catalog-backend` | `catalog-backend` | `/catalog/*` | Data API |
| `catalog-frontend` | `catalog-frontend` | `/fetch/*` | Calls backend via **Route 53 private name** → Lattice |

Flow: client → Lattice → frontend → `http://catalog.lattice.lab.internal/catalog/...` (PHZ CNAME → backend Lattice FQDN) → Lattice → backend.

Extended reference: [VPC Lattice on EKS with Gateway API](/eks-vpc-lattice-gateway-api/).

---

## Step 0 — Variables

```bash
export AWS_REGION=us-east-1
export EKS_CLUSTER_NAME=lab-cluster
export SERVICE_NETWORK_NAME=lattice-sn
export PRIVATE_ZONE_NAME=lattice.lab.internal
export BACKEND_DNS_NAME=catalog.lattice.lab.internal
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

---

## Step 1 — Cluster access + Lattice prefix lists on pod SG

```bash
aws eks update-kubeconfig --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}"

CLUSTER_SG=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --output json | jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=tcp,FromPort=8080,ToPort=8080" 2>/dev/null || true

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=-1" 2>/dev/null || true
```

---

## Step 2 — Service network + VPC association

```bash
aws vpc-lattice create-service-network --name "${SERVICE_NETWORK_NAME}" --region "${AWS_REGION}" 2>/dev/null || true

SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --region "${AWS_REGION}" \
  --query "items[?name=='${SERVICE_NETWORK_NAME}'].id" --output text)

CLUSTER_VPC_ID=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

aws vpc-lattice create-service-network-vpc-association \
  --region "${AWS_REGION}" \
  --service-network-identifier "${SERVICE_NETWORK_ID}" \
  --vpc-identifier "${CLUSTER_VPC_ID}" 2>/dev/null || true
```

Wait until association is **ACTIVE**:

```bash
aws vpc-lattice list-service-network-vpc-associations \
  --region "${AWS_REGION}" \
  --vpc-id "${CLUSTER_VPC_ID}"
```

---

## Step 3 — Gateway API CRDs

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## Step 4 — Controller IAM + EKS Pod Identity (no hand-written ServiceAccount manifest)

```bash
curl -fsSL -o /tmp/vpc-lattice-controller-policy.json \
  https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json

aws iam create-policy \
  --policy-name VPCLatticeControllerIAMPolicy \
  --policy-document file:///tmp/vpc-lattice-controller-policy.json 2>/dev/null || true

POLICY_ARN="arn:aws:iam::${ACCOUNT_ID}:policy/VPCLatticeControllerIAMPolicy"

aws iam create-role \
  --role-name VPCLatticeControllerRole \
  --assume-role-policy-document file://controller/pod-identity-trust.json 2>/dev/null || true

aws iam attach-role-policy \
  --role-name VPCLatticeControllerRole \
  --policy-arn "${POLICY_ARN}"

aws eks create-pod-identity-association \
  --cluster-name "${EKS_CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/VPCLatticeControllerRole" \
  --namespace aws-application-networking-system \
  --service-account gateway-api-controller
```

Ensure **eks-pod-identity-agent** add-on is on the cluster.

---

## Step 5 — Helm: Gateway API controller (`serviceAccount.create=true`)

Helm creates the ServiceAccount; Pod Identity binds IAM to `gateway-api-controller`.

```bash
aws ecr-public get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --create-namespace \
  -f controller/helm-values.yaml

kubectl get pods -n aws-application-networking-system
```

Values file: [`controller/helm-values.yaml`](./controller/helm-values.yaml).

---

## Step 6 — GatewayClass + Gateway

```bash
kubectl apply -f manifests/namespaces.yaml
kubectl apply -f manifests/gatewayclass.yaml
kubectl apply -f manifests/gateway.yaml
kubectl get gateway -n networking
```

Wait for `PROGRAMMED=True`.

---

## Step 7 — Build and push images

From this directory:

```bash
export ECR_REGISTRY="${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
export BACKEND_REPO=catalog-backend
export FRONTEND_REPO=catalog-frontend

aws ecr create-repository --repository-name "${BACKEND_REPO}" --region "${AWS_REGION}" 2>/dev/null || true
aws ecr create-repository --repository-name "${FRONTEND_REPO}" --region "${AWS_REGION}" 2>/dev/null || true
aws ecr get-login-password --region "${AWS_REGION}" | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

docker build -t "${ECR_REGISTRY}/${BACKEND_REPO}:latest" backend/
docker build -t "${ECR_REGISTRY}/${FRONTEND_REPO}:latest" frontend/
docker push "${ECR_REGISTRY}/${BACKEND_REPO}:latest"
docker push "${ECR_REGISTRY}/${FRONTEND_REPO}:latest"
```

Edit manifests — replace image placeholders:

- `manifests/backend.yaml` → `REPLACE_WITH_BACKEND_ECR_IMAGE`
- `manifests/frontend.yaml` → `REPLACE_WITH_FRONTEND_ECR_IMAGE`

---

## Step 8 — Deploy workloads + HTTPRoute + TargetGroupPolicy

```bash
kubectl apply -f manifests/backend.yaml
kubectl apply -f manifests/frontend.yaml
kubectl get httproute -A
```

Backend Lattice FQDN:

```bash
export BACKEND_LATTICE_FQDN=$(kubectl get httproute catalog-backend-route -n catalog-backend \
  -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}')
echo "${BACKEND_LATTICE_FQDN}"
```

---

## Step 9 — Route 53 private hosted zone → VPC Lattice

Create a **private** zone linked to the cluster VPC (once per lab):

```bash
HOSTED_ZONE_ID=$(aws route53 create-hosted-zone \
  --name "${PRIVATE_ZONE_NAME}" \
  --vpc VPCRegion="${AWS_REGION}",VPCId="${CLUSTER_VPC_ID}" \
  --caller-reference "lattice-lab-$(date +%s)" \
  --query 'HostedZone.Id' --output text | tr -d '/hostedzone/')

sed "s/REPLACE_WITH_BACKEND_LATTICE_FQDN/${BACKEND_LATTICE_FQDN}/" route53/private-zone-cname.json > /tmp/cname-change.json

aws route53 change-resource-record-sets \
  --hosted-zone-id "${HOSTED_ZONE_ID}" \
  --change-batch file:///tmp/cname-change.json
```

Record template: [`route53/private-zone-cname.json`](./route53/private-zone-cname.json).  
Name `catalog.lattice.lab.internal` must match `BACKEND_HOST` in [`manifests/frontend.yaml`](./manifests/frontend.yaml).

---

## Step 10 — Verify

From a pod or host in the cluster VPC:

```bash
export FRONTEND_LATTICE_FQDN=$(kubectl get httproute catalog-frontend-route -n catalog-frontend \
  -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}')

curl -s "http://${FRONTEND_LATTICE_FQDN}/fetch/item-1" | jq .
curl -s "http://${BACKEND_LATTICE_FQDN}/catalog/item-1" | jq .
```

Expected: frontend JSON includes `via: private-hosted-zone` and `item` from backend.

---

## Layout

```text
vpc-lattic-eks/
  README.md                 # this guide
  backend/                  # FastAPI catalog API
  frontend/                 # calls backend via PHZ name
  controller/helm-values.yaml
  manifests/*.yaml
  route53/private-zone-cname.json
```

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Controller crash | Pod Identity association + `VPCLatticeControllerIAMPolicy` |
| Unhealthy targets | TargetGroupPolicy `/health` on port **8080**; SG prefix list |
| Frontend 502 | PHZ CNAME → correct backend Lattice FQDN; zone associated with VPC |
| Gateway not programmed | `defaultServiceNetwork=lattice-sn`; VPC association **ACTIVE** |

---

# docker-alpine-ecr-patterns.md

---
title: "Docker: Alpine Non-Root Images and ECR"
description: ""
tags:
  - docker
  - ecr
  - repository
  - aws
---


## Alpine ( User with UID & GID )

```Dockerfile

FROM python:3.14-alpine

RUN addgroup -g 5000 app && adduser -D -u 5000 -G app app

WORKDIR /app

COPY --chown=app:app app.py requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

USER app

CMD ["python", "app.py"]

```

## Debian ( User with UID & GID )

```Dockerfile

FROM python:3.14-slim

RUN groupadd --gid 5000 app && useradd --uid 5000 --gid 5000 --create-home app

WORKDIR /app

COPY --chown=app:app app.py requirements.txt ./

RUN pip install --no-cache-dir -r requirements.txt

USER app

CMD ["python", "app.py"]

```

`RUN groupadd --gid 5000 app && useradd --uid 5000 --gid 5000 --create-home --shell /usr/sbin/nologin app`
---

# eks-alb-ingress-controller.md

---
title: "EKS ALB Ingress with AWS Load Balancer Controller"
description: Expose services on EKS via the AWS Load Balancer Controller and ALB Ingress.
tags:
  - eks
  - alb
  - ingress
  - load-balancer
---

# EKS + AWS Load Balancer Controller (ALB Ingress) Notes

Personal setup notes for exposing services on EKS via the AWS Load Balancer
Controller (ALB Ingress). Steps: tag subnets → install controller → deploy
ingress → variations.

---

## 1. Tag VPC & Subnets

The controller auto-discovers subnets using these tags. Replace
`<my-cluster>`, `<subnet-id>` with real values.

**VPC add tag for Cluster**
- Key: `kubernetes.io/cluster/<my-cluster>`
- Value: `shared` (cluster doesn't own the VPC) or `owned` (cluster owns the VPC)

```bash
aws ec2 describe-vpcs \
  --query "Vpcs[*].{VpcId: VpcId, Name: Tags[?Key=='Name'].Value | [0]}" \
  --output json

aws ec2 create-tags \
  --resources <vpc-xxxxxxxxx> \
  --tags Key=kubernetes.io/cluster/<my-cluster>,Value=shared
```

**List Subnets**
```bash
#all
aws ec2 describe-subnets \
  --query "Subnets[*].{SubnetId: SubnetId, VpcId: VpcId, Name: Tags[?Key=='Name'].Value | [0], CidrBlock: CidrBlock}" \
  --output json

# specific vpc
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=vpc-xxxxxxxxx" \
  --query "Subnets[*].{SubnetId: SubnetId, Name: Tags[?Key=='Name'].Value | [0]}" \
  --output json
```

**Private subnets** (for internal load balancers)
- Key: `kubernetes.io/role/internal-elb`
- Value: `1`

```bash
aws ec2 create-tags \
  --resources <subnet-id> \
  --tags Key=kubernetes.io/role/internal-elb,Value=1
```

**Public subnets** (for internet-facing load balancers)
- Key: `kubernetes.io/role/elb`
- Value: `1`

```bash
aws ec2 create-tags \
  --resources <subnet-id> \
  --tags Key=kubernetes.io/role/elb,Value=1
```

> Note: if the cluster/VPC was created with `eksctl`, these tags are usually
> applied automatically - check before re-tagging.

---

## 2. Install the AWS Load Balancer Controller

### 2.1 Create IAM Policy

```bash
curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.14.1/docs/install/iam_policy.json

# China regions use a different policy:
# https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/main/docs/install/iam_policy_cn.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json
```

### 2.2 Create IAM Service Account

```bash
eksctl create iamserviceaccount \
  --cluster=<cluster-name> \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=arn:aws:iam::<AWS_ACCOUNT_ID>:policy/AWSLoadBalancerControllerIAMPolicy \
  --override-existing-serviceaccounts \
  --region <aws-region-code> \
  --approve
```

### 2.3 Install via Helm

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update eks

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=<cluster-name> \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=<region-code> \
  --set vpcId=<vpc-id> \
  --version 1.14.0
```

### 2.4 Verify

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
```

Expect `READY 2/2` (two controller replicas) once it's up.

---

## 3. Deploy an Ingress

### 3.1 Service (ClusterIP, targeted by the ALB)

```yaml
apiVersion: v1
kind: Service
metadata:
  namespace: game-2048
  name: service-2048
spec:
  ports:
    - port: 80
      targetPort: 80
      protocol: TCP
  type: ClusterIP
  selector:
    app.kubernetes.io/name: app-2048
```

### 3.2 Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: game-2048
  name: ingress-2048
  annotations:
    alb.ingress.kubernetes.io/load-balancer-name: <name>
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: service-2048
                port:
                  number: 80
```

### Key annotations reference

| Annotation | Purpose |
|---|---|
| `alb.ingress.kubernetes.io/scheme` | `internet-facing` or `internal` |
| `alb.ingress.kubernetes.io/target-type` | `ip` (pod IP, needs VPC CNI) or `instance` (NodePort) |
| `alb.ingress.kubernetes.io/load-balancer-name` | Custom ALB name |
| _`kubernetes.io/ingress.class: alb`_ | _Legacy way to select the ALB controller (older `Ingress` API, pre-`ingressClassName`)_ |
| `alb.ingress.kubernetes.io/ip-address-type: dualstack` | Enables IPv6 + IPv4. **Note:** IPv6 load balancing only works with `target-type: ip`, not `instance`. Without this, the ALB is IPv4-only. |

---

## 4. Ingress Variations

### 4.1 Multiple routes (path-based, incl. non-k8s targets like Lambda)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: mixed-routing-ingress
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.aws/scheme: internet-facing
    # Map rules to standard services or external/lambda targets via annotations/plugin groups
    alb.ingress.kubernetes.aws/actions.lambda-route: |
      {
        "Type": "forward",
        "TargetGroupARN": "arn:aws:elasticloadbalancing:region:account:targetgroup/my-lambda-tg/xxxx"
      }
spec:
  rules:
    - http:
        paths:
          - path: /service
            pathType: Prefix
            backend:
              service:
                name: my-eks-app-service
                port:
                  number: 80
          - path: /lambda
            pathType: Prefix
            backend:
              service:
                name: lambda-route
                port:
                  number: use-annotations

```

### 4.2 Host-based routing

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: game-2048
  name: ingress-2048
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: service-2048
                port:
                  number: 80
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
```

### 4.3 Health check annotations

```yaml
metadata:
  annotations:
    alb.ingress.kubernetes.io/healthcheck-protocol: HTTP
    alb.ingress.kubernetes.io/healthcheck-path: /healthz
    alb.ingress.kubernetes.io/healthcheck-port: <port>
    alb.ingress.kubernetes.io/healthcheck-interval-seconds: '15'
    alb.ingress.kubernetes.io/healthcheck-timeout-seconds: '5'
    alb.ingress.kubernetes.io/success-codes: '200'
    alb.ingress.kubernetes.io/healthy-threshold-count: '2'
    alb.ingress.kubernetes.io/unhealthy-threshold-count: '2'
```

---

## Gotchas / Things I forgot before

- `target-type: ip` requires pods to have routable VPC IPs (default with the
  VPC CNI) - no extra config needed on standard EKS.
- Dualstack (IPv6) only works with `target-type: ip`.
- Subnet tags are how the controller *discovers* subnets automatically - if
  they're missing/wrong, the ALB either fails to provision or lands in the
  wrong subnets.
- `kubernetes.io/ingress.class: alb` is the old annotation-based way to pick
  the controller; prefer `spec.ingressClassName: alb` on newer clusters.


## 5. Examples

### 5.1 Ingress ( Grafana and Prometheus )

Assumes `kube-prometheus-stack` installed in the `prometheus` namespace
(services `prometheus-grafana` on port 80 and
`prometheus-kube-prometheus-prometheus` on port 9090 - check your actual
service names with `kubectl get svc -n monitoring`).

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: prometheus
  name: monitoring-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /grafana
            pathType: Prefix
            backend:
              service:
                name: prometheus-grafana
                port:
                  number: 80

          - path: /prometheus
            pathType: Prefix
            backend:
              service:
                name: prometheus-kube-prometheus-prometheus
                port:
                  number: 9090
```

**Configure Prometheus and Grafana**

```yaml
cat > monitoring-values.yaml <<'EOF'
 prometheus:
   prometheusSpec:
     externalUrl: "http://alb-153229186.us-east-1.elb.amazonaws.com/prometheus/"
     routePrefix: "/prometheus/"
 
 grafana:
   grafana.ini:
     server:
       root_url: "%(protocol)s://%(domain)s/grafana/"
       serve_from_sub_path: true
EOF
```
```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  -f monitoring-values.yaml
```

```bash
curl -I http://alb-153229186.us-east-1.elb.amazonaws.com/prometheus/
curl -v http://alb-153229186.us-east-1.elb.amazonaws.com/grafana/
```

> Gotcha: Grafana's default service port is `80` (proxies to container port
> `3000`) - don't point the Ingress at `3000` directly unless you changed
> the Service to expose it that way.

### 5.2 Ingress ( ArgoCD )

ArgoCD's `argocd-server` serves both gRPC and HTTPS on the same port by
default (unless it's running with `--insecure`), so the ALB needs to talk
HTTPS to the backend or the UI/API will fail with protocol errors.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: argocd
  name: argocd-server-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/backend-protocol: HTTPS
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: <acm-cert-arn>
    alb.ingress.kubernetes.io/ssl-redirect: '443'
spec:
  ingressClassName: alb
  rules:
    - host: argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
```

> Gotcha: if you run `argocd-server` with `--insecure` (TLS terminated at
> the ALB instead), switch `backend-protocol` to `HTTP` and target port
> `80` instead - otherwise the ALB will fail health checks trying HTTPS
> against a plaintext backend.

---

## 6. Ingress ( Group )

By default every `Ingress` resource provisions its **own** ALB. That gets
expensive/messy fast if you have several apps (Grafana, Prometheus,
ArgoCD, …) each wanting their own ingress - you end up paying for and
managing N load balancers.

`IngressGroup` lets multiple `Ingress` resources share a single ALB. The
controller merges all rules from every Ingress with the same
`group.name` into one ALB, keyed by listener/host/path.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: monitoring
  name: grafana-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/group.name: shared-alb
    alb.ingress.kubernetes.io/group.order: '10'
spec:
  ingressClassName: alb
  rules:
    - host: grafana.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: kube-prometheus-stack-grafana
                port:
                  number: 80
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  namespace: argocd
  name: argocd-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/backend-protocol: HTTPS
    alb.ingress.kubernetes.io/group.name: shared-alb
    alb.ingress.kubernetes.io/group.order: '20'
spec:
  ingressClassName: alb
  rules:
    - host: argocd.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: argocd-server
                port:
                  number: 443
```

Both Ingresses above (in different namespaces) get merged into **one**
ALB named after the group.

### Key group annotations

| Annotation | Purpose |
|---|---|
| `alb.ingress.kubernetes.io/group.name` | Ingresses sharing this name share one ALB. Must be unique per ALB across the cluster. |
| `alb.ingress.kubernetes.io/group.order` | Evaluation priority within the group (lower = evaluated first). Matters when rules could overlap. |

> Gotchas:
> - Annotations like `load-balancer-name`, `scheme`, `ip-address-type`,
>   `certificate-arn`, etc. must be **consistent** across all Ingresses in
>   the group - the controller merges them, and conflicts cause errors.
> - Deleting one Ingress in the group only removes its rules from the
>   shared ALB, not the whole ALB - it stays up as long as at least one
>   Ingress in the group exists.
> - Group name is cluster-scoped, not namespace-scoped, so it's fine (and
>   expected) for member Ingresses to live in different namespaces, as in
>   the Grafana/ArgoCD example above.
---

# eks-argocd-codecommit-pipeline.md

---
title: "EKS GitOps: CodeCommit to Argo CD"
description: End-to-end GitOps from CodeCommit through CodePipeline to Argo CD on EKS.
tags:
  - eks
  - argocd
  - codecommit
  - codepipeline
  - codebuild
  - ecr
  - cicd
  - gitops
---

# CodeCommit to ArgoCD Pipeline on EKS

End-to-end GitOps: push application code → CodePipeline builds and pushes to ECR → image tag is bumped in a manifest repo → Argo CD syncs to the cluster.

```text
git push app-repo
  → CodePipeline / CodeBuild
  → build image → push ECR
  → bump tag in manifest-repo
  → Argo CD sync
```

**Repos:**

```text
app-repo/              manifest-repo/
├── Dockerfile         ├── deployment-api.yaml
├── buildspec.yml      └── configmap.yaml
└── src/...
```

**Prerequisites:** Argo CD installed on EKS ([ArgoCD on EKS](argocd-eks.md)), `aws` CLI, `kubectl`, and `git-remote-codecommit` for local clones.

---

## 1. Create CodeCommit repos

Create two repos in CodeCommit:

- `app-repo` - application source + Dockerfile + buildspec
- `manifest-repo` - Kubernetes manifests (Deployment, ConfigMap)

Clone locally:

```bash
pip install git-remote-codecommit

git clone codecommit::<region>://app-repo
git clone codecommit::<region>://manifest-repo
```

## 2. Create ECR repo

```bash
aws ecr create-repository --repository-name my-app --region <region>
```

## 3. Push manifests to manifest-repo

The app pod reads RDS credentials from Secrets Manager at runtime (`secret_name` in `config.ini`). It uses service account `my-app-sa`.

`deployment-api.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: config-volume
              mountPath: /app/config.ini
              subPath: config.ini
              readOnly: true
      volumes:
        - name: config-volume
          configMap:
            name: my-app-config
```

`configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
  namespace: my-app
data:
  config.ini: |
    [app]
    port = 8080

    [aws]
    region = <region>

    [database]
    host = <rds-host>
    port = 5432
    dbname = <dbname>
    secret_name = <rds-secret-name>

    [firehose]
    stream_name = <firehose-stream>
```

## 4. App IAM - Secrets Manager

The Secrets Manager policy belongs on the **application** service account (`my-app-sa`), not Argo CD.

```bash
cat <<EOF > my-app-secrets-manager-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsManagerGetAndDescribeSecret",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:<region>:<account-id>:secret:<rds-secret-name>*"
    },
    {
      "Sid": "KMSDecryptKey",
      "Effect": "Allow",
      "Action": ["kms:Decrypt"],
      "Resource": "arn:aws:kms:<region>:<account-id>:key/*",
      "Condition": {
        "StringLike": {
          "kms:EncryptionContext:SecretARN": "arn:aws:secretsmanager:<region>:<account-id>:secret:<rds-secret-name>*",
          "kms:ViaService": "secretsmanager.<region>.amazonaws.com"
        }
      }
    }
  ]
}
EOF

cat <<EOF > my-app-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "pods.eks.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession"]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name MyAppSecretsManagerReadPolicy \
  --policy-document file://my-app-secrets-manager-policy.json

aws iam create-role \
  --role-name EKS-MyApp-SecretsManager-Role \
  --assume-role-policy-document file://my-app-trust-policy.json

aws iam attach-role-policy \
  --role-name EKS-MyApp-SecretsManager-Role \
  --policy-arn arn:aws:iam::<account-id>:policy/MyAppSecretsManagerReadPolicy
```

Associate the role with the app service account:

```bash
kubectl create namespace my-app
kubectl create serviceaccount my-app-sa -n my-app

aws eks create-pod-identity-association \
  --cluster-name <cluster> \
  --namespace my-app \
  --service-account my-app-sa \
  --role-arn arn:aws:iam::<account-id>:role/EKS-MyApp-SecretsManager-Role \
  --region <region>
```

Pod Identity credentials are injected at pod start. Restart the deployment after creating the association:

```bash
kubectl rollout restart deployment my-app -n my-app
```

## 5. CodeBuild IAM policy

Attach this policy to the CodeBuild service role. Replace `<region>` and `<account-id>`.

```bash
cat <<EOF > codebuild-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:PutImage",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["codecommit:GitPull"],
      "Resource": "arn:aws:codecommit:<region>:<account-id>:app-repo"
    },
    {
      "Effect": "Allow",
      "Action": ["codecommit:GitPull", "codecommit:GitPush"],
      "Resource": "arn:aws:codecommit:<region>:<account-id>:manifest-repo"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name MyAppCodeBuildPolicy \
  --policy-document file://codebuild-policy.json

aws iam attach-role-policy \
  --role-name <CODEBUILD_ROLE_NAME> \
  --policy-arn arn:aws:iam::<account-id>:policy/MyAppCodeBuildPolicy
```

## 6. buildspec.yml and CodePipeline

Add `buildspec.yml` to `app-repo`:

```yaml
version: 0.2

env:
  variables:
    ECR_REPO: "<account-id>.dkr.ecr.<region>.amazonaws.com/my-app"
    AWS_REGION: "<region>"
    MANIFESTS_REPO: "https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo"
    DEPLOYMENT_FILE: "deployment-api.yaml"

phases:
  install:
    commands:
      - IMAGE_TAG=$(echo "$CODEBUILD_RESOLVED_SOURCE_VERSION" | cut -c1-8)
      - "git config --global credential.helper '!aws codecommit credential-helper $@'"
      - git config --global credential.UseHttpPath true

  pre_build:
    commands:
      - aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REPO"

  build:
    commands:
      - docker build -t "$ECR_REPO:$IMAGE_TAG" .
      - docker tag "$ECR_REPO:$IMAGE_TAG" "$ECR_REPO:latest"

  post_build:
    commands:
      - docker push "$ECR_REPO:$IMAGE_TAG"
      - docker push "$ECR_REPO:latest"
      - git clone "$MANIFESTS_REPO" manifests-checkout
      - cd manifests-checkout
      - 'sed -i "s|image: .*|image: ${ECR_REPO}:${IMAGE_TAG}|" ${DEPLOYMENT_FILE}'
      - git config user.email "ci-bot@my-app.internal"
      - git config user.name "ci-bot"
      - git add ${DEPLOYMENT_FILE}
      - git commit -m "ci - bump image to ${IMAGE_TAG}"
      - git push origin HEAD
```

Create a CodePipeline with:

- **Source:** CodeCommit `app-repo`
- **Build:** CodeBuild project using the role from step 5

## 7. Connect Argo CD to manifest-repo

Argo CD only needs access to `manifest-repo` to sync Kubernetes manifests. Two options below - use **direct auth** unless Pod Identity is preferred.

### Option A - Direct auth (HTTPS credentials)

Generate HTTPS git credentials: IAM user → CodeCommit → Clone URL → HTTPS.

`argocd-repo-secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: codecommit-repo
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
stringData:
  type: git
  url: https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo
  username: <codecommit-git-username>
  password: <codecommit-git-password>
```

`argocd-application.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-app
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo
    targetRevision: master
    path: .
  destination:
    server: https://kubernetes.default.svc
    namespace: my-app
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

Apply:

```bash
kubectl apply -f argocd-repo-secret.yaml
kubectl apply -f argocd-application.yaml
```

### Option B - Pod Identity (no git credentials in secret)

Requires the EKS Pod Identity agent add-on.

```bash
cat <<EOF > argocd-codecommit-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["codecommit:GitPull", "codecommit:Get*", "codecommit:List*"],
      "Resource": "arn:aws:codecommit:<region>:<account-id>:manifest-repo"
    }
  ]
}
EOF

cat <<EOF > argocd-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "pods.eks.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession"]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name ArgoCDCodeCommitPolicy \
  --policy-document file://argocd-codecommit-policy.json

aws iam create-role \
  --role-name EKS-ArgoCD-CodeCommit-Role \
  --assume-role-policy-document file://argocd-trust-policy.json

aws iam attach-role-policy \
  --role-name EKS-ArgoCD-CodeCommit-Role \
  --policy-arn arn:aws:iam::<account-id>:policy/ArgoCDCodeCommitPolicy

aws eks create-pod-identity-association \
  --cluster-name <cluster> \
  --namespace argocd \
  --service-account argocd-repo-server \
  --role-arn arn:aws:iam::<account-id>:role/EKS-ArgoCD-CodeCommit-Role \
  --region <region>
```

Patch `argocd-repo-server` to use the AWS git credential helper:

```yaml
# patch-repo-server.yaml
spec:
  template:
    spec:
      initContainers:
        - name: config-git-aws
          image: alpine/git:latest
          command: ["sh", "-c"]
          args:
            - |
              git config --global credential.helper '!aws codecommit credential-helper "$@"'
              git config --global credential.UseHttpPath true
          volumeMounts:
            - name: git-config
              mountPath: /root
      volumes:
        - name: git-config
          emptyDir: {}
```

```bash
kubectl patch deployment argocd-repo-server -n argocd --patch-file patch-repo-server.yaml
```

Repo secret (URL only, no credentials):

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: codecommit-repo
  namespace: argocd
  labels:
    argocd.argoproj.io/secret-type: repository
type: Opaque
stringData:
  type: git
  url: https://git-codecommit.<region>.amazonaws.com/v1/repos/manifest-repo
  enableLfs: "true"
```

Apply the Application manifest from Option A (without username/password in the repo secret).

## 8. Verify

Push to `app-repo` and confirm the full pipeline:

```bash
aws codepipeline get-pipeline-state --name my-app-pipeline
aws ecr describe-images --repository-name my-app --region <region>
kubectl get application my-app -n argocd -o wide
kubectl get pods -n my-app -o jsonpath='{.items[*].spec.containers[*].image}'
```

---

**Optional:** For private Argo CD, create a VPC interface endpoint for `com.amazonaws.<region>.eks-capabilities` across multiple AZs with inbound HTTPS (443) allowed.

---

# eks-argocd-install.md

---
title: "Install Argo CD on Amazon EKS"
description: "Install Argo CD on EKS, expose the server with a LoadBalancer, retrieve the admin password, and log in from the CLI."
tags:
  - eks
  - argocd
  - kubernetes
  - helm
  - load-balancer
links:
  - title: Argo CD documentation
    url: https://argo-cd.readthedocs.io/
  - title: Amazon EKS
    url: https://docs.aws.amazon.com/eks/
---

# ArgoCD on EKS

## 1. Install Argo CD

```bash
helm repo add argo-cd https://argoproj.github.io/argo-helm
helm repo update

kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

## 2. Expose with a LoadBalancer

```bash
kubectl patch svc argocd-server -n argocd \
  -p '{"spec": {"type": "LoadBalancer"}}'
```

Get the URL:

```bash
export ARGOCD_SERVER=$(kubectl get svc argocd-server -n argocd \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Argo CD URL: https://$ARGOCD_SERVER"
```

## 3. Get the admin password

The default username is `admin`. The password is stored in a Kubernetes secret:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d && echo
```

Or save it to a variable:

```bash
export ARGOCD_PWD=$(kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d)
echo "Argo CD admin password: $ARGOCD_PWD"
```

Log in:

```bash
argocd login "$ARGOCD_SERVER" --username admin --password "$ARGOCD_PWD" --insecure
```

For CodeCommit repo access and application IAM (Secrets Manager), see [CodeCommit to ArgoCD Pipeline on EKS](codecommit-eks-argocd.md).

---

# eks-cluster-operations-runbook.md

---
title: "Amazon EKS Cluster Operations Runbook"
description: "EKS version guidance, access entries, Pod Identity vs IRSA, and day-2 cluster operations for Amazon EKS."
tags:
  - eks
  - kubernetes
  - pod-identity
  - irsa
  - aws
---
## Overview

Reference runbook for Amazon EKS cluster operations, workload identity, and deployment patterns. For a full end-to-end walkthrough, follow [ShopSphere on Amazon EKS](/eks-shopsphere-walkthrough/).

## EKS operations

### Version guidance

As of June 2026, AWS docs list EKS standard support for Kubernetes 1.35, 1.34, and 1.33. Verify with [EKS Kubernetes versions](https://docs.aws.amazon.com/eks/latest/userguide/kubernetes-versions.html) or `aws eks describe-cluster-versions` before creating clusters.

### Core commands

```bash
eksctl create cluster --name my-cluster --region ap-south-1 --version 1.35 --managed
aws eks update-kubeconfig --region ap-south-1 --name my-cluster
kubectl get nodes -o wide
kubectl get svc -A
kubectl auth can-i --list
```

### Access model

- Prefer **EKS access entries** for cluster access management on modern clusters.
- For pod AWS permissions, standardize on either **EKS Pod Identity** or **IRSA** per cluster/team.

### Day-2 checklist

- Confirm node IAM role has only node-level permissions.
- Use pod-level IAM for workload AWS access.
- Confirm add-ons and kubectl versions match the cluster minor version.
- Keep worker nodes in private subnets unless public nodes are deliberate.

### References

- [EKS access entries](https://docs.aws.amazon.com/eks/latest/userguide/access-entries.html)
- [EKS quick start](https://docs.aws.amazon.com/eks/latest/userguide/quickstart.html)

## Pod Identity and IRSA

Decision and troubleshooting notes for pod-level AWS permissions in Amazon EKS.

### Choose one pattern

- **EKS Pod Identity** - simpler operational model for supported EKS clusters and Linux EC2 worker nodes.
- **IRSA** - useful for OIDC-based compatibility and established workflows.

### Pod Identity trust policy

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "pods.eks.amazonaws.com" },
    "Action": ["sts:AssumeRole", "sts:TagSession"]
  }]
}
```

### Troubleshooting checklist

- Pod uses the intended `serviceAccountName`.
- Association exists for the namespace/service account.
- AWS SDK inside the container is recent enough for the selected identity method.
- No static `AWS_ACCESS_KEY_ID` or profile setting overrides the provider chain.
- Validate with `aws sts get-caller-identity` from inside the pod.

### References

- [EKS Pod Identity](https://docs.aws.amazon.com/eks/latest/userguide/pod-identities.html)
- [IAM roles for service accounts](https://docs.aws.amazon.com/eks/latest/userguide/iam-roles-for-service-accounts.html)

## Application deployment

For a complete deployment tutorial (ECR, HPA, ALB controller, ingress), use the ShopSphere walkthrough:

- [Infrastructure setup](/eks-shopsphere-walkthrough/#phase-01-01-infrastructure-setup)
- [Application deployment](/eks-shopsphere-walkthrough/#phase-05-05-application-deployment)
- [Ingress configuration](/eks-shopsphere-walkthrough/#phase-09-09-ingress-configuration)

**Quick reference links:**

- [EKS networking requirements](https://docs.aws.amazon.com/eks/latest/userguide/network-reqs.html)
- [AWS Load Balancer Controller](https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html)
- [Enable IAM OIDC provider](https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html)
---

# eks-deploy-app-alb-autoscaling.md

---
title: "Deploy an Application on EKS with ALB and Autoscaling"
description: "ECR push, eksctl cluster, Deployment, HPA, Cluster Autoscaler, AWS Load Balancer Controller, and ALB Ingress."
tags:
  - eks
  - ecr
  - kubernetes
  - alb
  - aws
  - notes
date: 2026-08-29
---

# AWS EKS Application Deployment Guide


---

## Prerequisites

- AWS CLI configured with appropriate permissions
- `eksctl`, `kubectl`, `docker`, `helm` installed
- Basic familiarity with YAML and Kubernetes concepts

---

## 1. ECR Setup & Docker Image Push

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=ap-south-1

# Create ECR repository
aws ecr create-repository --repository-name myapp --region $REGION

# Authenticate Docker to ECR
aws ecr get-login-password --region $REGION | \\
  docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Tag & push image
docker tag myapp:latest $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/myapp:latest
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/myapp:latest
```

---

## 2. Create EKS Cluster

```bash
eksctl create cluster \\
  --name my-cluster \\
  --region $REGION \\
  --nodegroup-name workers \\
  --node-type t3.medium \\
  --nodes 2 \\
  --managed
```

*AWS manages:* Control plane, API server, etcd

*You manage:* Worker nodes, pods, deployments, services

---

## 3. Deploy Application

**`deployment.yaml`**

*(Note: Added `resources` block. HPA requires CPU/Memory requests to function.)*

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 2
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/myapp:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
```

```bash
kubectl apply -f deployment.yaml
kubectl get pods
```

---

## 4. Autoscaling (Pods & Nodes)

### 4.1 Horizontal Pod Autoscaler (HPA)

EKS includes `metrics-server` by default. Create an HPA to scale pods based on CPU utilization.

**`hpa.yaml`**

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 50
```

```bash
kubectl apply -f hpa.yaml
kubectl get hpa
```

*Test:* `kubectl run load-generator --image=busybox -- /bin/sh -c "while true; do wget -q -O- <http://myapp-service>; done"`

### 4.2 Cluster Node Autoscaler

EKS managed node groups do **not** autoscale out-of-the-box. You must deploy the **Cluster Autoscaler** (CA) or use **Karpenter** (AWS recommended). Here is the standard CA setup:

### Step A: Tag Node Group for Auto-Discovery

CA requires specific tags to manage the node group.

```bash
eksctl create nodegroup \\
  --cluster my-cluster \\
  --name workers-autoscale \\
  --node-type t3.medium \\
  --nodes-min 2 \\
  --nodes-max 10 \\
  --tags k8s.io/cluster-autoscaler/enabled=true,k8s.io/cluster-autoscaler/my-cluster=owned
```

*(If updating an existing node group, use `aws eks update-nodegroup-config` to add tags.)*

### Step B: Attach IAM Policy

AWS provides a managed policy for CA:

```bash
export CA_POLICY_ARN="arn:aws:iam::aws:policy/AWSClusterAutoscalerPolicy"

eksctl create iamserviceaccount \\
  --cluster my-cluster \\
  --namespace kube-system \\
  --name cluster-autoscaler \\
  --attach-policy-arn $CA_POLICY_ARN \\
  --override-existing-serviceaccounts \\
  --approve
```

### Step C: Install via Helm

```bash
helm repo add autoscaler <https://kubernetes.github.io/autoscaler>
helm repo update

helm install cluster-autoscaler autoscaler/cluster-autoscaler \\
  -n kube-system \\
  --set autoDiscovery.clusterName=my-cluster \\
  --set awsRegion=$REGION \\
  --set extraArgs.balance-similar-node-groups=true \\
  --set extraArgs.skip-nodes-with-system-pods=false
```

**Verify:**

```bash
kubectl get pods -n kube-system | grep cluster-autoscaler
```

---

## 5. AWS Load Balancer Controller (ALB) Setup

### 5.1 Enable OIDC Provider

Required for IAM Roles for Service Accounts (IRSA).

```bash
eksctl utils associate-iam-oidc-provider \\
  --region $REGION \\
  --cluster my-cluster \\
  --approve
```

### 5.2 Create IAM Policy

```bash
curl -O <https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json>
aws iam create-policy \\
  --policy-name AWSLoadBalancerControllerIAMPolicy \\
  --policy-document file://iam_policy.json
```

### 5.3 Create IAM Service Account (IRSA)

```bash
export ALB_POLICY_ARN=$(aws iam list-policies \\
  --query 'Policies[?PolicyName==`AWSLoadBalancerControllerIAMPolicy`].Arn' \\
  --output text)

eksctl create iamserviceaccount \\
  --cluster my-cluster \\
  --namespace kube-system \\
  --name aws-load-balancer-controller \\
  --attach-policy-arn $ALB_POLICY_ARN \\
  --override-existing-serviceaccounts \\
  --approve
```

### 5.4 Install Controller via Helm

```bash
export VPC_ID=$(aws eks describe-cluster \\
  --name my-cluster \\
  --query "cluster.resourcesVpcConfig.vpcId" \\
  --output text)

helm repo add eks <https://aws.github.io/eks-charts>
helm repo update

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \\
  -n kube-system \\
  --set clusterName=my-cluster \\
  --set serviceAccount.create=false \\
  --set serviceAccount.name=aws-load-balancer-controller \\
  --set region=$REGION \\
  --set vpcId=$VPC_ID
```

**Verify:**

```bash
kubectl get pods -n kube-system | grep aws-load-balancer-controller
```

---

## 6. Service & Ingress Configuration

### 6.1 Internal Service (`ClusterIP`)

ALB handles public routing; services must remain internal.
**`service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-service
spec:
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

### 6.2 Ingress (`ingress.yaml`)

Triggers ALB creation via the controller.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp-service
                port:
                  number: 80
```

**Apply:**

```bash
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl get ingress myapp-ingress
```

---

## 7. Traffic Flow & Verification

```
Internet → ALB (Created by Ingress) → Ingress Controller → ClusterIP Service → Pods (Scaled by HPA)
                                                                         ↑
                                                                 Nodes (Scaled by CA)
```

- Wait 2–3 minutes for ALB provisioning.
- `kubectl get ingress` will show an `ADDRESS` (ALB DNS endpoint).
- Test access: `curl http://<ALB_DNS_ENDPOINT>`
- Monitor scaling: `kubectl get hpa` and `kubectl get nodes`

---
---

# eks-ecr-best-practices.md

---
title: "Amazon ECR Best Practices"
description: "Repository hardening workloads-scan on push, immutable production tags, and lifecycle policies for cost control."
tags:
  - ecr
  - eks
  - container-security
  - image-scanning
  - lifecycle
  - aws
---
## Overview

Harden Amazon ECR repositories used by EKS workloads with scanning, immutable tags for production, and lifecycle rules that control storage cost.

## Repository settings

- **Scan on push:** `true` - catch CVEs before images reach the cluster
- **Tags:** `Environment=Prod`, `ManagedBy=Manual` (or your standard tag set)
- **Tag mutability:** `Immutable` for production repos; `Mutable` only for dev/test if needed

## Lifecycle policy

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Cleanup untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire dev/test branch builds after 14 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["test-", "dev-", "feature-"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 14
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 3,
      "description": "Keep only last 20 production release tags",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["prod-", "v"],
        "countType": "imageCountMoreThan",
        "countNumber": 20
      },
      "action": { "type": "expire" }
    }
  ]
}
```

---

# eks-fargate-quickstart.md

---
title: "Run Workloads on AWS Fargate with Amazon EKS"
description: "Quick start for EKS Fargate profiles-pod execution role, private subnets, eksctl, sample Deployment, networking pitfalls."
tags:
  - eks
  - fargate
  - kubernetes
  - eksctl
  - iam
  - vpc
  - aws
resources:
  - title: Get started with Fargate for your cluster
    url: https://docs.aws.amazon.com/eks/latest/userguide/fargate-getting-started.html
  - title: Fargate profile selectors
    url: https://docs.aws.amazon.com/eks/latest/userguide/fargate-profile.html
  - title: Pod execution IAM role
    url: https://docs.aws.amazon.com/eks/latest/userguide/pod-execution-role.html
  - title: eksctl Fargate support
    url: https://docs.aws.amazon.com/eks/latest/eksctl/fargate.html
---

**Fargate on EKS** = Kubernetes schedules pods; AWS runs them on **Fargate** (no EC2 worker for those pods). You choose which pods via **Fargate profiles** (namespace + optional labels). This is different from [AWS Batch on Fargate](./aws-batch-fargate-quickstart.md), which uses job queues and job definitions.

**Time:** ~20 minutes for a minimal cluster + one app namespace.

## How it fits together

```mermaid
flowchart TB
  CP[EKS control plane]
  FP[Fargate profile selectors]
  API[kube-scheduler]
  POD[Pod on Fargate]
  ENI[Task ENI in private subnet]

  CP --> API
  FP --> API
  API -->|matches selector| POD
  POD --> ENI
```

| Piece | Role |
| --- | --- |
| Fargate profile | Maps `namespace` (+ labels) → Fargate capacity |
| Pod execution role | Lets Fargate pull images and write logs (`eks-fargate-pods.amazonaws.com`) |
| Private subnets | Required for Fargate pods (with NAT or VPC endpoints) |
| Cluster security group | Traffic between control plane and pod ENIs |

Manifests: [`dir/eks-fargate/`](./dir/eks-fargate/) - [`fargate-cluster.yaml`](./dir/eks-fargate/fargate-cluster.yaml), [`deployment.yaml`](./dir/eks-fargate/deployment.yaml).

## Prerequisites

- `eksctl` **0.215.0+** (`eksctl version`)
- `kubectl` aligned with cluster version
- IAM rights for EKS, EC2 (VPC), and IAM roles

```bash
export AWS_REGION=us-east-1
export CLUSTER_NAME=fargate-demo
```

## Step 1 - Pod execution role

Fargate needs a role trusted by `eks-fargate-pods.amazonaws.com` with **`AmazonEKSFargatePodExecutionRolePolicy`**.

`eksctl` can create this when you pass `--pod-execution-role-arn` or use a config file. Manual create (once per account/region pattern):

```bash
cat > /tmp/fargate-pod-trust.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "eks-fargate-pods.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
EOF

aws iam create-role \
  --role-name AmazonEKSFargatePodExecutionRole \
  --assume-role-policy-document file:///tmp/fargate-pod-trust.json 2>/dev/null || true

aws iam attach-role-policy \
  --role-name AmazonEKSFargatePodExecutionRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSFargatePodExecutionRolePolicy
```

## Step 2 - Create cluster with Fargate profiles

### Option A - eksctl config (recommended)

Edit region/version in [`fargate-cluster.yaml`](./dir/eks-fargate/fargate-cluster.yaml), then:

```bash
eksctl create cluster -f src/content/dir/eks-fargate/fargate-cluster.yaml
```

This example:

- **`fp-apps`** - pods in namespace `apps` with label `compute=fargate`
- **`fp-kube-system`** - CoreDNS (`k8s-app=kube-dns`) on Fargate
- **`system-ng`** - small managed node group for controllers/DaemonSets that cannot run on Fargate

### Option B - Fargate-only cluster flag

```bash
eksctl create cluster \
  --name "$CLUSTER_NAME" \
  --region "$AWS_REGION" \
  --fargate
```

That seeds profiles for **`default`** and **`kube-system`** only. Add more profiles for app namespaces.

### Option C - Existing cluster

```bash
eksctl create fargateprofile \
  --cluster "$CLUSTER_NAME" \
  --name fp-apps \
  --namespace apps \
  --labels compute=fargate
```

Profiles are **immutable** - change selectors by creating a new profile and deleting the old one after workloads move.

## Step 3 - Security groups and subnets

| Rule | Detail |
| --- | --- |
| Subnets | Fargate pods use **private** subnets from the profile (NAT for outbound, or VPC endpoints for ECR/S3/logs) |
| Pod ENI | Each pod gets an ENI; security groups come from the cluster config |
| Hybrid cluster | [AWS docs](https://docs.aws.amazon.com/eks/latest/userguide/fargate-profile.html): ensure **node security groups allow traffic to the cluster security group** so Fargate and EC2 pods can talk |

No extra inbound rules for a stateless `nginx` demo. For ALB Ingress, use the [AWS Load Balancer Controller](./eks-deploy-app-alb-autoscaling.md) and target-type `ip` on Fargate.

## Step 4 - Deploy a sample app

Create namespace and apply the deployment (labels must match the Fargate profile):

```bash
kubectl create namespace apps

kubectl apply -f src/content/dir/eks-fargate/deployment.yaml
```

Verify pods run on Fargate:

```bash
kubectl -n apps get pods -o wide
kubectl -n apps describe pod -l app=hello-fargate | grep -E 'Node:|fargate'
```

Fargate nodes look like `fargate-ip-10-20-x-x.region.compute.internal`.

```bash
kubectl -n apps run -it --rm debug --image=public.ecr.aws/docker/library/busybox:1.36 \
  --restart=Never -- wget -qO- http://hello-fargate.apps.svc.cluster.local
```

## Step 5 - CoreDNS on Fargate

If app pods stay `Pending` or DNS fails:

1. Confirm a profile selects **CoreDNS** in `kube-system` (label `k8s-app=kube-dns`), as in [`fargate-cluster.yaml`](./dir/eks-fargate/fargate-cluster.yaml).
2. Or keep CoreDNS on a **managed node group** and only run apps on Fargate.

After adding a profile, **recreate** CoreDNS pods so they match:

```bash
kubectl -n kube-system rollout restart deployment coredns
```

## What works / what does not

| Supported | Not supported on Fargate |
| --- | --- |
| Deployments, Jobs, most Services | **DaemonSets** (no host) |
| ALB Ingress (`target-type: ip`) | **Host network**, **privileged** containers |
| Horizontal Pod Autoscaler | **EBS volumes** attached to pod (use EFS) |
| IRSA (pod IAM roles) | GPU, **bare PodSecurityPolicy host paths** |

## Pitfalls

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Pod **Pending** (`eks-fargate-profile-not-found`) | No profile matches namespace/labels | Add profile or fix pod labels |
| Pod Pending (insufficient capacity) | Subnet/AZ or Fargate limits | Try another AZ in profile subnets; check quotas |
| **ImagePullBackOff** | No NAT/endpoints from private subnet | NAT gateway or ECR/S3 VPC endpoints |
| DNS failures | CoreDNS not on Fargate or not reachable | Fargate profile for `kube-dns` or run DNS on nodes |
| Changed profile has no effect | Profiles are immutable | Create new profile, migrate workloads, delete old |
| Old pods still on EC2 | Selector only applies at **schedule** time | Delete pods so they recreate |
| `eksctl create fargateprofile` fails on old cluster | Platform version / legacy stack | `eksctl upgrade cluster` per [eksctl docs](https://docs.aws.amazon.com/eks/latest/eksctl/fargate.html) |

## Cleanup

```bash
kubectl delete namespace apps
eksctl delete cluster --name "$CLUSTER_NAME" --region "$AWS_REGION"
```

## EKS Fargate vs other compute

| Model | You manage | Good for |
| --- | --- | --- |
| **Fargate profiles** | Profiles + pod sizing | Stateless apps, batch jobs, no node patching |
| **Managed node groups** | AMIs, scaling, DaemonSets | System agents, GPUs, EBS-heavy workloads |
| **EKS Auto Mode** | Less node plumbing | New clusters wanting AWS-managed compute (see [EKS getting started](./eks-getting-started.md)) |

Official walkthrough: [Get started with AWS Fargate for your cluster](https://docs.aws.amazon.com/eks/latest/userguide/fargate-getting-started.html).

---

# eks-getting-started.md

---
title: "Getting Started with Amazon EKS"
description: Initial EKS cluster setup including IAM roles, nodes, CNI, and ECR.
tags:
  - eks
  - iam
  - kubernetes
  - nodes
  - cni
  - ecr
  - auto-mode
---

# Getting Started with EKS

## Setup
- Cluster IAM Role
  - `AmazonEKSClusterRole` : Policies: `AmazonEKSClusterPolicy`

  Additional Policies Required ( Auto Mode ):
  - `AmazonEKSClusterPolicy`
    This policy provides Kubernetes the permissions it requires to manage resources on your behalf. Kubernetes requires Ec2:CreateTags permissions to place identifying information on EC2 resources including but not limited to Instances, Security Groups, and Elastic Network Interfaces.

  - `AmazonEKSBlockStoragePolicyV2`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's block storage resources.

  - `AmazonEKSComputePolicy`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's compute resources.

  - `AmazonEKSLoadBalancingPolicy`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's load balancing resources.

  - `AmazonEKSNetworkingPolicy`
    Policy attached to the EKS Cluster Role that grants permissions to manage the cluster's networking resources.

- Node IAM

  NodeGroup Role
  - `AmazonEC2ContainerRegistryReadOnly`
    Provides read-only access to Amazon EC2 Container Registry repositories.

  - `AmazonEKS_CNI_Policy`
    This policy provides the Amazon VPC CNI Plugin (amazon-vpc-cni-k8s) the permissions it requires to modify the IP address configuration on your EKS worker nodes. This permission set allows the CNI to list, describe, and modify Elastic Network Interfaces on your behalf. More information on the AWS VPC CNI Plugin is available here: https://github.com/aws/amazon-vpc-cni-k8s

  - `AmazonEKSWorkerNodePolicy`
    This policy allows Amazon EKS worker nodes to connect to Amazon EKS Clusters.

  - `AmazonElasticContainerRegistryPublicReadOnly`
    Provides read-only access to Amazon ECR Public repositories.

  Policies ( In Auto Mode ):
  - `AmazonEC2ContainerRegistryPullOnly`
    Provides access to pull images from Amazon EC2 Container Registry repositories.

  - `AmazonEKSWorkerNodeMinimalPolicy`
    This policy allows Amazon EKS worker nodes to connect to Amazon EKS Clusters.

  - `AmazonElasticContainerRegistryPublicReadOnly`
    Provides read-only access to Amazon ECR Public repositories.

---

# eks-karpenter-install.md

---
title: "Install Karpenter on Amazon EKS"
description: Install Karpenter on an existing EKS cluster for node autoscaling.
tags:
  - eks
  - vpc
  - karpenter
  - nodes
  - oidc
  - oidc-provider
---
# Karpenter Setup on EKS

Install [Karpenter](https://karpenter.sh/) on an **existing** Amazon EKS cluster so it can provision EC2 nodes when pods are unschedulable.

## Prerequisites

- `aws`, `kubectl`, `eksctl`, and `helm` installed and on your `PATH`
- `envsubst` (Git Bash / WSL on Windows, or the `gettext` package on Linux/macOS) - only needed for the bash steps
- Credentials with permission to create IAM roles/policies, tag EC2 resources, and administer the cluster
- The cluster already exists and `kubectl` can already reach it

> If your cluster was **not** created by you or is older, don't assume its IAM auth setup - step #4 below detects it for you before you touch anything.



### #1 - Configure kubectl



```bash
aws eks update-kubeconfig --name "${CLUSTER_NAME}" --region "${AWS_REGION}"
```



### #2 - Set environment variables



```bash
# verify you're pointed at the right account/region first
aws configure list

export KARPENTER_NAMESPACE=kube-system
export CLUSTER_NAME=<your-cluster-name>
export KARPENTER_VERSION="1.14.0"
export AWS_PARTITION="aws" # use aws-cn or aws-us-gov for other partitions
export AWS_REGION="$(aws configure get region)"
export AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query 'Account' --output text)"
export OIDC_ENDPOINT="$(aws eks describe-cluster --name "${CLUSTER_NAME}" \
    --query "cluster.identity.oidc.issuer" --output text)"
export K8S_VERSION="$(aws eks describe-cluster --name "${CLUSTER_NAME}" --query "cluster.version" --output text)"
export ALIAS_VERSION="$(aws ssm get-parameter --name "/aws/service/eks/optimized-ami/${K8S_VERSION}/amazon-linux-2023/x86_64/standard/recommended/image_id" --query Parameter.Value --output text | xargs -I{} aws ec2 describe-images --image-ids {} --query 'Images[0].Name' --output text | sed -r 's/^.*(v[[:digit:]]+).*$/\1/')"
```



### #3 - Associate an OIDC provider

The Karpenter controller authenticates via IRSA, which needs an IAM OIDC provider on the cluster. Existing clusters often don't have one yet - check first, don't assume:



```bash
OIDC_ID="${OIDC_ENDPOINT#*//}"
aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[].Arn" --output text | grep -q "${OIDC_ID##*/}" \
    && echo "OIDC provider already associated" \
    || eksctl utils associate-iam-oidc-provider --cluster "${CLUSTER_NAME}" --region "${AWS_REGION}" --approve
```



### #4 - Create node IAM role

Karpenter-launched nodes assume this role.



```bash
cat > node-trust-policy.json <<'EOF'
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
EOF

aws iam create-role --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --assume-role-policy-document file://node-trust-policy.json

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonEKSWorkerNodePolicy"

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonEKS_CNI_Policy"

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonEC2ContainerRegistryPullOnly"

aws iam attach-role-policy --role-name "KarpenterNodeRole-${CLUSTER_NAME}" \
    --policy-arn "arn:${AWS_PARTITION}:iam::aws:policy/AmazonSSMManagedInstanceCore"
```



### #5 - Authorize the node role to join the cluster

**This is the step that breaks most often on existing clusters.** `eksctl create iamidentitymapping` only works against the legacy `aws-auth` ConfigMap. Since EKS added **access entries**, most clusters created or upgraded in the last couple of years default to `API` or `API_AND_CONFIG_MAP` authentication mode - and on `API`-only clusters, ConfigMap-based mapping fails outright. Check the mode first, then use the matching command:



```bash
AUTH_MODE=$(aws eks describe-cluster --name "${CLUSTER_NAME}" \
    --query "cluster.accessConfig.authenticationMode" --output text)
echo "Authentication mode: ${AUTH_MODE}"

if [ "${AUTH_MODE}" = "CONFIG_MAP" ]; then
  # Legacy clusters only
  eksctl create iamidentitymapping \
    --cluster "${CLUSTER_NAME}" \
    --region "${AWS_REGION}" \
    --arn "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}" \
    --username system:node:{{EC2PrivateDNSName}} \
    --group system:bootstrappers \
    --group system:nodes
else
  # API or API_AND_CONFIG_MAP (current default) - use an access entry instead.
  # EC2_LINUX is a special node type: it wires up bootstrap auth automatically,
  # no access policy association needed.
  aws eks create-access-entry \
    --cluster-name "${CLUSTER_NAME}" \
    --principal-arn "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}" \
    --type EC2_LINUX
fi
```



If you get `ResourceInUseException: The specified access entry already exists`, the role is already authorized - safe to ignore.

### #6 - Create Karpenter controller IAM role

The controller uses IRSA to launch and terminate instances.



```bash
cat << EOF > controller-trust-policy.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:oidc-provider/${OIDC_ENDPOINT#*//}"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "${OIDC_ENDPOINT#*//}:aud": "sts.amazonaws.com",
                    "${OIDC_ENDPOINT#*//}:sub": "system:serviceaccount:${KARPENTER_NAMESPACE}:karpenter"
                }
            }
        }
    ]
}
EOF

aws iam create-role --role-name "KarpenterControllerRole-${CLUSTER_NAME}" \
    --assume-role-policy-document file://controller-trust-policy.json

cat << EOF > controller-policy.json
{
    "Statement": [
        {
            "Action": [
                "ssm:GetParameter",
                "ec2:DescribeImages",
                "ec2:RunInstances",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:DescribeLaunchTemplates",
                "ec2:DescribeInstances",
                "ec2:DescribeInstanceTypes",
                "ec2:DescribeInstanceTypeOfferings",
                "ec2:DeleteLaunchTemplate",
                "ec2:CreateTags",
                "ec2:CreateLaunchTemplate",
                "ec2:CreateFleet",
                "ec2:DescribeSpotPriceHistory",
                "pricing:GetProducts"
            ],
            "Effect": "Allow",
            "Resource": "*",
            "Sid": "Karpenter"
        },
        {
            "Action": "ec2:TerminateInstances",
            "Condition": {
                "StringLike": {
                    "ec2:ResourceTag/karpenter.sh/nodepool": "*"
                }
            },
            "Effect": "Allow",
            "Resource": "*",
            "Sid": "ConditionalEC2Termination"
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterNodeRole-${CLUSTER_NAME}",
            "Sid": "PassNodeIAMRole"
        },
        {
            "Effect": "Allow",
            "Action": "eks:DescribeCluster",
            "Resource": "arn:${AWS_PARTITION}:eks:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/${CLUSTER_NAME}",
            "Sid": "EKSClusterEndpointLookup"
        },
        {
            "Sid": "AllowScopedInstanceProfileCreationActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": [
                "iam:CreateInstanceProfile"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:RequestTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:RequestTag/topology.kubernetes.io/region": "${AWS_REGION}"
                },
                "StringLike": {
                    "aws:RequestTag/karpenter.k8s.aws/ec2nodeclass": "*"
                }
            }
        },
        {
            "Sid": "AllowScopedInstanceProfileTagActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": [
                "iam:TagInstanceProfile"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:ResourceTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:ResourceTag/topology.kubernetes.io/region": "${AWS_REGION}",
                    "aws:RequestTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:RequestTag/topology.kubernetes.io/region": "${AWS_REGION}"
                },
                "StringLike": {
                    "aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass": "*",
                    "aws:RequestTag/karpenter.k8s.aws/ec2nodeclass": "*"
                }
            }
        },
        {
            "Sid": "AllowScopedInstanceProfileActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": [
                "iam:AddRoleToInstanceProfile",
                "iam:RemoveRoleFromInstanceProfile",
                "iam:DeleteInstanceProfile"
            ],
            "Condition": {
                "StringEquals": {
                    "aws:ResourceTag/kubernetes.io/cluster/${CLUSTER_NAME}": "owned",
                    "aws:ResourceTag/topology.kubernetes.io/region": "${AWS_REGION}"
                },
                "StringLike": {
                    "aws:ResourceTag/karpenter.k8s.aws/ec2nodeclass": "*"
                }
            }
        },
        {
            "Sid": "AllowInstanceProfileReadActions",
            "Effect": "Allow",
            "Resource": "*",
            "Action": "iam:GetInstanceProfile"
        },
        {
            "Sid": "AllowUnscopedInstanceProfileListAction",
            "Effect": "Allow",
            "Resource": "*",
            "Action": "iam:ListInstanceProfiles"
        }
    ],
    "Version": "2012-10-17"
}
EOF

aws iam put-role-policy --role-name "KarpenterControllerRole-${CLUSTER_NAME}" \
    --policy-name "KarpenterControllerPolicy-${CLUSTER_NAME}" \
    --policy-document file://controller-policy.json

export KARPENTER_IAM_ROLE_ARN="arn:${AWS_PARTITION}:iam::${AWS_ACCOUNT_ID}:role/KarpenterControllerRole-${CLUSTER_NAME}"
```

> PowerShell users: build these two JSON policy documents the same way as the trust policy in step #4 (a `@'...'@` here-string piped to `Set-Content`), then run the equivalent `aws iam` commands with ``` line continuations and `$env:` variables as in the other PowerShell blocks.



### #7 - Tag subnets and security groups

Karpenter discovers networking resources using the `karpenter.sh/discovery` tag. On an existing cluster, tag the subnets an existing node group already uses (not every subnet in the VPC) and the cluster's shared security group:

```bash
# Subnets used by an existing managed node group
NODEGROUP=$(aws eks list-nodegroups --cluster-name "${CLUSTER_NAME}" --query "nodegroups[0]" --output text)
SUBNET_IDS=$(aws eks describe-nodegroup --cluster-name "${CLUSTER_NAME}" --nodegroup-name "${NODEGROUP}" --query "nodegroup.subnets" --output text)

# Cluster security group (shared by the control plane and, usually, nodes)
SECURITY_GROUP_ID=$(aws eks describe-cluster --name "${CLUSTER_NAME}" --query "cluster.resourcesVpcConfig.clusterSecurityGroupId" --output text)

aws ec2 create-tags --resources ${SUBNET_IDS} --tags Key=karpenter.sh/discovery,Value="${CLUSTER_NAME}"
aws ec2 create-tags --resources "${SECURITY_GROUP_ID}" --tags Key=karpenter.sh/discovery,Value="${CLUSTER_NAME}"
```



Don't use a Fargate-only cluster or a custom node group with a different security group without adjusting this. To see all candidate subnets/security groups in the VPC instead of relying on an existing node group:

> Make sure that the additional security allow the inbound from EKS security for worker-node 
>
> **IMP**: Use eks default security group only ( It will cause CoreDNS issue - traffic from additional sg must be allowed on eks-default on port 53 )

```bash
aws ec2 authorize-security-group-ingress \
   --group-id <additional-sg> \
   --protocol tcp \
   --port 443 \
   --source-group <eks-default-sg>
```

**Inspect and list subnets and security groups**

```bash
aws ec2 describe-subnets --query "Subnets[*].[SubnetId,VpcId,CidrBlock,Tags[?Key=='Name'].Value | [0]]" --output table
aws ec2 describe-security-groups --query "SecurityGroups[*].[GroupId, GroupName, VpcId, Description]" --output json
```

### #8 - Create interruption queue (optional)

> Skip this if you don't use spot instances or interruption handling. Recommended for production spot workloads.

Spot and scheduled-event handling requires an SQS queue named `${CLUSTER_NAME}`. Deploy the official CloudFormation template to create it:

```bash
curl -fsSL "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/website/content/en/preview/getting-started/getting-started-with-karpenter/cloudformation.yaml" > karpenter-cf.yaml

aws cloudformation deploy \
  --stack-name "Karpenter-${CLUSTER_NAME}" \
  --template-file karpenter-cf.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "ClusterName=${CLUSTER_NAME}"
```



### #9 - Render the Karpenter manifest

`helm template` against the OCI registry prints `Pulled:` / `Digest:` lines ahead of the YAML, which corrupts `karpenter.yaml` if left in - strip them before writing the file:

```bash
helm registry logout public.ecr.aws

helm template karpenter oci://public.ecr.aws/karpenter/karpenter \
  --version "${KARPENTER_VERSION}" \
  --namespace "${KARPENTER_NAMESPACE}" \
  --set "settings.clusterName=${CLUSTER_NAME}" \
  --set "settings.interruptionQueue=${CLUSTER_NAME}" \
  --set "serviceAccount.annotations.eks\.amazonaws\.com/role-arn=${KARPENTER_IAM_ROLE_ARN}" \
  --set controller.resources.requests.cpu=1 \
  --set controller.resources.requests.memory=1Gi \
  --set controller.resources.limits.cpu=1 \
  --set controller.resources.limits.memory=1Gi \
  | sed '1,2{/^\(Pulled:\|Digest:\)/d;}' > karpenter.yaml
```



If `kubectl apply -f karpenter.yaml` ever fails with a YAML parse error, open the file and check the first couple of lines for leftover `Pulled:`/`Digest:` text.

#### #9.1 - Pin Karpenter to an existing managed node group (optional)

Schedule the controller on your existing node group so it starts before Karpenter provisions any nodes.



```bash
aws eks list-nodegroups --cluster-name "${CLUSTER_NAME}" --region "${AWS_REGION}"
```

Edit `karpenter.yaml` and set `${NODEGROUP}` to a node group from the command above:

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: karpenter.sh/nodepool
          operator: DoesNotExist
        - key: eks.amazonaws.com/nodegroup
          operator: In
          values:
          - ${NODEGROUP}
  podAntiAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - topologyKey: "kubernetes.io/hostname"
```



### #10 - Deploy CRDs

```bash
kubectl create namespace "${KARPENTER_NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -f \
    "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/pkg/apis/crds/karpenter.sh_nodepools.yaml"
kubectl apply -f \
    "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/pkg/apis/crds/karpenter.k8s.aws_ec2nodeclasses.yaml"
kubectl apply -f \
    "https://raw.githubusercontent.com/aws/karpenter-provider-aws/v${KARPENTER_VERSION}/pkg/apis/crds/karpenter.sh_nodeclaims.yaml"
```



### #11 - Apply Karpenter

```bash
kubectl apply -f karpenter.yaml
```



### #12 - Create default NodePool

```bash
cat <<EOF | envsubst | kubectl apply -f -
apiVersion: karpenter.sh/v1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["spot"]
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["2"]
      nodeClassRef:
        group: karpenter.k8s.aws
        kind: EC2NodeClass
        name: default
      expireAfter: 720h
  limits:
    cpu: 1000
  disruption:
    consolidationPolicy: WhenEmptyOrUnderutilized
    consolidateAfter: 1m
---
apiVersion: karpenter.k8s.aws/v1
kind: EC2NodeClass
metadata:
  name: default
spec:
  role: "KarpenterNodeRole-${CLUSTER_NAME}"
  amiSelectorTerms:
    - alias: "al2023@${ALIAS_VERSION}"
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: "${CLUSTER_NAME}"
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: "${CLUSTER_NAME}"
EOF
```



### #13 - Verify (optional)

Confirm Karpenter is healthy and can provision nodes:

```bash
kubectl rollout status deployment/karpenter -n "${KARPENTER_NAMESPACE}"
kubectl get nodepools,ec2nodeclasses
```

Deploy a test workload to confirm node provisioning:

```bash
kubectl create deployment inflate --image=public.ecr.aws/eks-distro/kubernetes/pause:3.9
kubectl scale deployment inflate --replicas=3
kubectl get nodes -l karpenter.sh/nodepool
```

Clean up the test workload once you've confirmed nodes came up:

```bash
kubectl delete deployment inflate
```



## Troubleshooting

```bash
# Check controller pod status
kubectl get pods -n kube-system -l app.kubernetes.io/name=karpenter

# Read controller logs
kubectl logs -n kube-system -l app.kubernetes.io/name=karpenter -c controller --tail=100

# List Karpenter resources
kubectl get nodepools,ec2nodeclasses,nodeclaims

# Inspect NodePool configuration
kubectl describe nodepool default

# Inspect a failed NodeClaim (replace <name> with one from the previous command)
kubectl describe nodeclaim <name>

# Review recent scheduling events
kubectl get events -A --sort-by='.lastTimestamp' | grep -i karpenter

# Confirm subnet discovery tags
aws ec2 describe-subnets --filters "Name=tag:karpenter.sh/discovery,Values=${CLUSTER_NAME}" --query 'Subnets[*].SubnetId' --output table

# Confirm node role is authorized to join (access-entry clusters)
aws eks list-access-entries --cluster-name "${CLUSTER_NAME}"

# Fix Helm OCI authentication errors
helm registry logout public.ecr.aws

# Restart the controller after a config change
kubectl rollout restart deployment karpenter -n kube-system
```



## NodeClaim

```bash
kubectl get nodeclaim -w
kubectl delete nodeclaim default-nj5tj
```



## Update the Kubeconfig for Scaling

```bash
aws eks describe-nodegroup \
  --cluster-name lab-cluster \
  --nodegroup-name lab-nodes \
  --query 'nodegroup.scalingConfig'


aws eks update-nodegroup-config \
  --cluster-name lab-cluster \
  --nodegroup-name lab-nodes \
  --scaling-config minSize=2,maxSize=8,desiredSize=2
```



## VPC private endpoints

If the cluster's nodes run in private subnets with no NAT gateway, create interface endpoints for the services Karpenter and the nodes need:


| Service                          | Purpose                                     |
| -------------------------------- | ------------------------------------------- |
| `com.amazonaws.<region>.ec2`     | EC2 API calls (launch/terminate instances)  |
| `com.amazonaws.<region>.ecr.api` | Container image pulls (auth)                |
| `com.amazonaws.<region>.ecr.dkr` | Container image pulls (layers)              |
| `com.amazonaws.<region>.s3`      | Pulling container images (gateway endpoint) |
| `com.amazonaws.<region>.sts`     | IAM roles for service accounts              |
| `com.amazonaws.<region>.ssm`     | Resolving default AMIs                      |
| `com.amazonaws.<region>.sqs`     | Interruption handling (if enabled)          |
| `com.amazonaws.<region>.eks`     | Karpenter discovering the cluster endpoint  |


```bash
aws ec2 create-vpc-endpoint --vpc-id "${VPC_ID}" --service-name "${SERVICE_NAME}" \
  --vpc-endpoint-type Interface --subnet-ids ${SUBNET_IDS} --security-group-ids "${SECURITY_GROUP_ID}"
```


---

# eks-kubernetes-workloads-reference.md

---
title: "EKS Workloads Quick Reference"
description: "EKS Notes"
tags: 
    - eks
    
    - aws
---


# EKS Notes

| Resource              | Purpose                                            | Typical use                   |
| --------------------- | -------------------------------------------------- | ----------------------------- |
| **Deployment**        | Manages stateless Pods + ReplicaSets               | APIs, web apps                |
| **StatefulSet (STS)** | Manages stateful Pods with stable identity/storage | Databases, Kafka, etc.        |
| **DaemonSet (DS)**    | Runs a Pod on every/specific node                  | Log agents, monitoring agents |
| **Job**               | Runs a task to completion                          | Migration, batch processing   |
| **CronJob**           | Creates Jobs on a schedule                         | Backups, cleanup, reports     |
| **Probes**            | Determines application health                      | Restart/unready decisions     |
| **Requests/Limits**   | Controls resource scheduling/usage                 | CPU & memory management       |

### 1. Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: nginx:latest
          ports:
            - containerPort: 80
```

Deployment → ReplicaSet → Pods.

Use it when Pods are **interchangeable/stateless**.

---

### 2. StatefulSet

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mysql
spec:
  serviceName: mysql
  replicas: 2
  selector:
    matchLabels:
      app: mysql
  template:
    metadata:
      labels:
        app: mysql
    spec:
      containers:
        - name: mysql
          image: mysql:8
          env:
            - name: MYSQL_ROOT_PASSWORD
              value: password
```

Pods get stable identities:

```text
mysql-0
mysql-1
```

Unlike Deployment Pods:

```text
api-7d8f9c-x
api-7d8f9c-y
```

StatefulSet is useful when **identity, ordering, or persistent storage** matters.

For EKS, persistent workloads commonly use **EBS CSI** with PVCs.

---

### 3. DaemonSet

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-agent
spec:
  selector:
    matchLabels:
      app: log-agent
  template:
    metadata:
      labels:
        app: log-agent
    spec:
      containers:
        - name: agent
          image: fluent/fluent-bit:latest
```

If you have:

```text
Node 1
Node 2
Node 3
```

DaemonSet gives:

```text
Node 1 → log-agent
Node 2 → log-agent
Node 3 → log-agent
```

Classic EKS use cases:

* Fluent Bit
* Prometheus Node Exporter
* Security agents
* Monitoring agents

---

### 4. Job

A Job runs a workload **until successful completion**.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migration
          image: myapp:1.0
          command: ["python", "migrate.py"]
```

Flow:

```text
Job
 ↓
Pod
 ↓
Application completes
 ↓
Pod → Completed
 ↓
Job → Complete
```

Good for:

* DB migrations
* Data processing
* One-time initialization
* Batch workloads

---

### 5. CronJob

A CronJob creates Jobs according to a schedule.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: cleanup
              image: myapp:1.0
              command: ["python", "cleanup.py"]
```

```text
CronJob
   │
   ├── Job ── Pod ── Completed
   │
   ├── Job ── Pod ── Completed
   │
   └── Job ── Pod ── Completed
```

This runs every day at **02:00**.

---

# 6. Probes

Three important probes:

### Liveness

"Is the application alive?"

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

Failure → Kubernetes **restarts the container**.

---

### Readiness

"Can this Pod receive traffic?"

```yaml
readinessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```

Failure → Pod is removed from the Service's ready endpoints.

**Container does not necessarily restart.**

This is particularly important behind an **EKS ALB/Ingress**.

```text
ALB
 ↓
Service
 ↓
Ready Pods
```

If readiness fails:

```text
ALB
 ↓
Service
 ↓
❌ Pod not ready
```

---

### Startup

Useful for applications that take a long time to initialize.

```yaml
startupProbe:
  httpGet:
    path: /healthz
    port: 8080
  failureThreshold: 30
  periodSeconds: 10
```

Kubernetes waits for startup to succeed before enforcing liveness/readiness behavior.

---

# 7. Resource Requests & Limits

Example:

```yaml
resources:
  requests:
    cpu: "250m"
    memory: "256Mi"
  limits:
    cpu: "500m"
    memory: "512Mi"
```

### Request

Minimum resource requirement used by the **scheduler**.

```text
Pod requests:
CPU    = 250m
Memory = 256Mi
```

Scheduler looks for a node with sufficient allocatable resources.

### Limit

Maximum resource the container can consume.

```text
CPU    ≤ 500m
Memory ≤ 512Mi
```

Important distinction:

```text
requests → scheduling
limits   → runtime constraint
```

For memory, exceeding the limit can result in **OOMKilled**.

For CPU, throttling can occur.

---

## Recommended EKS Pod baseline

For a typical API:

```yaml
containers:
  - name: api
    image: my-api:1.0

    resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"

    startupProbe:
      httpGet:
        path: /healthz
        port: 8080
      failureThreshold: 30
      periodSeconds: 10

    readinessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 5

    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      periodSeconds: 10
```

### The mental model to remember

```text
                    Kubernetes Workloads
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     Deployment       StatefulSet       DaemonSet
     Stateless        Stateful           Per-node
          │                │                │
          └────────────────┴────────────────┘
                           │
                    Batch Workloads
                           │
                    ┌──────┴──────┐
                    │             │
                   Job         CronJob
                one-time       scheduled
```

And **every production Pod should make you think about three things**:

```text
                Pod
                 │
       ┌─────────┼─────────┐
       │         │         │
    Probes    Requests   Limits
       │         │         │
    Health    Scheduling  Runtime
```

For EKS specifically, I would learn these next in this order: **Deployment → Service → Ingress/ALB → StatefulSet/PVC/EBS CSI → DaemonSet → Job/CronJob → Probes → Requests/Limits → HPA → Cluster Autoscaler/Karpenter**.

---

# eks-kubernetes-yaml-examples.md

---
title: "EKS Kubernetes Resource YAML Examples"
description: Minimal YAML samples for common Kubernetes resources on EKS.
tags:
  - eks
  - kubernetes
  - deployment
  - pod
  - service
  - configmap
  - secret
  - serviceaccount
  - ebs
  - efs
  - s3
  - secrets-manager
  - parameter-store
  - ssm
  - hpa
  - vpa
  - autoscaling
---

# Kubernetes on EKS - Core Resource Examples

Minimal YAML samples for common Kubernetes resources on EKS. All examples use namespace `my-app`.

## Apply all

```bash
kubectl create namespace my-app
kubectl apply -f .
```

---

## ServiceAccount

Identity for pods. Used with IRSA or EKS Pod Identity for AWS API access.

```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app-sa
  namespace: my-app
```

---

## ConfigMap

Non-sensitive configuration. Mounted as a file or injected as environment variables.

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-app-config
  namespace: my-app
data:
  APP_ENV: production
  LOG_LEVEL: info
  config.ini: |
    [app]
    port = 8080
    [aws]
    region = us-east-1
```

---

## Secret

Sensitive values - base64-encoded in `data`, or plain text in `stringData` (encoded automatically).

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secret
  namespace: my-app
type: Opaque
stringData:
  DB_USER: admin
  DB_PASSWORD: changeme
```

---

## Pod

A single pod. Prefer a **Deployment** for production - it manages replicas and rollouts.

```yaml
# pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app-pod
  namespace: my-app
  labels:
    app: my-app
spec:
  serviceAccountName: my-app-sa
  containers:
    - name: my-app
      image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
      ports:
        - containerPort: 8080
      env:
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: my-app-config
              key: APP_ENV
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: my-app-secret
              key: DB_PASSWORD
      volumeMounts:
        - name: config-volume
          mountPath: /app/config.ini
          subPath: config.ini
          readOnly: true
  volumes:
    - name: config-volume
      configMap:
        name: my-app-config
```

---

## Deployment

Manages replica pods with rolling updates. Typical way to run apps on EKS.

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          ports:
            - containerPort: 8080
          env:
            - name: APP_ENV
              valueFrom:
                configMapKeyRef:
                  name: my-app-config
                  key: APP_ENV
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: my-app-secret
                  key: DB_PASSWORD
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          volumeMounts:
            - name: config-volume
              mountPath: /app/config.ini
              subPath: config.ini
              readOnly: true
      volumes:
        - name: config-volume
          configMap:
            name: my-app-config
```

---

## Deployment - EBS, EFS, S3, and Secrets Manager

Each example mounts a different storage backend or secret source. Requires the corresponding CSI driver or add-on on the cluster.

| Mount | Driver / add-on | Access mode |
|---|---|---|
| EBS | `aws-ebs-csi-driver` | ReadWriteOnce (single pod) |
| EFS | `aws-efs-csi-driver` | ReadWriteMany (shared across pods) |
| S3 | `aws-mountpoint-s3-csi-driver` | ReadWriteMany (object storage) |
| Secrets Manager | ASCP CSI + `usePodIdentity: "true"` | Files under `/mnt/secrets-store` |
| Parameter Store | ASCP CSI + `usePodIdentity: "true"` | Files under `/mnt/secrets-store` |

### EBS (block storage)

Requires a `gp3` StorageClass - see [Prometheus with EBS CSI Driver](prometheus-ebs-csi-driver.md).

```yaml
# pvc-ebs.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-ebs
  namespace: my-app
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: gp3
  resources:
    requests:
      storage: 10Gi
```

```yaml
# deployment-ebs.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-ebs
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app-ebs
  template:
    metadata:
      labels:
        app: my-app-ebs
    spec:
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: data
              mountPath: /data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: my-app-ebs
```

### EFS (shared file storage)

Create an EFS file system first, then install the [EFS CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html).

```yaml
# storageclass-efs.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: fs-<efs-id>
  directoryPerms: "700"
```

```yaml
# pvc-efs.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-efs
  namespace: my-app
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
```

```yaml
# deployment-efs.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-efs
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app-efs
  template:
    metadata:
      labels:
        app: my-app-efs
    spec:
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: shared-data
              mountPath: /shared
      volumes:
        - name: shared-data
          persistentVolumeClaim:
            claimName: my-app-efs
```

### S3 (object storage)

Uses the [Mountpoint for Amazon S3 CSI driver](https://docs.aws.amazon.com/eks/latest/userguide/s3-csi.html). Mounts a bucket as a filesystem path (read-heavy workloads).

```yaml
# pv-s3.yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: s3-pv
spec:
  capacity:
    storage: 1200Gi   # required but not enforced for S3
  accessModes:
    - ReadWriteMany
  mountOptions:
    - region <region>
  csi:
    driver: s3.csi.aws.com
    volumeHandle: <bucket-name>
    volumeAttributes:
      bucketName: <bucket-name>
```

```yaml
# pvc-s3.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-s3
  namespace: my-app
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: ""
  resources:
    requests:
      storage: 1200Gi
  volumeName: s3-pv
```

```yaml
# deployment-s3.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-s3
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app-s3
  template:
    metadata:
      labels:
        app: my-app-s3
    spec:
      serviceAccountName: my-app-sa   # needs s3:GetObject on the bucket
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: s3-data
              mountPath: /assets
              readOnly: true
      volumes:
        - name: s3-data
          persistentVolumeClaim:
            claimName: my-app-s3
```

### Secrets Manager (ASCP + Pod Identity)

Uses the [AWS Secrets and Configuration Provider (ASCP)](https://docs.aws.amazon.com/systems-manager/latest/userguide/ascp-pod-identity-integration.html) CSI driver. Secrets mount as files under `/mnt/secrets-store`.

**Prerequisites:**

- `eks-pod-identity-agent` add-on
- [Secrets Store CSI Driver](https://secrets-store-csi-driver.sigs.k8s.io/) installed with sync enabled: `--set syncSecret.enabled=true`
- [AWS provider](https://github.com/aws/secrets-store-csi-driver-provider-aws) installed
- Pod Identity association on `my-app-sa` with `secretsmanager:GetSecretValue` - see [CodeCommit to ArgoCD](codecommit-eks-argocd.md#4-app-iam--secrets-manager)

RDS secrets in Secrets Manager are JSON (`username`, `password`, etc.). Use `jmesPath` to extract keys - `secretObjects.data.objectName` must reference the **objectAlias**, not the secret name.

```yaml
# secretproviderclass.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-secrets
  namespace: my-app
spec:
  provider: aws
  parameters:
    usePodIdentity: "true"          # required for Pod Identity; omit or "false" for IRSA
    objects: |
      - objectName: "<rds-secret-name>"
        objectType: "secretsmanager"
        jmesPath:
          - path: "username"
            objectAlias: "db-username"
          - path: "password"
            objectAlias: "db-password"
  secretObjects:                    # optional - sync to a K8s Secret (needs syncSecret.enabled=true)
    - secretName: my-app-db-secret
      type: Opaque
      data:
        - objectName: db-username   # objectAlias from jmesPath, not the secret name
          key: username
        - objectName: db-password
          key: password
```

```yaml
# deployment-secrets-manager.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-sm
  namespace: my-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app-sm
  template:
    metadata:
      labels:
        app: my-app-sm
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: secrets-store-inline
              mountPath: /mnt/secrets-store
              readOnly: true
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: my-app-db-secret
                  key: password
      volumes:
        - name: secrets-store-inline
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: aws-secrets
```

Verify the mount:

```bash
kubectl exec -it deploy/my-app-sm -n my-app -- cat /mnt/secrets-store/db-password
```

**Alternative - SDK in application code:** skip the CSI driver and call `secretsmanager:GetSecretValue` from the app using Pod Identity on `my-app-sa`.

### Parameter Store (ASCP + Pod Identity)

Same [ASCP CSI driver](https://docs.aws.amazon.com/systems-manager/latest/userguide/ascp-pod-identity-integration.html) as Secrets Manager - set `objectType: "ssmparameter"` instead. Pod Identity association on `my-app-sa` needs `ssm:GetParameter` and `ssm:GetParameters` on the parameter ARN.

```bash
cat <<EOF > my-app-ssm-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:DescribeParameters"
      ],
      "Resource": "arn:aws:ssm:<region>:<account-id>:parameter/myapp/*"
    }
  ]
}
EOF
```

**String parameter** - value mounts as a file. Use `objectAlias` for a clean filename (slashes in parameter paths are not valid filenames).

```yaml
# secretproviderclass-ssm.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-ssm-params
  namespace: my-app
spec:
  provider: aws
  parameters:
    usePodIdentity: "true"
    objects: |
      - objectName: "/myapp/config/api-key"
        objectType: "ssmparameter"
        objectAlias: "api-key"
      - objectName: "/myapp/config/log-level"
        objectType: "ssmparameter"
        objectAlias: "log-level"
  secretObjects:
    - secretName: my-app-ssm-secret
      type: Opaque
      data:
        - objectName: api-key        # objectAlias
          key: API_KEY
        - objectName: log-level
          key: LOG_LEVEL
```

**JSON parameter** - use `jmesPath` to extract individual keys (same pattern as Secrets Manager):

```yaml
# secretproviderclass-ssm-json.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: aws-ssm-json
  namespace: my-app
spec:
  provider: aws
  parameters:
    usePodIdentity: "true"
    objects: |
      - objectName: "/myapp/database/config"
        objectType: "ssmparameter"
        jmesPath:
          - path: "host"
            objectAlias: "db-host"
          - path: "port"
            objectAlias: "db-port"
  secretObjects:
    - secretName: my-app-db-config
      type: Opaque
      data:
        - objectName: db-host
          key: host
        - objectName: db-port
          key: port
```

Mount in a Deployment (same volume pattern as Secrets Manager):

```yaml
# deployment-ssm.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app-ssm
  namespace: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app-ssm
  template:
    metadata:
      labels:
        app: my-app-ssm
    spec:
      serviceAccountName: my-app-sa
      containers:
        - name: my-app
          image: <account-id>.dkr.ecr.<region>.amazonaws.com/my-app:v1
          volumeMounts:
            - name: secrets-store-inline
              mountPath: /mnt/secrets-store
              readOnly: true
          env:
            - name: API_KEY
              valueFrom:
                secretKeyRef:
                  name: my-app-ssm-secret
                  key: API_KEY
      volumes:
        - name: secrets-store-inline
          csi:
            driver: secrets-store.csi.k8s.io
            readOnly: true
            volumeAttributes:
              secretProviderClass: aws-ssm-params
```

Verify:

```bash
kubectl exec -it deploy/my-app-ssm -n my-app -- cat /mnt/secrets-store/api-key
```

---

## Service

Exposes pods inside the cluster (ClusterIP) or externally (LoadBalancer on EKS).

```yaml
# service.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: my-app
spec:
  type: ClusterIP
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
```

**LoadBalancer** (creates an AWS ELB):

```yaml
# service-lb.yaml
apiVersion: v1
kind: Service
metadata:
  name: my-app-lb
  namespace: my-app
spec:
  type: LoadBalancer
  selector:
    app: my-app
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
```

---

## HPA (Horizontal Pod Autoscaler)

Scales pod **replica count** based on CPU, memory, or custom metrics. Requires [metrics-server](https://docs.aws.amazon.com/eks/latest/userguide/metrics-server.html) on the cluster.

```yaml
# hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app
  namespace: my-app
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

The target Deployment must define `resources.requests` - HPA compares usage against requests.

Verify:

```bash
kubectl get hpa -n my-app
kubectl describe hpa my-app -n my-app
```

---

## VPA (Vertical Pod Autoscaler)

Adjusts pod **CPU/memory requests and limits** based on historical usage. Not included in EKS by default - install the [VPA add-on](https://github.com/kubernetes/autoscaler/tree/master/vertical-pod-autoscaler) first:

```bash
kubectl apply -f https://github.com/kubernetes/autoscaler/releases/latest/download/vertical-pod-autoscaler.yaml
```

Do not use VPA and HPA on the same Deployment for CPU - they conflict. Use HPA for replica scaling, or VPA for right-sizing resources.

```yaml
# vpa.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: my-app
  namespace: my-app
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  updatePolicy:
    updateMode: Auto        # Off | Initial | Recreate | Auto
  resourcePolicy:
    containerPolicies:
      - containerName: my-app
        minAllowed:
          cpu: 100m
          memory: 128Mi
        maxAllowed:
          cpu: "1"
          memory: 1Gi
```

| `updateMode` | Behavior |
|---|---|
| `Off` | Recommendations only (no changes applied) |
| `Initial` | Apply on pod creation |
| `Recreate` | Evict and recreate pods with new resources |
| `Auto` | Recreate pods when resources need updating |

Verify:

```bash
kubectl get vpa -n my-app
kubectl describe vpa my-app -n my-app
```

---

## Verify

```bash
kubectl get sa,configmap,secret,pvc,pv,deployment,svc,hpa,vpa -n my-app
kubectl describe deployment my-app -n my-app
kubectl get secretproviderclass -n my-app
```

---

# eks-kyverno-install.md

---
title: "Install Kyverno on Amazon EKS"
description: Install and configure Kyverno policy engine on Amazon EKS.
tags:
  - eks
  - kyverno
  - policy
  - helm
  - admission-controller
---
# Kyverno Setup on EKS

## 1. Confirm cluster context

```bash
kubectl config current-context
kubectl get nodes
```

## 2. Add the Kyverno Helm repo

```bash
helm repo add kyverno https://kyverno.github.io/kyverno/
helm repo update
```

## 3. Install Kyverno

```bash
kubectl create namespace kyverno

helm install kyverno kyverno/kyverno \
  -n kyverno \
  --set replicaCount=3 \
  --wait
```

## 4. Verify

```bash
kubectl get pods -n kyverno
kubectl get deploy -n kyverno
```

## 5. Policy examples

Each example is a standalone `ClusterPolicy`. Replace `my-app-namespace` with the target namespace. Policies can be combined into one file by merging rules under a single `spec.rules` list.

### Allowed registries

Only allow images from the account ECR or `public.ecr.aws`.

`allowed-registries.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: allowed-registries
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: allowed-registries
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Images must come from an approved registry (ECR account or public.ecr.aws)."
        pattern:
          spec:
            containers:
              - image: "<YOUR_ACCOUNT_ID>.dkr.ecr.*.amazonaws.com/* | public.ecr.aws/*"
```

### Disallow `:latest` tag

Block implicit or explicit `:latest` image tags.

`disallow-latest-tag.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  background: true
  rules:
    - name: disallow-latest-tag
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Images must not use the ':latest' tag or omit a tag."
        pattern:
          spec:
            containers:
              - image: "!*:latest"
                =(imagePullPolicy): "!Always"
```

### Require resource limits

Require CPU and memory limits on all containers.

`require-resource-limits.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-limits
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "CPU and memory limits are required."
        pattern:
          spec:
            containers:
              - resources:
                  limits:
                    memory: "?*"
                    cpu: "?*"
```

### Disallow privileged containers

Prevent pods from running privileged containers.

`disallow-privileged.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
  rules:
    - name: disallow-privileged
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Privileged containers are not allowed."
        pattern:
          spec:
            containers:
              - securityContext:
                  privileged: false
```

### Require labels

Require standard labels on every pod.

`require-labels.yaml`:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  validationFailureAction: Enforce
  rules:
    - name: require-labels
      match:
        any:
          - resources:
              kinds:
                - Pod
              namespaces:
                - my-app-namespace
      validate:
        message: "Labels 'app' and 'env' are required."
        pattern:
          metadata:
            labels:
              app: "?*"
              env: "?*"
```

Apply one or more policies:

```bash
kubectl apply -f allowed-registries.yaml
kubectl apply -f disallow-latest-tag.yaml
kubectl apply -f require-resource-limits.yaml
kubectl apply -f disallow-privileged.yaml
kubectl apply -f require-labels.yaml
```

## 6. Remove a ClusterPolicy

```bash
# List what's currently applied
kubectl get clusterpolicy

# Delete a specific ClusterPolicy
kubectl delete clusterpolicy allowed-registries
kubectl delete clusterpolicy disallow-latest-tag

# Delete all ClusterPolicies (removes every policy cluster-wide)
kubectl delete clusterpolicy --all
```

## 7. Debug

```bash
kubectl logs -n kyverno \
  -l app.kubernetes.io/component=admission-controller \
  --tail=50

kubectl get pods -n kyverno
kubectl get pods -n kyverno -o wide

kubectl logs -n kyverno -l app.kubernetes.io/component=admission-controller -f --tail=20
```


---

# eks-orderflow-cli-snippets.md

---
title: "OrderFlow: CLI and Operations Snippets"
description: "Copy-paste EKS, IRSA, RDS, SQS, ingress, and add-on commands for the OrderFlow migration project."
tags:
  - orderflow
  - eks
  - irsa
  - rds
  - sqs
  - cli
  - snippets
  - aws
---
Copy-paste commands for [OrderFlow on AWS](/eks-orderflow-migration-guide). The guide covers architecture and decisions; this page holds operational snippets.

## EKS cluster and nodes

```bash
aws eks describe-cluster --name orderflow-cluster \
  --query 'cluster.{Status:status,Version:version,Endpoint:endpoint,OIDC:identity.oidc.issuer}'

aws eks update-kubeconfig --name orderflow-cluster --region us-east-1
kubectl get nodes -o wide
kubectl get pods -A
```

## OIDC and IRSA

```bash
aws iam list-open-id-connect-providers

## API - Secrets Manager + RDS access
eksctl create iamserviceaccount \
  --cluster orderflow-cluster \
  --namespace orderflow \
  --name orderflow-api \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowApiPolicy \
  --approve

## Worker - SQS, SNS, DynamoDB
eksctl create iamserviceaccount \
  --cluster orderflow-cluster \
  --namespace orderflow \
  --name orderflow-worker \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowWorkerPolicy \
  --approve

kubectl describe pod -n orderflow -l app=orderflow-api | grep -E 'AWS_ROLE_ARN|AWS_WEB_IDENTITY'
```

## Add-ons and ingress

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
kubectl get pods -n kube-system -l app=ebs-csi-controller
kubectl get storageclass gp3

kubectl create namespace orderflow --dry-run=client -o yaml | kubectl apply -f -
kubectl get ingress -n orderflow
kubectl describe ingress orderflow-ingress -n orderflow
```

## ECR login and push

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=us-east-1

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

## Repositories: orderflow/api, orderflow/frontend, orderflow/worker
docker tag orderflow-api:v1 $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/orderflow/api:v1
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/orderflow/api:v1
```

## RDS connectivity

```bash
kubectl run postgres-client -n orderflow --image=postgres:17 --restart=Never -- sleep infinity
kubectl exec -it postgres-client -n orderflow -- pg_isready -h <rds-endpoint> -p 5432
kubectl exec -it postgres-client -n orderflow -- \
  psql -h <rds-endpoint> -U orderflow -d orderflowdb -c "SELECT count(*) FROM orders;"
kubectl delete pod postgres-client -n orderflow
```

## API smoke test

```bash
ALB=$(kubectl get ingress orderflow-ingress -n orderflow -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -s "http://${ALB}/health"
curl -s -X POST "http://${ALB}/orders" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ord-001","status":"CREATED"}'
```

## SQS, SNS, DynamoDB

```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/orderflow-orders \
  --attribute-names ApproximateNumberOfMessages,ApproximateNumberOfMessagesNotVisible

aws sns list-subscriptions-by-topic \
  --topic-arn arn:aws:sns:us-east-1:ACCOUNT_ID:orderflow-notifications

aws dynamodb describe-table --table-name orderflow-events \
  --query 'Table.{Name:TableName,Status:TableStatus,ItemCount:ItemCount}'
```

## Worker rollout and logs

```bash
kubectl apply -f k8s/worker-deployment.yaml
kubectl rollout status deployment/orderflow-worker -n orderflow
kubectl logs -f deployment/orderflow-worker -n orderflow
```

## CloudWatch agents

```bash
kubectl get pods -n amazon-cloudwatch
```
---

# eks-orderflow-migration-guide.md

---
title: "OrderFlow: Migrate Workloads to Amazon EKS"
description: "Phase-by-phase migration from in-cluster PostgreSQL to RDS, Secrets Manager, SQS, SNS, and DynamoDB on Amazon EKS."
tags:
  - orderflow
  - eks
  - rds
  - sqs
  - sns
  - dynamodb
  - migration
  - aws
---
> Migrate ShopSphere from in-cluster PostgreSQL to managed RDS, Secrets Manager, and an event-driven pipeline with SQS, SNS, and DynamoDB on EKS.



## Migration at a glance

| ShopSphere (K8s-native) | OrderFlow (AWS-managed) |
|---------------------------|-------------------------|
| PostgreSQL StatefulSet + EBS | RDS PostgreSQL (`orderflow-db`) |
| Kubernetes Secrets in Git | Secrets Manager + IRSA |
| Synchronous API only | API → RDS + SQS → worker → SNS/DynamoDB |

## Final architecture

```mermaid
flowchart TB
    User[User] --> ALB[ALB via Ingress]
    ALB --> API[orderflow-api]
    API --> RDS[(RDS PostgreSQL)]
    API --> SQS[SQS orderflow-orders]
    SQS --> Worker[orderflow-worker]
    Worker --> SNS[SNS orderflow-notifications]
    Worker --> DDB[(DynamoDB orderflow-events)]
    API -.-> SM[Secrets Manager]
    SM -.-> RDS
    subgraph EKS[orderflow-cluster]
        API
        Worker
    end
```

## Phase 01: 01-infrastructure-setup

## Objective

Create **OrderFlowVpc** with public and private subnets, an Internet Gateway, a NAT Gateway, and route tables that support EKS nodes in private subnets and internet-facing ALBs in public subnets.

## Architecture

```
VPC: 16.0.0.0/16 (OrderFlowVpc)
├── PublicSubnet1, PublicSubnet2
│   ├── Internet Gateway
│   ├── NAT Gateway
│   └── ALB (created later by ingress controller)
│
├── PrivateSubnet1, PrivateSubnet2
│   ├── EKS worker nodes
│   ├── Application pods
│   └── RDS (private subnets only)
│
└── Route tables
    ├── Public: 0.0.0.0/0 → IGW
    └── Private: 0.0.0.0/0 → NAT Gateway
```

## Commands

### Option A: eksctl (recommended)

```bash
eksctl create cluster \
  --name orderflow-cluster \
  --region us-east-1 \
  --version 1.35 \
  --without-nodegroup \
  --vpc-cidr 16.0.0.0/16 \
  --vpc-public-subnets 16.0.0.0/20,16.0.16.0/20 \
  --vpc-private-subnets 16.0.32.0/20,16.0.48.0/20
```

### Option B: tag existing subnets for ALB discovery

```bash
## Public subnets - internet-facing ALBs
aws ec2 create-tags \
  --resources subnet-PUBLIC1 subnet-PUBLIC2 \
  --tags \
    Key=kubernetes.io/cluster/orderflow-cluster,Value=shared \
    Key=kubernetes.io/role/elb,Value=1

## Private subnets - internal load balancers
aws ec2 create-tags \
  --resources subnet-PRIVATE1 subnet-PRIVATE2 \
  --tags \
    Key=kubernetes.io/cluster/orderflow-cluster,Value=shared \
    Key=kubernetes.io/role/internal-elb,Value=1
```

## Manifests

Subnet tags are not Kubernetes manifests but are required before Phase 05:

| Subnet type | Tag | Value |
|-------------|-----|-------|
| Public | `kubernetes.io/role/elb` | `1` |
| Private | `kubernetes.io/role/internal-elb` | `1` |
| Both | `kubernetes.io/cluster/orderflow-cluster` | `shared` |

## Verification

```bash
aws ec2 describe-vpcs \
  --filters "Name=tag:Name,Values=OrderFlowVpc" \
  --query 'Vpcs[*].{Id:VpcId,Cidr:CidrBlock}'

aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].{Id:SubnetId,Az:AvailabilityZone,Tags:Tags}'

aws ec2 describe-nat-gateways \
  --filter "Name=vpc-id,Values=$VPC_ID" \
  --query 'NatGateways[*].State'
```

**Expected:** one VPC `16.0.0.0/16`, two public and two private subnets, NAT Gateway `available`, public route to IGW, private route to NAT.

## Troubleshooting

### Private nodes cannot pull images

**Symptoms:** `ErrImagePull` / `ImagePullBackOff` on pods in private subnets.

**Fix:** Confirm NAT Gateway is in a **public** subnet and the private route table has `0.0.0.0/0 → nat-xxx`.

```bash
aws ec2 describe-route-tables \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'RouteTables[*].Routes'
```

---

## Phase 02: 02-eks-cluster

## Objective

Create **orderflow-cluster** (Kubernetes 1.35) with a managed node group in private subnets, control-plane logging enabled, and an OIDC provider for IRSA.

## Architecture

```
orderflow-cluster (EKS 1.35)
├── Control plane (public + private endpoint)
├── Managed node group: primary-ng
│   ├── Instance type: t3.small
│   ├── Scaling: min 2, desired 2, max 4
│   └── Subnets: private only
└── OIDC provider → IRSA (Phases 05, 09, 13)
```

## Commands

### Create node group (if cluster created with --without-nodegroup)

```bash
eksctl create nodegroup \
  --cluster orderflow-cluster \
  --region us-east-1 \
  --name primary-ng \
  --node-type t3.small \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 4 \
  --node-private-networking
```

### Enable control-plane logging

```bash
aws eks update-cluster-config \
  --name orderflow-cluster \
  --logging '{"clusterLogging":[{"types":["api","audit","authenticator","controllerManager","scheduler"],"enabled":true}]}'
```

### Associate OIDC provider

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster orderflow-cluster \
  --region us-east-1 \
  --approve
```

### Configure kubectl

```bash
aws eks update-kubeconfig --name orderflow-cluster --region us-east-1
kubectl get nodes -o wide
```

## Manifests

No application manifests in this phase. Cluster logging and endpoint access are AWS API settings.

## Verification

```bash
aws eks describe-cluster --name orderflow-cluster \
  --query 'cluster.{Status:status,Version:version,OIDC:identity.oidc.issuer,Logging:logging.clusterLogging}'

aws iam list-open-id-connect-providers | grep orderflow-cluster

kubectl get nodes
## Expected: 2 nodes, STATUS Ready, internal IPs in private CIDR
```

## Troubleshooting

### Nodes NotReady

```bash
kubectl describe node <node-name>
aws ec2 describe-instances --filters "Name=tag:eks:nodegroup-name,Values=primary-ng"
```

Common causes: insufficient subnet IP space, missing NAT (Phase 01), or security group blocking node communication.

### OIDC provider missing

IRSA and the ALB controller fail without OIDC. Re-run `eksctl utils associate-iam-oidc-provider` and verify the issuer URL matches the cluster describe output.

## Phase 03: 03-ebs-csi-storage

## Objective

Install the **EBS CSI Driver** as an EKS managed add-on (EKS Pod Identity) and define a **gp3** StorageClass for any pod-local volumes the API or worker need.

## Architecture

```
EKS Pod Identity
  → EBS CSI controller (kube-system)
  → gp3 StorageClass
  → PVC → EBS volume (when workloads request storage)
```

OrderFlow persists orders in **RDS**, not cluster volumes - but gp3 remains useful for temp/cache volumes and mirrors ShopSphere storage patterns.

## Commands

### Install EBS CSI add-on

```bash
aws eks create-addon \
  --cluster-name orderflow-cluster \
  --addon-name aws-ebs-csi-driver \
  --resolve-conflicts OVERWRITE

kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
```

## Manifests

### gp3 StorageClass

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  encrypted: "true"
```

```bash
kubectl apply -f storageclass-gp3.yaml
```

## Verification

```bash
kubectl get storageclass gp3
kubectl get pods -n kube-system | grep ebs-csi
## Expected: ebs-csi-controller and ebs-csi-node pods Running
```

## Troubleshooting

### PVC stays Pending

**Cause:** `WaitForFirstConsumer` delays binding until a pod is scheduled. Ensure a pod references the PVC and runs in a node AZ with available capacity.

### CSI pods CrashLoopBackOff

Verify the add-on version matches the cluster Kubernetes version and that Pod Identity / IAM permissions for the CSI service account are attached.

## Phase 04: 04-ecr-repositories

## Objective

Create ECR repositories for **orderflow/api**, **orderflow/frontend**, and **orderflow/worker** with image scanning on push and an immutable tagging strategy.

## Architecture

```
Developer workstation
  → docker build
  → ECR (scan on push)
  → EKS pulls via node IAM / private NAT
  → Deployments reference immutable tags (v1, git SHA)
```

## Commands

### Create repositories

```bash
for REPO in orderflow/api orderflow/frontend orderflow/worker; do
  aws ecr create-repository \
    --repository-name "$REPO" \
    --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256
done
```

### Login and push API image

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export REGION=us-east-1

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin \
  $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

docker build -t orderflow-api:v1 ./api
docker tag orderflow-api:v1 \
  $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/orderflow/api:v1
docker push $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/orderflow/api:v1
```

Repeat for `orderflow/frontend` and `orderflow/worker` when those Dockerfiles are ready.

## Manifests

Deployment image references (used in Phases 06 and 13):

```yaml
image: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/orderflow/api:v1
imagePullPolicy: IfNotPresent
```

## Verification

```bash
aws ecr describe-repositories \
  --query 'repositories[?starts_with(repositoryName, `orderflow/`)].repositoryName'

aws ecr describe-image-scan-findings \
  --repository-name orderflow/api \
  --image-id imageTag=v1 \
  --query 'imageScanFindings.findingSeverityCounts'
```

## Troubleshooting

### ImagePullBackOff after push

- Confirm tag in Deployment matches the pushed tag exactly (`v1`, not `latest`).
- Verify NAT connectivity from private nodes (Phase 01).
- Check ECR repository policy allows the node/instance role to pull.

## Phase 05: 05-aws-load-balancer-controller

## Objective

Install the **AWS Load Balancer Controller** on **orderflow-cluster** using IRSA so Ingress resources provision Application Load Balancers automatically.

## Architecture

```
Ingress (orderflow namespace)
  → AWS Load Balancer Controller (kube-system, IRSA)
  → AWS ELB APIs
  → Internet-facing ALB → Target Group (pod IPs)
```

## Commands

### Download and create IAM policy

```bash
curl -fsSL -o iam_policy.json \
  https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.0/docs/install/iam_policy.json

aws iam create-policy \
  --policy-name AWSLoadBalancerControllerOrderFlowPolicy \
  --policy-document file://iam_policy.json

export POLICY_ARN=$(aws iam list-policies \
  --query "Policies[?PolicyName=='AWSLoadBalancerControllerOrderFlowPolicy'].Arn" \
  --output text)
```

### Create IRSA service account

```bash
eksctl create iamserviceaccount \
  --cluster=orderflow-cluster \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=$POLICY_ARN \
  --override-existing-serviceaccounts \
  --approve
```

### Install via Helm

```bash
helm repo add eks https://aws.github.io/eks-charts
helm repo update

export VPC_ID=$(aws eks describe-cluster --name orderflow-cluster \
  --query "cluster.resourcesVpcConfig.vpcId" --output text)

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=orderflow-cluster \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=us-east-1 \
  --set vpcId=$VPC_ID \
  --set replicaCount=2
```

## Manifests

No Ingress yet - that is Phase 07. Confirm the controller Deployment references the IRSA service account.

## Verification

```bash
kubectl get deployment -n kube-system aws-load-balancer-controller
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=30
## Expected: manager started, no AccessDenied on ec2:DescribeSubnets
```

## Troubleshooting

### No subnets found

Subnet tags from Phase 01 are missing. Re-apply `kubernetes.io/role/elb=1` on public subnets.

### AccessDenied in controller logs

Re-create the IRSA service account and confirm trust policy `sub` matches `system:serviceaccount:kube-system:aws-load-balancer-controller`.

## Phase 06: 06-api-deployment

## Objective

Deploy the **orderflow-api** Flask/Gunicorn application into the **orderflow** namespace with a **ClusterIP** Service. Database and secrets wiring come in Phases 09–10.

## Architecture

```
orderflow namespace
├── Deployment: orderflow-api (replicas: 2)
├── Service: orderflow-api-service (ClusterIP :5000)
└── ConfigMap: orderflow-api-config (non-secret env, Phase 10)
```

## Commands

```bash
kubectl create namespace orderflow

kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/api-service.yaml

kubectl rollout status deployment/orderflow-api -n orderflow
kubectl get pods,svc -n orderflow
```

## Manifests

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderflow-api
  namespace: orderflow
  labels:
    app: orderflow-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: orderflow-api
  template:
    metadata:
      labels:
        app: orderflow-api
    spec:
      serviceAccountName: orderflow-api
      containers:
        - name: api
          image: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/orderflow/api:v1
          ports:
            - containerPort: 5000
          envFrom:
            - configMapRef:
                name: orderflow-api-config
          readinessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 5000
            initialDelaySeconds: 30
            periodSeconds: 20
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
```

### Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: orderflow-api-service
  namespace: orderflow
spec:
  type: ClusterIP
  selector:
    app: orderflow-api
  ports:
    - port: 80
      targetPort: 5000
      protocol: TCP
```

> **Note:** `serviceAccountName: orderflow-api` requires the IRSA service account from Phase 09. For initial image-only testing, use `default` temporarily, then switch after IRSA is created.

## Verification

```bash
kubectl port-forward svc/orderflow-api-service 8080:80 -n orderflow
curl -s http://localhost:8080/health
## Expected: {"status":"ok"} or HTTP 200
```

## Troubleshooting

### CrashLoopBackOff before RDS is configured

Expected until Phases 08–10 complete. Check logs:

```bash
kubectl logs deployment/orderflow-api -n orderflow --tail=50
```

If the app requires `DB_HOST` at startup, add placeholder ConfigMap values or defer readiness until RDS is reachable.

## Phase 07: 07-ingress-configuration

## Objective

Expose the API through **orderflow-ingress**, letting the AWS Load Balancer Controller provision an internet-facing ALB with health checks on `/health`.

## Architecture

```
Internet
  → ALB (internet-facing)
  → Target group (pod IPs, HTTP :5000)
  → orderflow-api-service
  → orderflow-api pods
```

## Commands

```bash
kubectl apply -f k8s/ingress.yaml

kubectl get ingress -n orderflow -w
## Wait until ADDRESS column shows ALB hostname

export ALB=$(kubectl get ingress orderflow-ingress -n orderflow \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
curl -s "http://${ALB}/health"
```

## Manifests

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orderflow-ingress
  namespace: orderflow
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/healthcheck-path: /health
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
spec:
  ingressClassName: alb
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: orderflow-api-service
                port:
                  number: 80
```

When the frontend is deployed, add a second path rule for `/` static content and `/api/*` to the API - mirror [ShopSphere ingress](/eks-shopsphere-walkthrough/#phase-09-09-ingress-configuration).

## Verification

```bash
kubectl describe ingress orderflow-ingress -n orderflow
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?contains(LoadBalancerName, `k8s-orderflow`)].{Name:LoadBalancerName,DNS:DNSName,State:State.Code}'

curl -s -o /dev/null -w "%{http_code}" "http://${ALB}/health"
## Expected: 200
```

## Troubleshooting

### Ingress has no ADDRESS

1. Controller pods running? (Phase 05)
2. Subnet tags correct? (Phase 01)
3. Check events: `kubectl describe ingress orderflow-ingress -n orderflow`

### ALB targets unhealthy

Verify readiness probe on `/health` and security groups allow node → pod traffic on port 5000.

## Phase 08: 08-rds-postgresql

## Objective

Provision **orderflow-db** (PostgreSQL) in private subnets with **no public access**, secured so only EKS nodes can reach port **5432**.

## Architecture

```
orderflow-api pods (private subnets)
  → RDS security group (5432 from node SG)
  → orderflow-db (PostgreSQL, Multi-AZ optional)
  → AWS-managed master secret in Secrets Manager
```

## Commands

### Create DB subnet group and instance

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name orderflow-db-subnets \
  --db-subnet-group-description "OrderFlow private subnets" \
  --subnet-ids subnet-PRIVATE1 subnet-PRIVATE2

aws rds create-db-instance \
  --db-instance-identifier orderflow-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username orderflow \
  --manage-master-user-password \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-RDS \
  --db-subnet-group-name orderflow-db-subnets \
  --no-publicly-accessible \
  --backup-retention-period 7
```

### Allow nodes to reach RDS

```bash
## Get EKS node security group
NODE_SG=$(aws eks describe-cluster --name orderflow-cluster \
  --query 'cluster.resourcesVpcConfig.clusterSecurityGroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id sg-RDS \
  --protocol tcp \
  --port 5432 \
  --source-group $NODE_SG
```

### Connectivity test from cluster

```bash
kubectl run postgres-client -n orderflow --image=postgres:17 --restart=Never -- sleep infinity

kubectl exec -it postgres-client -n orderflow -- \
  pg_isready -h orderflow-db.xxxx.us-east-1.rds.amazonaws.com -p 5432

kubectl delete pod postgres-client -n orderflow
```

## Manifests

RDS is provisioned via AWS API/Console - no Kubernetes manifests. Record endpoint and port for the ConfigMap in Phase 10:

```
DB_HOST=orderflow-db.xxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=orderflowdb
```

## Verification

```bash
aws rds describe-db-instances --db-instance-identifier orderflow-db \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address,Public:PubliclyAccessible}'

## Expected: available, PubliclyAccessible=false
```

## Troubleshooting

### Connection timeout from pods

- RDS SG must allow **node security group**, not `0.0.0.0/0`.
- Confirm RDS subnets are the same VPC as the cluster.
- Verify route tables allow node → RDS within VPC (local routes).

### pg_isready fails

Check NACLs and that the client pod runs in the **orderflow** namespace with network policies allowing egress to RDS.

## Phase 09: 09-secrets-manager-irsa

## Objective

Grant the API pods permission to read the **RDS master secret** from Secrets Manager using **IRSA** - no long-lived AWS keys or Kubernetes secret objects in Git.

## Architecture

```
orderflow-api pod
  → service account orderflow-api (IRSA)
  → OrderFlowApiRole
  → secretsmanager:GetSecretValue (RDS secret only)
  → psycopg2/SQLAlchemy connection to RDS
```

## Commands

### Create least-privilege policy

```bash
export SECRET_ARN=$(aws rds describe-db-instances \
  --db-instance-identifier orderflow-db \
  --query 'DBInstances[0].MasterUserSecret.SecretArn' --output text)

cat > orderflow-api-secrets-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
    "Resource": "$SECRET_ARN"
  }]
}
EOF

aws iam create-policy \
  --policy-name OrderFlowApiSecretsPolicy \
  --policy-document file://orderflow-api-secrets-policy.json
```

### Create IRSA service account

```bash
eksctl create iamserviceaccount \
  --cluster orderflow-cluster \
  --namespace orderflow \
  --name orderflow-api \
  --role-name OrderFlowApiRole \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowApiSecretsPolicy \
  --approve
```

### Roll API to pick up service account

```bash
kubectl rollout restart deployment/orderflow-api -n orderflow
kubectl describe pod -n orderflow -l app=orderflow-api | grep -E 'AWS_ROLE_ARN|AWS_WEB_IDENTITY'
```

## Manifests

### API secret-fetch pattern (application code)

```python
import boto3
import json
import os

def get_db_credentials():
    client = boto3.client("secretsmanager", region_name=os.environ["AWS_REGION"])
    resp = client.get_secret_value(SecretId=os.environ["DB_SECRET_ARN"])
    secret = json.loads(resp["SecretString"])
    return secret["username"], secret["password"]
```

### ConfigMap (non-secret only)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orderflow-api-config
  namespace: orderflow
data:
  DB_HOST: "orderflow-db.xxxx.us-east-1.rds.amazonaws.com"
  DB_PORT: "5432"
  DB_NAME: "orderflowdb"
  DB_SECRET_ARN: "arn:aws:secretsmanager:us-east-1:ACCOUNT:secret:rds!..."
  AWS_REGION: "us-east-1"
```

## Verification

```bash
kubectl exec -it deployment/orderflow-api -n orderflow -- env | grep AWS_
## Expected: AWS_ROLE_ARN, AWS_WEB_IDENTITY_TOKEN_FILE

kubectl exec -it deployment/orderflow-api -n orderflow -- \
  python -c "import boto3; print(boto3.client('sts').get_caller-identity())"
## Expected: Arn contains OrderFlowApiRole
```

## Troubleshooting

### AccessDenied on GetSecretValue

- Policy `Resource` must match the exact secret ARN.
- Pod must use `serviceAccountName: orderflow-api`, not `default`.
- Confirm OIDC provider exists (Phase 02).

### No AWS_ROLE_ARN on pod

Deployment spec missing `serviceAccountName` or service account created in wrong namespace.

## Phase 10: 10-api-database-integration

## Objective

Wire the Flask API to RDS: create the **orders** table, expose **GET/POST /orders**, and confirm end-to-end persistence through the ALB.

## Architecture

```
POST /orders
  → validate payload
  → INSERT into orders (RDS)
  → return 201 + order_id
  (SQS enqueue added in Phase 11)
```

## Commands

### Apply ConfigMap and restart API

```bash
kubectl apply -f k8s/api-configmap.yaml
kubectl rollout restart deployment/orderflow-api -n orderflow
```

### Smoke test via ALB

```bash
export ALB=$(kubectl get ingress orderflow-ingress -n orderflow \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

curl -s "http://${ALB}/health"
curl -s "http://${ALB}/orders"
curl -s -X POST "http://${ALB}/orders" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ord-001","status":"CREATED"}'
curl -s "http://${ALB}/orders"
```

### Verify row in RDS

```bash
kubectl run postgres-client -n orderflow --image=postgres:17 --restart=Never -- sleep infinity
kubectl exec -it postgres-client -n orderflow -- \
  psql -h $DB_HOST -U orderflow -d orderflowdb -c "SELECT * FROM orders;"
kubectl delete pod postgres-client -n orderflow
```

## Manifests

### Schema (run once at app startup or migration job)

```sql
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Flask route sketch

```python
@app.route("/orders", methods=["GET"])
def list_orders():
    rows = db.session.execute(text("SELECT order_id, status, created_at FROM orders ORDER BY id DESC LIMIT 50"))
    return jsonify([dict(r._mapping) for r in rows])

@app.route("/orders", methods=["POST"])
def create_order():
    data = request.get_json(force=True)
    db.session.execute(
        text("INSERT INTO orders (order_id, status) VALUES (:oid, :st)"),
        {"oid": data["order_id"], "st": data.get("status", "CREATED")},
    )
    db.session.commit()
    return jsonify(data), 201
```

## Verification

| Check | Expected |
|-------|----------|
| `GET /health` | HTTP 200 |
| `GET /orders` | `[]` or list of orders |
| `POST /orders` | HTTP 201, row in RDS |
| API logs | No `password authentication failed` |

```bash
kubectl logs deployment/orderflow-api -n orderflow --tail=30
```

## Troubleshooting

### SSL required by RDS

Add `?sslmode=require` to the SQLAlchemy URL or set `sslmode` in the Postgres driver options.

### Unique violation on order_id

Expected if re-posting the same `order_id` - return HTTP 409 in production.

## Phase 11: 11-sqs-integration

## Objective

Create **orderflow-orders** (SQS) and extend the API so every successful `POST /orders` enqueues a message for asynchronous processing.

## Architecture

```
POST /orders
  → INSERT orders (RDS) - synchronous
  → SendMessage (SQS orderflow-orders) - synchronous
  → HTTP 201 to client
  → Worker consumes later (Phase 13)
```

## Commands

### Create queue

```bash
aws sqs create-queue \
  --queue-name orderflow-orders \
  --attributes '{
    "VisibilityTimeout": "60",
    "MessageRetentionPeriod": "345600",
    "ReceiveMessageWaitTimeSeconds": "20"
  }'

export QUEUE_URL=$(aws sqs get-queue-url \
  --queue-name orderflow-orders --query QueueUrl --output text)
```

### Grant API permission to send messages

Add to **OrderFlowApiSecretsPolicy** or a separate **OrderFlowApiSqsPolicy**:

```json
{
  "Effect": "Allow",
  "Action": ["sqs:SendMessage", "sqs:GetQueueUrl"],
  "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:orderflow-orders"
}
```

```bash
aws iam attach-role-policy \
  --role-name OrderFlowApiRole \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowApiSqsPolicy
```

### Test enqueue

```bash
curl -s -X POST "http://${ALB}/orders" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ord-002","status":"CREATED"}'

aws sqs get-queue-attributes \
  --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages
```

## Manifests

### ConfigMap addition

```yaml
data:
  SQS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/orderflow-orders"
```

### API enqueue snippet

```python
import boto3, json, os

sqs = boto3.client("sqs", region_name=os.environ["AWS_REGION"])

def enqueue_order(order_id: str, status: str):
    sqs.send_message(
        QueueUrl=os.environ["SQS_QUEUE_URL"],
        MessageBody=json.dumps({"order_id": order_id, "status": status}),
    )
```

Call `enqueue_order()` after successful DB commit in `create_order()`.

## Verification

```bash
aws sqs receive-message --queue-url $QUEUE_URL --max-number-of-messages 1
## Expected: body contains order_id from POST /orders
```

## Troubleshooting

### Message not appearing after POST

- API role missing `sqs:SendMessage`.
- Wrong `SQS_QUEUE_URL` in ConfigMap (region/account mismatch).
- API returns 201 but enqueue runs after failed commit - check transaction order in code.

### Duplicate messages on client retry

Use a deduplication id or idempotency key on `order_id` if clients may retry POST.

## Phase 12: 12-sns-dynamodb

## Objective

Create **orderflow-notifications** (SNS) and **orderflow-events** (DynamoDB) - the worker publishes notifications and stores processed events (Phase 13).

## Architecture

```
Worker (Phase 13)
  → sns:Publish → orderflow-notifications
  → dynamodb:PutItem → orderflow-events (PK: eventId)
```

## Commands

### SNS topic

```bash
aws sns create-topic --name orderflow-notifications

export TOPIC_ARN=$(aws sns list-topics \
  --query "Topics[?contains(TopicArn, 'orderflow-notifications')].TopicArn" \
  --output text)

## Optional: email subscription for lab alerts
aws sns subscribe \
  --topic-arn $TOPIC_ARN \
  --protocol email \
  --notification-endpoint you@example.com
```

### DynamoDB table

```bash
aws dynamodb create-table \
  --table-name orderflow-events \
  --attribute-definitions AttributeName=eventId,AttributeType=S \
  --key-schema AttributeName=eventId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

aws dynamodb wait table-exists --table-name orderflow-events
```

### Worker IAM policy (preview - applied in Phase 13)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:us-east-1:ACCOUNT_ID:orderflow-orders"
    },
    {
      "Effect": "Allow",
      "Action": "sns:Publish",
      "Resource": "TOPIC_ARN"
    },
    {
      "Effect": "Allow",
      "Action": "dynamodb:PutItem",
      "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT_ID:table/orderflow-events"
    }
  ]
}
```

## Manifests

### Example DynamoDB item shape

```json
{
  "eventId": "evt-ord-002-20260609",
  "orderId": "ord-002",
  "status": "PROCESSED",
  "processedAt": "2026-06-09T12:00:00Z"
}
```

### Example SNS message

```json
{
  "order_id": "ord-002",
  "status": "PROCESSED",
  "message": "Order fulfillment complete"
}
```

## Verification

```bash
aws dynamodb describe-table --table-name orderflow-events \
  --query 'Table.{Name:TableName,Status:TableStatus,Billing:BillingModeSummary.BillingMode}'

aws sns get-topic-attributes --topic-arn $TOPIC_ARN
```

After Phase 13 worker runs, confirm items appear:

```bash
aws dynamodb scan --table-name orderflow-events --max-items 5
```

## Troubleshooting

### PutItem AccessDenied

Worker role missing `dynamodb:PutItem` on the table ARN (not `*`).

### SNS publish succeeds but no email

Confirm subscription status is **Confirmed** in the SNS console.

## Phase 13: 13-worker-deployment

## Objective

Deploy **orderflow-worker** with **OrderFlowWorkerRole** (IRSA) to poll SQS, publish SNS notifications, write DynamoDB events, and delete messages on success.

## Architecture

```
orderflow-orders (SQS)
  → orderflow-worker Deployment
      1. ReceiveMessage (long poll)
      2. Publish → orderflow-notifications
      3. PutItem → orderflow-events
      4. DeleteMessage
```

## Commands

### Create worker IAM policy and IRSA

```bash
aws iam create-policy \
  --policy-name OrderFlowWorkerPolicy \
  --policy-document file://orderflow-worker-policy.json

eksctl create iamserviceaccount \
  --cluster orderflow-cluster \
  --namespace orderflow \
  --name orderflow-worker \
  --role-name OrderFlowWorkerRole \
  --attach-policy-arn arn:aws:iam::ACCOUNT_ID:policy/OrderFlowWorkerPolicy \
  --approve
```

### Deploy worker

```bash
kubectl apply -f k8s/worker-deployment.yaml
kubectl rollout status deployment/orderflow-worker -n orderflow
kubectl logs -f deployment/orderflow-worker -n orderflow
```

### End-to-end test

```bash
curl -s -X POST "http://${ALB}/orders" \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ord-e2e-001","status":"CREATED"}'

aws sqs get-queue-attributes --queue-url $QUEUE_URL \
  --attribute-names ApproximateNumberOfMessages

aws dynamodb scan --table-name orderflow-events \
  --filter-expression "orderId = :oid" \
  --expression-attribute-values '{":oid":{"S":"ord-e2e-001"}}'
```

## Manifests

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orderflow-worker
  namespace: orderflow
spec:
  replicas: 1
  selector:
    matchLabels:
      app: orderflow-worker
  template:
    metadata:
      labels:
        app: orderflow-worker
    spec:
      serviceAccountName: orderflow-worker
      containers:
        - name: worker
          image: ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/orderflow/worker:v1
          env:
            - name: SQS_QUEUE_URL
              value: "https://sqs.us-east-1.amazonaws.com/ACCOUNT_ID/orderflow-orders"
            - name: SNS_TOPIC_ARN
              value: "arn:aws:sns:us-east-1:ACCOUNT_ID:orderflow-notifications"
            - name: DYNAMODB_TABLE
              value: "orderflow-events"
            - name: AWS_REGION
              value: "us-east-1"
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
```

### Worker loop (Python sketch)

```python
import boto3, json, uuid, os, time

sqs = boto3.client("sqs")
sns = boto3.client("sns")
ddb = boto3.client("dynamodb")

while True:
    resp = sqs.receive_message(
        QueueUrl=os.environ["SQS_QUEUE_URL"],
        MaxNumberOfMessages=1,
        WaitTimeSeconds=20,
    )
    for msg in resp.get("Messages", []):
        body = json.loads(msg["Body"])
        order_id = body["order_id"]
        event_id = f"evt-{order_id}-{uuid.uuid4().hex[:8]}"

        sns.publish(
            TopicArn=os.environ["SNS_TOPIC_ARN"],
            Message=json.dumps({"order_id": order_id, "status": "PROCESSED"}),
        )
        ddb.put_item(
            TableName=os.environ["DYNAMODB_TABLE"],
            Item={
                "eventId": {"S": event_id},
                "orderId": {"S": order_id},
                "status": {"S": "PROCESSED"},
            },
        )
        sqs.delete_message(
            QueueUrl=os.environ["SQS_QUEUE_URL"],
            ReceiptHandle=msg["ReceiptHandle"],
        )
```

## Verification

| Step | Expected |
|------|----------|
| POST /orders | HTTP 201 |
| SQS depth | Returns to 0 after worker processes |
| DynamoDB | Item with matching `orderId` |
| Worker logs | `Processed ord-e2e-001` or equivalent |

## Troubleshooting

### Messages reappear after processing

DeleteMessage failing - check `sqs:DeleteMessage` on the queue ARN. Visibility timeout may be too short if processing exceeds 60s.

### Worker idle, queue depth grows

- Wrong queue URL in Deployment env.
- IRSA role not attached to `orderflow-worker` service account.
- Worker image crash - `kubectl logs` for stack traces.

## Phase 14: 14-cloudwatch-observability

## Objective

Install the **Amazon CloudWatch Observability** EKS add-on for container logs, Container Insights metrics, and a baseline for debugging API and worker issues.

## Architecture

```
orderflow-api / orderflow-worker pods
  → CloudWatch agent (DaemonSet)
  → Log groups /metrics in CloudWatch
  → Container Insights dashboards
```

## Commands

### Install add-on

```bash
aws eks create-addon \
  --cluster-name orderflow-cluster \
  --addon-name amazon-cloudwatch-observability \
  --resolve-conflicts OVERWRITE

kubectl get pods -n amazon-cloudwatch
```

### Tail API logs

```bash
aws logs tail /aws/containerinsights/orderflow-cluster/application \
  --follow --filter-pattern "orderflow-api"
```

### Useful kubectl checks

```bash
kubectl top pods -n orderflow
kubectl logs deployment/orderflow-api -n orderflow --since=1h
kubectl logs deployment/orderflow-worker -n orderflow --since=1h
```

## Manifests

No custom manifests required for the managed add-on. Optional: structured JSON logging in the app for easier CloudWatch Logs Insights queries:

```python
import json, logging
logging.basicConfig(format="%(message)s", level=logging.INFO)
logger = logging.getLogger("orderflow")
logger.info(json.dumps({"event": "order_created", "order_id": order_id}))
```

## Verification

```bash
kubectl get pods -n amazon-cloudwatch
## Expected: fluent-bit / cloudwatch-agent pods Running on each node

aws logs describe-log-groups \
  --log-group-name-prefix /aws/containerinsights/orderflow-cluster
```

## Troubleshooting

### No logs in CloudWatch

- Add-on pods not Running on all nodes.
- IAM permissions for the add-on service account missing (check EKS add-on status).
- Wrong log group region - match cluster Region.

### High log volume cost

Set retention on log groups and filter noisy health-check lines at the app or collector level.

## Phase 15: 15-roadmap

## Objective

Document the next production hardening steps not completed in the core 14 phases: edge delivery, WAF, automated deploys, and domain events via EventBridge.

## Architecture (target state)

```
User
  → CloudFront
  → WAF
  → Frontend ALB
  → orderflow-frontend

API ALB → orderflow-api (existing)

Worker → EventBridge (planned)
  → Rules → Lambda / SNS / audit targets
```

## CloudFront and WAF

| Component | Attachment | Purpose |
|-----------|------------|---------|
| CloudFront | Origin: frontend ALB | HTTPS, edge caching, global latency |
| WAF Web ACL | CloudFront distribution | OWASP managed rules, IP reputation |

**Managed rule groups to enable:**

- `AWSManagedRulesCommonRuleSet`
- `AWSManagedRulesKnownBadInputsRuleSet`
- `AWSManagedRulesAmazonIpReputationList`

## CI/CD pipeline

Target flow:

```
GitHub push
  → GitHub Actions (build + test)
  → docker push → ECR (tag = git SHA)
  → kubectl set image / ArgoCD sync
  → EKS rollout (orderflow-api, orderflow-worker)
```

**Tag strategy:** immutable git SHA tags - never promote `latest` to production.

Reference: [AWS Lambda CI/CD](/aws-lambda-codepipeline-codedeploy) for CodeDeploy patterns; adapt to EKS rollouts with `kubectl rollout status`.

## EventBridge integration

Extend the worker to emit domain events after DynamoDB write:

```json
{
  "Source": "orderflow.worker",
  "DetailType": "OrderProcessed",
  "Detail": "{\"orderId\":\"ord-123\",\"status\":\"PROCESSED\",\"eventId\":\"evt-...\"}"
}
```

```python
events.put_events(
    Entries=[{
        "Source": "orderflow.worker",
        "DetailType": "OrderProcessed",
        "Detail": json.dumps({"orderId": order_id, "status": "PROCESSED"}),
        "EventBusName": "default",
    }]
)
```

Downstream rules can fan out to audit Lambdas, analytics, or cross-account buses - see [Lambda event pipeline](/aws-lambda-event-pipeline).

## Verification checklist (full stack)

- [ ] CloudFront serves frontend with valid ACM certificate
- [ ] WAF blocks common attack probes in count mode, then block mode
- [ ] CI pipeline deploys on merge to `main` with SHA-tagged images
- [ ] EventBridge rule fires on `OrderProcessed` test event
---

# eks-prometheus-ebs-storage.md

---
title: "Prometheus on EKS with EBS CSI Storage"
description: Run Prometheus on EKS with persistent volumes via the AWS EBS CSI driver.
tags:
  - eks
  - prometheus
  - ebs
  - ebs-csi-driver
  - kubernetes
  - storageclass
  - pvc
  - gp3
---

# Prometheus with EBS CSI Driver

EKS clusters often ship with a legacy `gp2` StorageClass using the in-tree `kubernetes.io/aws-ebs` provisioner. On newer Kubernetes versions, volume provisioning is migrated to `ebs.csi.aws.com` - so PVCs stay `Pending` until the AWS EBS CSI driver is installed.

```text
kubectl get storageclass

NAME   PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
gp2    kubernetes.io/aws-ebs   Delete          WaitForFirstConsumer   false                  10h
```

This guide installs the EBS CSI driver, creates a `gp3` StorageClass, and points Prometheus at it.

## 1. Check current StorageClasses

```bash
kubectl get storageclass
```

Legacy `gp2` uses `kubernetes.io/aws-ebs`. The target is a CSI-based `gp3` class using `ebs.csi.aws.com`.

## 2. Install the AWS EBS CSI driver

Set cluster variables:

```bash
export CLUSTER_NAME=<your-cluster-name>
export AWS_REGION=$(aws configure get region)
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
```

Check if the add-on is already installed:

```bash
aws eks describe-addon \
  --cluster-name "$CLUSTER_NAME" \
  --addon-name aws-ebs-csi-driver \
  --region "$AWS_REGION"
```

Create the IAM role for the CSI controller:

```bash
eksctl utils associate-iam-oidc-provider --cluster "$CLUSTER_NAME" --approve

eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster "$CLUSTER_NAME" \
  --role-name AmazonEKS_EBS_CSI_DriverRole \
  --role-only \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve
```

Install the add-on:

```bash
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster "$CLUSTER_NAME" \
  --service-account-role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_EBS_CSI_DriverRole" \
  --force
```

Verify the driver is running:

```bash
kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
```

## 3. Create a gp3 StorageClass

Do not delete the existing `gp2` StorageClass - existing PVCs may still depend on it.

Unset `gp2` as the default (if it is):

```bash
kubectl patch storageclass gp2 \
  -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"false"}}}'
```

Create `gp3-storageclass.yaml`:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
  encrypted: "true"
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
reclaimPolicy: Delete
```

Apply:

```bash
kubectl apply -f gp3-storageclass.yaml
kubectl get storageclass
```

Expected output includes:

```text
gp3    ebs.csi.aws.com   Delete   WaitForFirstConsumer   true
```

## 4. Configure Prometheus storage

Add to `values.yaml`:

```yaml
prometheus:
  prometheusSpec:
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi
```

Apply:

```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  -f values.yaml
```

If Prometheus was previously installed with a pending PVC on `gp2`, delete the stuck PVC before upgrading so it can be recreated on `gp3`:

```bash
kubectl get pvc -n prometheus
kubectl delete pvc -n prometheus <stuck-pvc-name>
```

## 5. Verify

```bash
kubectl get pvc -n prometheus
kubectl get pods -n prometheus
```

PVCs should be `Bound` and Prometheus pods `Running`.

## Alternative: disable persistence

For dev or temporary setups, skip EBS entirely and use ephemeral storage:

```bash
helm upgrade prometheus prometheus-community/kube-prometheus-stack \
  -n prometheus \
  --set prometheus.prometheusSpec.storageSpec=null
```

Metrics are lost when the pod is rescheduled.

---

# eks-sealed-secret.md

---
title: "Sealed Secret on Amazon EKS"
description: Use Sealed Secret on Amazon EKS.
tags:
  - eks
  - kubernetes
  - storageclass
  - secret
  - sealed secret
  - sealed
---

# 1. Install kubeseal (CLI) if you don't have it - matches your cluster's controller version
# 2. Install the sealed-secrets controller in-cluster (once):
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system

# 3. Create the plain secret LOCALLY only (never apply or commit this file):

## metadata
##   name: frontend-secret
##   namespace: claude
   
kubectl create secret generic frontend-secret \
  --namespace claude \
  --from-literal=db-password='REAL_PASSWORD_HERE' \
  --dry-run=client -o yaml > frontend-secret.yaml

# 4. Seal it using the controller's public cert:
kubeseal --format yaml \
  --controller-name sealed-secrets \
  --controller-namespace kube-system \
  < frontend-secret.yaml > frontend-sealedsecret.yaml

# 5. Delete the plaintext file, commit only the sealed one:
rm frontend-secret.yaml
git add frontend-sealedsecret.yaml   # goes in your CodeCommit manifests repo

# 6. ArgoCD (or kubectl apply) deploys frontend-sealedsecret.yaml -> controller
#    decrypts it in-cluster -> produces the real "frontend-secret" K8s Secret
#    that your Deployment's DB_PASSWORD env var already references.

---

# eks-shopsphere-walkthrough.md

---
title: "ShopSphere on Amazon EKS (End-to-End Walkthrough)"
description: "Complete microservices lab on EKS-VPC, Flask backend, ALB ingress patterns, autoscaling, Prometheus, Grafana, GitOps, and secrets."
tags:
  - shopsphere
  - eks
  - kubernetes
  - microservices
  - alb
  - ingress
  - flask
  - gitops
  - aws
---

> End-to-end guide: build and operate a production-style microservices app on Amazon EKS - VPC, persistence, backend API, ingress, autoscaling, observability, GitOps, and secrets.

## Final architecture

```mermaid
graph TD
    Internet[Internet] --> ALB[Application Load Balancer]
    ALB -->|"/"| Frontend[Frontend Nginx]
    ALB -->|"/api/*"| Backend[Flask Backend]
    ALB -->|"/grafana"| Grafana[Grafana]
    Backend --> DB[PostgreSQL]
    DB --> EBS[(EBS Volume)]
    Grafana --> Prometheus[Prometheus]
    Prometheus --> Metrics[Cluster Metrics]
```

<!-- ## Table of contents

| Phase | Topic |
| --- | --- |
| 01 | [Infrastructure setup](#phase-01-01-infrastructure-setup) |
| 02 | [EKS cluster](#phase-02-02-eks-cluster) |
| 03 | [EBS CSI driver](#phase-03-03-ebs-csi-driver) |
| 04 | [PostgreSQL persistence](#phase-04-04-postgresql-persistence) |
| 05 | [Application deployment](#phase-05-05-application-deployment) |
| 06 | [ConfigMaps and Secrets](#phase-06-06-configmaps-secrets) |
| 07 | [Backend and database integration](#phase-07-07-backend-database-integration) |
| 08 | [AWS Load Balancer Controller](#phase-08-08-aws-load-balancer-controller) |
| 09 | [Ingress configuration](#phase-09-09-ingress-configuration) |
| 10 | [Frontend application](#phase-10-10-frontend-application) |
| 11 | [Metrics Server](#phase-11-11-metrics-server) |
| 12 | [Horizontal Pod Autoscaler](#phase-12-12-horizontal-pod-autoscaler) |
| 13 | [Prometheus and Grafana](#phase-13-13-prometheus-grafana) |
| 14 | [Grafana access and dashboards](#phase-14-14-grafana-access-dashboards) |
| 15 | [Application metrics](#phase-15-15-application-metrics) |
| 16 | [Advanced autoscaling with Karpenter](#phase-16-16-advanced-autoscaling-karpenter) |
| 17 | [GitOps with Argo CD](#phase-17-17-gitops-argocd) |
| 18 | [DNS and TLS automation](#phase-18-18-dns-tls-automation) |
| 19 | [Security and secrets](#phase-19-19-security-secrets) | -->

Each phase follows the same layout: **Objective** → **Architecture** → **Commands** → **Manifests** → **Verification** → **Troubleshooting** (where applicable).

---

## Phase 01: 01-infrastructure-setup

## Objective

Create a production-ready VPC with public and private subnets, internet gateway, NAT gateway, and proper routing for EKS workloads.

## Architecture

```
VPC: 10.0.0.0/16
├── Public Subnets (us-east-1a, 1b)
│   ├── Internet Gateway
│   └── ALBs
│
├── Private Subnets (us-east-1a, 1b)
│   ├── NAT Gateway
│   └── EKS Worker Nodes
│
└── Route Tables
    ├── Public: 0.0.0.0/0 → IGW
    └── Private: 0.0.0.0/0 → NAT
```

## Commands

### Create VPC using eksctl (Recommended)

```bash
## Create VPC with eksctl
eksctl create cluster \
  --name shopsphere \
  --region us-east-1 \
  --version 1.27 \
  --without-nodegroup \
  --vpc-private-subnets=10.0.0.0/19,10.0.32.0/19 \
  --vpc-public-subnets=10.0.64.0/19,10.0.96.0/19 \
  --vpc-cidr=10.0.0.0/16
```

### Or using AWS CLI

```bash
## Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications \
  'ResourceType=vpc,Tags=[{Key=Name,Value=shopsphere-vpc}]'

## Create Internet Gateway
aws ec2 create-internet-gateway --tag-specifications \
  'ResourceType=internet-gateway,Tags=[{Key=Name,Value=shopsphere-igw}]'

## Attach IGW to VPC
aws ec2 attach-internet-gateway --internet-gateway-id igw-xxx --vpc-id vpc-xxx

## Create NAT Gateway in public subnet
aws ec2 allocate-address --domain vpc
aws ec2 create-nat-gateway --subnet-id subnet-xxx --allocation-id eipalloc-xxx
```

## Manifests

### VPC Tags for Kubernetes

```yaml
## Required tags for ALB controller
kubernetes.io/cluster/shopsphere: shared
kubernetes.io/role/elb: "1"  # Public subnets
kubernetes.io/role/internal-elb: "1"  # Private subnets
```

## Verification

```bash
## Verify VPC setup
aws ec2 describe-vpcs --filters "Name=tag:Name,Values=shopsphere-vpc"

## Verify subnets
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxx"

## Verify route tables
aws ec2 describe-route-tables --filters "Name=vpc-id,Values=vpc-xxx"
```

**Expected Output:**

```
VPC: 10.0.0.0/16
Public Subnets: 2
Private Subnets: 2
Internet Gateway: Attached
NAT Gateway: 1 (in public subnet)
```

## Troubleshooting

### Issue: Private nodes cannot pull images

**Symptoms:**

```bash
kubectl describe pod <pod-name>
## Events:
## Failed to pull image: request canceled while waiting for connection
## ErrImagePull / ImagePullBackOff
```

**Root Cause:**

```
❌ Missing NAT Gateway
❌ Private route table not pointing to NAT
```

**Fix:**

```bash
## Verify NAT Gateway exists
aws ec2 describe-nat-gateways --filter "Name=vpc-id,Values=vpc-xxx"

## Update private route table
aws ec2 create-route \
  --route-table-id rtb-private-xxx \
  --destination-cidr-block 0.0.0.0/0 \
  --nat-gateway-id nat-xxx
```



```bash
## Test internet connectivity from private subnet
aws ec2 run-instances \
  --image-id ami-0c55b159cbfafe1f0 \
  --instance-type t2.micro \
  --subnet-id subnet-private-xxx \
  --security-group-ids sg-xxx \
  --query 'Instances[0].InstanceId'

## Connect and test
aws ec2 describe-instance-status --instance-ids i-xxx
```

---


---

## Phase 02: 02-eks-cluster

## Objective

Create an Amazon EKS cluster with managed node groups and verify node connectivity.

## Architecture

```
EKS Control Plane (AWS Managed)
├── API Server
├── etcd
└── Controllers

Managed Node Group
├── m5.large (2 vCPU, 8 GiB)
├── Auto-scaling: 2-4 nodes
└── Private subnets only
```

## Commands

### Create EKS Cluster

```bash
## Using eksctl (Recommended)
eksctl create cluster \
  --name shopsphere \
  --region us-east-1 \
  --version 1.27 \
  --nodegroup-name standard-workers \
  --node-type m5.large \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 4 \
  --node-volume-size 20 \
  --ssh-access \
  --ssh-public-key my-key-pair \
  --managed \
  --with-oidc \
  --full-ecr-access \
  --appmesh-access \
  --alb-ingress-access
```

### Alternative: Terraform

```hcl
## main.tf
module "eks" {
  source          = "terraform-aws-modules/eks/aws"
  version         = "~> 19.0"

  cluster_name    = "shopsphere"
  cluster_version = "1.27"

  vpc_id          = aws_vpc.main.id
  subnet_ids      = aws_subnet.private[*].id

  eks_managed_node_groups = {
    standard = {
      min_size     = 2
      max_size     = 4
      desired_size = 2

      instance_types = ["m5.large"]
      capacity_type  = "ON_DEMAND"
    }
  }
}
```

## Manifests

### Node Group Configuration

```yaml
## nodegroup.yaml
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: shopsphere
  region: us-east-1
  version: "1.27"

managedNodeGroups:
  - name: standard-workers
    instanceType: m5.large
    desiredCapacity: 2
    minSize: 2
    maxSize: 4
    volumeSize: 20
    privateNetworking: true
    labels:
      role: workers
    tags:
      environment: production
```

## Verification

```bash
## Update kubeconfig
aws eks update-kubeconfig --name shopsphere --region us-east-1

## Verify nodes
kubectl get nodes -o wide

## Verify system pods
kubectl get pods -n kube-system

## Check cluster info
kubectl cluster-info
```

**Expected Output:**

```bash
NAME                         STATUS   ROLES    AGE   VERSION
ip-10-0-128-1.ec2.internal   Ready    <none>   5m    v1.27.3-eks
ip-10-0-160-1.ec2.internal   Ready    <none>   5m    v1.27.3-eks
```

## Screenshots

**EKS Cluster Dashboard:**

```
🔗 Console Path: EKS → Clusters → shopsphere
✅ Status: ACTIVE
✅ Kubernetes version: 1.27
✅ Platform version: eks.5
```

**Node Group View:**

```
🔗 Console Path: EKS → Clusters → shopsphere → Configuration → Compute
✅ Desired: 2
✅ Current: 2
✅ Status: ACTIVE
```

## Troubleshooting

### Issue: Nodes never join cluster

**Symptoms:**

```bash
kubectl get nodes
## No resources found
## OR
kubectl get nodes
NAME     STATUS     ROLES    AGE   VERSION
node-1   NotReady   <none>   10m   v1.27.3
```

**Root Causes:**

```
❌ Wrong subnet selection (public instead of private)
❌ Missing IAM permissions for node role
❌ Security group blocking node-to-control-plane traffic
❌ CNI plugin not installed
```

**Fix:**

```bash
## Check node group status
aws eks describe-nodegroup \
  --cluster-name shopsphere \
  --nodegroup-name standard-workers

## Check events
kubectl get events --sort-by='.lastTimestamp'

## Verify security groups
aws ec2 describe-security-groups \
  --filters "Name=tag:aws:eks:cluster-name,Values=shopsphere"
```



```bash
## Describe nodes for detailed info
kubectl describe node <node-name>

## Check kubelet logs on node
aws ssm start-session --target <instance-id>
sudo journalctl -u kubelet -f

## Verify IAM role
aws iam get-role --role-name eksctl-shopsphere-nodegroup-NodeInstanceRole
```

---

## Phase 03: 03-ebs-csi-driver

## Objective

Install the Amazon EBS CSI driver to enable dynamic provisioning of persistent volumes for stateful workloads like databases.

## Architecture

```
Kubernetes Cluster
├── EBS CSI Controller (Deployment)
│   ├── csi-provisioner
│   ├── csi-attacher
│   └── ebs-plugin
│
└── EBS CSI Node (DaemonSet)
    ├── node-driver-registrar
    └── ebs-plugin

StorageClass (gp3)
    ↓
PVC Request
    ↓
EBS Volume (gp3, 10Gi)
    ↓
Pod Mount
```

## Commands

### Install EBS CSI Driver

```bash
## Method 1: Using eksctl (Easiest)
eksctl create addon \
  --name aws-ebs-csi-driver \
  --cluster shopsphere \
  --version latest \
  --force

## Method 2: Using Helm
helm repo add aws-ebs-csi-driver \
  <https://kubernetes-sigs.github.io/aws-ebs-csi-driver>

helm install aws-ebs-csi-driver aws-ebs-csi-driver/aws-ebs-csi-driver \
  --namespace kube-system \
  --set controller.serviceAccount.create=true \
  --set controller.serviceAccount.name=ebs-csi-controller-sa

## Method 3: Using kubectl (IAM role required)
kubectl apply -k "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/?ref=master"
```

### Create IAM Role for Service Account (if not using addon)

```bash
eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster shopsphere \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve \
  --role-only \
  --role-name AmazonEKS_EBS_CSI_DriverRole
```

## Manifests

### StorageClass Configuration

```yaml
## storageclass.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  fsType: ext4
  encrypted: "true"
  kmsKeyId: "arn:aws:kms:us-east-1:123456789012:key/xxxx"  # Optional
reclaimPolicy: Retain  # Keep data after PVC deletion
```

### Verify Installation

```yaml
## test-pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ebs-test-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
  storageClassName: gp3
---
apiVersion: v1
kind: Pod
metadata:
  name: ebs-test-app
spec:
  containers:
  - name: app
    image: centos
    command: ["/bin/sh"]
    args: ["-c", "while true; do echo $(date -u) >> /data/out.txt; sleep 5; done"]
    volumeMounts:
    - name: persistent-storage
      mountPath: /data
  volumes:
  - name: persistent-storage
    persistentVolumeClaim:
      claimName: ebs-test-claim
```

## Verification

```bash
## Check CSI driver pods
kubectl get pods -n kube-system | grep ebs-csi

## Expected output:
## ebs-csi-controller-xxxxx   6/6     Running   0          5m
## ebs-csi-node-xxxxx         3/3     Running   0          5m

## Verify StorageClass
kubectl get storageclass

## Expected:
## NAME            PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE      ALLOWVOLUMEEXPANSION   AGE
## gp3 (default)   ebs.csi.aws.com         Retain          WaitForFirstConsumer   true                   5m

## Test PVC creation
kubectl apply -f test-pvc.yaml
kubectl get pvc
kubectl get pv

## Expected:
## NAME             STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
## ebs-test-claim   Bound    pvc-12345678-1234-1234-1234-123456789012   1Gi        RWO            gp3            30s
```

## Screenshots

**EKS Add-ons View:**

```
🔗 Console Path: EKS → Clusters → shopsphere → Add-ons
✅ aws-ebs-csi-driver: Active
✅ Version: v1.20.0-eksbuild.1
```

**EC2 Volumes:**

```
🔗 Console Path: EC2 → Elastic Block Store → Volumes
✅ Volume ID: vol-0xxxx
✅ State: in-use
✅ Size: 1 GiB
✅ Type: gp3
✅ Attached to: i-0xxxx (EKS node)
```

## Troubleshooting

### Issue: PVC remains in Pending state

**Symptoms:**

```bash
kubectl get pvc
NAME             STATUS    VOLUME   CAPACITY   ACCESS MODES   STORAGECLASS   AGE
postgres-pvc     Pending                                      gp3            5m

kubectl describe pvc postgres-pvc
Events:
  Warning  ProvisioningFailed  2m  ebs.csi.aws.com_gp3
  failed to provision volume with StorageClass "gp3":
  rpc error: code = Internal desc = Could not attach volume
```

**Root Causes:**

```
❌ EBS CSI Driver not installed
❌ IAM permissions missing
❌ No nodes available in AZ
❌ Volume limit reached (max 39 volumes per node)
```

**Fix:**

```bash
## Check if CSI driver is running
kubectl get pods -n kube-system | grep ebs-csi

## Check CSI driver logs
kubectl logs -n kube-system deployment/ebs-csi-controller

## Verify IAM role (if using IRSA)
kubectl get sa ebs-csi-controller-sa -n kube-system -o yaml

## Check node availability
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.labels.topology\.kubernetes\.io/zone}{"\n"}{end}'
```



```bash
## Check events for PVC
kubectl describe pvc <pvc-name>

## Check CSI controller logs
kubectl logs -n kube-system deployment/ebs-csi-controller -c csi-provisioner

## Check node plugin logs
kubectl logs -n kube-system <ebs-csi-node-pod-name> -c node-driver-registrar

## Verify AWS permissions
aws ec2 describe-volumes --filters "Name=tag:kubernetes.io/created-for/pvc/name,Values=<pvc-name>"
```

---

## Phase 04: 04-postgresql-persistence

## Objective

Deploy a production-ready PostgreSQL database with persistent storage, proper resource limits, and health checks.

## Architecture

```
PostgreSQL Deployment
├── 1 Replica (can scale to HA)
├── Resource Limits: 512Mi RAM, 500m CPU
└── Health Checks: liveness & readiness

PersistentVolumeClaim
├── 10Gi gp3 storage
├── ReadWriteOnce access
└── Retain policy

Service (ClusterIP)
└── Port 5432
```

## Commands

### Create Namespace

```bash
kubectl create namespace shopsphere
kubectl config set-context --current --namespace=shopsphere
```

### Deploy PostgreSQL

```bash
## Apply all resources
kubectl apply -f postgres/

## Or deploy individually
kubectl apply -f postgres/storageclass.yaml
kubectl apply -f postgres/pvc.yaml
kubectl apply -f postgres/deployment.yaml
kubectl apply -f postgres/service.yaml
kubectl apply -f postgres/configmap.yaml
kubectl apply -f postgres/secret.yaml
```

## Manifests

### PersistentVolumeClaim

```yaml
## postgres/pvc.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: shopsphere
  labels:
    app: postgresql
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3
```

### PostgreSQL Deployment

```yaml
## postgres/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: shopsphere
  labels:
    app: postgresql
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgresql
  template:
    metadata:
      labels:
        app: postgresql
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        ports:
        - containerPort: 5432
          name: postgres
        env:
        - name: POSTGRES_DB
          valueFrom:
            configMapKeyRef:
              name: postgres-config
              key: database-name
        - name: POSTGRES_USER
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: username
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
          subPath: postgres
        livenessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - $(POSTGRES_USER)
            - -d
            - $(POSTGRES_DB)
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
        readinessProbe:
          exec:
            command:
            - pg_isready
            - -U
            - $(POSTGRES_USER)
            - -d
            - $(POSTGRES_DB)
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
      volumes:
      - name: postgres-storage
        persistentVolumeClaim:
          claimName: postgres-pvc
      securityContext:
        fsGroup: 999  # postgres user
```

### PostgreSQL Service

```yaml
## postgres/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: shopsphere
  labels:
    app: postgresql
spec:
  type: ClusterIP
  ports:
  - port: 5432
    targetPort: 5432
    protocol: TCP
    name: postgres
  selector:
    app: postgresql
```

### ConfigMap

```yaml
## postgres/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-config
  namespace: shopsphere
data:
  database-name: "shopsphere_db"
  database-host: "postgres"
  database-port: "5432"
```

### Secret (Base64 encoded)

```yaml
## postgres/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: postgres-secret
  namespace: shopsphere
type: Opaque
data:
  username: cG9zdGdyZXM=  # postgres (base64)
  password: c2VjdXJlcGFzc3dvcmQxMjM=  # securepassword123 (base64)
```

**Generate base64:**

```bash
echo -n "postgres" | base64
echo -n "your-secure-password" | base64
```

## Verification

```bash
## Check PVC status
kubectl get pvc -n shopsphere
## Expected: STATUS = Bound

## Check pods
kubectl get pods -n shopsphere -l app=postgresql
## Expected: STATUS = Running

## Check logs
kubectl logs -n shopsphere deployment/postgres

## Test database connection
kubectl run postgres-client --rm --it --image=postgres:15-alpine --namespace=shopsphere -- bash

## Inside pod:
psql -h postgres -U postgres -d shopsphere_db

## Run query:
\dt
SELECT version();
```

**Expected Output:**

```
PostgreSQL 15.3 on x86_64-pc-linux-musl
(1 row)
```

## Screenshots

**EBS Volume for PostgreSQL:**

```
🔗 Console Path: EC2 → Volumes
✅ Volume ID: vol-0xxxx
✅ Size: 10 GiB
✅ Type: gp3
✅ State: In-use
✅ Attached to: <EKS node>
✅ Tags: kubernetes.io/created-for/pvc/name=postgres-pvc
```

## Troubleshooting

### Issue: PVC remains Pending

**Symptoms:**

```bash
kubectl describe pvc postgres-pvc
Events:
  Warning  ProvisioningFailed  failed to provision volume:
  rpc error: code = Internal desc = Could not attach volume
```

**Root Cause:**

```
❌ EBS CSI Driver not installed (See Phase 3)
```

**Fix:**

```bash
kubectl apply -k "github.com/kubernetes-sigs/aws-ebs-csi-driver/deploy/kubernetes/overlays/stable/"
```

### Issue: Pod CrashLoopBackOff

**Symptoms:**

```bash
kubectl get pods -n shopsphere
NAME         READY   STATUS             RESTARTS   AGE
postgres-0   0/1     CrashLoopBackOff   5          10m
```

**Root Causes:**

```
❌ Wrong permissions on data directory
❌ Invalid password encoding
❌ Insufficient memory
```

**Fix:**

```bash
## Check logs
kubectl logs -n shopsphere deployment/postgres

## Common fix: Ensure fsGroup is set
## Add to deployment spec:
securityContext:
  fsGroup: 999
```



```bash
## Describe pod for events
kubectl describe pod -n shopsphere -l app=postgresql

## Check persistent volume
kubectl get pv
kubectl describe pv <pv-name>

## Test database connectivity from backend pod
kubectl exec -it -n shopsphere <backend-pod> -- bash
nc -zv postgres 5432

## Check PostgreSQL logs
kubectl logs -n shopsphere deployment/postgres --tail=100
```

---

## Phase 05: 05-application-deployment

## Objective

Deploy the Flask backend API and Nginx frontend application with proper service discovery and inter-pod communication.

## Architecture

```
Frontend (Nginx)
├── Port 80
├── Serves static HTML/JS
└── Proxies API calls to backend

Backend (Flask)
├── Port 5000
├── REST API endpoints
│   ├── GET /api/products
│   ├── POST /api/products
│   └── GET /api/health
└── Connects to PostgreSQL

Services
├── frontend-service (ClusterIP)
└── backend-service (ClusterIP)
```

## Commands

```bash
## Create namespace if not exists
kubectl create namespace shopsphere

## Deploy backend
kubectl apply -f backend/deployment.yaml
kubectl apply -f backend/service.yaml

## Deploy frontend
kubectl apply -f frontend/deployment.yaml
kubectl apply -f frontend/service.yaml

## Verify all pods
kubectl get pods -n shopsphere

## Check services
kubectl get svc -n shopsphere
```

## Manifests

### Backend Deployment

```yaml
## backend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
  labels:
    app: backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: public.ecr.aws/myrepo/shopsphere-backend:latest
        ports:
        - containerPort: 5000
          name: http
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:$(POSTGRES_PASSWORD)@postgres:5432/shopsphere_db"
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        - name: FLASK_ENV
          value: "production"
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 5000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Backend Service

```yaml
## backend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: shopsphere
  labels:
    app: backend
spec:
  type: ClusterIP
  ports:
  - port: 5000
    targetPort: 5000
    protocol: TCP
    name: http
  selector:
    app: backend
```

### Frontend Deployment

```yaml
## frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: shopsphere
  labels:
    app: frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: public.ecr.aws/myrepo/shopsphere-frontend:latest
        ports:
        - containerPort: 80
          name: http
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "200m"
        livenessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 10
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Frontend Service

```yaml
## frontend/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: shopsphere
  labels:
    app: frontend
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
    name: http
  selector:
    app: frontend
```

## Verification

```bash
## Check all resources
kubectl get all -n shopsphere

## Expected output:
## NAME                           READY   STATUS    RESTARTS   AGE
## pod/backend-6d8f9b7c4-abc12    1/1     Running   0          5m
## pod/backend-6d8f9b7c4-def34    1/1     Running   0          5m
## pod/frontend-5c7d8e9f0-ghi56   1/1     Running   0          5m
## pod/frontend-5c7d8e9f0-jkl78   1/1     Running   0          5m
## pod/postgres-xxxxx             1/1     Running   0          10m
#
## NAME              TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
## service/backend   ClusterIP   10.100.50.100   <none>        5000/TCP   5m
## service/frontend  ClusterIP   10.100.60.110   <none>        80/TCP     5m
## service/postgres  ClusterIP   10.100.70.120   <none>        5432/TCP   10m

## Test backend API
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- bash
curl <http://backend:5000/api/health>

## Expected:
## {"status": "healthy", "database": "connected"}

## Test from outside cluster (after ingress setup)
curl http://<alb-dns>/api/products
```

## Application architecture

```
┌─────────────────────────────────────────────────┐
│              Application Load Balancer           │
│              (internet-facing)                   │
└─────────────────┬───────────────────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │         │      │         │
    │  /      │      │ /api/*  │
    │         │      │         │
    └────┬────┘      └────┬────┘
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │ Frontend│      │ Backend │
    │  Nginx  │      │  Flask  │
    │  :80    │      │  :5000  │
    └─────────      └────────┘
                          │
                    ┌─────▼─────┐
                    │ PostgreSQL│
                    │   :5432   │
                    └───────────┘
```

## Troubleshooting

### Issue: Backend cannot connect to database

**Symptoms:**

```bash
kubectl logs -n shopsphere deployment/backend

## Error:
sqlalchemy.exc.OperationalError: (psycopg2.OperationalError)
could not translate host name "postgres" to address: Name or service not known
```

**Root Causes:**

```
❌ PostgreSQL service not running
❌ Wrong service name in DATABASE_URL
❌ Network policy blocking traffic
```

**Fix:**

```bash
## Verify PostgreSQL is running
kubectl get pods -n shopsphere -l app=postgresql

## Test DNS resolution
kubectl run dns-test --rm -it --image=busybox --namespace=shopsphere -- nslookup postgres

## Check service exists
kubectl get svc -n shopsphere postgres
```

### Issue: Frontend returns 502 Bad Gateway

**Symptoms:**

```bash
curl <http://frontend/api/products>
## 502 Bad Gateway
```

**Root Cause:**

```
❌ Backend service not found
❌ Wrong proxy configuration in Nginx
```

**Fix:**

```yaml
## Ensure Nginx config has correct upstream
## nginx.conf:
location /api/ {
    proxy_pass <http://backend:5000>;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```



```bash
## Check pod logs
kubectl logs -n shopsphere deployment/backend --tail=50
kubectl logs -n shopsphere deployment/frontend --tail=50

## Describe pods for events
kubectl describe pod -n shopsphere -l app=backend

## Test connectivity between pods
kubectl exec -it -n shopsphere deployment/frontend -- bash
curl -v <http://backend:5000/api/health>

## Check resource usage
kubectl top pods -n shopsphere

## Verify environment variables
kubectl exec -it -n shopsphere deployment/backend -- env | grep DATABASE
```

---

## Phase 06: 06-configmaps-secrets

## Objective

Externalize application configuration using ConfigMaps and securely manage sensitive data using Kubernetes Secrets.

## Architecture

```
ConfigMap (Non-sensitive)
├── database-name
├── database-host
├── database-port
├── app-settings
└── feature-flags

Secret (Sensitive - Base64 encoded)
├── username
├── password
├── api-keys
└── certificates

Injected into Pods as:
├── Environment Variables
└── Volume Mounts
```

## Commands

### Create ConfigMap

```bash
## From literal values
kubectl create configmap app-config \
  --from-literal=database-name=shopsphere_db \
  --from-literal=database-host=postgres \
  --from-literal=database-port=5432 \
  --from-literal=log-level=info \
  --namespace=shopsphere

## From file
kubectl create configmap nginx-config \
  --from-file=nginx.conf=./config/nginx.conf \
  --namespace=shopsphere

## From env file
kubectl create configmap app-env \
  --from-env-file=.env \
  --namespace=shopsphere
```

### Create Secret

```bash
## From literal values
kubectl create secret generic postgres-secret \
  --from-literal=username=postgres \
  --from-literal=password='SecureP@ssw0rd123!' \
  --namespace=shopsphere

## From file
kubectl create secret generic tls-secret \
  --from-file=tls.crt=./certs/tls.crt \
  --from-file=tls.key=./certs/tls.key \
  --type=kubernetes.io/tls \
  --namespace=shopsphere

## From env file
kubectl create secret generic app-secrets \
  --from-env-file=.env.secrets \
  --namespace=shopsphere
```

### View Secrets (Decoded)

```bash
## List secrets
kubectl get secrets -n shopsphere

## Get secret value (base64 encoded)
kubectl get secret postgres-secret -n shopsphere -o jsonpath='{.data.password}'

## Decode secret
kubectl get secret postgres-secret -n shopsphere -o jsonpath='{.data.password}' | base64 --decode

## Edit secret
kubectl edit secret postgres-secret -n shopsphere
```

## Manifests

### Complete ConfigMap

```yaml
## configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: shopsphere
data:
  # Database configuration
  database-name: "shopsphere_db"
  database-host: "postgres"
  database-port: "5432"

  # Application settings
  app-name: "ShopSphere"
  log-level: "info"
  max-connections: "100"

  # Feature flags
  enable-caching: "true"
  enable-metrics: "true"

  # Nginx configuration (multi-line)
  nginx.conf: |
    server {
        listen 80;
        server_name localhost;

        location / {
            root /usr/share/nginx/html;
            index index.html;
        }

        location /api/ {
            proxy_pass <http://backend:5000>;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
```

### Complete Secret

```yaml
## secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
  namespace: shopsphere
type: Opaque
stringData:  # stringData allows plain text (auto base64 encoded)
  database-url: "postgresql://postgres:SecureP@ssw0rd123!@postgres:5432/shopsphere_db"
  api-key: "sk-prod-1234567890abcdef"
  jwt-secret: "super-secret-jwt-key-change-in-production"
data:  # data requires base64 encoding
  password: U2VjdXJlUEBzc3cwcmQxMjMh  # SecureP@ssw0rd123!
```

### Using ConfigMap in Deployment

```yaml
## deployment-with-configmap.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
spec:
  template:
    spec:
      containers:
      - name: backend
        image: shopsphere-backend:latest

        # Method 1: Environment variables from ConfigMap
        env:
        - name: DATABASE_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: database-host
        - name: DATABASE_PORT
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: database-port

        # Method 2: All ConfigMap keys as env vars
        envFrom:
        - configMapRef:
            name: app-config

        # Method 3: Volume mount
        volumeMounts:
        - name: config-volume
          mountPath: /etc/config
          readOnly: true

      volumes:
      - name: config-volume
        configMap:
          name: app-config
          items:
          - key: nginx.conf
            path: nginx.conf
```

### Using Secret in Deployment

```yaml
## deployment-with-secret.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
spec:
  template:
    spec:
      containers:
      - name: backend
        image: shopsphere-backend:latest

        # Environment variables from Secret
        env:
        - name: DATABASE_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password

        # All secret keys as env vars
        envFrom:
        - secretRef:
            name: app-secrets

        # Volume mount for sensitive files
        volumeMounts:
        - name: secret-volume
          mountPath: /etc/secrets
          readOnly: true

      volumes:
      - name: secret-volume
        secret:
          secretName: app-secrets
          defaultMode: 0400  # Read-only for owner
```

## Verification

```bash
## List ConfigMaps
kubectl get configmap -n shopsphere

## Describe ConfigMap
kubectl describe configmap app-config -n shopsphere

## List Secrets
kubectl get secret -n shopsphere

## Verify ConfigMap mounted in pod
kubectl exec -it -n shopsphere deployment/backend -- cat /etc/config/nginx.conf

## Verify environment variables
kubectl exec -it -n shopsphere deployment/backend -- env | grep DATABASE

## Verify Secret mounted
kubectl exec -it -n shopsphere deployment/backend -- ls -la /etc/secrets
kubectl exec -it -n shopsphere deployment/backend -- cat /etc/secrets/password
```

## Screenshots

**Secrets Manager Integration (Optional):**

```
🔗 Console Path: Secrets Manager → Secrets
✅ Create external secret
✅ Sync with Kubernetes Secret
✅ Automatic rotation enabled
```

## Troubleshooting

### Issue: CreateContainerConfigError

**Symptoms:**

```bash
kubectl describe pod -n shopsphere deployment/backend
Events:
  Warning  Failed  Error: configmap "app-config" not found
  Warning  Failed  Error: secret "postgres-secret" not found
```

**Root Cause:**

```
❌ ConfigMap/Secret not created before deployment
❌ Wrong namespace
❌ Typo in name reference
```

**Fix:**

```bash
## Create missing resources
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml

## Verify they exist
kubectl get configmap,secret -n shopsphere
```

### Issue: Permission denied reading secret

**Symptoms:**

```bash
kubectl exec -it -n shopsphere deployment/backend -- cat /etc/secrets/password
cat: /etc/secrets/password: Permission denied
```

**Root Cause:**

```
❌ Wrong defaultMode on secret volume
```

**Fix:**

```yaml
volumes:
- name: secret-volume
  secret:
    secretName: app-secrets
    defaultMode: 0400  # Read-only for owner (4 = read for owner)
```



```bash
## Check if ConfigMap exists
kubectl get configmap app-config -n shopsphere -o yaml

## Check if Secret exists
kubectl get secret postgres-secret -n shopsphere -o yaml

## Verify pod can resolve ConfigMap keys
kubectl exec -it -n shopsphere deployment/backend -- printenv | grep DATABASE

## Check volume mounts
kubectl describe pod -n shopsphere deployment/backend | grep -A 5 Mounts

## Test secret decoding
kubectl get secret postgres-secret -n shopsphere -o json | jq '.data | map_values(@base64d)'
```

---

## Phase 07: 07-backend-database-integration

## Objective

Implement a Flask REST API that connects to PostgreSQL, performs CRUD operations on products, and includes proper error handling and health checks.

## Architecture

```
Flask Application
├── app.py (Main application)
├── models.py (SQLAlchemy models)
├── config.py (Configuration)
└── requirements.txt

Database Schema
└── products
    ├── id (Serial, Primary Key)
    ├── name (VARCHAR 100)
    ├── description (TEXT)
    ├── price (DECIMAL 10,2)
    ├── stock (INTEGER)
    └── created_at (TIMESTAMP)

API Endpoints
├── GET    /api/health      - Health check
├── GET    /api/products    - List all products
├── GET    /api/products/:id - Get product by ID
├── POST   /api/products    - Create product
├── PUT    /api/products/:id - Update product
└── DELETE /api/products/:id - Delete product
```

## Commands

### Build and Push Docker Image

```bash
## Build image
docker build -t shopsphere-backend:latest ./backend

## Tag for ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

docker tag shopsphere-backend:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-backend:latest

## Push to ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-backend:latest
```

### Test API Locally

```bash
## Run PostgreSQL locally
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=shopsphere_db \
  -p 5432:5432 \
  postgres:15-alpine

## Run backend
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shopsphere_db"
python app.py

## Test endpoints
curl <http://localhost:5000/api/health>
curl <http://localhost:5000/api/products>
curl -X POST <http://localhost:5000/api/products> \
  -H "Content-Type: application/json" \
  -d '{"name":"Laptop","price":999.99,"stock":10}'
```

## Manifests

### Application source (`app.py`)

```python
from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL',
    'postgresql://postgres:postgres@postgres:5432/shopsphere_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Product(db.Model):
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Numeric(10, 2), nullable=False)
    stock = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'price': float(self.price),
            'stock': self.stock,
            'created_at': self.created_at.isoformat(),
        }

with app.app_context():
    db.create_all()

@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        db.session.execute('SELECT 1')
        return jsonify({'status': 'healthy', 'database': 'connected'}), 200
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 503

@app.route('/api/products', methods=['GET'])
def get_products():
    products = Product.query.all()
    return jsonify({'products': [p.to_dict() for p in products], 'count': len(products)}), 200

@app.route('/api/products', methods=['POST'])
def create_product():
    data = request.get_json()
    product = Product(
        name=data['name'],
        description=data.get('description', ''),
        price=data['price'],
        stock=data.get('stock', 0),
    )
    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
```

### Requirements (`requirements.txt`)

```text
Flask==2.3.3
Flask-SQLAlchemy==3.0.5
Flask-CORS==4.0.0
psycopg2-binary==2.9.7
python-dotenv==1.0.0
gunicorn==21.2.0
```

### Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "app:app"]
```

### Database initialization (`init.sql`)

```sql
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER DEFAULT 0 CHECK (stock >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (name, description, price, stock) VALUES
('Laptop', 'High-performance laptop', 999.99, 10),
('Mouse', 'Wireless mouse', 29.99, 50),
('Keyboard', 'Mechanical keyboard', 79.99, 30)
ON CONFLICT DO NOTHING;
```

### Backend deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: shopsphere
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
        - name: backend
          image: <account>.dkr.ecr.us-east-1.amazonaws.com/shopsphere-backend:latest
          ports:
            - containerPort: 5000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
```

## Verification

```bash
## Check backend logs
kubectl logs -n shopsphere deployment/backend --tail=50

## Expected output:
## * Serving Flask app 'app'
## * Running on <http://0.0.0.0:5000>
## 127.0.0.1 - - [07/Jun/2026 10:00:00] "GET /api/health HTTP/1.1" 200

## Test health endpoint
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- \
  curl <http://backend:5000/api/health>

## Expected:
## {"database":"connected","status":"healthy","timestamp":"2026-06-07T10:00:00"}

## Test create product
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- bash
curl -X POST <http://backend:5000/api/products> \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Product","price":99.99,"stock":5}'

## Expected:
## {"id":1,"name":"Test Product","description":"","price":99.99,"stock":5,"created_at":"..."}

## Test get products
curl <http://backend:5000/api/products>

## Expected:
## {"products":[{"id":1,"name":"Test Product",...}],"count":1}

## Connect to database directly
kubectl run postgres-client --rm -it --image=postgres:15-alpine --namespace=shopsphere -- \
  psql -h postgres -U postgres -d shopsphere_db -c "SELECT * FROM products;"
```


## Troubleshooting

### Issue: CrashLoopBackOff

**Symptoms:**

```bash
kubectl get pods -n shopsphere
NAME       READY   STATUS             RESTARTS   AGE
backend    0/1     CrashLoopBackOff   5          10m

kubectl logs -n shopsphere deployment/backend
sqlalchemy.exc.OperationalError: could not connect to server
```

**Root Causes:**

```
❌ Database not running
❌ Wrong DATABASE_URL
❌ Missing environment variables
❌ Python syntax errors
❌ Missing dependencies
```

**Fix:**

```bash
## Check environment variables
kubectl describe pod -n shopsphere deployment/backend | grep -A 10 Environment

## Verify database connectivity
kubectl exec -it -n shopsphere deployment/backend -- \
  python -c "import psycopg2; psycopg2.connect('postgresql://postgres:password@postgres:5432/db')"

## Check for Python errors
kubectl logs -n shopsphere deployment/backend --previous

## Test database connection
kubectl run test --rm -it --image=postgres:15-alpine --namespace=shopsphere -- \
  psql -h postgres -U postgres -d shopsphere_db -c "SELECT 1"
```

### Issue: ModuleNotFoundError

**Symptoms:**

```bash
kubectl logs -n shopsphere deployment/backend
ModuleNotFoundError: No module named 'flask'
```

**Root Cause:**

```
❌ requirements.txt not copied in Dockerfile
❌ pip install failed
```

**Fix:**

```docker
## Ensure Dockerfile has:
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
```



```bash
## Check database tables
kubectl exec -it -n shopsphere deployment/postgres -- \
  psql -U postgres -d shopsphere_db -c "\dt"

## Check database connection from backend
kubectl exec -it -n shopsphere deployment/backend -- \
  python -c "from app import db; print(db.engine.connect())"

## View database logs
kubectl logs -n shopsphere deployment/postgres --tail=50

## Check for migration issues
kubectl exec -it -n shopsphere deployment/backend -- \
  python -c "from app import db, Product; db.create_all(); print('Tables created')"

## Monitor API requests
kubectl logs -n shopsphere deployment/backend -f | grep "GET\|POST"
```

---

## Phase 08: 08-aws-load-balancer-controller

## Objective

Install and configure the AWS Load Balancer Controller to automatically provision Application Load Balancers (ALB) for Kubernetes Ingress resources.

## Architecture

```
Kubernetes Cluster
├── AWS Load Balancer Controller
│   ├── Deployment (kube-system)
│   ├── ServiceAccount (IRSA)
│   └── IAM Role (with permissions)
│
└── Ingress Resources
    ↓
Controller watches for Ingress
    ↓
Creates ALB via AWS API
    ↓
Configures Target Groups
    ↓
Routes traffic to Pods
```

## Commands

### Step 1: Associate OIDC Provider

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster shopsphere \
  --region us-east-1 \
  --approve
```

**Verify:**

```bash
aws iam list-open-id-connect-providers | grep shopsphere
## Expected: arn:aws:iam::<account-id>:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/XXXXX
```

### Step 2: Create IAM Policy

```bash
## Download policy
curl -O <https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json>

## Create IAM policy
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://iam_policy.json

## Get policy ARN
POLICY_ARN=$(aws iam list-policies \
  --query "Policies[?PolicyName=='AWSLoadBalancerControllerIAMPolicy'].Arn" \
  --output text)

echo $POLICY_ARN
```

### Step 3: Create IAM Service Account

```bash
eksctl create iamserviceaccount \
  --cluster=shopsphere \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=$POLICY_ARN \
  --override-existing-serviceaccounts \
  --approve
```

**Verify:**

```bash
kubectl get sa aws-load-balancer-controller -n kube-system -o yaml | grep annotations
## Expected: eks.amazonaws.com/role-arn: arn:aws:iam::...
```

### Step 4: Install Controller via Helm

```bash
## Add Helm repo
helm repo add eks <https://aws.github.io/eks-charts>
helm repo update

## Get VPC ID
VPC_ID=$(aws eks describe-cluster \
  --name shopsphere \
  --query "cluster.resourcesVpcConfig.vpcId" \
  --output text)

echo "VPC ID: $VPC_ID"

## Install controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=shopsphere \
  --set serviceAccount.create=false \
  --set serviceAccount.name=aws-load-balancer-controller \
  --set region=us-east-1 \
  --set vpcId=$VPC_ID \
  --set replicaCount=2 \
  --set resources.requests.cpu=100m \
  --set resources.requests.memory=128Mi
```

## Manifests

### Alternative: Manual Installation (without Helm)

```yaml
## aws-load-balancer-controller.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: aws-load-balancer-controller
  namespace: kube-system
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/AmazonEKSLoadBalancerControllerRole
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aws-load-balancer-controller
  namespace: kube-system
  labels:
    app.kubernetes.io/name: aws-load-balancer-controller
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: aws-load-balancer-controller
  template:
    metadata:
      labels:
        app.kubernetes.io/name: aws-load-balancer-controller
    spec:
      serviceAccountName: aws-load-balancer-controller
      containers:
      - name: controller
        image: public.ecr.aws/eks/aws-load-balancer-controller:v2.5.4
        args:
        - --cluster-name=shopsphere
        - --ingress-class=alb
        - --aws-vpc-id=<vpc-id>
        - --aws-region=us-east-1
        resources:
          requests:
            cpu: 100m
            memory: 128Mi
          limits:
            cpu: 200m
            memory: 256Mi
```

## Verification

```bash
## Check controller pods
kubectl get pods -n kube-system | grep aws-load-balancer-controller

## Expected:
## aws-load-balancer-controller-6d8f9b7c4-abc12   1/1     Running   0   5m
## aws-load-balancer-controller-6d8f9b7c4-def34   1/1     Running   0   5m

## Check logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=20

## Expected:
## {"level":"info","ts":1686139200.123,"msg":"version","GitVersion":"v2.5.4"}
## {"level":"info","ts":1686139200.456,"msg":"starting manager"}

## Verify webhook is ready
kubectl get validatingwebhookconfiguration ingress-class-validator -o yaml

## Test by creating an Ingress (see Phase 9)
```

## Screenshots

**EC2 Load Balancers:**

```
🔗 Console Path: EC2 → Load Balancers
✅ After creating Ingress, ALB appears here
✅ Type: Application
✅ Scheme: internet-facing
✅ State: active
```

**Target Groups:**

```
🔗 Console Path: EC2 → Target Groups
✅ Automatically created for each Ingress
✅ Type: IP
✅ Protocol: HTTP
✅ Health checks configured
```

## Troubleshooting

### Issue: AccessDenied errors in logs

**Symptoms:**

```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
{"level":"error","ts":1686139200,"msg":"failed to describe subnets",
"error":"AccessDenied: User: arn:aws:sts::123456789012:assumed-role/...
is not authorized to perform: ec2:DescribeSubnets"}
```

**Root Causes:**

```
❌ IRSA not configured correctly
❌ Missing IAM policy
❌ Wrong service account annotation
```

**Fix:**

```bash
## Verify service account has correct annotation
kubectl get sa aws-load-balancer-controller -n kube-system -o yaml

## Verify IAM role trust relationship
aws iam get-role \
  --role-name eksctl-shopsphere-addon-iamserviceaccount-kube-system-aws-load-balancer-controller

## Should include:
## "Condition": {
##   "StringEquals": {
##     "oidc.eks.us-east-1.amazonaws.com/id/XXXXX:sub": "system:serviceaccount:kube-system:aws-load-balancer-controller"
##   }
## }

## Re-create service account if needed
eksctl delete iamserviceaccount \
  --cluster=shopsphere \
  --namespace=kube-system \
  --name=aws-load-balancer-controller

eksctl create iamserviceaccount \
  --cluster=shopsphere \
  --namespace=kube-system \
  --name=aws-load-balancer-controller \
  --attach-policy-arn=$POLICY_ARN \
  --override-existing-serviceaccounts \
  --approve
```

### Issue: No subnets found

**Symptoms:**

```bash
kubectl logs -n kube-system deployment/aws-load-balancer-controller
{"level":"error","msg":"failed to build load balancer",
"error":"couldn't find any subnets"}
```

**Root Cause:**

```
❌ Subnets not tagged correctly
```

**Fix:**

```bash
## Tag public subnets for internet-facing ALBs
aws ec2 create-tags \
  --resources subnet-xxxxx subnet-yyyyy \
  --tags Key=kubernetes.io/cluster/shopsphere,Value=shared \
  Key=kubernetes.io/role/elb,Value=1

## Tag private subnets for internal ALBs
aws ec2 create-tags \
  --resources subnet-zzzzz subnet-aaaaa \
  --tags Key=kubernetes.io/cluster/shopsphere,Value=shared \
  Key=kubernetes.io/role/internal-elb,Value=1

## Verify tags
aws ec2 describe-subnets \
  --filters "Name=tag:kubernetes.io/cluster/shopsphere,Values=shared"
```



```bash
## Check controller events
kubectl get events -n kube-system --sort-by='.lastTimestamp' | grep -i "load.balancer"

## Describe ingress for events
kubectl describe ingress <ingress-name> -n shopsphere

## Check AWS API calls (CloudTrail)
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=CreateLoadBalancer \
  --max-results 5

## Verify VPC configuration
aws ec2 describe-vpcs --vpc-ids $VPC_ID
aws ec2 describe-internet-gateways \
  --filters "Name=attachment.vpc-id,Values=$VPC_ID"

## Check subnet tags
aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].[SubnetId,Tags]"
```

---

## Phase 09: 09-ingress-configuration

## Objective

Create Kubernetes Ingress resources to route external traffic to frontend and backend services through a single Application Load Balancer.

## Architecture

```
Internet
    ↓
Application Load Balancer (ALB)
├── Listener: HTTP (80)
│   └── Rules:
│       ├── Path: /api/* → backend:5000
│       ├── Path: /grafana → grafana:3000
│       └── Path: /* → frontend:80
│
└── Listener: HTTPS (443) [Optional with cert-manager]
    └── Same rules with SSL termination

Target Groups
├── tg-frontend (IP targets)
├── tg-backend (IP targets)
└── tg-grafana (IP targets)
```

## Commands

### Create Ingress

```bash
## Apply Ingress configuration
kubectl apply -f ingress.yaml

## Check Ingress status
kubectl get ingress -n shopsphere

## Wait for ALB to be created (2-5 minutes)
kubectl get ingress -n shopsphere -w

## Get ALB DNS name
ALB_DNS=$(kubectl get ingress shopsphere-ingress -n shopsphere \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "ALB DNS: $ALB_DNS"

## Test endpoints
curl http://$ALB_DNS/api/health
curl http://$ALB_DNS/api/products
curl http://$ALB_DNS/
```

### Test with kubectl

```bash
## Port-forward for local testing (alternative)
kubectl port-forward -n shopsphere svc/frontend 8080:80
curl <http://localhost:8080>

## Test backend directly
kubectl port-forward -n shopsphere svc/backend 5000:5000
curl <http://localhost:5000/api/health>
```

## Manifests

### Basic ingress (path-based)

Use this as the default ShopSphere ingress - routes `/api` to the backend and `/` to the frontend.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
spec:
  rules:
  - http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 5000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### Multi-host ingress (HTTPS)

Split frontend and API by hostname. Replace the certificate ARN with your ACM certificate.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}, {"HTTPS": 443}]'
    alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:us-east-1:123456789012:certificate/xxxxx
    alb.ingress.kubernetes.io/group.name: shopsphere
spec:
  rules:
  - host: api.shopsphere.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: backend
            port:
              number: 5000
  - host: shopsphere.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### Ingress with Cognito authentication

Uncomment the auth annotations to protect the frontend with Amazon Cognito.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    # alb.ingress.kubernetes.io/auth-type: cognito
    # alb.ingress.kubernetes.io/auth-idp-cognito: '{"UserPoolArn":"arn:aws:cognito-idp:...","UserPoolClientId":"xxxx","UserPoolDomain":"auth.example.com"}'
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

### Grafana ingress (shared ALB)

Expose Grafana on `/grafana` using the same ALB group as the main ingress.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/group.name: shopsphere
    alb.ingress.kubernetes.io/group.order: '2'
spec:
  rules:
  - http:
      paths:
      - path: /grafana
        pathType: Prefix
        backend:
          service:
            name: monitoring-grafana
            port:
              number: 80
```

### Custom single-service ingress

Minimal pattern for a single backend service on its own ALB.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: custom-ingress
  namespace: custom-app
  annotations:
    alb.ingress.kubernetes.io/load-balancer-name: custom-alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
spec:
  ingressClassName: alb
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: custom-svc
            port:
              number: 8080
```

## Verification

```bash
## Check Ingress resource
kubectl get ingress -n shopsphere

## Expected output:
## NAME                 CLASS   HOSTS   ADDRESS                                               PORTS   AGE
## shopsphere-ingress   alb     *       k8s-shops-shopspher-xxxxx-1234567890.us-east-1.elb.amazonaws.com   80      5m

## Describe Ingress for events
kubectl describe ingress shopsphere-ingress -n shopsphere

## Expected events:
## Normal   Created             Ingress   Ingress shopsphere/shopsphere-ingress
## Normal   Created             Ingress   LoadBalancer created

## Check ALB in AWS
ALB_DNS=$(kubectl get ingress shopsphere-ingress -n shopsphere \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

echo "Testing ALB: $ALB_DNS"

## Test all endpoints
echo "=== Frontend ==="
curl -I http://$ALB_DNS/

echo "=== Backend API ==="
curl http://$ALB_DNS/api/health

echo "=== Products ==="
curl http://$ALB_DNS/api/products

## Check target groups
aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'k8s-shops')].TargetGroupName"

## Check ALB listeners
aws elbv2 describe-listeners \
  --load-balancer-arn $(aws elbv2 describe-load-balancers \
    --query "LoadBalancers[?DNSName=='$ALB_DNS'].LoadBalancerArn" --output text)
```


## Troubleshooting

### Issue: Ingress ADDRESS is empty

**Symptoms:**

```bash
kubectl get ingress -n shopsphere
NAME                 CLASS   HOSTS   ADDRESS   PORTS   AGE
shopsphere-ingress   alb     *                 80      10m

kubectl describe ingress shopsphere-ingress -n shopsphere
Events:
  Warning  FailedDeployModel  Failed deploy model due to
  ListenerNotFound: Listener 'arn:aws:elasticloadbalancing:...' not found
```

**Root Causes:**

```
❌ AWS Load Balancer Controller not running
❌ Missing subnet tags
❌ IAM permissions issue
```

**Fix:**

```bash
## Check controller is running
kubectl get pods -n kube-system | grep aws-load-balancer-controller

## Check controller logs
kubectl logs -n kube-system deployment/aws-load-balancer-controller --tail=50

## Verify subnet tags (see Phase 8)
aws ec2 describe-subnets --filters "Name=tag:kubernetes.io/role/elb,Values=1"
```

### Issue: 503 Service Unavailable

**Symptoms:**

```bash
curl http://$ALB_DNS/api/health
## 503 Service Temporarily Unavailable
```

**Root Causes:**

```
❌ Target group health checks failing
❌ Wrong service port
❌ Pods not ready
```

**Fix:**

```bash
## Check target group health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

## Expected:
## "State": "healthy"

## If unhealthy, check:
kubectl get pods -n shopsphere
kubectl describe pod -n shopsphere <pod-name>

## Verify service endpoints
kubectl get endpoints -n shopsphere

## Expected:
## NAME       ENDPOINTS         AGE
## backend    10.0.1.10:5000,10.0.1.11:5000   10m

## Check health check path
kubectl describe ingress shopsphere-ingress -n shopsphere | grep healthcheck

## Test health endpoint directly
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- \
  curl <http://backend:5000/api/health>
```

### Issue: 404 Not Found

**Symptoms:**

```bash
curl http://$ALB_DNS/api/products
## 404 Not Found
```

**Root Cause:**

```
❌ Path not matching
❌ Service not found
```

**Fix:**

```bash
## Check pathType
kubectl get ingress shopsphere-ingress -n shopsphere -o yaml | grep pathType

## Use Prefix for /api/* matching
pathType: Prefix

## Verify service exists
kubectl get svc -n shopsphere backend

## Test service directly
kubectl run test --rm -it --image=curlimages/curl --namespace=shopsphere -- \
  curl <http://backend:5000/api/products>
```



```bash
## Check Ingress events
kubectl get events -n shopsphere --sort-by='.lastTimestamp' | grep -i ingress

## Check ALB logs (enable access logs first)
aws s3 ls s3://<alb-access-logs-bucket>/

## Describe target groups
aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'k8s-shops')].[TargetGroupName,HealthCheckPath,HealthCheckPort]"

## Check target health
TARGET_GROUP_ARN=$(aws elbv2 describe-target-groups \
  --query "TargetGroups[?contains(TargetGroupName, 'backend')].TargetGroupArn" --output text)

aws elbv2 describe-target-health --target-group-arn $TARGET_GROUP_ARN

## Test from within cluster
kubectl run debug --rm -it --image=nicolaka/netshoot --namespace=shopsphere -- bash
curl -v <http://backend:5000/api/health>

## Check AWS WAF logs (if enabled)
aws wafv2 get-web-acl-resource --scope REGIONAL --resource-arn <alb-arn>
```

---

## Phase 10: 10-frontend-application

## Objective

Deploy an Nginx-based frontend that serves static HTML/JS files and acts as a reverse proxy to route `/api/*` requests to the Flask backend service.

## Architecture

```
Browser
  ↓
Nginx (Frontend Pod)
  ├── / → Serves static files (index.html, CSS, JS)
  └── /api/* → Proxies to <http://backend:5000>
```

## Commands

### Build and Push Frontend Image

```bash
## Build the Docker image
docker build -t shopsphere-frontend:latest ./frontend

## Authenticate with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

## Tag and push
docker tag shopsphere-frontend:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-frontend:latest
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-frontend:latest
```

### Deploy to EKS

```bash
## Apply ConfigMap, Deployment, and Service
kubectl apply -f frontend/configmap.yaml
kubectl apply -f frontend/deployment.yaml
kubectl apply -f frontend/service.yaml

## Verify
kubectl get pods -n shopsphere -l app=frontend
```

## Manifests

### Nginx Configuration (ConfigMap)

```yaml
## frontend/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: shopsphere
data:
  default.conf: |
    server {
        listen 80;
        server_name localhost;

        # Serve static frontend files
        location / {
            root   /usr/share/nginx/html;
            index  index.html index.htm;
            try_files $uri $uri/ /index.html; # For SPA routing
        }

        # Reverse proxy to backend API
        location /api/ {
            proxy_pass <http://backend:5000>;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
```

### Frontend Deployment

```yaml
## frontend/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: shopsphere
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/shopsphere-frontend:latest
        ports:
        - containerPort: 80
        volumeMounts:
        - name: nginx-config
          mountPath: /etc/nginx/conf.d/default.conf
          subPath: default.conf
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "200m"
      volumes:
      - name: nginx-config
        configMap:
          name: nginx-config
```

## Verification

```bash
## Test frontend through the ALB
curl http://<ALB-DNS>/
## Expected: HTML content of your frontend

## Test API proxy through frontend
curl http://<ALB-DNS>/api/products
## Expected: JSON array of products from the database
```

## Screenshots

> 

## Troubleshooting

### Issue: 502 Bad Gateway on `/api/*`

**Cause:** Nginx cannot resolve or connect to the `backend` service.
**Fix:** Ensure the backend service is named exactly `backend` and is in the same namespace. Check Nginx logs:

```bash
kubectl logs -n shopsphere deployment/frontend
## Look for: "host not found in upstream "backend:5000""
```

### Issue: CORS Errors in Browser Console

**Cause:** The browser blocks requests from the frontend domain to the backend.
**Fix:** Since Nginx is proxying the requests, the browser only sees one origin (the ALB). If you are calling the backend directly from JS instead of using relative URLs (`/api/...`), enable CORS in Flask:

```python
from flask_cors import CORS
CORS(app)
```

---

## Phase 11: 11-metrics-server

## Objective

Install the Kubernetes Metrics Server to collect CPU and memory metrics from pods and nodes. This is a strict prerequisite for Horizontal Pod Autoscaling (HPA).

## Architecture

```
Kubelet (on each node)
  ↓ (exposes /metrics/resource)
Metrics Server (Aggregation Layer)
  ↓ (exposes metrics.k8s.io API)
kubectl top / HPA Controller
```

## Commands

### Install Metrics Server

*Note: EKS does not install this by default.*

```bash
kubectl apply -f <https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml>
```

### Verify Installation

```bash
## Wait ~30 seconds for it to collect initial data
kubectl get pods -n kube-system | grep metrics-server

## Test node metrics
kubectl top nodes

## Test pod metrics
kubectl top pods -n shopsphere
```

## Verification

**Expected Output:**

```
NAME                         CPU(cores)   CPU%   MEMORY(bytes)   MEMORY%
ip-10-0-1-100.ec2.internal   150m         7%     1024Mi          26%
ip-10-0-2-100.ec2.internal   120m         6%     950Mi           24%
```

## Troubleshooting

### Issue: `kubectl top` returns `<unknown>`

**Cause:** The Metrics Server hasn't collected data yet, or the API service is not registering.
**Fix:**

```bash
## Check if metrics-server is crashing
kubectl logs -n kube-system deployment/metrics-server

## If you see TLS certificate errors (common in some local clusters, less in EKS),
## you may need to add the --kubelet-insecure-tls flag to the deployment args.
```

---

## Phase 12: 12-horizontal-pod-autoscaler

## Objective

Configure the backend deployment to automatically scale from 1 to 5 replicas based on CPU utilization.

## Architecture

```
HPA Controller
  ↓ (queries every 15s)
Metrics Server
  ↓ (returns current CPU usage)
HPA calculates desired replicas
  ↓
Updates Deployment.replicas
```

## Commands

### Apply HPA and Load Generator

```bash
kubectl apply -f backend/hpa.yaml
kubectl apply -f utils/load-generator.yaml
```

### Watch Scaling in Real-Time

```bash
## Watch HPA metrics
kubectl get hpa -n shopsphere -w

## Watch pods being created
kubectl get pods -n shopsphere -w
```

## Manifests

### Horizontal Pod Autoscaler

```yaml
## backend/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
  namespace: shopsphere
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50 # Target 50% CPU usage
```

### Load Generator Pod

```yaml
## utils/load-generator.yaml
apiVersion: v1
kind: Pod
metadata:
  name: load-generator
  namespace: shopsphere
spec:
  containers:
  - name: busybox
    image: busybox
    command: ["sh", "-c", "while true; do wget -q -O- <http://backend/api/products>; done"]
```

## Verification

```bash
## After a few minutes of load generation, you should see:
kubectl get hpa -n shopsphere
NAME          REFERENCE             TARGETS   MINPODS   MAXPODS   REPLICAS   AGE
backend-hpa   Deployment/backend    75%/50%   1         5         3          5m
```

## Troubleshooting

### Issue: HPA shows `0%/50%` or `<unknown>` and never scales

**Cause:** The target deployment is missing CPU `requests` in its resource limits. HPA calculates utilization as a percentage of the *request*, not the *limit*.
**Fix:** Ensure your backend deployment has:

```yaml
resources:
  requests:
    cpu: "100m" # This is mandatory for HPA
```



```bash
## See exactly what the HPA is calculating
kubectl describe hpa backend-hpa -n shopsphere
```

---

## Phase 13: 13-prometheus-grafana

## Objective

Deploy a production-grade observability stack using the `kube-prometheus-stack` Helm chart to monitor cluster health, node metrics, and application performance.

## Architecture

```
kube-prometheus-stack
├── Prometheus (Time-series DB)
├── Grafana (Visualization)
├── Alertmanager (Alert routing)
├── Node Exporter (DaemonSet for OS metrics)
└── kube-state-metrics (K8s object metrics)
```

## Commands

### Install via Helm

```bash
## Create namespace
kubectl create namespace monitoring

## Add repo and install
helm repo add prometheus-community <https://prometheus-community.github.io/helm-charts>
helm repo update

helm install monitoring prometheus-community/kube-prometheus-stack \
  -n monitoring \
  --set prometheus.prometheusSpec.storageSpec.volumeClaimTemplate.spec.storageClassName=gp3
```

### Access Grafana Temporarily

```bash
## Get auto-generated admin password
kubectl get secret --namespace monitoring monitoring-grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode ; echo

## Port-forward to access locally
kubectl port-forward --namespace monitoring svc/monitoring-grafana 3000:80
## Open <http://localhost:3000> (User: admin, Password: <from above>)
```

## Verification

```bash
## Check all pods are running
kubectl get pods -n monitoring

## Expected:
## monitoring-grafana-xxxxx               3/3     Running
## monitoring-kube-prometheus-operator    1/1     Running
## monitoring-prometheus-xxxxx            2/2     Running
## monitoring-node-exporter-xxxxx         1/1     Running
```

## Screenshots

> 

## Troubleshooting

### Issue: Helm Timeout / Pods stuck in Pending

**Error:** `context deadline exceeded` during `helm install`.
**Events:** `0/2 nodes are available: Too many pods` or `Insufficient memory`.
**Root Cause:** The monitoring stack is resource-heavy. Two `t3.small` nodes (2 vCPU, 2GB RAM) will quickly run out of capacity.
**Resolution:** Scale your EKS Node Group. Change instance type to `t3.medium` or increase the Desired capacity to 3 nodes.

### Issue: Prometheus PVC stuck in Pending

**Cause:** The chart requests persistent storage, but the StorageClass doesn't exist or the EBS CSI driver isn't working.
**Fix:** Ensure Phase 3 (EBS CSI Driver) was completed successfully.

---

## Phase 14: 14-grafana-access-dashboards

## Objective

Expose Grafana to the internet via the AWS Load Balancer and import custom dashboards for the ShopSphere application.

## Architecture

```
Internet → ALB → /grafana path → monitoring namespace → Grafana Service
```

## Commands

### Create Grafana Ingress

```bash
kubectl apply -f monitoring/grafana-ingress.yaml
```

### Import Dashboards

1. Log into Grafana via the ALB URL.
2. Go to **Dashboards → Import**.
3. Import ID `3119` (Kubernetes Cluster Monitoring) or `13332` (Flask/Python metrics).

## Manifests

### Grafana Ingress

*Note: Ingress resources can ONLY reference services within the SAME namespace. Therefore, this must be created in the `monitoring` namespace.*

```yaml
## monitoring/grafana-ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring # MUST be in the monitoring namespace
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTP": 80}]'
    alb.ingress.kubernetes.io/group.name: shopsphere # Groups with main ALB
    alb.ingress.kubernetes.io/group.order: '10'
    alb.ingress.kubernetes.io/rewrite-target: /$2 # Strips /grafana prefix
spec:
  rules:
  - http:
      paths:
      - path: /grafana(/|$)(.*)
        pathType: ImplementationSpecific
        backend:
          service:
            name: monitoring-grafana
            port:
              number: 80
```

### Grafana Helm Values (Root URL fix)

If accessing via a subpath (`/grafana`), Grafana needs to know its root URL to load CSS/JS correctly.

```yaml
## grafana-values.yaml
grafana:
  grafana.ini:
    server:
      root_url: http://<ALB-DNS>/grafana
      serve_from_sub_path: true
```

*Upgrade helm:* `helm upgrade monitoring prometheus-community/kube-prometheus-stack -n monitoring -f grafana-values.yaml`

## Verification

```bash
## Verify Ingress is attached to the ALB
kubectl get ingress -n monitoring

## Test access
curl -I http://<ALB-DNS>/grafana
## Expected: HTTP/1.1 200 OK (or 302 redirect to login)
```

## Screenshots

> 

## Troubleshooting

### Issue: Cross Namespace Service Error

**Error:** `services "monitoring-grafana" not found` when creating Ingress in the `shopsphere` namespace.
**Reason:** Kubernetes Ingress controllers strictly enforce namespace boundaries for backend services.
**Fix:** Create a dedicated Ingress resource in the `monitoring` namespace and use the `alb.ingress.kubernetes.io/group.name` annotation to merge it into the existing ALB.

### Issue: Grafana UI is broken (missing CSS/JS)

**Cause:** Grafana is trying to load assets from the root path `/`, but it's being served under `/grafana`.
**Fix:** Configure `root_url` and `serve_from_sub_path` in the Grafana Helm values (see YAML snippet above).

---

## Phase 15: 15-application-metrics

## Objective

Expose custom application metrics from the Flask backend and configure Prometheus to scrape them using a `ServiceMonitor`, enabling deep observability into application-level performance (e.g., request counts, latency, database query times).

## Architecture

```
Flask App (prometheus_flask_instrumentator)
  ↓ (exposes /metrics endpoint)
Kubernetes Service (backend)
  ↓ (discovered by Prometheus Operator)
ServiceMonitor (Custom Resource)
  ↓ (tells Prometheus how to scrape)
Prometheus Server
  ↓ (stores time-series data)
Grafana Dashboards
```

## Commands

### Update Python Dependencies

Add the metrics library to your backend requirements.

```bash
echo "prometheus-flask-instrumentator==6.1.0" >> backend/requirements.txt
```

### Update Flask Application

Add the instrumentation code to `app.py`.

```python
## backend/app.py (Add to imports and initialization)
from prometheus_flask_instrumentator import Instrumentator

## ... after app = Flask(__name__) ...
Instrumentator().instrument(app).expose(app, endpoint="/metrics")
```

### Deploy and Create ServiceMonitor

```bash
## Rebuild and push the updated backend image
docker build -t shopsphere-backend:v2 ./backend
docker push <ECR-REPO-URI>/shopsphere-backend:v2

## Update the deployment image
kubectl set image deployment/backend backend=<ECR-REPO-URI>/shopsphere-backend:v2 -n shopsphere

## Apply the ServiceMonitor
kubectl apply -f monitoring/service-monitor.yaml
```

## Manifests

### Prometheus ServiceMonitor

*Crucial: The `labels` must match the `serviceMonitorSelector` configured in your `kube-prometheus-stack` Helm release (usually `release: monitoring`).*

```yaml
## monitoring/service-monitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: backend-monitor
  namespace: shopsphere
  labels:
    release: monitoring # Must match Prometheus selector!
spec:
  selector:
    matchLabels:
      app: backend
  endpoints:
  - port: http
    path: /metrics
    interval: 15s
```

## Verification

```bash
## 1. Verify the /metrics endpoint is working
kubectl port-forward -n shopsphere svc/backend 5000:5000
curl <http://localhost:5000/metrics>
## Expected: Prometheus text format metrics (e.g., http_requests_total)

## 2. Verify Prometheus is scraping the target
kubectl port-forward -n monitoring svc/monitoring-kube-prometheus-prometheus 9090:9090
## Open <http://localhost:9090/targets>
## Look for "shopsphere/backend-monitor" with State: UP
```

## Screenshots

> 

## Troubleshooting

### Issue: Target shows "DOWN" in Prometheus

**Cause:** The `ServiceMonitor` labels don't match the Prometheus Operator's selector, or the port name in the ServiceMonitor (`http`) doesn't exactly match the port name in the Kubernetes Service.
**Fix:** Ensure your backend Service has `name: http` for port 5000, and the ServiceMonitor uses `port: http`.

---

## Phase 16: 16-advanced-autoscaling-karpenter

## Objective

Implement Karpenter to automatically provision and terminate EC2 instances based on pending pod demands, replacing or complementing the legacy Cluster Autoscaler with faster, more cost-effective node scaling.

## Architecture

```
Pending Pods (e.g., from HPA)
  ↓
Karpenter Controller (watches unschedulable pods)
  ↓
Evaluates NodePool & EC2NodeClass
  ↓
EC2 Fleet API (provisions exact instance type needed)
  ↓
Node joins cluster, Pod is scheduled
```

## Commands

### Prerequisites: IAM Roles

Karpenter requires an IAM role for the nodes it launches and an IRSA for the controller.

```bash
## Create Karpenter Node IAM Role (via eksctl or CloudFormation)
## Note: Refer to Karpenter docs for the exact CloudFormation template URL for your EKS version.

## Create IRSA for Karpenter Controller
eksctl create iamserviceaccount \
  --cluster shopsphere \
  --name karpenter \
  --namespace karpenter \
  --role-name KarpenterControllerRole-shopsphere \
  --attach-policy-arn arn:aws:iam::123456789012:policy/KarpenterControllerPolicy \
  --approve
```

### Install Karpenter via Helm

```bash
helm repo add karpenter <https://charts.karpenter.sh>
helm repo update

helm upgrade --install karpenter karpenter/karpenter \
  --namespace karpenter --create-namespace \
  --set settings.clusterName=shopsphere \
  --set settings.clusterEndpoint=$(aws eks describe-cluster --name shopsphere --query "cluster.endpoint" --output text) \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::123456789012:role/KarpenterControllerRole-shopsphere \
  --wait
```

## Manifests

### EC2NodeClass (AWS Specific Configuration)

```yaml
## karpenter/ec2-node-class.yaml
apiVersion: karpenter.k8s.aws/v1beta1
kind: EC2NodeClass
metadata:
  name: default
spec:
  amiFamily: AL2
  role: "KarpenterNodeRole-shopsphere" # The IAM role for the EC2 instances
  subnetSelectorTerms:
    - tags:
        karpenter.sh/discovery: shopsphere # Tag your private subnets with this!
  securityGroupSelectorTerms:
    - tags:
        karpenter.sh/discovery: shopsphere # Tag your node SG with this!
  instanceProfile: "KarpenterNodeInstanceProfile-shopsphere" # If not using role directly
  tags:
    karpenter.sh/discovery: shopsphere
```

### NodePool (Generic Kubernetes Constraints)

```yaml
## karpenter/node-pool.yaml
apiVersion: karpenter.sh/v1beta1
kind: NodePool
metadata:
  name: default
spec:
  template:
    spec:
      requirements:
        - key: kubernetes.io/arch
          operator: In
          values: ["amd64"]
        - key: kubernetes.io/os
          operator: In
          values: ["linux"]
        - key: karpenter.sh/capacity-type
          operator: In
          values: ["on-demand"] # Change to "spot" for cost savings
        - key: karpenter.k8s.aws/instance-category
          operator: In
          values: ["c", "m", "r"]
        - key: karpenter.k8s.aws/instance-generation
          operator: Gt
          values: ["2"]
      nodeClassRef:
        name: default
  limits:
    cpu: 1000 # Max CPU across all Karpenter nodes
  disruption:
    consolidationPolicy: WhenUnderutilized
    expireAfter: 720h # 30 days
```

## Verification

```bash
## 1. Apply the Karpenter resources
kubectl apply -f karpenter/ec2-node-class.yaml
kubectl apply -f karpenter/node-pool.yaml

## 2. Create a dummy deployment that requires more CPU than currently available
kubectl run stress-test --image=nginx --requests='cpu=5' -n shopsphere

## 3. Watch Karpenter provision a node
kubectl logs -n karpenter -l app.kubernetes.io/name=karpenter -f
## Expected: "Launching node with instance type m5.xlarge..."

kubectl get nodes -w
```

## Troubleshooting

### Issue: Karpenter fails to launch instances

**Cause:** Subnets or Security Groups are not tagged with `karpenter.sh/discovery: shopsphere`, or the Node IAM role lacks permissions to join the EKS cluster.
**Fix:** Verify AWS tags and ensure the `aws-auth` ConfigMap includes the Karpenter Node IAM role.

---

## Phase 17: 17-gitops-argocd

## Objective

Transition from imperative `kubectl apply` to declarative GitOps using ArgoCD, ensuring the cluster state always matches the manifests stored in a Git repository.

## Architecture

```
Git Repository (Source of Truth)
  ↓ (Polls / Webhooks)
ArgoCD (Continuous Delivery Tool)
  ↓ (Syncs state)
Kubernetes Cluster ( shopsphere namespace )
```

## Commands

### Install ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f <https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml>

## Expose ArgoCD UI via LoadBalancer
kubectl patch svc argocd-server -n argocd -p '{"spec": {"type": "LoadBalancer"}}'

## Get initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d; echo
```

### Create ArgoCD Application

```bash
kubectl apply -f argocd/application.yaml
```

## Manifests

### ArgoCD Application Manifest

```yaml
## argocd/application.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: shopsphere
  namespace: argocd
spec:
  project: default
  source:
    repoURL: '<https://github.com/your-username/shopsphere-gitops.git>'
    targetRevision: HEAD
    path: k8s-manifests # Folder in your repo containing the YAMLs
  destination:
    server: '<https://kubernetes.default.svc>'
    namespace: shopsphere
  syncPolicy:
    automated:
      prune: true      # Delete resources not in Git
      selfHeal: true   # Revert manual kubectl changes
    syncOptions:
    - CreateNamespace=true
```

## Verification

1. Access the ArgoCD UI via the LoadBalancer DNS.
2. Log in with `admin` and the decoded password.
3. Verify the `shopsphere` app shows a **Healthy** and **Synced** status (Green).
4. Manually delete a pod using `kubectl delete pod ...` and watch ArgoCD automatically recreate it within seconds (Self-Healing).

## Screenshots

> 

---

## Phase 18: 18-dns-tls-automation

## Objective

Automate DNS record creation using ExternalDNS and provision free SSL/TLS certificates using cert-manager with Let's Encrypt.

## Architecture

```
ExternalDNS: Watches Ingress → Updates Route53 A/CNAME records
cert-manager: Watches Ingress annotations → Solves ACME challenge → Creates K8s TLS Secret
```

## Commands

### Install ExternalDNS

```bash
## Create IAM Role for ExternalDNS (Route53 permissions)
eksctl create iamserviceaccount \
  --name external-dns \
  --namespace external-dns \
  --cluster shopsphere \
  --attach-policy-arn arn:aws:iam::123456789012:policy/ExternalDNSPolicy \
  --approve

helm repo add external-dns <https://kubernetes-sigs.github.io/external-dns/>
helm install external-dns external-dns/external-dns \
  --namespace external-dns --create-namespace \
  --set provider=aws \
  --set policy=sync \
  --set txtOwnerId=shopsphere \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::123456789012:role/ExternalDNSRole
```

### Install cert-manager

```bash
helm repo add jetstack <https://charts.jetstack.io>
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set installCRDs=true
```

## Manifests

### Let's Encrypt ClusterIssuer

```yaml
## monitoring/cluster-issuer.yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: <https://acme-v02.api.letsencrypt.org/directory>
    email: admin@shopsphere.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: alb
```

### Updated Ingress with TLS

```yaml
## ingress.yaml (Updated)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: shopsphere-ingress
  namespace: shopsphere
  annotations:
    kubernetes.io/ingress.class: alb
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    cert-manager.io/cluster-issuer: "letsencrypt-prod" # Triggers cert-manager
spec:
  tls:
  - hosts:
    - shopsphere.yourdomain.com
    secretName: shopsphere-tls # cert-manager will create this secret
  rules:
  - host: shopsphere.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

## Verification

```bash
## Check Certificate status
kubectl get certificates -n shopsphere
## Expected: READY = True

## Check DNS record
dig shopsphere.yourdomain.com +short
## Expected: Returns the ALB DNS name

## Test HTTPS
curl -I <https://shopsphere.yourdomain.com>
## Expected: HTTP/2 200, valid Let's Encrypt certificate
```

## Troubleshooting

### Issue: Certificate stays in "Ready: False"

**Cause:** The HTTP01 challenge fails because the ALB isn't routing the `.well-known/acme-challenge` path correctly, or ExternalDNS hasn't propagated the DNS record yet.
**Fix:** Check `kubectl describe certificate shopsphere-tls`. Ensure DNS has propagated (can take up to 5 mins).

---

## Phase 19: 19-security-secrets

## Objective

Eliminate base64-encoded Kubernetes Secrets from Git by integrating the Secrets Store CSI Driver with AWS Secrets Manager, mounting secrets directly as volumes in pods.

## Architecture

```
AWS Secrets Manager (Source of Truth for Secrets)
  ↓ (API Call)
Secrets Store CSI Driver (Runs on Node)
  ↓ (Mounts as in-memory tmpfs volume)
Pod (/mnt/secrets/db-password)
```

## Commands

### Install Secrets Store CSI Driver & AWS Provider

```bash
helm repo add secrets-store-csi-driver <https://kubernetes-sigs.github.io/secrets-store-csi-driver/charts>
helm install csi-secrets-store secrets-store-csi-driver/secrets-store-csi-driver \
  --namespace kube-system

## Install AWS Provider
helm repo add aws-secrets-provider <https://aws.github.io/secrets-store-csi-driver-provider-aws>
helm install secrets-provider-aws aws-secrets-provider/aws-secrets-provider \
  --namespace kube-system
```

### Create IAM Role for Pod

```bash
eksctl create iamserviceaccount \
  --name backend-sa \
  --namespace shopsphere \
  --cluster shopsphere \
  --attach-policy-arn arn:aws:iam::123456789012:policy/SecretsManagerReadPolicy \
  --approve
```

## Manifests

### SecretProviderClass

```yaml
## shopsphere/secret-provider-class.yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: backend-aws-secrets
  namespace: shopsphere
spec:
  provider: aws
  parameters:
    objects: |
      - objectName: "shopsphere/prod/db-password" # ARN or name in AWS Secrets Manager
        objectType: "secretsmanager"
        jmesPath:
            - path: password
              objectAlias: db_password
  secretObjects:
  - data:
    - key: db_password
      objectName: db_password
    secretName: db-secret-synced # Optional: syncs to a K8s secret for env vars
    type: Opaque
```

### Updated Backend Deployment

```yaml
## shopsphere/backend-deployment.yaml (Snippet)
spec:
  template:
    spec:
      serviceAccountName: backend-sa # Must use the IRSA service account
      containers:
      - name: backend
        image: shopsphere-backend:latest
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret-synced
              key: db_password
        volumeMounts:
        - name: secrets-store
          mountPath: "/mnt/secrets"
          readOnly: true
      volumes:
      - name: secrets-store
        csi:
          driver: secrets-store.csi.k8s.io
          readOnly: true
          volumeAttributes:
            secretProviderClass: "backend-aws-secrets"
```

## Verification

```bash
## 1. Exec into the backend pod
kubectl exec -it -n shopsphere deployment/backend -- bash

## 2. Verify the secret is mounted as a file
cat /mnt/secrets/db_password
## Expected: The actual plain-text password from AWS Secrets Manager

## 3. Verify the environment variable is populated
echo $DB_PASSWORD
```

## Screenshots

> 

## Troubleshooting

### Issue: Pod stuck in ContainerCreating / MountVolume.SetUp failed

**Cause:** The Service Account lacks the IAM permissions to read the specific secret in AWS Secrets Manager, or the CSI driver isn't running on the node.
**Fix:** Verify the IRSA role trust policy and the attached IAM policy allows `secretsmanager:GetSecretValue`. Check `kubectl describe pod` for the exact CSI error.

---
---

# eks-storage-ebs-efs-s3.md

---
title: "Amazon EKS Storage: EBS, EFS, and S3"
description: "Daily playbook for persistent storage on Amazon EKS: pick EBS vs EFS vs S3, install CSI add-ons, copy-paste StorageClass/PVC/PV, and avoid common bind and permission failures."
tags:
  - eks
  - ebs
  - efs
  - s3
  - csi
  - storageclass
  - pvc
  - kubernetes
  - notes
date: 2026-09-06
links:
  - title: EBS CSI on EKS
    url: https://docs.aws.amazon.com/eks/latest/userguide/ebs-csi.html
  - title: EFS CSI on EKS
    url: https://docs.aws.amazon.com/eks/latest/userguide/efs-csi.html
  - title: Mountpoint for Amazon S3 CSI
    url: https://docs.aws.amazon.com/eks/latest/userguide/s3-csi.html
  - title: EFS CSI access-point examples
    url: https://github.com/kubernetes-sigs/aws-efs-csi-driver/blob/master/examples/kubernetes/access_points/README.md
---

# EKS storage guide

Pick storage from the workload, then run the matching CSI path. Do not mix patterns on the same PVC (dynamic EFS access points vs a pre-created access point).

| Need | Use | Access mode | Typical cost shape |
| --- | --- | --- | --- |
| Database, Prometheus, one-pod disk, AZ-local IOPS | **Amazon EBS** (`gp3`) | `ReadWriteOnce` | GiB-month + provisioned IOPS/throughput. Cheapest for exclusive block. |
| Shared POSIX files, multi-AZ, multi-pod write | **Amazon EFS** | `ReadWriteMany` | GiB-month by class (Standard / IA / Archive) + throughput. Elastic; no volume size to manage. |
| App talks S3 API (SDK, AWS CLI) | **S3 + Pod Identity** | n/a (no PVC) | Storage class + request/data transfer. Prefer this over a mount when the app already uses objects. |
| Legacy app needs a path like `/data` on a bucket | **Mountpoint for Amazon S3 CSI** | `ReadWriteMany` (static PV) | Same S3 charges; extra GET/PUT from file-style access. Not POSIX. No Fargate. |

Encrypt at rest (EBS `encrypted: "true"`, EFS encryption on create, S3 default encryption / KMS). Encrypt in transit (EFS TLS via CSI; S3 HTTPS). Scope IAM to one bucket or one access-point ARN. Turn on CloudWatch metrics for the CSI controllers and CloudTrail data events for S3 / EFS when you need an audit trail.

**Cluster notes**

- EKS Auto Mode uses provisioner `ebs.csi.eks.amazonaws.com`, not `ebs.csi.aws.com`.
- Fargate: no EBS; EFS static PV only (no dynamic EFS provisioning); no Mountpoint S3 CSI.
- Hybrid Nodes: EBS / EFS / Mountpoint CSI not supported.

<details>
<summary>Cluster env + Pod Identity trust JSON</summary>

```bash
export AWS_REGION=<region>
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export EKS_CLUSTER_NAME=<cluster>
aws eks update-kubeconfig --name "$EKS_CLUSTER_NAME" --region "$AWS_REGION"
```

Reuse this trust for CSI roles and app roles:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowEksAuthToAssumeRoleForPodIdentity",
      "Effect": "Allow",
      "Principal": { "Service": "pods.eks.amazonaws.com" },
      "Action": ["sts:AssumeRole", "sts:TagSession"]
    }
  ]
}
```

</details>

---

## 1. Amazon EBS (block, one node)

Install add-on `aws-ebs-csi-driver`. Controller SA: `kube-system/ebs-csi-controller-sa`. Attach `arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicyV2` (or `AmazonEBSCSIDriverPolicy` on older setups). Custom KMS keys need extra `kms:*` on that key.

`WaitForFirstConsumer` creates the volume in the AZ of the scheduled pod. Skip it → PVC in AZ-a, pod on AZ-b → attach fail.

PVC `Pending` + `UnauthorizedOperation` on EC2 → CSI role missing. Volume stuck across nodes → RWO + two pods; use EFS or one replica.

<details>
<summary>StorageClass + PVC (`gp3`, encrypted)</summary>

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  encrypted: "true"
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-pvc
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: ebs-sc
  resources:
    requests:
      storage: 4Gi
```

</details>

<details>
<summary>Smoke-test pod</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ebs-test-app
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo hello from EBS > /data/out.txt && sleep 3600"]
      volumeMounts:
        - mountPath: /data
          name: my-volume
  volumes:
    - name: my-volume
      persistentVolumeClaim:
        claimName: my-app-pvc
```

```bash
kubectl apply -f storageclass.yaml -f pvc.yaml -f pod.yaml
kubectl get pvc,pv,pod
kubectl exec ebs-test-app -- cat /data/out.txt
```

</details>

---

## 2. Amazon EFS (NFS, shared)

### Network

Mount-target SG: inbound TCP **2049** from the node (or pod) SG. Node SG: outbound TCP 2049 to the mount-target SG. Timeout on mount almost always this. Regional EFS: mount target in every AZ you run nodes.

<details>
<summary>Allow NFS from node SG</summary>

```bash
aws ec2 authorize-security-group-ingress \
  --group-id <efs_sg_id> \
  --protocol tcp --port 2049 \
  --source-group <node_sg_id>
```

</details>

### Driver

Add-on: Amazon EFS CSI driver. Controller SA: `kube-system/efs-csi-controller-sa`. Managed policy: `arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy`. Then install / update the add-on (console or `aws eks create-addon`).

<details>
<summary>Pod Identity for EFS CSI</summary>

```bash
aws iam create-role --role-name AmazonEKS_EFS_CSI_DriverRole \
  --assume-role-policy-document file://eks-pod-identity-trust-relationship.json

aws iam attach-role-policy --role-name AmazonEKS_EFS_CSI_DriverRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonEFSCSIDriverPolicy

aws eks create-pod-identity-association \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_EFS_CSI_DriverRole" \
  --namespace kube-system \
  --service-account efs-csi-controller-sa
```

</details>

### Dynamic access points (dev / one PVC lifecycle)

CSI creates an access point per PVC. EFS size on the PVC is ignored for capacity (NFS is elastic); keep a dummy request so the object is valid.

`directoryPerms` (access-point root): `700` default (one app); `750` sidecar other UID same GID read; `755` shared read; `777` lab only.

<details>
<summary>directoryPerms cheat sheet</summary>

| Mode | When |
| --- | --- |
| `700` | Default. One app owns the tree. |
| `750` | Sidecar other UID, same GID, read-only. |
| `755` | Shared read, no extra writers. |
| `777` | Lab only. Never prod. |

</details>

<details>
<summary>StorageClass + PVC (`efs-ap`)</summary>

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
parameters:
  provisioningMode: efs-ap
  fileSystemId: <EFS_ID>
  directoryPerms: "700"
```

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-efs-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
```

</details>

<details>
<summary>Writer / reader smoke test</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: efs-writer
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo hello from pod A > /data/shared.txt && sleep 3600"]
      volumeMounts:
        - mountPath: /data
          name: efs-vol
  volumes:
    - name: efs-vol
      persistentVolumeClaim:
        claimName: my-efs-pvc
---
apiVersion: v1
kind: Pod
metadata:
  name: efs-reader
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - mountPath: /data
          name: efs-vol
  volumes:
    - name: efs-vol
      persistentVolumeClaim:
        claimName: my-efs-pvc
```

```bash
kubectl apply -f storageclass-efs.yaml -f pvc-efs.yaml -f pods-efs.yaml
kubectl exec efs-reader -- cat /data/shared.txt
```

</details>

### POSIX: StorageClass `uid`/`gid` vs pod `securityContext`

EFS access points **enforce identity**. NFS client UID/GID is replaced by the access-point user for file operations. Dynamic `efs-ap` does **not** honor Kubernetes `fsGroup` the way EBS does (driver will not chown the AP root; that would break the AP).

Set `uid`/`gid` on the StorageClass when the process must own files as a known UID. Match `runAsUser` / `runAsGroup` / `fsGroup` on the pod so local tools agree. `fsGroup` still helps **ephemeral** files; it is not the EFS AP source of truth.

Omit `uid`/`gid` → driver picks from `gidRangeStart` / `gidRangeEnd`. Need no identity enforcement → static provision without an access point.

<details>
<summary>Fixed uid/gid on StorageClass</summary>

```yaml
parameters:
  provisioningMode: efs-ap
  fileSystemId: <EFS_ID>
  directoryPerms: "750"
  uid: "1000"
  gid: "1000"
```

</details>

<details>
<summary>Pod `securityContext` sample</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: efs-posix-app
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
    fsGroupChangePolicy: OnRootMismatch
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "id; echo posix-ok > /data/out.txt && sleep 3600"]
      securityContext:
        allowPrivilegeEscalation: false
      volumeMounts:
        - name: efs-vol
          mountPath: /data
  volumes:
    - name: efs-vol
      persistentVolumeClaim:
        claimName: my-efs-pvc
```

</details>

### Static: existing access point (prod / multi-tenant)

Create the access point in AWS (Terraform/CLI). Point a **PersistentVolume** at `FileSystemId::AccessPointId` (double colon required; middle field is optional subpath). Reclaim `Retain`.

Do **not** use StorageClass `efs-sc` with `provisioningMode: efs-ap` for this PVC - that class creates a **new** AP. Use a class with no `efs-ap` parameters and bind with `volumeName`. Skip `volumeName` on a dynamic class → new AP, not yours.

Tighten IAM with `elasticfilesystem:AccessPointArn` when apps share one filesystem.

- Dynamic AP → lab, one app owns PVC lifecycle.
- Static AP → prod isolation, `Retain`, shared FS, IAM scoped to one AP.

<details>
<summary>Static SC + PV + PVC (existing AP)</summary>

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: efs-static
provisioner: efs.csi.aws.com
---
apiVersion: v1
kind: PersistentVolume
metadata:
  name: efs-pv-static
spec:
  capacity:
    storage: 5Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany
  persistentVolumeReclaimPolicy: Retain
  storageClassName: efs-static
  csi:
    driver: efs.csi.aws.com
    volumeHandle: ${EFS_ID}::${EFS_AP_ID}
    volumeAttributes:
      encryptInTransit: "true"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: efs-pvc-static
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-static
  volumeName: efs-pv-static
  resources:
    requests:
      storage: 5Gi
```

</details>

---

## 3. Amazon S3 API from a pod (no mount)

Prefer this when the workload uses the AWS SDK. Bind Pod Identity to the **app** service account (not the CSI SA). Pod must set `serviceAccountName: my-app-sa`. Block instance metadata if nodes still expose broad IAM.

<details>
<summary>App policy + Pod Identity association</summary>

```bash
cat > s3-app-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>"]
    },
    {
      "Sid": "ObjectRW",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload", "s3:DeleteObject"],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>/*"]
    }
  ]
}
EOF

aws iam create-policy --policy-name MyAppS3Policy --policy-document file://s3-app-policy.json

aws iam create-role --role-name MyAppS3Role \
  --assume-role-policy-document file://eks-pod-identity-trust-relationship.json

aws iam attach-role-policy --role-name MyAppS3Role \
  --policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/MyAppS3Policy"

aws eks create-pod-identity-association \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/MyAppS3Role" \
  --namespace default \
  --service-account my-app-sa
```

</details>

---

## 4. Mountpoint for Amazon S3 CSI (bucket as a path)

Add-on: `aws-mountpoint-s3-csi-driver`. SA: `kube-system/s3-csi-driver-sa`. **Static provisioning only** (existing bucket). Capacity on PV/PVC is required by Kubernetes and **ignored** by S3. Not full POSIX. `allow-delete` only if the app must unlink files.

IAM is a **customer** policy (commonly `AmazonS3CSIDriverPolicy`), not the EFS/EBS AWS-managed CSI policies.

Empty `storageClassName` disables dynamic provision. `volumeHandle` must be unique per PV if you mount multiple buckets.

Console: IAM role trusted by `pods.eks.amazonaws.com` → EKS **Access** → Pod Identity → role + `kube-system` + `s3-csi-driver-sa`.

<details>
<summary>CSI IAM policy + role + add-on</summary>

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "MountpointFullBucketAccess",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>"]
    },
    {
      "Sid": "MountpointFullObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:DeleteObject"
      ],
      "Resource": ["arn:aws:s3:::my-eks-app-bucket-<unique-suffix>/*"]
    }
  ]
}
```

```bash
aws iam create-policy --policy-name AmazonS3CSIDriverPolicy \
  --policy-document file://s3-csi-policy.json

aws iam create-role --role-name AmazonEKS_S3_CSI_DriverRole \
  --assume-role-policy-document file://eks-pod-identity-trust-relationship.json

aws iam attach-role-policy --role-name AmazonEKS_S3_CSI_DriverRole \
  --policy-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:policy/AmazonS3CSIDriverPolicy"

aws eks create-pod-identity-association \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_S3_CSI_DriverRole" \
  --namespace kube-system \
  --service-account s3-csi-driver-sa

aws eks create-addon \
  --cluster-name "$EKS_CLUSTER_NAME" \
  --addon-name aws-mountpoint-s3-csi-driver \
  --service-account-role-arn "arn:aws:iam::${AWS_ACCOUNT_ID}:role/AmazonEKS_S3_CSI_DriverRole"
```

</details>

<details>
<summary>Static PV + PVC</summary>

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: s3-pv
spec:
  capacity:
    storage: 100Gi
  accessModes:
    - ReadWriteMany
  storageClassName: ""
  claimRef:
    namespace: default
    name: s3-pvc
  mountOptions:
    - allow-delete
    - region us-east-1
  csi:
    driver: s3.csi.aws.com
    volumeHandle: s3-csi-driver-volume
    volumeAttributes:
      bucketName: my-eks-app-bucket-<unique-suffix>
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: s3-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: ""
  resources:
    requests:
      storage: 100Gi
  volumeName: s3-pv
```

</details>

<details>
<summary>Smoke-test pod</summary>

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: s3-mount-test
spec:
  containers:
    - name: app
      image: busybox
      command: ["sh", "-c", "echo hello from mountpoint > /data/mnt-test.txt && sleep 3600"]
      volumeMounts:
        - name: s3-vol
          mountPath: /data
  volumes:
    - name: s3-vol
      persistentVolumeClaim:
        claimName: s3-pvc
```

```bash
kubectl apply -f s3-pv-pvc.yaml -f s3-pod.yaml
kubectl exec s3-mount-test -- cat /data/mnt-test.txt
aws s3 ls s3://my-eks-app-bucket-<unique-suffix>/
```

</details>

---

## 5. Daily checks

| Symptom | First look |
| --- | --- |
| PVC Pending, no volume | CSI add-on / IAM; EBS Auto Mode provisioner mismatch |
| EBS attach timeout | AZ mismatch; missing `WaitForFirstConsumer` |
| EFS mount hang | SG 2049 both directions; no mount target in node AZ |
| EFS Permission denied | AP `uid`/`gid` vs image user; `directoryPerms`; IAM on FS |
| S3 mount fail | Driver SA policy vs bucket; region mount option; POSIX expectation |

Pricing: [EBS](https://aws.amazon.com/ebs/pricing/) · [EFS](https://aws.amazon.com/efs/pricing/) · [S3](https://aws.amazon.com/s3/pricing/)

<details>
<summary>kubectl debug commands</summary>

```bash
kubectl get sc,pvc,pv
kubectl describe pvc <name>
kubectl -n kube-system get pods | grep -E 'ebs-csi|efs-csi|s3-csi|mountpoint'
kubectl -n kube-system logs deploy/ebs-csi-controller --tail=50
```

</details>

---

# eks-vpc-lattice-gateway-api.md

---
title: "VPC Lattice on EKS with Gateway API"
description: "Install AWS Gateway API Controller, service network association, Gateway + HTTPRoute + TargetGroupPolicy for VPC Lattice."
tags:
  - vpc-lattice
  - eks
  - gateway-api
  - networking
  - aws
  - notes
date: 2026-09-05
resources:
  - title: Controller installation (EKS)
    url: https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/
  - title: Getting started (single cluster)
    url: https://www.gateway-api-controller.eks.aws.dev/latest/guides/getstarted/
---

Gateway API objects → **Amazon VPC Lattice Gateway API Controller** → Lattice services and target groups.

**Order:** kubeconfig → Lattice prefix-list SG rules → IAM (Pod Identity or IRSA) → Gateway API CRDs → Helm controller → **service network + VPC association** → GatewayClass → Gateway → workload + HTTPRoute → TargetGroupPolicy → verify Lattice DNS.

Pair with the app lab: [VPC Lattice application networking](/aws-vpc-lattice-application-networking/) (service network name **`lattice-sn`**). This page uses the same network name so EKS inventory shares the network with ECS/EC2 services.

Official walkthrough: [Getting started](https://www.gateway-api-controller.eks.aws.dev/latest/guides/getstarted/) (upstream examples use service network **`my-hotel`** — name is arbitrary).

---

## 1. Cluster context and Lattice security groups

```bash
export AWS_REGION=<eks_cluster_region>
export EKS_CLUSTER_NAME=<EKS_CLUSTER_NAME>

aws eks update-kubeconfig --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}"
eksctl utils associate-iam-oidc-provider --cluster "${EKS_CLUSTER_NAME}" --approve --region "${AWS_REGION}"
```

Allow **inbound from VPC Lattice managed prefix lists** on the security group that protects your **pod ENIs** (often the cluster security group or a custom node group SG). Without this, targets stay unhealthy or connections time out.

```bash
CLUSTER_SG=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --output json | jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=-1" 2>/dev/null || true

PREFIX_LIST_ID_IPV6=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.ipv6.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID_IPV6}}],IpProtocol=-1" 2>/dev/null || true
```

Also allow **TCP 8080** (app port) from the IPv4 prefix list on the same SG if your lab apps listen on 8080. See [Allow traffic from Amazon VPC Lattice](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#allow-traffic-from-amazon-vpc-lattice).

**Controller IAM:** create `VPCLatticeControllerIAMPolicy` from [recommended-inline-policy.json](https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json), namespace `aws-application-networking-system`, then **EKS Pod Identity** (recommended) or **IRSA** for ServiceAccount `gateway-api-controller`. Follow [Set up IAM permissions](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#set-up-iam-permissions) through namespace + role binding. Skipping IAM → controller pods crash on Lattice API calls.

---

## 2. Gateway API CRDs

Pin a release from [Gateway API releases](https://github.com/kubernetes-sigs/gateway-api/releases). Match a version compatible with your controller chart (see deploy guide).

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## 3. Install the controller (Helm)

Chart version: use the value in [Install the controller](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#install-the-controller) (currently **v2.1.3**). Set `serviceAccount.create=false` because the SA already exists from Pod Identity / IRSA.

On **Amazon EKS**, the chart reads account, Region, VPC, and cluster name from the control plane — **do not** pass empty `clusterVpcId` / `awsAccountId` placeholders.

```bash
aws ecr-public get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --set serviceAccount.create=false \
  --set log.level=info

kubectl get pods -n aws-application-networking-system
```

<details>
<summary>Self-hosted Kubernetes (not EKS)</summary>

When the controller is not on EKS, set Helm values explicitly: `clusterVpcId`, `awsAccountId`, `awsRegion`, `clusterName`. See [Environment variables](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/#environment-variables) in the deploy guide.

</details>

---

## 4. GatewayClass

`GatewayClass` tells Kubernetes **which controller** owns Gateways of that class. Your `Gateway` must set `spec.gatewayClassName: amazon-vpc-lattice` to match this object.

Apply the manifest from the controller repo (after Helm pods are running):

```bash
kubectl apply -f https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/gatewayclass.yaml
```

Same content (cluster-scoped — no namespace):

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: amazon-vpc-lattice
spec:
  controllerName: application-networking.k8s.aws/gateway-api-controller
```

Verify the class exists and is accepted:

```bash
kubectl get gatewayclass amazon-vpc-lattice
kubectl describe gatewayclass amazon-vpc-lattice
```

`controllerName` must match the running controller. If `GatewayClass` is missing, `kubectl apply` on a `Gateway` succeeds but status stays unprogrammed and no Lattice resources are created.

Upstream file may still use `apiVersion: gateway.networking.k8s.io/v1beta1`; either `v1` or `v1beta1` is fine once Gateway API CRDs are installed.

---

## 5. Service network (required)

The controller attaches new Gateways to a **VPC Lattice service network**. Create the network (once per Region/account lab) and associate the **EKS cluster VPC**.

If you already created **`lattice-sn`** in [application networking](/aws-vpc-lattice-application-networking/#2-service-network), reuse it. Otherwise:

```bash
export SERVICE_NETWORK_NAME=lattice-sn

aws vpc-lattice create-service-network --name "${SERVICE_NETWORK_NAME}" --region "${AWS_REGION}" 2>/dev/null || true

SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --region "${AWS_REGION}" \
  --query "items[?name=='${SERVICE_NETWORK_NAME}'].id" --output text)

CLUSTER_VPC_ID=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

aws vpc-lattice create-service-network-vpc-association \
  --region "${AWS_REGION}" \
  --service-network-identifier "${SERVICE_NETWORK_ID}" \
  --vpc-identifier "${CLUSTER_VPC_ID}"
```

Wait until association status is **ACTIVE**:

```bash
aws vpc-lattice list-service-network-vpc-associations \
  --region "${AWS_REGION}" \
  --vpc-id "${CLUSTER_VPC_ID}"
```

Tell the controller which service network to use (Helm):

```bash
helm upgrade gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --reuse-values \
  --namespace aws-application-networking-system \
  --set defaultServiceNetwork="${SERVICE_NETWORK_NAME}"
```

---

## 6. Gateway

Create namespace `networking` (optional; keeps Gateway separate from app namespaces):

```bash
kubectl create namespace networking
```

Minimal Gateway (matches [upstream `my-hotel-gateway.yaml`](https://github.com/aws/aws-application-networking-k8s/blob/main/files/examples/my-hotel-gateway.yaml)). Custom `hostname` and cross-namespace routes are optional — see collapsible note below.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: lattice-gateway
  namespace: networking
spec:
  gatewayClassName: amazon-vpc-lattice
  listeners:
    - name: http
      protocol: HTTP
      port: 80
      allowedRoutes:
        namespaces:
          from: All
```

```bash
kubectl apply -f lattice-gateway.yaml
kubectl get gateway -n networking
```

`PROGRAMMED=True` in status when the controller has linked the Gateway to Lattice.

<details>
<summary>hostname vs allowedRoutes (custom domains)</summary>

| Field | Filters |
| --- | --- |
| `listeners[].hostname` | Request `Host` header |
| `allowedRoutes.namespaces.from` | Which namespaces may attach an HTTPRoute |

`from`: `Same` (Gateway ns only), `All`, or `Selector`.

For a custom domain, Gateway listener `hostname` and HTTPRoute `hostnames` must **overlap** or the route is not accepted (`Accepted=False`).

</details>

---

## 7. Workload (inventory lab)

Deploy the sample app from the repo (Service port **80** → pod **8080**, health **`GET /health`**):

1. Build/push [`eks-inventory-service/Dockerfile`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/Dockerfile) to ECR.
2. Edit [`eks-inventory-service/k8s/deployment.yaml`](./dir/vpc/vpc-lattice-networking/eks-inventory-service/k8s/deployment.yaml) (`REPLACE_WITH_ECR_IMAGE`).
3. Create namespace and apply:

```bash
kubectl create namespace inventory
kubectl apply -n inventory -f deployment.yaml
```

---

## 8. HTTPRoute

Example route to **`inventory-service`** on path prefix **`/inventory`** (matches the lab app).

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: inventory-route
  namespace: inventory
spec:
  parentRefs:
    - name: lattice-gateway
      namespace: networking
      sectionName: http
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /inventory
      backendRefs:
        - name: inventory-service
          port: 80
```

<details>
<summary>parentRefs, hostnames, backendRefs</summary>

- **parentRefs** — Gateway name; `sectionName` binds listener `http`. Cross-namespace attach requires Gateway `allowedRoutes.namespaces.from: All`.
- **hostnames** — optional; must overlap Gateway listener hostname when both are set.
- **backendRefs** — Kubernetes Service name and **Service port** (80 here, not 8080).

</details>

---

## 9. TargetGroupPolicy

Attach to the **Service**, not the HTTPRoute. Health check must hit the **pod** path and port the app exposes.

```yaml
apiVersion: application-networking.k8s.aws/v1alpha1
kind: TargetGroupPolicy
metadata:
  name: inventory-policy
  namespace: inventory
spec:
  targetRef:
    group: ""
    kind: Service
    name: inventory-service
  protocol: HTTP
  protocolVersion: HTTP1
  healthCheck:
    enabled: true
    path: /health
    port: 8080
    intervalSeconds: 30
    healthyThresholdCount: 3
    unhealthyThresholdCount: 3
```

Wrong `healthCheck.path` (for example `/healthz`) → targets **unhealthy** → no traffic even when DNS resolves.

---

## 10. Verify

```bash
kubectl get httproute -n inventory
kubectl get httproute inventory-route -n inventory -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}{"\n"}'
```

Call the Lattice-assigned hostname from a client in a VPC associated with **`lattice-sn`** (HTTP **80**, path **`/inventory/...`**):

```bash
curl -s "http://${LATTICE_FQDN}/inventory/SKU-001"
```

Controller logs:

```bash
kubectl logs -n aws-application-networking-system -l app.kubernetes.io/name=aws-gateway-controller --tail=50
```

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `GatewayClass` not found | Apply §4 before `Gateway`; name must be **`amazon-vpc-lattice`** |
| Gateway not `PROGRAMMED` | Missing `defaultServiceNetwork` or VPC association not **ACTIVE** |
| HTTPRoute not accepted | `parentRefs` namespace/name wrong; hostname mismatch with Gateway |
| 503 / no healthy targets | TargetGroupPolicy path/port wrong; SG missing Lattice prefix list on pod SG |
| Helm env errors on Fargate-only | Controller needs EC2 or hybrid; or set explicit Helm env for non-EKS |

## References

- [Deploy on EKS](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/)
- [Getting started](https://www.gateway-api-controller.eks.aws.dev/latest/guides/getstarted/)
- [VPC Lattice application networking lab](/aws-vpc-lattice-application-networking/)

---

# eks-vpc-lattice-gateway-api-updated.md

---
title: "VPC Lattice on EKS with Gateway API (updated)"
description: "lab-cluster walkthrough: Pod Identity + Helm serviceAccount.create=true, Gateway name = service network, two Python apps, Route 53 private zone, HTTPRoute troubleshooting."
tags:
  - vpc-lattice
  - eks
  - gateway-api
  - networking
  - route53
  - pod-identity
  - aws
  - notes
date: 2026-09-18
resources:
  - title: Controller installation (EKS)
    url: https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/
  - title: Gateway API type — Gateway
    url: https://www.gateway-api-controller.eks.aws.dev/latest/api-types/gateway/
  - title: Earlier guide (unchanged)
    url: /eks-vpc-lattice-gateway-api/
---

This page supersedes the **operational** details for new clusters; the [original Gateway API guide](/eks-vpc-lattice-gateway-api/) is unchanged. Manifests and apps live under [`dir/vpc-lattic-eks/`](./dir/vpc-lattic-eks/).

**Lab cluster:** `lab-cluster` (us-east-1). VPC and EKS already exist.

---

## What changed vs the original post

| Topic | Original emphasis | Updated (validated on `lab-cluster`) |
| --- | --- | --- |
| ServiceAccount | `serviceAccount.create=false` after manual SA | **Helm `serviceAccount.create=true`**; bind IAM with **EKS Pod Identity** (no hand-written SA YAML) |
| Service network | `defaultServiceNetwork` / `lattice-sn` | **Gateway `metadata.name` = VPC Lattice service network name** (e.g. Gateway `lattice-gateway` → SN `lattice-gateway`) |
| Helm account ID | Numeric `awsAccountId` in values | Use **`helm --set-string awsAccountId=...`** or omit on EKS — bare numbers can become `2.71e+11` in pod env |
| HTTPRoute errors | Generic troubleshooting | **IMDS timeout** on `Resource Groups Tagging API` / target group synthesis → missing Pod Identity/IRSA on controller SA |

One VPC can be associated with **one** service network at a time. Plan SN name before associating the cluster VPC.

---

## Architecture (two apps + private DNS)

```text
Client → VPC Lattice → catalog-frontend (/fetch/*)
                              │
                              ▼
              http://catalog.lattice.lab.internal/catalog/...
              (Route 53 private CNAME → backend Lattice FQDN)
                              │
                              ▼
              VPC Lattice → catalog-backend (/catalog/*)
```

| App | Namespace (lab) | HTTPRoute path |
| --- | --- | --- |
| `catalog-backend` | `backend` | `/catalog` |
| `catalog-frontend` | `frontend` | `/fetch` |

---

## 1. Prefix lists on the cluster security group

```bash
export AWS_REGION=us-east-1
export EKS_CLUSTER_NAME=lab-cluster

aws eks update-kubeconfig --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}"

CLUSTER_SG=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --output json | jq -r '.cluster.resourcesVpcConfig.clusterSecurityGroupId')

PREFIX_LIST_ID=$(aws ec2 describe-managed-prefix-lists --region "${AWS_REGION}" \
  --query "PrefixLists[?PrefixListName=='com.amazonaws.${AWS_REGION}.vpc-lattice'].PrefixListId" \
  --output text)

aws ec2 authorize-security-group-ingress --region "${AWS_REGION}" \
  --group-id "${CLUSTER_SG}" \
  --ip-permissions "PrefixListIds=[{PrefixListId=${PREFIX_LIST_ID}}],IpProtocol=tcp,FromPort=8080,ToPort=8080" 2>/dev/null || true
```

---

## 2. Service network (name = Gateway name)

Create a service network whose **name matches the Kubernetes Gateway name** (`lattice-gateway` in [`manifests/gateway.yaml`](./dir/vpc-lattic-eks/manifests/gateway.yaml)):

```bash
export SERVICE_NETWORK_NAME=lattice-gateway

aws vpc-lattice create-service-network --name "${SERVICE_NETWORK_NAME}" --region "${AWS_REGION}" 2>/dev/null || true

SERVICE_NETWORK_ID=$(aws vpc-lattice list-service-networks --region "${AWS_REGION}" \
  --query "items[?name=='${SERVICE_NETWORK_NAME}'].id" --output text)

CLUSTER_VPC_ID=$(aws eks describe-cluster --name "${EKS_CLUSTER_NAME}" --region "${AWS_REGION}" \
  --query 'cluster.resourcesVpcConfig.vpcId' --output text)

aws vpc-lattice create-service-network-vpc-association \
  --region "${AWS_REGION}" \
  --service-network-identifier "${SERVICE_NETWORK_ID}" \
  --vpc-identifier "${CLUSTER_VPC_ID}"
```

Wait for association **ACTIVE** before expecting `HTTPRoute` `DeploySucceed`.

---

## 3. Gateway API CRDs

```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.6.1/standard-install.yaml
```

---

## 4. Controller IAM + Pod Identity

Policy: [recommended-inline-policy.json](https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json). Trust policy for Pod Identity: [`controller/pod-identity-trust.json`](./dir/vpc-lattic-eks/controller/pod-identity-trust.json).

```bash
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

curl -fsSL -o /tmp/vpc-lattice-controller-policy.json \
  https://raw.githubusercontent.com/aws/aws-application-networking-k8s/main/files/controller-installation/recommended-inline-policy.json

aws iam create-policy --policy-name VPCLatticeControllerIAMPolicy \
  --policy-document file:///tmp/vpc-lattice-controller-policy.json 2>/dev/null || true

aws iam create-role --role-name VPCLatticeControllerRole \
  --assume-role-policy-document file://dir/vpc-lattic-eks/controller/pod-identity-trust.json 2>/dev/null || true

aws iam attach-role-policy --role-name VPCLatticeControllerRole \
  --policy-arn "arn:aws:iam::${ACCOUNT_ID}:policy/VPCLatticeControllerIAMPolicy"

aws eks create-pod-identity-association \
  --cluster-name "${EKS_CLUSTER_NAME}" \
  --region "${AWS_REGION}" \
  --role-arn "arn:aws:iam::${ACCOUNT_ID}:role/VPCLatticeControllerRole" \
  --namespace aws-application-networking-system \
  --service-account gateway-api-controller
```

Requires **eks-pod-identity-agent** on the cluster.

---

## 5. Helm (`serviceAccount.create=true`)

```bash
aws ecr-public get-login-password --region us-east-1 | \
  helm registry login --username AWS --password-stdin public.ecr.aws

helm upgrade --install gateway-api-controller \
  oci://public.ecr.aws/aws-application-networking-k8s/aws-gateway-controller-chart \
  --version=v2.1.3 \
  --namespace aws-application-networking-system \
  --create-namespace \
  --set serviceAccount.create=true \
  --set serviceAccount.name=gateway-api-controller \
  --set defaultServiceNetwork=lattice-gateway \
  --set log.level=info \
  --set-string awsAccountId="${ACCOUNT_ID}" \
  --set-string clusterVpcId="${CLUSTER_VPC_ID}" \
  --set awsRegion="${AWS_REGION}" \
  --set clusterName="${EKS_CLUSTER_NAME}"

kubectl rollout restart deployment -n aws-application-networking-system \
  -l app.kubernetes.io/instance=gateway-api-controller
```

Reference values: [`controller/helm-values.yaml`](./dir/vpc-lattic-eks/controller/helm-values.yaml).

---

## 6. GatewayClass, Gateway, workloads

```bash
kubectl apply -f dir/vpc-lattic-eks/manifests/namespaces.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/gatewayclass.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/gateway.yaml
# After ECR images are set in YAML:
kubectl apply -f dir/vpc-lattic-eks/manifests/backend.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/frontend.yaml
kubectl apply -f dir/vpc-lattic-eks/manifests/targetgrouppolicies-lab.yaml
```

**TargetGroupPolicy is required** for healthy Lattice targets (`/health` on pod port **8080**).

---

## 7. Route 53 private zone (frontend → backend via Lattice DNS)

CNAME `catalog.lattice.lab.internal` → backend HTTPRoute Lattice FQDN. Template: [`route53/private-zone-cname.json`](./dir/vpc-lattic-eks/route53/private-zone-cname.json). Full steps: [`dir/vpc-lattic-eks/README.md`](./dir/vpc-lattic-eks/README.md).

---

## 8. Verify

```bash
kubectl get httproute -A
kubectl describe httproute catalog-backend-route -n backend

export BACKEND_FQDN=$(kubectl get httproute catalog-backend-route -n backend \
  -o jsonpath='{.metadata.annotations.application-networking\.k8s\.aws/lattice-assigned-domain-name}')

curl -s "http://${BACKEND_FQDN}/catalog/item-1"
```

---

## Troubleshooting (from `lab-cluster`)

| Symptom | Fix |
| --- | --- |
| `FailedDeployModel` … `no EC2 IMDS role found` … `Resource Groups Tagging API` | Create **Pod Identity** (or IRSA) for `gateway-api-controller`; restart controller pods |
| `Service network lattice-gateway` not found | Create SN **named like the Gateway**; associate cluster VPC (only one SN per VPC) |
| `awsAccountId` looks like `2.71e+11` in pod env | `helm --set-string awsAccountId=...` |
| HTTPRoute stuck; no `lattice-assigned-domain-name` | Fix controller IAM + SN; wait for `DeploySucceed` event |
| 503 / unhealthy targets | Apply **TargetGroupPolicy**; SG allows Lattice prefix list to **8080** |

```bash
aws eks list-pod-identity-associations --cluster-name lab-cluster --region us-east-1
kubectl logs -n aws-application-networking-system -l app.kubernetes.io/instance=gateway-api-controller --tail=50
```

---

## References

- [VPC Lattice on EKS with Gateway API](/eks-vpc-lattice-gateway-api/) (original)
- [VPC Lattice application networking](/aws-vpc-lattice-application-networking/)
- [Deploy on EKS](https://www.gateway-api-controller.eks.aws.dev/latest/guides/deploy/)

---

# llama-cpp-local-inference.md

---
title: "llama.cpp: Local GGUF Inference"
description: "Run GGUF models locally with llama-server, download from Hugging Face, estimate VRAM and RAM needs, and pick a quantization for your hardware."
tags:
  - llama.cpp
  - gguf
  - llm
  - local
---

## Overview

**llama.cpp** runs large language models locally from **GGUF** files. It supports CPU and GPU backends (CUDA, Metal, Vulkan) and exposes an **OpenAI-compatible HTTP API** via `llama-server`.

| Piece | Role |
| --- | --- |
| **GGUF file** | Quantized model weights on disk |
| **`llama-server`** | HTTP server (default port `8080`) |
| **`llama-cli`** | Interactive terminal chat |
| **VRAM / RAM** | Weights + KV cache at runtime |

References:

- [llama.cpp README](https://github.com/ggml-org/llama.cpp/blob/master/README.md)
- [GGUF format](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)

---

## Serve a model

Point `llama-server` at a local `.gguf` file:

```bash
llama-server -m "/path/to/your/model.gguf"
```

Common production flags:

```bash
llama-server \
  -m ./models/qwen2.5-7b-instruct-q4_k_m.gguf \
  --host 0.0.0.0 \
  --port 8080 \
  --n-gpu-layers 35 \
  --ctx-size 8192 \
  --parallel 4
```

| Flag | Purpose |
| --- | --- |
| `-m` / `--model` | Path to the GGUF file |
| `--host` / `--port` | Bind address (default `127.0.0.1:8080`) |
| `--n-gpu-layers` | Layers offloaded to GPU (`-1` = all) |
| `--ctx-size` | Context window in tokens |
| `--parallel` | Concurrent request slots |
| `--flash-attn` | Lower KV cache memory use |

After start:

- Web UI: `http://localhost:8080`
- OpenAI-compatible API: `http://localhost:8080/v1/chat/completions`

### Pull from Hugging Face in one step

```bash
llama-server -hf ggml-org/gemma-3-1b-it-GGUF
```

Optional quant suffix: `-hf org/repo:Q4_K_M`

---

## Download a `.gguf` file

### Option 1 - Hugging Face CLI

```bash
pip install huggingface-hub

huggingface-cli download \
  Qwen/Qwen2.5-7B-Instruct-GGUF \
  qwen2.5-7b-instruct-q4_k_m.gguf \
  --local-dir ./models
```

### Option 2 - Browser

1. Open a model repo on [Hugging Face](https://huggingface.co/) (search for `GGUF` in the model name or files).
2. Download the quant file you want (for example `*-q4_k_m.gguf`).
3. Place it under `./models/`.

### Option 3 - Convert / quantize

Non-GGUF checkpoints can be converted with scripts in the llama.cpp repo, or via Hugging Face spaces such as [GGUF-my-repo](https://huggingface.co/spaces/ggml-org/gguf-my-repo).

---

## VRAM and RAM - what you actually need

Runtime memory is **not** just the file size on disk.

```text
Total memory ≈ model weights + KV cache + runtime overhead (~10%)
```

| Component | Grows with |
| --- | --- |
| **Weights** | Parameter count × bits-per-weight (quant) |
| **KV cache** | Context length (`--ctx-size`), layers, parallel slots |
| **Overhead** | Backend, batching, temporary buffers |

### Approximate VRAM for Q4_K_M (starting point)

Use these as a **first guess** before tuning `--n-gpu-layers` and `--ctx-size`.

| Model size | File size (approx.) | VRAM (approx., 8k context) | Fits on |
| --- | --- | --- | --- |
| 1–3B | 0.7–2 GB | 2–4 GB | 8 GB GPU, most laptops |
| 7–8B | 4–5 GB | 6–8 GB | 8 GB GPU (tight) |
| 13–14B | 7–9 GB | 11–14 GB | 12–16 GB GPU |
| 32B | 18–20 GB | 22–28 GB | 24 GB GPU (Q4) |
| 70B | 38–42 GB (Q4) | 40 GB+ | 48 GB GPU or CPU offload |

For exact numbers per quant and context length, use a [GGUF VRAM calculator](https://codeswap.net/llm/gguf-vram-calculator/).

---

## Choose a quant for your system

| Quant | Size | Quality | When to use |
| --- | --- | --- | --- |
| **Q4_K_M** | Smallest practical | Good | Default for most local setups |
| **Q5_K_M** | Medium | Better | Extra VRAM headroom |
| **Q6_K** | Larger | Near FP16 | 16 GB+ GPU |
| **Q8_0** | Large | Very close to original | Quality-first, plenty of RAM |
| **Q2_K / Q3_K** | Tiny | Noticeable loss | Extreme memory limits only |

**Rule of thumb:** start with **Q4_K_M**. Move up (Q5/Q6) if quality matters and memory allows; move down (Q3) only if you cannot fit the model otherwise.

---

## Decide what your system can run

### Step 1 - Check available memory

| Hardware | What to check |
| --- | --- |
| **NVIDIA GPU** | Free VRAM (`nvidia-smi`) |
| **Apple Silicon** | Unified memory (Metal backend) |
| **CPU only** | System RAM (expect slower tokens/sec) |

### Step 2 - Pick model size

```text
Free VRAM (or RAM for CPU)
        │
        ├─ < 4 GB  → 1–3B, Q4_K_M
        ├─ 6–8 GB  → 7–8B, Q4_K_M
        ├─ 12–16 GB → 13–14B, Q4_K_M
        ├─ 24 GB   → 32B Q4 or 70B with heavy CPU offload
        └─ 48 GB+  → 70B Q4_K_M
```

### Step 3 - Tune GPU offload

If the model does not fit fully on GPU, offload partial layers:

```bash
# Offload 32 layers to GPU; rest on CPU RAM
llama-server -m model.gguf --n-gpu-layers 32
```

| Symptom | Fix |
| --- | --- |
| CUDA OOM on load | Lower `--n-gpu-layers`, use smaller quant, or smaller model |
| Slow but stable | Increase `--n-gpu-layers` until VRAM is nearly full |
| High memory during chat | Lower `--ctx-size` or `--parallel` |
| KV cache too large | Add `--flash-attn` |

### CPU-only fallback

Omit `--n-gpu-layers` (or set `0`). Inference uses system RAM and CPU vector instructions (AVX2/AVX-512). Throughput is lower but works without a GPU.

---

## Quick examples

### 8 GB GPU - 7B instruct model

```bash
huggingface-cli download \
  Qwen/Qwen2.5-7B-Instruct-GGUF \
  qwen2.5-7b-instruct-q4_k_m.gguf \
  --local-dir ./models

llama-server \
  -m ./models/qwen2.5-7b-instruct-q4_k_m.gguf \
  --n-gpu-layers 35 \
  --ctx-size 8192 \
  --port 8080
```

### Low RAM laptop - 1B model

```bash
llama-server -hf ggml-org/gemma-3-1b-it-GGUF --ctx-size 4096
```

### Test the API

```bash
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

## Notes

- Binary names vary by build: `llama-server`, `llama-cli`, or older `server` / `main` targets from the same repo.
- Match `--chat-template` to the model family when responses look malformed (for example `qwen2`, `llama3`).
- One `llama-server` process loads **one** model at a time; run multiple processes on different ports for multiple models.
