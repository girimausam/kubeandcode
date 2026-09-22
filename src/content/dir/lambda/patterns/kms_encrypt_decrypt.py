"""KMS: encrypt or decrypt a short string. Env: KMS_KEY_ID.

Event: {"action": "encrypt"|"decrypt", "text": "..."}  OR  {"action": "decrypt", "ciphertext_b64": "..."}
"""

import base64
import os

import boto3

kms = boto3.client("kms")
KEY_ID = os.environ["KMS_KEY_ID"]


def lambda_handler(event, context):
    action = event.get("action", "encrypt")

    if action == "encrypt":
        text = event["text"].encode("utf-8")
        res = kms.encrypt(KeyId=KEY_ID, Plaintext=text)
        return {"ciphertext_b64": base64.b64encode(res["CiphertextBlob"]).decode("ascii")}

    blob = base64.b64decode(event["ciphertext_b64"])
    res = kms.decrypt(CiphertextBlob=blob)
    return {"text": res["Plaintext"].decode("utf-8")}
