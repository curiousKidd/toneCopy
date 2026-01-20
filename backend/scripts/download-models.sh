#!/bin/sh

# Face-API 모델 다운로드 스크립트

MODELS_DIR="/app/models"
MODELS_URL="https://raw.githubusercontent.com/vladmandic/face-api/master/model"

echo "Creating models directory..."
mkdir -p "$MODELS_DIR"

echo "Downloading face detection models..."

# Tiny Face Detector
wget -P "$MODELS_DIR" "$MODELS_URL/tiny_face_detector_model-weights_manifest.json" || echo "Failed to download tiny face detector manifest"
wget -P "$MODELS_DIR" "$MODELS_URL/tiny_face_detector_model-shard1" || echo "Failed to download tiny face detector shard1"

# Face Landmarks 68
wget -P "$MODELS_DIR" "$MODELS_URL/face_landmark_68_model-weights_manifest.json" || echo "Failed to download face landmarks manifest"
wget -P "$MODELS_DIR" "$MODELS_URL/face_landmark_68_model-shard1" || echo "Failed to download face landmarks shard1"

echo "Model download completed!"
ls -la "$MODELS_DIR"
