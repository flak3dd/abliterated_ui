# App Screens and Operator Scripts

Expo Router app. Public web https://web.abliterated.app. Dev server typically :8081 or :8999.

## Routes
- GET / — streaming chat, reasoning accordion, code blocks, sandbox files
- GET /voice — full-duplex voice mode
- GET /studio — Neural Studio image gen and inpaint
- GET /radar — Radar Mesh ops tab: GB10 gauges, model storage, mesh profile, endpoints, cloud credentials, emulation
- GET /telemetry — redirects to /radar
- Session deep link /session/[id]

## Chat sandbox
Each conversation has an isolated environment (sandbox-xxxx). Generated markdown fences sync as files. Download ZIP from the sandbox modal. Tests run via pytest/vitest in an ephemeral runner.

## BUILD agent (in-chat)
Toggle **Agent: BUILD** in the input dock. Requires Spark mesh + an active sandbox. Runs a tool loop (list/read/write/edit/grep/exec/test/build/github/plan) against the session env — it does **not** silently fall through to normal chat when gated off. Mode persists via AsyncStorage. No step/exec/wall budgets (runs until done or user cancel). GitHub: allowlisted `git`/`gh` via exec, plus `github` helper (pr_list/view/create, repo_view, issue_list, auth_status). Soft-blocks force-push to main/master and `.env` reads. If `gh` is not logged in, agent surfaces “GitHub CLI not logged in” — run `gh auth login` on the Mac. CLI `npm run agent` remains the interactive spark-agent outside the UI.

## Mac / Spark vs Spark / Cloud Mesh
Mac / Spark in the sidebar is the sandbox execution target (`useSandboxStore.target`). It does not switch chat or mesh.

- Mac → run tests/builds/commands on this machine (`/tmp/spark-sandboxes`)
- Spark → run the sandbox on the GB10 box (`dgx_spark`). The same control is labeled DGX GB10 in the terminal drawer and DGX Spark Blackwell in the environment modal. It is not Featherless/Abliteration.

Spark / Cloud Mesh (`useMeshStore.meshMode`) is a separate control. Spark routes chat/images to LOCAL SPARK (`192.168.4.103`). Cloud Mesh routes chat to EXTERNAL APIS (Featherless / Abliteration). Radar Mesh, the drawer, and the sidebar pill `Spark (103)` / `Cloud Mesh` all drive mesh mode.

## npm scripts (repo root)
- npm run preflight — 8-point diagnostic
- npm run start-services — boot :7860, :17325
- npm run test-controller
- npm run agent — spark-agent
- npm run audit-image
- npm run test-rag — retriever unit checks
- npm start / npm run web — Expo

## RAG UI
Header and input dock show RAG chunk count. Sandbox modal Knowledge tab: ingest notes, upload files, reindex sandbox, reload bundled dataset, delete non-seed sources.
