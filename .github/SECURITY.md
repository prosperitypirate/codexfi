# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| latest  | :white_check_mark: |

## Reporting a Vulnerability

We take the security of opencode-memory seriously. If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to report

1. **Preferred:** Use GitHub's [private vulnerability reporting](https://github.com/prosperitypirate/opencode-memory/security/advisories/new) feature.
2. **Alternative:** Email security concerns to the maintainers via the contact listed on the organization profile.

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to expect

- **Acknowledgment** within 48 hours
- **Status update** within 7 days
- **Resolution** for confirmed vulnerabilities as quickly as possible

### Scope

This project runs as a **local, self-hosted service**. The primary security concerns are:

- API key exposure (XAI, Voyage AI)
- Data injection via LanceDB query parameters
- Unauthorized access to stored memories
- Docker container security

### Out of scope

- Attacks requiring physical access to the host machine
- Social engineering
- Denial of service against the local service
