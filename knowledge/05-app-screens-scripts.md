# App Screens and Operator Scripts

Expo Router app. Public web https://web.abliterated.app. Dev server typically :8081 or :8999.

## Routes
- GET / — streaming chat, reasoning accordion, code blocks, sandbox files
- GET /voice — full-duplex voice mode
- GET /studio — Neural Studio image gen and inpaint
- GET /telemetry — GB10 gauges, microservices, model storage
- GET /radar — mesh radar, tap to switch route
- Session deep link /session/[id]

## Chat sandbox
Each conversation has an isolated environment (sandbox-xxxx). Generated markdown fences sync as files. Download ZIP from the sandbox modal. Tests run via pytest/vitest in an ephemeral runner.

## npm scripts (repo root)
- npm run preflight — 8-point diagnostic
- npm run start-services — boot :7860, :8188, :17325
- npm run test-controller
- npm run agent — spark-agent
- npm run audit-image
- npm run test-rag — retriever unit checks
- npm start / npm run web — Expo

## RAG UI
Header and input dock show RAG chunk count. Sandbox modal Knowledge tab: ingest notes, upload files, reindex sandbox, reload bundled dataset, delete non-seed sources.
