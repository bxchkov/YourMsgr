# YourMsgr Project Roadmap 🚀

This document outlines the planned improvement waves and milestones for the **YourMsgr** self-hosted encrypted messaging platform.

---

## 🌊 Completed Milestones

### **Go Backend Migration (v2.2.0)**
* [x] Port server core from Bun/Hono to Go (Golang) for maximum memory efficiency and CPU performance.
* [x] Integrate PostgreSQL native connection pool (`pgx/v5`).
* [x] Implement multi-device sessions with Token Rotation.
* [x] Enforce standard HTTP Rate Limiting and double-submit CSRF Protection.
* [x] Restore concurrent real-time Pub/Sub using PostgreSQL `LISTEN/NOTIFY` to scale WebSocket events horizontally.

---

## 📅 Future Milestones & Active Waves

### **Wave 1: Advanced Cryptography Hardening & TOFU (Active)**
* [ ] **Trust On First Use (TOFU):** Cache dialog public keys locally on the client and raise security flags if a public key changes.
* [ ] **Local Storage Encryption:** Protect client-side local cache using key derivation functions (PBKDF2/scrypt).
* [ ] **Message Decryption Refinement:** Fix edge cases in preview decryption for self-sent E2EE payloads.

### **Wave 2: Clustering & High Availability**
* [ ] **Redis Adapter:** Transition from PostgreSQL `LISTEN/NOTIFY` to Redis Pub/Sub for sub-millisecond cluster routing under heavy load.
* [ ] **Media Assets S3 Storage:** Integrate S3-compatible cloud storage for encrypted attachments.

### **Wave 3: Anti-Censorship & Obfuscation**
* [ ] **Shadowsocks/V2Ray Obfuscation Layer:** Obfuscate WebSocket traffic to bypass aggressive Deep Packet Inspection (DPI) in heavily censored regions.
* [ ] **Domain Fronting & Alternative Entry Points:** Allow dynamic endpoint swapping if the main server domain is blocked.

### **Wave 4: DevOps & Orchestration**
* [ ] **Kubernetes Helm Charts:** Provide official Helm charts for Kubernetes cluster deployments.
* [ ] **GitHub Actions Automated Vulnerability Scans:** Integrate AI-driven SAST/DAST scanning pipelines (leveraging OpenAI Codex API / Claude API).
