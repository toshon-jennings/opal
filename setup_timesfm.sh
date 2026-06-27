#!/bin/bash
set -e

# setup_timesfm.sh
# Automates the setup of a Python virtual environment and dependencies for the TimesFM MCP server.

SCRIPT_DIR="/Users/toshonjennings/opal"
VENV_DIR="$SCRIPT_DIR/timesfm-venv"
MCP_CONFIG="$SCRIPT_DIR/.mcp.json"

echo "=== Setting up TimesFM MCP Server Environment ==="

# 1. Check Python version
if ! command -v python3 &> /dev/null; then
    echo "Error: python3 is not installed on this system." >&2
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Detected system python3 version: $PYTHON_VERSION"

# 2. Create Virtual Environment
if [ -d "$VENV_DIR" ]; then
    echo "Virtual environment already exists at $VENV_DIR. Skipping creation."
else
    echo "Creating virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
fi

# 3. Activate Virtual Environment and Install Dependencies
echo "Activating virtual environment..."
source "$VENV_DIR/bin/activate"

echo "Upgrading pip..."
pip install --upgrade pip

echo "Installing PyTorch..."
# Standard torch installation (compatible with macOS CPU and Apple Silicon MPS out of the box)
pip install torch torchvision torchaudio

echo "Installing TimesFM..."
pip install timesfm

echo "Installing MCP, Matplotlib, and other helper packages..."
pip install mcp matplotlib numpy huggingface_hub

# 4. Register the MCP server in .mcp.json
echo "Registering TimesFM MCP Server in $MCP_CONFIG..."

python3 - <<EOF
import json
import os

mcp_json_path = "$MCP_CONFIG"
venv_python = "$VENV_DIR/bin/python"
server_script = "$SCRIPT_DIR/timesfm_mcp_server.py"

if os.path.exists(mcp_json_path):
    with open(mcp_json_path, "r") as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f"Warning: Could not parse existing .mcp.json, initializing new one. Error: {e}")
            data = {}
else:
    data = {}

if "mcpServers" not in data:
    data["mcpServers"] = {}

data["mcpServers"]["timesfm"] = {
    "command": venv_python,
    "args": [server_script]
}

with open(mcp_json_path, "w") as f:
    json.dump(data, f, indent=2)

print("TimesFM MCP Server registered successfully in .mcp.json!")
EOF

echo "=== Setup Completed Successfully ==="
echo "To test the MCP server in your terminal, run:"
echo "  $VENV_DIR/bin/python $SCRIPT_DIR/timesfm_mcp_server.py"
