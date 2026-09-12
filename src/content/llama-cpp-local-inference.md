---
title: "llama.cpp - Local GGUF Inference"
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
