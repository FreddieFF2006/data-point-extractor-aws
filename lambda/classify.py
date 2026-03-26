import json
import boto3
import os
import re

bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_REGION", "ap-northeast-1")
)

# Try Claude 3.5 Sonnet first (widely available), fall back to others
MODEL_ID = os.environ.get("MODEL_ID", "anthropic.claude-3-5-sonnet-20241022-v2:0")

SYSTEM_PROMPT = """You are a strict, consistent classifier of numerical data points in corporate reports. Apply the SAME rules every time without variation.

TASK: For each candidate (number + sentence), decide if it is a DATA POINT. If yes, assign category E/S/G/O.

A DATA POINT is a specific numerical figure that MEASURES something. It must be a metric, KPI, target, count, percentage, monetary amount, or ratio that would be verified year-over-year.

STRICT RULES - always include:
1. ANY percentage in a performance/target context
2. ANY count of people, sites, countries, organizations
3. ANY monetary amount (yen, USD, EUR, billion, million)
4. ANY environmental measurement (tons, MW, TJ, m3, kWh, degrees C)
5. ANY ratio like 1:53 or 1:210
6. Share counts, shareholder counts, board member counts

ALWAYS EXCLUDE - these are NEVER data points:
1. Years: ANY 4-digit number 1900-2059 used as a year
2. Dates: "March 31", "fiscal year 2023", FY2023
3. Page numbers, section numbers, TOC references
4. ISO/standard numbers: 14001, 45001, 9001
5. Labels: "Scope 1", "Class 3", "SDG 13", "Category 2"
6. Product names: "PlayStation 5"
7. Footnote markers after asterisks
8. GRI/SASB codes (like "302-1", "305-1")
9. Address/postal numbers
10. Bullet/section numbering
11. Raw datasheet tables with no narrative sentence

CATEGORIES:
E (Environment) = emissions, energy, water, waste, recycling, renewable, carbon, climate, biodiversity, metric tons, MW, TJ, m3
S (Social) = employees, diversity, safety, training, community, human rights, wages, hours, donations, accessibility, health
G (Governance) = board, directors, committees, compensation, audit, compliance, shareholders, shares, voting, ethics
O (Other) = financial results, revenue, general corporate, anything not clearly E/S/G

Return ONLY a JSON array of data points: [{"id":1,"cat":"E"},{"id":5,"cat":"S"},...]
No markdown. No explanation. Just the array."""


def handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
    }

    # API Gateway v2 uses requestContext.http.method
    method = "POST"
    if "requestContext" in event:
        method = event.get("requestContext", {}).get("http", {}).get("method", "POST")
    elif "httpMethod" in event:
        method = event["httpMethod"]

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
        candidates = body.get("candidates", [])

        if not candidates:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "No candidates"})}

        lines = []
        for c in candidates:
            sentence = c.get("sentence", "")[:250]
            lines.append(f'ID:{c["id"]} | {c["number"]} | "{sentence}"')

        user_msg = "Classify each candidate strictly. Return ONLY a JSON array of {{id, cat}} for data points. Omit non-data-points.\n\n" + "\n".join(lines)

        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4000,
            "temperature": 0,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_msg}],
        })

        response = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )

        result = json.loads(response["body"].read())
        text = result["content"][0]["text"].strip()
        text = re.sub(r"^```\w*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
        match = re.search(r"\[[\s\S]*?\]", text)

        if match:
            data_points = json.loads(match.group(0))
            normalized = []
            for item in data_points:
                if isinstance(item, dict):
                    normalized.append({"id": item.get("id"), "cat": item.get("cat", "O").upper()})
                elif isinstance(item, (int, float)):
                    normalized.append({"id": int(item), "cat": "O"})
            return {"statusCode": 200, "headers": headers, "body": json.dumps({"results": normalized})}
        else:
            return {"statusCode": 200, "headers": headers, "body": json.dumps({"results": []})}

    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}
