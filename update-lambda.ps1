$REGION = "ap-northeast-1"
$FN = "data-point-classifier"

Write-Host "Updating Lambda..." -ForegroundColor Yellow

if (Test-Path lambda\classify.zip) { Remove-Item lambda\classify.zip -Force }
Compress-Archive -Path lambda\classify.py -DestinationPath lambda\classify.zip -Force

aws lambda update-function-code --function-name $FN --zip-file fileb://lambda/classify.zip --region $REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Lambda updated successfully" -ForegroundColor Green
} else {
    Write-Host "Update failed" -ForegroundColor Red
}
