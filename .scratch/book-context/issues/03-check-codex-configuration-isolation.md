# 03: Check Codex readiness and configuration isolation

**What to build:** Show a Codex setup result that establishes whether the installed, signed-in CLI can run with the required restricted configuration while keeping sign-in entirely within the CLI.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The plugin setup check discovers Codex or uses an executable path supplied by the user, reports the CLI version and sign-in status, and gives terminal instructions for missing setup.
- [ ] Establish a supported mechanism to exclude unrelated user configuration, MCP servers, plugins, apps, goals, and multi-agent behavior without reading or copying credential files.
- [ ] Validate isolation using harmless planted configuration and controlled protocol/executable fixtures. A successful answer alone is not an isolation check.
- [ ] The rejected ignore-user-config assumption from the prototype is not used as a working mechanism. Record the actual supported configuration behavior and compatibility limits.
- [ ] The setup result verifies the required app-server and dynamic-tool capabilities, with no selected environments, read-only restrictions, and declined approvals.
- [ ] If isolation cannot be established, show an actionable unsupported-configuration result and leave this capability unresolved. Do not declare the ticket complete with an unverified workaround, switch to token handling, or enable broader tools.
- [ ] This is a complete setup/diagnostic flow and can be implemented before the Reader or assistant sidebar. The live-question ticket remains gated by verified readiness.

Specification: Reading assistant with source document context. User stories: 44, 45, 46, 50.
Prototype evidence: retained commit `61eed56c18db7d962c3d3f984c89bf57f7db3df4`; use the specification and prototype findings for the accepted contracts and known limits.
