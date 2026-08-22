#!/usr/bin/env bash
set -euo pipefail

# Perci Automated Backup Script
# Backs up configuration, notes, and other data for periodic backup

BACKUP_ROOT="${PERCI_BACKUP_DIR:-/tmp/perci-backups}"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
SOURCE_USER_DATA="${HOME}/Library/Application Support/Perci"
SOURCE_OPAL="${HOME}/opal"

# Ensure backup root exists
mkdir -p "$BACKUP_ROOT"

echo "=== Perci Backup Started: $TIMESTAMP ==="
echo "Backup directory: $BACKUP_DIR"

# 1. Backup perci-data.json (main config: encrypted API keys, tokens, etc.)
if [ -f "$SOURCE_USER_DATA/perci-data.json" ]; then
  mkdir -p "$BACKUP_DIR"
  cp "$SOURCE_USER_DATA/perci-data.json" "$BACKUP_DIR/perci-data.json"
  echo "✓ Backed up perci-data.json"
else
  echo "⚠ perci-data.json not found at $SOURCE_USER_DATA/perci-data.json"
fi

# 2. Backup notes directory (from opal repo)
if [ -d "$SOURCE_OPAL/notes/notes" ]; then
  cp -r "$SOURCE_OPAL/notes/notes" "$BACKUP_DIR/notes"
  echo "✓ Backed up notes"
else
  echo "⚠ notes/notes directory not found"
fi

# 3. Backup okf_bundle
if [ -d "$SOURCE_OPAL/notes/okf_bundle" ]; then
  cp -r "$SOURCE_OPAL/notes/okf_bundle" "$BACKUP_DIR/okf_bundle"
  echo "✓ Backed up okf_bundle"
else
  echo "⚠ okf_bundle directory not found"
fi

# 4. Backup OpenClaw diary
if [ -f "$HOME/.openclaw/workspace/DIARY.md" ]; then
  mkdir -p "$BACKUP_DIR"
  cp "$HOME/.openclaw/workspace/DIARY.md" "$BACKUP_DIR/openclaw-diary.md"
  echo "✓ Backed up OpenClaw diary"
else
  echo "⚠ OpenClaw diary not found"
fi

# 5. Backup supermemory data
if [ -d "$SOURCE_USER_DATA/supermemory" ]; then
  cp -r "$SOURCE_USER_DATA/supermemory" "$BACKUP_DIR/supermemory"
  echo "✓ Backed up supermemory"
else
  echo "⚠ supermemory directory not found"
fi

# 6. Backup usage tracker
if [ -f "$SOURCE_USER_DATA/usage-tracker/subscriptions.json" ]; then
  mkdir -p "$BACKUP_DIR"
  cp "$SOURCE_USER_DATA/usage-tracker/subscriptions.json" "$BACKUP_DIR/usage-tracker-subscriptions.json"
  echo "✓ Backed up usage tracker"
else
  echo "⚠ usage-tracker not found"
fi

# 7. Backup agentmail
if [ -f "$SOURCE_USER_DATA/agentmail.json" ]; then
  cp "$SOURCE_USER_DATA/agentmail.json" "$BACKUP_DIR/agentmail.json"
  echo "✓ Backed up agentmail.json"
else
  echo "⚠ agentmail.json not found"
fi

# 8. Create a symlink to the latest backup for easy access
LATEST_LINK="${BACKUP_ROOT}/latest"
if [ -L "$LATEST_LINK" ]; then
  rm "$LATEST_LINK"
fi
ln -s "$TIMESTAMP" "$LATEST_LINK"

# 9. Prune old backups (keep last N)
KEEP_COUNT="${PERCI_BACKUP_KEEP:-10}"
COUNT=$(ls -d "${BACKUP_ROOT}"/*/ 2>/dev/null | wc -l)
if [ "$COUNT" -gt "$KEEP_COUNT" ]; then
  echo "Pruning old backups (keeping last $KEEP_COUNT)..."
  ls -d -t "${BACKUP_ROOT}"/*/ 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs rm -rf
fi

echo "=== Perci Backup Complete ==="
echo "Latest backup: $LATEST_LINK"
echo "Backup stored at: $BACKUP_DIR"