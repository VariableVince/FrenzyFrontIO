#!/bin/bash
# Setup script to download required sound assets for FrenzyFront

SOUNDS_DIR="sounds/music"
mkdir -p "$SOUNDS_DIR"

echo "Downloading background music..."
echo ""
echo "Please download the following file manually from Pixabay:"
echo "  URL: https://pixabay.com/music/supernatural-enveloped-mission-4-operation-alpha-116601/"
echo "  Save as: $SOUNDS_DIR/enveloped-mission-4-operation-alpha-116601.mp3"
echo ""
echo "Note: Pixabay requires user interaction to download, so automated download is not possible."
echo ""

# Check if file exists
if [ -f "$SOUNDS_DIR/enveloped-mission-4-operation-alpha-116601.mp3" ]; then
    echo "✓ Background music file found!"
else
    echo "✗ Background music file not found. Please download it manually."
fi
