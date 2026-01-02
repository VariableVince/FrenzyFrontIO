# Setup script to download required sound assets for FrenzyFront

$SOUNDS_DIR = "sounds/music"
New-Item -ItemType Directory -Path $SOUNDS_DIR -Force | Out-Null

Write-Host "Downloading background music..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Please download the following file manually from Pixabay:"
Write-Host "  URL: https://pixabay.com/music/supernatural-enveloped-mission-4-operation-alpha-116601/" -ForegroundColor Yellow
Write-Host "  Save as: $SOUNDS_DIR/enveloped-mission-4-operation-alpha-116601.mp3" -ForegroundColor Yellow
Write-Host ""
Write-Host "Note: Pixabay requires user interaction to download, so automated download is not possible."
Write-Host ""

# Check if file exists
if (Test-Path "$SOUNDS_DIR/enveloped-mission-4-operation-alpha-116601.mp3") {
    Write-Host "✓ Background music file found!" -ForegroundColor Green
} else {
    Write-Host "✗ Background music file not found. Please download it manually." -ForegroundColor Red
}
