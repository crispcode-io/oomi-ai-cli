import urllib.request
import urllib.error
import json
import argparse
import os
import sys

# Load config
try:
    config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config.json')
    with open(config_path, 'r') as f:
        config = json.load(f)
        BASE_URL = config.get('api_url', 'http://localhost:3000/api/skill')
except:
    BASE_URL = 'http://localhost:3000/api/skill'

API_URL = f"{BASE_URL}/goal"

def send_goal(goal_type, value, message=None):
    payload = {
        "type": goal_type,
        "value": value,
        "message": message
    }
    
    try:
        req = urllib.request.Request(
            API_URL, 
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
        
        print(json.dumps(result, indent=2))
        
    except urllib.error.URLError as e:
        print(json.dumps({
            "error": f"Failed to send goal: {str(e)}",
            "hint": "Is the Next.js app running on localhost:3000?"
        }))
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Set a goal in Oomi")
    parser.add_argument("--type", required=True, help="Type of goal (e.g. steps, sleep)")
    parser.add_argument("--value", required=True, type=float, help="Goal target value")
    parser.add_argument("--message", help="Optional motivational message")
    
    args = parser.parse_args()
    
    send_goal(args.type, args.value, args.message)
