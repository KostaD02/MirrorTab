# Security Policy

## Supported Versions

The following versions of MirrorTab are actively supported with security updates.

| Version  | Supported |
| -------- | --------- |
| < 1.1.3  | ❌        |
| >= 1.1.3 | ✔️        |

## Reporting a Vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Instead, please report them directly to me by emailing [konstantine@datunishvili.ge](mailto:konstantine@datunishvili.ge).

### General Context

As a browser extension capturing DOM events, MirrorTab handles sensitive user input locally on the browser. However, MirrorTab itself is designed entirely for your local environment context. It does **not** send any captured data, session records, or variables to external servers. It only mirrors it between the active source and target tabs that you explicitly define.
