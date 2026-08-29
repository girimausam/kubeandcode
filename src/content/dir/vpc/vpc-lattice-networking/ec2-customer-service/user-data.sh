#!/bin/bash
dnf update -y
dnf install -y python3-pip
mkdir -p /opt/customer-service
# Copy app.py and requirements.txt to /opt/customer-service during deployment.
cd /opt/customer-service
python3 -m pip install -r requirements.txt
nohup python3 -m uvicorn app:app --host 0.0.0.0 --port 8080 > /var/log/customer-service.log 2>&1 &
