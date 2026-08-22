---
title: "AWS Lambda Python Runtime — Notes"
description: "Python Lambda handler patterns, deployment packages, virtual environments, layers, and packaging notes for boto3 and third-party dependencies."
tags:
  - lambda
  - python
  - boto3
  - serverless
  - aws
  - notes
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

Do **not** include `__pycache__` directories in deployment packages or layers. AWS documents this as a packaging best practice — see [Using `__pycache__` folders](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html#python-package-pycache).

### Pure Python vs native wheels

- **Pure Python** packages: `pip install --target ./package <name>` on your build machine is usually enough.
- **Native extensions**: use `--platform`, `--implementation cp`, `--python-version`, and `--only-binary=:all:` so wheels match the Lambda execution environment.

### References

- [Lambda Python runtimes](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
- [Python deployment packages (.zip)](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html)
- [Python Lambda layers](https://docs.aws.amazon.com/lambda/latest/dg/python-layers.html)
