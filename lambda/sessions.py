import json
import boto3
import time
import traceback
from decimal import Decimal

dynamodb = boto3.resource("dynamodb", region_name="ap-northeast-1")
table = dynamodb.Table("data-point-sessions")

HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Content-Type": "application/json",
}


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def clean_for_dynamo(obj):
    """Recursively clean data for DynamoDB: no floats, no empty strings."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: clean_for_dynamo(v) for k, v in obj.items() if v != "" and v is not None}
    if isinstance(obj, list):
        return [clean_for_dynamo(i) for i in obj]
    if isinstance(obj, str) and obj == "":
        return None
    return obj


def handler(event, context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if method == "OPTIONS":
        return {"statusCode": 200, "headers": HEADERS, "body": ""}

    try:
        if method == "GET":
            return list_sessions()
        elif method == "POST":
            return save_session(event)
        elif method == "DELETE":
            return delete_session(event)
        else:
            return {"statusCode": 405, "headers": HEADERS, "body": json.dumps({"error": "Method not allowed"})}
    except Exception as e:
        print(f"ERROR: {str(e)}")
        print(traceback.format_exc())
        return {"statusCode": 500, "headers": HEADERS, "body": json.dumps({"error": str(e)})}


def list_sessions():
    try:
        result = table.scan(
            ProjectionExpression="sessionId, #n, createdAt, fileName, dataPointCount, chatCount",
            ExpressionAttributeNames={"#n": "name"}
        )
        items = result.get("Items", [])
        items = sorted(items, key=lambda x: x.get("createdAt", ""), reverse=True)
        return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"sessions": items}, cls=DecimalEncoder)}
    except Exception as e:
        print(f"LIST ERROR: {str(e)}")
        print(traceback.format_exc())
        return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"sessions": []})}


def save_session(event):
    body = json.loads(event.get("body", "{}"))
    session_id = body.get("sessionId")
    if not session_id:
        return {"statusCode": 400, "headers": HEADERS, "body": json.dumps({"error": "sessionId required"})}

    item = {
        "sessionId": session_id,
        "name": body.get("name") or "Untitled",
        "fileName": body.get("fileName") or "none",
        "createdAt": body.get("createdAt") or str(int(time.time())),
        "dataPointCount": body.get("dataPointCount", 0),
        "chatCount": len(body.get("chatHistory", [])),
        "totalPages": body.get("totalPages", 0),
        "dataPoints": body.get("dataPoints", []),
        "chatHistory": body.get("chatHistory", []),
        "catCounts": body.get("catCounts", {}),
    }

    cleaned = clean_for_dynamo(item)
    table.put_item(Item=cleaned)
    return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"saved": session_id})}


def delete_session(event):
    params = event.get("queryStringParameters") or {}
    session_id = params.get("sessionId", "")
    if not session_id:
        try:
            body = json.loads(event.get("body", "{}"))
            session_id = body.get("sessionId", "")
        except:
            pass
    if not session_id:
        return {"statusCode": 400, "headers": HEADERS, "body": json.dumps({"error": "sessionId required"})}

    table.delete_item(Key={"sessionId": session_id})
    return {"statusCode": 200, "headers": HEADERS, "body": json.dumps({"deleted": session_id})}
