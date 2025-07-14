#!/bin/bash

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID}
REGION=${GCP_REGION:-asia-northeast1}
SERVICE_NAME="harvest4-trading-bot"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Check if required environment variables are set
if [[ -z "${PROJECT_ID}" ]]; then
  echo "Error: GCP_PROJECT_ID environment variable is not set"
  exit 1
fi

if [[ -z "${BB_API_KEY}" ]]; then
  echo "Error: BB_API_KEY environment variable is not set"
  exit 1
fi

if [[ -z "${BB_API_SECRET}" ]]; then
  echo "Error: BB_API_SECRET environment variable is not set"
  exit 1
fi

echo "Starting deployment to Cloud Run..."
echo "Project ID: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Service Name: ${SERVICE_NAME}"

# Build and push Docker image
echo "Building Docker image..."
docker build -t ${IMAGE_NAME}:latest .

echo "Pushing Docker image to Container Registry..."
docker push ${IMAGE_NAME}:latest

# Create secrets in Secret Manager
echo "Creating secrets in Secret Manager..."
echo -n "${BB_API_KEY}" | gcloud secrets create bitbank-api-key --data-file=- --project=${PROJECT_ID} || echo "Secret bitbank-api-key already exists"
echo -n "${BB_API_SECRET}" | gcloud secrets create bitbank-api-secret --data-file=- --project=${PROJECT_ID} || echo "Secret bitbank-api-secret already exists"

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image=${IMAGE_NAME}:latest \
  --project=${PROJECT_ID} \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="BB_API_KEY=bitbank-api-key:latest,BB_API_SECRET=bitbank-api-secret:latest" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=1 \
  --max-instances=1 \
  --concurrency=1 \
  --timeout=3600s \
  --no-cpu-throttling

echo "Deployment completed successfully!"

# Get the service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --project=${PROJECT_ID} --region=${REGION} --format="value(status.url)")
echo "Service URL: ${SERVICE_URL}"

# Set up Cloud Scheduler for periodic execution
echo "Setting up Cloud Scheduler..."
gcloud scheduler jobs create http trading-bot-scheduler \
  --schedule="0 */1 * * *" \
  --uri="${SERVICE_URL}/start" \
  --http-method=POST \
  --project=${PROJECT_ID} \
  --time-zone="Asia/Tokyo" \
  --description="Trigger trading bot execution hourly" \
  --attempt-deadline=3600s || echo "Scheduler job already exists"

echo "Deployment and scheduling setup completed!"