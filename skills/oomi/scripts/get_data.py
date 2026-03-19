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

API_URL = f"{BASE_URL}/data"

def get_data():
    try:
        with urllib.request.urlopen(API_URL) as response:
            data = json.loads(response.read().decode())
        
        # Format output for the agent
        summary = (
            f"Steps: {data['steps']} / {data['goals']['steps']}\n"
            f"Sleep: {data['sleep']}h / {data['goals']['sleep']}h\n"
            f"Energy: {data['energy']}/100\n"
            f"Mood: {data['mood']}"
        )
        
        print(json.dumps({
            "summary": summary,
            "raw_data": data
        }, indent=2))
        
    except urllib.error.URLError as e:
        print(json.dumps({
            "error": f"Failed to connect to Oomi app: {str(e)}",
            "hint": "Is the Next.js app running on localhost:3000?"
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            "error": f"An error occurred: {str(e)}"
        }))
        sys.exit(1)

if __name__ == "__main__":
    get_data()
