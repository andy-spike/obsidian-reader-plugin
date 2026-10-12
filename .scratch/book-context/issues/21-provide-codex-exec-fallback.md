# 21: Provide the disclosed Codex exec fallback

**What to build:** When required app-server capabilities are unavailable, answer through the approved Codex exec/MCP fallback and show its different streaming and tool restrictions.

**Blocked by:** 06: Ask Codex about EPUB context.

**Status:** ready-for-agent

- [ ] Startup capability checks select primary mode when compatible and the exec fallback only when its required restrictions and document transport can be established.
- [ ] The fallback consumes the same source-bound, bounded document operations through authenticated loopback MCP. Pass its session token through the agreed environment/config mechanism without subscription credentials.
- [ ] Normalize completed messages, document-tool activity, errors, and approvals through the shared adapter interface. Do not present whole-message output as incremental text streaming.
- [ ] The setup result and sidebar identify fallback mode and its weaker shell/file-tool restriction. Retain read-only operation, declined approvals, excluded unrelated configuration/capabilities, and empty working directory.
- [ ] If the required isolation or tools cannot be established, show setup failure rather than silently granting broader access. Do not claim primary-mode environment removal applies to exec.
- [ ] Controlled workflow cases cover primary capability failure, fallback success, unsupported fallback configuration, cancellation/errors through the shared lifecycle, and evidence/citation consistency.
- [ ] Demonstrate an opt-in fallback question. Session metadata remains sufficient for the existing conversation workflow to identify its active mode.

Specification: Reading assistant with source document context. User stories: 44, 47, 50.
