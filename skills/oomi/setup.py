import json
import os
import sys

CONFIG_FILE = os.path.join(os.path.dirname(__file__), 'config.json')

def setup():
    print("Oomi Skill Setup")
    print("================")
    
    # Load existing config or defaults
    config = {"api_url": "http://localhost:3000/api/skill"}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r') as f:
                config.update(json.load(f))
        except:
            pass
    
    # Prompt user
    print(f"\nCurrent API URL: {config.get('api_url')}")
    new_url = input("Enter new API URL (press Enter to keep current): ").strip()
    
    if new_url:
        # Remove trailing slash if present
        if new_url.endswith('/'):
            new_url = new_url[:-1]
        config['api_url'] = new_url
    
    # Save
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        print(f"\nConfiguration saved to {CONFIG_FILE}")
        print("Setup complete!")
    except Exception as e:
        print(f"\nError saving configuration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    setup()
