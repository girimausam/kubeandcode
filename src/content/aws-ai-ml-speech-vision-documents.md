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
