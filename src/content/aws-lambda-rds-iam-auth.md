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
