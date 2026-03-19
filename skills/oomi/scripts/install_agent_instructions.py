import argparse
import os
import sys

DEFAULT_MARKER_START = "<oomi-agent-instructions>"
DEFAULT_MARKER_END = "</oomi-agent-instructions>"


def read_file(path: str) -> str:
    with open(path, "r") as f:
        return f.read()


def write_file(path: str, content: str) -> None:
    with open(path, "w") as f:
        f.write(content)


def get_default_agents_file() -> str:
    # Prefer explicit workspace env, otherwise use repo root if detected
    workspace = os.environ.get("OPENCLAW_WORKSPACE") or os.environ.get("OPENCLAW_HOME")
    if workspace:
        return os.path.join(workspace, "AGENTS.md")
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "AGENTS.md"))


def build_block(instructions: str, marker_start: str, marker_end: str) -> str:
    return f"{marker_start}\n{instructions.strip()}\n{marker_end}"


def install_block(agents_path: str, block: str, marker_start: str, marker_end: str) -> None:
    if os.path.exists(agents_path):
        existing = read_file(agents_path)
    else:
        existing = ""

    if marker_start in existing and marker_end in existing:
        # Replace existing block
        pre = existing.split(marker_start)[0]
        post = existing.split(marker_end)[1]
        content = f"{pre}{block}{post}"
    else:
        # Append block
        spacer = "\n\n" if existing and not existing.endswith("\n\n") else ""
        content = f"{existing}{spacer}{block}\n"

    write_file(agents_path, content)


def main() -> None:
    parser = argparse.ArgumentParser(description="Install Oomi agent instructions into AGENTS.md.")
    parser.add_argument(
        "--agents-file",
        default=get_default_agents_file(),
        help="Path to AGENTS.md (defaults to OPENCLAW_WORKSPACE/AGENTS.md or repo AGENTS.md).",
    )
    parser.add_argument(
        "--instructions-file",
        default=os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "agent_instructions.md")),
        help="Path to instructions markdown file.",
    )
    parser.add_argument("--marker-start", default=DEFAULT_MARKER_START, help="Start marker.")
    parser.add_argument("--marker-end", default=DEFAULT_MARKER_END, help="End marker.")
    args = parser.parse_args()

    if not os.path.exists(args.instructions_file):
        print(f"Instructions file not found: {args.instructions_file}", file=sys.stderr)
        sys.exit(1)

    instructions = read_file(args.instructions_file)
    block = build_block(instructions, args.marker_start, args.marker_end)
    install_block(args.agents_file, block, args.marker_start, args.marker_end)

    print(f"Installed Oomi instructions into {args.agents_file}")


if __name__ == "__main__":
    main()
