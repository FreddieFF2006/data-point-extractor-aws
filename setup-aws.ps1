$REGION = "ap-northeast-1"
$FN = "data-point-classifier"
$ROLE = "data-point-lambda-role"

Write-Host ""
Write-Host "=== DATA POINT EXTRACTOR - AWS SETUP ===" -ForegroundColor Cyan
Write-Host "Region: Tokyo (ap-northeast-1)" -ForegroundColor Cyan
Write-Host ""

# Check AWS CLI
Write-Host "[0/4] Checking AWS CLI..." -ForegroundColor Yellow
aws --version 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "AWS CLI not found" -ForegroundColor Red; exit 1 }
Write-Host "  AWS CLI OK" -ForegroundColor Green

$acct = aws sts get-caller-identity --query Account --output text 2>$null
if (-not $acct) { Write-Host "Not logged in. Run: aws configure" -ForegroundColor Red; exit 1 }
Write-Host "  Account: $acct" -ForegroundColor Green

# Step 1: IAM Role
Write-Host ""
Write-Host "[1/4] Creating IAM role..." -ForegroundColor Yellow

$tp = Join-Path $env:TEMP "trust.json"
$bp = Join-Path $env:TEMP "bedrock.json"
Set-Content -Path $tp -Value '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
Set-Content -Path $bp -Value '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel"],"Resource":"*"}]}'

aws iam create-role --role-name $ROLE --assume-role-policy-document file://$tp --query Role.Arn --output text 2>$null | Out-Null
$ra = aws iam get-role --role-name $ROLE --query Role.Arn --output text 2>$null
Write-Host "  Role: $ra" -ForegroundColor Green

aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole 2>$null | Out-Null
aws iam put-role-policy --role-name $ROLE --policy-name BedrockAccess --policy-document file://$bp 2>$null | Out-Null
Write-Host "  Policies attached" -ForegroundColor Green
Write-Host "  Waiting 10s for propagation..." -ForegroundColor Gray
Start-Sleep 10

# Step 2: Lambda
Write-Host ""
Write-Host "[2/4] Creating Lambda..." -ForegroundColor Yellow

if (Test-Path lambda\classify.zip) { Remove-Item lambda\classify.zip -Force }
Compress-Archive -Path lambda\classify.py -DestinationPath lambda\classify.zip -Force

$ra = aws iam get-role --role-name $ROLE --query Role.Arn --output text 2>$null

# Try to create. If it fails (already exists), update instead.
aws lambda create-function --function-name $FN --runtime python3.12 --handler classify.handler --role $ra --zip-file fileb://lambda/classify.zip --timeout 60 --memory-size 256 --region $REGION --environment "Variables={AWS_REGION=$REGION}" 2>$null | Out-Null

if ($LASTEXITCODE -ne 0) {
    aws lambda update-function-code --function-name $FN --zip-file fileb://lambda/classify.zip --region $REGION 2>$null | Out-Null
    Write-Host "  Updated: $FN" -ForegroundColor Green
} else {
    Write-Host "  Created: $FN" -ForegroundColor Green
}

# Step 3: API Gateway
Write-Host ""
Write-Host "[3/4] Creating API Gateway..." -ForegroundColor Yellow

$apiJson = aws apigatewayv2 create-api --name data-point-api --protocol-type HTTP --cors-configuration "AllowOrigins=*,AllowMethods=POST,OPTIONS,AllowHeaders=Content-Type" --region $REGION --output json 2>$null
$apiId = $null

if ($LASTEXITCODE -eq 0 -and $apiJson) {
    $apiId = ($apiJson | ConvertFrom-Json).ApiId
    Write-Host "  Created API: $apiId" -ForegroundColor Green
} else {
    $allJson = aws apigatewayv2 get-apis --region $REGION --output json 2>$null
    $allApis = $allJson | ConvertFrom-Json
    foreach ($a in $allApis.Items) {
        if ($a.Name -eq "data-point-api") { $apiId = $a.ApiId; break }
    }
    Write-Host "  API exists: $apiId" -ForegroundColor Green
}

if (-not $apiId) { Write-Host "  Failed to get API ID" -ForegroundColor Red; exit 1 }

$lambdaArn = aws lambda get-function --function-name $FN --query Configuration.FunctionArn --output text --region $REGION 2>$null

# Create integration (ignore error if exists)
$intJson = aws apigatewayv2 create-integration --api-id $apiId --integration-type AWS_PROXY --integration-uri $lambdaArn --payload-format-version 2.0 --region $REGION --output json 2>$null

if ($LASTEXITCODE -eq 0 -and $intJson) {
    $intId = ($intJson | ConvertFrom-Json).IntegrationId
    Write-Host "  Integration: $intId" -ForegroundColor Green

    aws apigatewayv2 create-route --api-id $apiId --route-key "POST /classify" --target "integrations/$intId" --region $REGION 2>$null | Out-Null
    Write-Host "  Route: POST /classify" -ForegroundColor Green

    aws apigatewayv2 create-stage --api-id $apiId --stage-name default --auto-deploy --region $REGION 2>$null | Out-Null
    Write-Host "  Stage created" -ForegroundColor Green
} else {
    Write-Host "  Integration already exists" -ForegroundColor Gray
}

# Permission for API Gateway to call Lambda
aws lambda add-permission --function-name $FN --statement-id apigw --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${acct}:${apiId}/*" --region $REGION 2>$null | Out-Null

$url = "https://$apiId.execute-api.$REGION.amazonaws.com/classify"

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Your API URL:" -ForegroundColor White
Write-Host ""
Write-Host "  $url" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Paste this in the app under AWS Bedrock mode." -ForegroundColor Gray
Write-Host ""
try { $url | Set-Clipboard; Write-Host "  (Copied to clipboard)" -ForegroundColor DarkGray } catch {}

Remove-Item $tp -Force -ErrorAction SilentlyContinue
Remove-Item $bp -Force -ErrorAction SilentlyContinue
