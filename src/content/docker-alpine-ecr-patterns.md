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