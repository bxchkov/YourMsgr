#!/bin/bash

set -e

echo "================================================"
echo "    .Chat - Uninstall Script"
echo "================================================"
echo ""

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${YELLOW}WARNING: This will remove all .Chat data including messages!${NC}"
read -p "Are you sure you want to uninstall? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${GREEN}Uninstall cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Stopping services...${NC}"

# Stop systemd service
if systemctl is-active --quiet chat-server; then
    sudo systemctl stop chat-server
    sudo systemctl disable chat-server
    sudo rm /etc/systemd/system/chat-server.service
    sudo systemctl daemon-reload
    echo "✓ Systemd service stopped and removed"
fi

# Stop Docker containers
if docker ps -a | grep -q chat-postgres; then
    docker stop chat-postgres
    docker rm chat-postgres
    echo "✓ PostgreSQL container stopped and removed"
fi

# Remove Docker volumes
read -p "Remove database volume (all data will be lost)? (yes/no): " REMOVE_DATA
if [ "$REMOVE_DATA" = "yes" ]; then
    docker volume rm chat_db 2>/dev/null && echo "✓ Database volume removed"
fi

# Remove application files
read -p "Remove application directory? (yes/no): " REMOVE_DIR
if [ "$REMOVE_DIR" = "yes" ]; then
    SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    cd ..
    rm -rf "$SCRIPT_DIR"
    echo "✓ Application directory removed"
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}    Uninstall complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Docker and Bun are still installed."
echo "To remove them:"
echo "  sudo apt remove docker.io docker-compose  # Ubuntu/Debian"
echo "  rm -rf ~/.bun  # Remove Bun"
echo ""
