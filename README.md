# YourMsgr

A secure messenger with Docker-first deployment, public chat, private chats, and E2EE for private conversations.

## Quick Install on Linux

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash

```

This command now handles **bootstrap only**:

1. Installs Docker if necessary;
2. Clones or updates the project repository into `/opt/yourmsgr`;
3. Installs the `yourmsgr` helper CLI utility;
4. Does not spin up any containers automatically.

Once the bootstrap phase is complete, the application remains unconfigured and stopped.

## Breakdown of the Installation Command

```bash
curl -fsSL https://raw.githubusercontent.com/bxchkov/YourMsgr/main/install.sh | sudo bash

```

* `curl` fetches the installer script;
* `-f` forces the command to fail silently on server errors (non-200 HTTP responses);
* `-s` runs in silent mode, hiding progress meters and unnecessary output;
* `-S` ensures error messages are still displayed if the request fails;
* `-L` follows any HTTP redirects automatically;
* `| sudo bash` pipes the downloaded script directly into `bash` with root privileges.

> **Note:** When using `curl | bash`, the `stdin` stream is consumed by the script itself, making an interactive wizard problematic at this stage. Because of this, domain and HTTPS setup are handled during the first launch via the `yourmsgr` utility rather than during the initial bootstrap.

---

## First Launch After Installation

**Option A: Using the TUI Menu**

```bash
sudo yourmsgr

```

Then follow these steps:

1. Open `Service management`;
2. Select `Start application`;
3. Complete the domain and HTTPS setup wizard;
4. Wait for the ACME SSL certificate issuance and container startup.

**Option B: Direct Command Line**

```bash
sudo yourmsgr service start

```

If no configuration file is detected, the helper tool automatically initiates the first-time setup wizard.

---

## Application Lifecycle Architecture

### 1. Bootstrap

* Project repository is cloned.
* CLI helper tool is installed globally.
* Services remain stopped.
* Domain name is not yet configured.

### 2. First Start

* Prompt for the target domain name.
* DNS resolution validation to ensure the domain points to the current host.
* Port `80/tcp` availability check.
* Automatic Caddy reverse-proxy initialization with trusted HTTPS via ACME.
* First administrator account creation.

### 3. Reconfigure

If you need to update the domain name later, a full reinstallation is unnecessary:

```bash
sudo yourmsgr reconfigure

```

*or*

```bash
sudo yourmsgr setup

```

The wizard overwrites the existing configuration and safely restarts the environment stack.

---

## Core Helper Commands

```bash
yourmsgr
yourmsgr version
yourmsgr status
yourmsgr setup
yourmsgr reconfigure
yourmsgr logs
yourmsgr check-update
sudo yourmsgr update
sudo yourmsgr service start
sudo yourmsgr service stop
sudo yourmsgr service restart
sudo yourmsgr service autostart on
sudo yourmsgr service autostart off
sudo yourmsgr service autorestart on
sudo yourmsgr service autorestart off
yourmsgr admin stats
sudo yourmsgr uninstall

```

---

## Updates

The recommended update flow is as follows:

```bash
yourmsgr check-update
sudo yourmsgr update

```

**Under the Hood:**

* `check-update` compares the local `VERSION` file with the upstream release on GitHub.
* `update` pulls the latest codebase changes and refreshes the CLI helper utility.
* If the application has already been configured, the update process automatically rebuilds and restarts the container stack.
* If the bootstrap phase was executed but the application has not yet been configured, `update` simply updates the source code without starting any services.

---

## Administration

The project does not feature a dedicated web administration panel. Administrative tasks are managed via:

1. The server-side CLI tool.
2. The `admin` privilege level within the standard client application interface.

### Admin CLI Quick Reference

```bash
yourmsgr admin stats
yourmsgr admin users:list
yourmsgr admin users:get <login>
yourmsgr admin users:create-auto
yourmsgr admin users:create-auto --admin
yourmsgr admin users:role <login> <user|admin>
yourmsgr admin users:logout <login>
yourmsgr admin users:delete <login>
yourmsgr admin messages:admin-post <admin-login> <message>
yourmsgr admin messages:purge-group <login>

```

---

## Manual Execution via Docker Compose

For development or custom orchestration environments:

```bash
cp .env.example .env
cp server/.env.example server/.env
docker compose up -d --build

```

> **Recommendation:** The automated installer/helper routine remains highly recommended for production deployments.

---

## Technology Stack

### Backend
* **Language:** Go (Golang 1.22+)
* **Framework & Router:** Fiber v2 (ultra-fast, Express/Hono-like router)
* **Database Connection:** pgx/v5 (high-performance PostgreSQL connection pool)
* **Real-time Networking:** gorilla/websocket (robust state-management hub)
* **Pub/Sub Cluster:** PostgreSQL LISTEN/NOTIFY for real-time event synchronization across nodes
* **Security & Auth:** JWT + Bcrypt, CSRF Protection, and HTTP Rate Limiting

### Frontend
* **Framework:** Vue 3
* **State Management:** Pinia
* **Routing:** Vue Router
* **Build Tool:** Vite
* **Styling:** SCSS
* **Cryptography:** Web Crypto API + tweetnacl (client-side encryption)

### Infrastructure
* **Containerization:** Docker Compose
* **Reverse Proxy / TLS:** Caddy (automated HTTPS with Let's Encrypt / ZeroSSL)

---

## 🔒 Security Posture & Cryptography (E2EE)
YourMsgr enforces strict **End-to-End Encryption (E2EE)** for private conversations:
1. **Zero-Knowledge Backend:** The server never sees the plaintext messages or private keys. Encryption and decryption occur strictly on the client side using the **Web Crypto API** (AES-GCM for payload encryption) and **X25519** for key exchange.
2. **Double Submit CSRF Protection:** Mutating REST requests require a custom `X-CSRF-Token` header validated against browser-scoped Lax cookies.
3. **Session Hardening:** Multi-device active sessions (refresh token lists) with rotation and automatic invalidation on sensitive changes (e.g., username updates, role modifications).

---

## Current Version

`2.2.0`

## License

MIT - see [LICENSE](file:///D:/urfu/YourMsgr/LICENSE) for details.
