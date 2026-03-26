import json
import boto3
import os
import re

bedrock = boto3.client("bedrock-runtime", region_name="ap-northeast-1")
dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
table = dynamodb.Table("data-point-sessions")

MODEL_ID = os.environ.get("MODEL_ID", "jp.anthropic.claude-sonnet-4-6")

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
}

CHAT_SYSTEM = """You are an expert analyst assistant for corporate sustainability and annual reports. You have access to extracted data points from a report document.

When answering questions:
- Reference specific data points with their page numbers
- Be precise with numbers - quote the exact figures from the data
- If asked about trends, compare relevant data points
- If asked about ESG breakdown, use the category labels (E=Environment, S=Social, G=Governance, O=Other)
- If the data doesn't contain information to answer a question, say so clearly
- Keep answers concise but thorough
- You can calculate totals, averages, and comparisons from the data provided

The data points are structured as: page number, the number/value, ESG category (E/S/G/O), and the sentence context."""


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "POST")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": HEADERS, "body": ""}

    try:
        body = json.loads(event.get("body", "{}"))
        question = body.get("question", "")
        session_id = body.get("sessionId", "")
        chat_history = body.get("chatHistory", [])

        if not question:
            return {"statusCode": 400, "headers": HEADERS, "body": json.dumps({"error": "question required"})}

        # Get data points - either from request body or from DynamoDB
        data_points = body.get("dataPoints", [])

        if not data_points and session_id:
            result = table.get_item(Key={"sessionId": session_id})
            item = result.get("Item", {})
            data_points = item.get("dataPoints", [])

        if not data_points:
            return {"statusCode": 400, "headers": HEADERS, "body": json.dumps({"error": "No data points available. Run extraction first."})}

        # Build context from data points
        dp_summary = f"Total data points: {len(data_points)}\n"

        cat_counts = {"E": 0, "S": 0, "G": 0, "O": 0}
        for dp in data_points:
            cat = dp.get("cat", "O")
            cat_counts[cat] = cat_counts.get(cat, 0) + 1

        dp_summary += f"Environment: {cat_counts['E']}, Social: {cat_counts['S']}, Governance: {cat_counts['G']}, Other: {cat_counts['O']}\n\n"
        dp_summary += "DATA POINTS:\n"

        for dp in data_points:
            page = dp.get("page", "?")
            number = dp.get("number", "")
            cat = dp.get("cat", "O")
            sentence = dp.get("sentence", "")[:200]
            dp_summary += f"[Page {page}] [{cat}] {number} - {sentence}\n"

        # Build messages with chat history
        messages = []

        # Add previous chat turns
        for msg in chat_history[-10:]:  # Last 10 messages to stay within limits
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

        # Add current question with data context
        user_msg = f"Here are the extracted data points from the report:\n\n{dp_summary}\n\nUser question: {question}"
        messages.append({"role": "user", "content": user_msg})

        # Call Bedrock
        request_body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2000,
            "temperature": 0,
            "system": CHAT_SYSTEM,
            "messages": messages,
        })

        response = bedrock.invoke_model(
            modelId=MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=request_body,
        )

        result = json.loads(response["body"].read())
        answer = result["content"][0]["text"].strip()

        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({"answer": answer}),
        }

    except Exception as e:
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({"error": str(e)}),
        }
