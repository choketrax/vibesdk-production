---
name: saas-foundation
description: Reusable Cloudflare-native SaaS foundation modules (verified-context tenant isolation, RBAC, idempotent billing webhooks, audit logging, and additive SQLite migrations) for converting repositories into multi-tenant SaaS apps.
---

Use this skill whenever converting an imported repository into a multi-tenant SaaS application inside SpaceDO (`App` Durable Object Facet with SQLite).

## Core Security Invariants
1. **Verified Tenant Context Only:** Derive `userId` and `tenantId` exclusively from signed session cookies or bearer JWTs verified server-side. NEVER accept `tenantId` or `userId` from query parameters, headers (`X-Tenant-Id`), or JSON bodies.
2. **Enforced SQLite Tenant Isolation:** Every multi-tenant business table MUST have `tenant_id TEXT NOT NULL`, and every `SELECT`, `UPDATE`, and `DELETE` MUST include `WHERE tenant_id = ?` bound to the verified context.
3. **Server-Side RBAC:** Enforce role checks (`owner | admin | member`) on every administrative and mutation endpoint before touching database state.
4. **Idempotent Billing Webhooks:** Always verify HMAC signatures using WebCrypto (`crypto.subtle.verify`) and deduplicate against a `processed_webhooks (event_id TEXT PRIMARY KEY, processed_at INTEGER)` table inside the same request flow.
5. **Additive Migrations Only:** Use `CREATE TABLE IF NOT EXISTS` and safe `ALTER TABLE ... ADD COLUMN` migrations so rollbacks never corrupt persisted state.

## Reference Schema & Helpers (App DO SQLite)

```ts
export function initSaasSchema(sql: SqlStorage): void {
	sql.exec(`
		CREATE TABLE IF NOT EXISTS tenants (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			plan TEXT NOT NULL DEFAULT 'free',
			created_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS memberships (
			user_id TEXT NOT NULL,
			tenant_id TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'member',
			PRIMARY KEY (user_id, tenant_id)
		);
		CREATE TABLE IF NOT EXISTS audit_events (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			actor_id TEXT NOT NULL,
			action TEXT NOT NULL,
			metadata TEXT,
			created_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS processed_webhooks (
			event_id TEXT PRIMARY KEY,
			event_type TEXT NOT NULL,
			processed_at INTEGER NOT NULL
		);
	`);
}

export function requireRole(
	sql: SqlStorage,
	userId: string,
	tenantId: string,
	allowed: Array<'owner' | 'admin' | 'member'>,
): void {
	const rows = sql
		.exec<{ role: string }>(
			'SELECT role FROM memberships WHERE user_id = ? AND tenant_id = ?',
			userId,
			tenantId,
		)
		.toArray();
	const role = rows[0]?.role as 'owner' | 'admin' | 'member' | undefined;
	if (!role || !allowed.includes(role)) {
		throw new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
	}
}

export function recordAuditEvent(
	sql: SqlStorage,
	tenantId: string,
	actorId: string,
	action: string,
	metadata?: Record<string, unknown>,
): void {
	sql.exec(
		'INSERT INTO audit_events (id, tenant_id, actor_id, action, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
		crypto.randomUUID(),
		tenantId,
		actorId,
		action,
		metadata ? JSON.stringify(metadata) : null,
		Date.now(),
	);
}
```

## Integration Rules for Imported Repositories
- Keep existing domain features listed under `Preserve` intact; adapt data access through a thin tenant-scoped repository helper rather than rewriting working UI logic unless specified.
- Never hardcode Stripe keys, JWT secrets, or SMTP passwords—read them from `env` bindings and document required secrets in the final deployment checklist.
- After implementing each spec task, run `commit` to save an incremental restore point.
