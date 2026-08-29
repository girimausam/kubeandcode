#!/bin/bash

dnf update -y
dnf install -y httpd

# Configure Apache to listen on port 8080
sed -i 's/^Listen 80$/Listen 8080/' /etc/httpd/conf/httpd.conf

systemctl enable httpd
systemctl start httpd

cat > /var/www/html/index.html <<'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>My EC2 Web Server</title>
</head>
<body>
    <h1>Hello from EC2!</h1>
    <p>Apache HTTP Server is running successfully on port 8080.</p>
</body>
</html>
EOF



# nohup flask run --host=0.0.0.0 --port 8080 &