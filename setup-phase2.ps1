$REGION = "ap-northeast-1"
$ROLE = "data-point-lambda-role"
$TABLE = "data-point-sessions"
$BUCKET = "data-point-pdfs-589833671631"
$CHAT_FN = "data-point-chat"
$SESSIONS_FN = "data-point-sessions-api"

Write-Host ""
Write-Host "=== PHASE 2: Database + Chat ===" -ForegroundColor Cyan
Write-Host "Region: Tokyo" -ForegroundColor Cyan
Write-Host ""

# Step 1: Create DynamoDB table
Write-Host "[1/5] Creating DynamoDB table..." -ForegroundColor Yellow

aws dynamodb create-table `
    --table-name $TABLE `
    --attribute-definitions AttributeName=sessionId,AttributeType=S `
    --key-schema AttributeName=sessionId,KeyType=HASH `
    --billing-mode PAY_PER_REQUEST `
    --region $REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Created: $TABLE" -ForegroundColor Green
} else {
    Write-Host "  Table already exists" -ForegroundColor Gray
}

# Step 2: Create S3 bucket
Write-Host ""
Write-Host "[2/5] Creating S3 bucket..." -ForegroundColor Yellow

aws s3 mb "s3://$BUCKET" --region $REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Created: $BUCKET" -ForegroundColor Green
} else {
    Write-Host "  Bucket already exists" -ForegroundColor Gray
}

# Add CORS to S3 bucket
$s3cors = Join-Path $env:TEMP "s3cors.json"
Set-Content -Path $s3cors -Value '[{"AllowedHeaders":["*"],"AllowedMethods":["PUT","GET"],"AllowedOrigins":["*"],"MaxAgeSeconds":3600}]'
aws s3api put-bucket-cors --bucket $BUCKET --cors-configuration "file://$s3cors" --region $REGION 2>$null
Write-Host "  CORS configured" -ForegroundColor Green

# Step 3: Add DynamoDB + S3 permissions to Lambda role
Write-Host ""
Write-Host "[3/5] Adding permissions..." -ForegroundColor Yellow

$dbPolicy = Join-Path $env:TEMP "db-policy.json"
Set-Content -Path $dbPolicy -Value '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["dynamodb:PutItem","dynamodb:GetItem","dynamodb:UpdateItem","dynamodb:DeleteItem","dynamodb:Scan","dynamodb:Query"],"Resource":"*"},{"Effect":"Allow","Action":["s3:PutObject","s3:GetObject","s3:ListBucket"],"Resource":"*"}]}'

aws iam put-role-policy `
    --role-name $ROLE `
    --policy-name DynamoS3Access `
    --policy-document "file://$dbPolicy" 2>$null
Write-Host "  DynamoDB + S3 permissions added" -ForegroundColor Green

Start-Sleep 5

# Step 4: Create sessions Lambda
Write-Host ""
Write-Host "[4/5] Creating sessions Lambda..." -ForegroundColor Yellow

if (Test-Path lambda\sessions.zip) { Remove-Item lambda\sessions.zip -Force }
Compress-Archive -Path lambda\sessions.py -DestinationPath lambda\sessions.zip -Force

$ra = aws iam get-role --role-name $ROLE --query Role.Arn --output text 2>$null

aws lambda create-function --function-name $SESSIONS_FN --runtime python3.12 --handler sessions.handler --role $ra --zip-file fileb://lambda/sessions.zip --timeout 30 --memory-size 256 --region $REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Created: $SESSIONS_FN" -ForegroundColor Green
} else {
    aws lambda update-function-code --function-name $SESSIONS_FN --zip-file fileb://lambda/sessions.zip --region $REGION 2>$null | Out-Null
    Write-Host "  Updated: $SESSIONS_FN" -ForegroundColor Green
}

# Step 5: Create chat Lambda
Write-Host ""
Write-Host "[5/5] Creating chat Lambda..." -ForegroundColor Yellow

if (Test-Path lambda\chat.zip) { Remove-Item lambda\chat.zip -Force }
Compress-Archive -Path lambda\chat.py -DestinationPath lambda\chat.zip -Force

aws lambda create-function --function-name $CHAT_FN --runtime python3.12 --handler chat.handler --role $ra --zip-file fileb://lambda/chat.zip --timeout 120 --memory-size 512 --region $REGION 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Created: $CHAT_FN" -ForegroundColor Green
} else {
    aws lambda update-function-code --function-name $CHAT_FN --zip-file fileb://lambda/chat.zip --region $REGION 2>$null | Out-Null
    Write-Host "  Updated: $CHAT_FN" -ForegroundColor Green
}

# Step 6: Add routes to API Gateway
Write-Host ""
Write-Host "[6] Adding API routes..." -ForegroundColor Yellow

$apiId = "9n9wdjl1kk"

$sessArn = aws lambda get-function --function-name $SESSIONS_FN --query Configuration.FunctionArn --output text --region $REGION 2>$null
$chatArn = aws lambda get-function --function-name $CHAT_FN --query Configuration.FunctionArn --output text --region $REGION 2>$null

# Sessions integration
$si = aws apigatewayv2 create-integration --api-id $apiId --integration-type AWS_PROXY --integration-uri $sessArn --payload-format-version 2.0 --region $REGION --query IntegrationId --output text 2>$null
if ($si) {
    aws apigatewayv2 create-route --api-id $apiId --route-key "POST /sessions" --target "integrations/$si" --region $REGION 2>$null | Out-Null
    aws apigatewayv2 create-route --api-id $apiId --route-key "GET /sessions" --target "integrations/$si" --region $REGION 2>$null | Out-Null
    aws apigatewayv2 create-route --api-id $apiId --route-key "DELETE /sessions" --target "integrations/$si" --region $REGION 2>$null | Out-Null
    Write-Host "  Sessions routes added" -ForegroundColor Green
} else {
    Write-Host "  Sessions routes may already exist" -ForegroundColor Gray
}

# Chat integration
$ci = aws apigatewayv2 create-integration --api-id $apiId --integration-type AWS_PROXY --integration-uri $chatArn --payload-format-version 2.0 --region $REGION --query IntegrationId --output text 2>$null
if ($ci) {
    aws apigatewayv2 create-route --api-id $apiId --route-key "POST /chat" --target "integrations/$ci" --region $REGION 2>$null | Out-Null
    Write-Host "  Chat route added" -ForegroundColor Green
} else {
    Write-Host "  Chat route may already exist" -ForegroundColor Gray
}

# Lambda permissions for API Gateway
$acct = aws sts get-caller-identity --query Account --output text 2>$null
aws lambda add-permission --function-name $SESSIONS_FN --statement-id apigw2 --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${acct}:${apiId}/*" --region $REGION 2>$null | Out-Null
aws lambda add-permission --function-name $CHAT_FN --statement-id apigw2 --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${REGION}:${acct}:${apiId}/*" --region $REGION 2>$null | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  PHASE 2 COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  API base: https://$apiId.execute-api.$REGION.amazonaws.com" -ForegroundColor Cyan
Write-Host "  Endpoints:" -ForegroundColor White
Write-Host "    POST /classify  - classify data points" -ForegroundColor Gray
Write-Host "    POST /chat      - chat about results" -ForegroundColor Gray
Write-Host "    GET  /sessions  - list sessions" -ForegroundColor Gray
Write-Host "    POST /sessions  - save session" -ForegroundColor Gray
Write-Host "    DELETE /sessions - delete session" -ForegroundColor Gray
Write-Host ""

Remove-Item $s3cors -Force -ErrorAction SilentlyContinue
Remove-Item $dbPolicy -Force -ErrorAction SilentlyContinue
