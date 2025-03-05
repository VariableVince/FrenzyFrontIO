#!/bin/bash
# Script to update Docker container

# Get AWS account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO="${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com/openfront:latest"

echo "Logging in to ECR..."
aws ecr get-login-password --region eu-west-1 | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.eu-west-1.amazonaws.com

echo "Pulling latest image..."
docker pull $ECR_REPO

echo "Checking for existing container..."
# Check for running container
RUNNING_CONTAINER=$(docker ps | grep openfront | awk '{print $1}')
if [ -n "$RUNNING_CONTAINER" ]; then
  echo "Stopping running container $RUNNING_CONTAINER..."
  docker stop $RUNNING_CONTAINER
  docker rm $RUNNING_CONTAINER
  echo "Container $RUNNING_CONTAINER stopped and removed."
fi

# Also check for stopped containers with the same name
STOPPED_CONTAINER=$(docker ps -a | grep openfront | awk '{print $1}')
if [ -n "$STOPPED_CONTAINER" ]; then
  echo "Removing stopped container $STOPPED_CONTAINER..."
  docker rm $STOPPED_CONTAINER
  echo "Container $STOPPED_CONTAINER removed."
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