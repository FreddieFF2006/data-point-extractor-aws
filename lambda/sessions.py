import json
import boto3
import os
import time

dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
table = dynamodb.Table("data-point-sessions")

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Content-Type": "application/json",
}


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": HEADERS, "body": ""}

    try:
        if method == "GET":
            return list_sessions(event)
        elif method == "POST":
            return save_session(event)
        elif method == "DELETE":
            return delete_session(event)
        else:
            return {"statusCode": 405, "headers": HEADERS, "body": json.dumps({"error": "Method not allowed"})}
    except Exception as e:
        return {"statusCode": 500, "headers": HEADERS, "body": json.dumps({"error": str(e)})}


def list_sessions(event):
    result = table.scan(
        ProjectionExpression="sessionId, #n, createdAt, fileName, dataPointCount, chatCount",
        ExpressionAttributeNames={"#n": "name"}
    )
    items = sorted(result.get("Items", []), key=lambda x: x.get("createdAt", ""), reverse=True)
    # Convert Decimal to int/float for JSON
    for item in items:
        for k, v in item.items():
            if hasattr(v, "as_integer_ratio"):
                item[k] = int(v) if v == int(v) else float(v)
    return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"sessions": items})}


def save_session(event):
    body = json.loads(event.get("body", "{}"))
    session_id = body.get("sessionId")
    if not session_id:
        return {"statusCode": 400, "headers": HEADERS, "body": json.dumps({"error": "sessionId required"})}

    item = {
        "sessionId": session_id,
        "name": body.get("name", "Untitled"),
        "fileName": body.get("fileName", ""),
        "createdAt": body.get("createdAt", str(int(time.time() * 1000))),
        "dataPoints": body.get("dataPoints", []),
        "dataPointCount": body.get("dataPointCount", 0),
        "candidates": body.get("candidates", []),
        "chatHistory": body.get("chatHistory", []),
        "chatCount": len(body.get("chatHistory", [])),
        "catCounts": body.get("catCounts", {}),
        "totalPages": body.get("totalPages", 0),
    }

    table.put_item(Item=json.loads(json.dumps(item), parse_float=str))
    return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"saved": session_id})}


def delete_session(event):
    params = event.get("queryStringParameters") or {}
    session_id = params.get("sessionId", "")
    if not session_id:
        body = json.loads(event.get("body", "{}"))
        session_id = body.get("sessionId", "")
    if not session_id:
        return {"statusCode": 400, "headers": HEADERS, "body": json.dumps({"error": "sessionId required"})}

    table.delete_item(Key={"sessionId": session_id})
    return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"deleted": session_id})}
