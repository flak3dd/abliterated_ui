# Network Interfaces and Routing Matrix

Verified Spark / Mac / cloud routes for Abliterated.

## Hosts
- Abliterated Cloud IO (mirror): api.abliterated.io HTTPS :443
- Featherless AI Mesh: https://api.featherless.ai/v1 — serverless open-weight router (~30–60ms)
- Direct LAN Spark (primary): 192.168.4.103 — NVIDIA DGX Spark GB10 (~10–13ms)
- Secondary LAN Spark NIC: 192.168.4.101 (~20–60ms)
- Tailscale Spark: 100.94.45.77 hostname gx10-d0e7 (~10–25ms)
- Mac host LAN: 192.168.4.50 — Metro, gateway (~1–3ms)
- Mac Tailscale: 100.120.81.22
- Localhost: 127.0.0.1

## Default mesh
The mobile/desktop client mesh store defaults the active Spark LAN host to 192.168.4.103.
Cloud endpoints use port 443 and HTTPS. LAN services use HTTP on their native ports.

The sidebar Mac / Spark buttons are not this mesh. They set the sandbox execution target (`useSandboxStore.target`): Mac = this machine (`/tmp/spark-sandboxes`); Spark = GB10 box (`dgx_spark`). Chat/mesh is Spark / Cloud Mesh on the Radar Mesh tab, the drawer, and the `Spark (103)` / `Cloud Mesh` pill.

## Public app
- https://web.abliterated.app
- Local Expo/web: http://192.168.4.50:8081/ or http://localhost:8081/
