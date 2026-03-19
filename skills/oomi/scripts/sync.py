import urllib.request
import urllib.error
import json
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

API_URL = f"{BASE_URL}/sync"

def sync_context():
    # In a real scenario, this might read from stdin or a file provided by the agent
    # For now, we send a dummy context
    payload = {
        "agent_id": "nemu-agent",
        "context_summary": "User is actively working on coding tasks.",
        "suggested_mode": "working"
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
            "error": f"Failed to sync: {str(e)}"
        }))
        sys.exit(1)

if __name__ == "__main__":
    sync_context()
