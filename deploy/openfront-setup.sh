#!/bin/bash
# Executed on ec2 startup
yum update -y
amazon-linux-extras install docker -y
service docker start
systemctl enable docker
usermod -a -G docker ec2-user

# Install AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
./aws/install

# Install CloudWatch agent (simplified)
yum install -y amazon-cloudwatch-agent

# Start CloudWatch agent with default config (collects basic system metrics)
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# Authenticate to ECR and run container
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com

# Pull and run container with simple CloudWatch logging
docker pull ${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com/openfront:latest
docker run -d -p 80:80 \
  --log-driver=awslogs \
  --log-opt awslogs-region=eu-west-1 \
  --log-opt awslogs-group=/aws/ec2/docker-containers \
  --log-opt awslogs-create-group=true \
  ${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com/openfront:latest