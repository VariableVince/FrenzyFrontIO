#!/bin/bash
# Script to update Docker container

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com/openfront:latest"

echo "Logging in to ECR..."
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com

echo "Pulling latest image..."
docker pull $ECR_REPO

echo "Stopping current container..."
CONTAINER_ID=$(docker ps | grep openfront | awk '{print $1}')
if [ -z "$CONTAINER_ID" ]; then
  echo "No running container found."
else
  docker stop $CONTAINER_ID
  docker rm $CONTAINER_ID
  echo "Container $CONTAINER_ID stopped and removed."
fi

echo "Starting new container..."
docker run -d -p 80:80 \
  --log-driver=awslogs \
  --log-opt awslogs-region=eu-west-1 \
  --log-opt awslogs-group=/aws/ec2/docker-containers \
  --log-opt awslogs-create-group=true \
  --name openfront \
  $ECR_REPO

echo "Update complete! New container is running."