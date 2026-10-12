# 22: Run assistant CLI questions across supported desktop systems

**What to build:** Use the configured assistant CLI to ask a source document question on Linux, macOS, and Windows, including installations with spaces or command wrappers in their paths.

**Blocked by:** 20: Choose assistant models and control web research; 21: Provide the disclosed Codex exec fallback.

**Status:** ready-for-agent

- [ ] Launch installed executables using the agreed direct child-process strategy, retaining the CLI’s own sign-in and inherited environment without opening credential files.
- [ ] Resolve the native Codex executable behind a Windows wrapper when available. If a wrapper must be used, launch it through the built-in command interpreter with safe argument handling.
- [ ] Arguments containing spaces and user question text cannot become shell commands. End-user setup requires no separate Node.js or Git for Windows for the plugin adapter.
- [ ] Exercise discovery and explicit executable paths for Claude Code, Codex primary mode, and the exec fallback using controlled executables/protocol fixtures.
- [ ] Record native smoke results on supported desktop environments for an actual source-question/citation flow, or leave the missing environment validation explicitly unresolved. Linux-only argument checks do not establish Windows/macOS runtime compatibility.
- [ ] Keep platform differences behind the existing adapters and shared workflow; do not add platform-specific retrieval behavior or require a second assistant interface.

Specification: Reading assistant with source document context. User stories: 45, 46, 56.
