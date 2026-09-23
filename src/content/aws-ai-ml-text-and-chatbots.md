---
title: "AI/ML: Text and Chatbots (Comprehend, Translate, Lex)"
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
