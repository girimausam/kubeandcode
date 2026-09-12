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
