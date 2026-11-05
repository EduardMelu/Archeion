# Synthetic fixture platform

Acme is invented. This platform exists to exercise Archeion across three repositories and shared Azure resources. Nothing is deployed, no Azure account is involved, and every value that looks like a credential is a placeholder.

Tests and the demo copy these folders to a temporary directory and turn each one into a real Git repository; see `e2e/platform.ts`.
