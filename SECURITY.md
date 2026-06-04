# Security Policy

## Supported Versions

Only the latest release version on the `main` branch is actively supported with security updates.

| Version | Supported |
| ------- | --------- |
| v2.2.x  | ✅ Yes     |
| < v2.2  | ❌ No      |

## Reporting a Vulnerability

We take the security of **YourMsgr** seriously. If you find a security vulnerability, please do **NOT** open a public issue on GitHub. Instead, report it privately.

You can report security issues by sending an email to:
**bxchkov@example.com** (Replace with your actual contact or a placeholder, but standard format is highly recommended)

Please include the following information in your report:
* A detailed description of the vulnerability.
* Steps to reproduce the issue (PoC script, request payloads, or screenshots).
* Potential impact of the vulnerability (e.g., privilege escalation, E2EE bypass).

We will acknowledge your report within 48 hours and work with you to patch the issue before making it public.

## Security Practices

* **End-to-End Encryption (E2EE):** Plaintext messages are never sent or stored on the server.
* **Regular Audits:** We continuously audit our Go-backend and Vue-frontend implementations for memory leaks, privilege escalation, and session hijack risks.
* **Safe CLI execution:** Elevated administration commands are strictly limited to local host-level CLI flags.
