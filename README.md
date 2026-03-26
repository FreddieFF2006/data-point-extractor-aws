# Data Point Extractor

AI-powered tool to extract data points from sustainability reports and annual filings.

## Quick Setup

### 1. Install dependencies
```
npm install
```

### 2. Set up AWS (one time)
Open PowerShell in this folder and run:
```
powershell -ExecutionPolicy Bypass -File setup-aws.ps1
```
This creates everything on AWS and gives you an API URL.

### 3. Deploy the web app
```
git init
git add -A
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/data-point-extractor.git
git push -u origin main
```
Then connect to Vercel or AWS Amplify.

### 4. Use it
- Open the web app
- Select "AWS Bedrock" mode
- Paste the API URL from step 2
- Upload a PDF and click Run
