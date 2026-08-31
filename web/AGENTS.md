<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Backend

This project uses the Nest API in `apps/api` with PostgreSQL (Prisma), Redis, and S3-compatible object storage.

Frontend data access goes through `src/data/**` adapters (`apiClient` → Nest). Do not add Convex or other dual-backend provider switches.
