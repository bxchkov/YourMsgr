#!/bin/bash

set -e

echo "================================================"
echo "    .Chat - Secure Messenger Installation"
echo "================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Please do not run as root${NC}"
  exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    echo -e "${RED}Cannot detect OS${NC}"
    exit 1
fi

echo -e "${GREEN}Detected OS: $OS${NC}"

# Install dependencies
install_dependencies() {
    echo -e "${YELLOW}Installing dependencies...${NC}"

    case $OS in
        ubuntu|debian)
            sudo apt update
            sudo apt install -y curl git docker.io docker-compose postgresql-client
            ;;
        centos|rhel|fedora)
            sudo yum install -y curl git docker docker-compose postgresql
            sudo systemctl start docker
            sudo systemctl enable docker
            ;;
        *)
            echo -e "${RED}Unsupported OS${NC}"
            exit 1
            ;;
    esac
}

# Install Bun
install_bun() {
    if ! command -v bun &> /dev/null; then
        echo -e "${YELLOW}Installing Bun...${NC}"
        curl -fsSL https://bun.sh/install | bash
        export PATH="$HOME/.bun/bin:$PATH"
    else
        echo -e "${GREEN}Bun already installed${NC}"
    fi
}

# Configure application
configure_app() {
    echo -e "${YELLOW}Configuring application...${NC}"

    read -p "Enter database password (default: random): " DB_PASSWORD
    if [ -z "$DB_PASSWORD" ]; then
        DB_PASSWORD=$(openssl rand -base64 32)
    fi

    read -p "Enter JWT access secret (default: random): " JWT_ACCESS
    if [ -z "$JWT_ACCESS" ]; then
        JWT_ACCESS=$(openssl rand -base64 32)
    fi

    read -p "Enter JWT refresh secret (default: random): " JWT_REFRESH
    if [ -z "$JWT_REFRESH" ]; then
        JWT_REFRESH=$(openssl rand -base64 32)
    fi

    read -p "Enter server port (default: 3000): " PORT
    PORT=${PORT:-3000}

    read -p "Enter domain or IP (default: localhost): " DOMAIN
    DOMAIN=${DOMAIN:-localhost}

    # Create .env file
    cat > server/.env << EOF
PORT=$PORT
NODE_ENV=production

DATABASE_URL=postgresql://chat_user:${DB_PASSWORD}@localhost:5432/chat

JWT_ACCESS_SECRET=$JWT_ACCESS
JWT_REFRESH_SECRET=$JWT_REFRESH

ALLOWED_ORIGINS=http://${DOMAIN},https://${DOMAIN}

RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=15
EOF

    echo -e "${GREEN}Configuration saved to server/.env${NC}"
}

# Setup database
setup_database() {
    echo -e "${YELLOW}Setting up database...${NC}"

    # Start PostgreSQL with Docker
    docker run -d \
        --name chat-postgres \
        -e POSTGRES_USER=chat_user \
        -e POSTGRES_PASSWORD=$DB_PASSWORD \
        -e POSTGRES_DB=chat \
        -p 5432:5432 \
        -v chat_db:/var/lib/postgresql/data \
        postgres:16-alpine

    sleep 5

    cd server
    bun install
    bun run db:generate
    bun run db:migrate
    cd ..

    echo -e "${GREEN}Database setup complete${NC}"
}

# Install and build
build_app() {
    echo -e "${YELLOW}Building application...${NC}"

    # Server
    cd server
    bun install --production
    cd ..

    # Client
    cd client
    npm install
    npm run build
    cd ..

    echo -e "${GREEN}Build complete${NC}"
}

# Create systemd service
create_service() {
    echo -e "${YELLOW}Creating systemd service...${NC}"

    sudo tee /etc/systemd/system/chat-server.service > /dev/null << EOF
[Unit]
Description=.Chat Server
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=$(pwd)/server
ExecStart=$HOME/.bun/bin/bun run start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable chat-server
    sudo systemctl start chat-server

    echo -e "${GREEN}Service created and started${NC}"
}

# Main installation
main() {
    echo -e "${YELLOW}Starting installation...${NC}"

    install_dependencies
    install_bun
    configure_app
    setup_database
    build_app
    create_service

    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}    Installation complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "Server running on: ${GREEN}http://${DOMAIN}:${PORT}${NC}"
    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl status chat-server  # Check status"
    echo "  sudo systemctl restart chat-server # Restart"
    echo "  sudo systemctl stop chat-server    # Stop"
    echo "  sudo journalctl -u chat-server -f # View logs"
    echo ""
}

main
