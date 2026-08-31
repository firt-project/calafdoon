import { writeFile } from "node:fs/promises";
import path from "node:path";
import { classifyPasswordHash } from "../crypto/lucia-scrypt.js";

export type ValidationResult = {
  generatedAt: string;
  criticalFailures: string[];
  warnings: string[];
  counts: Record<string, number>;
  ok: boolean;
};

async function loadPrismaClient() {
  const mod = await import("@prisma/client");
  return mod.PrismaClient;
}

export async function runValidate(opts: {
  databaseUrl?: string;
  outDir?: string;
}): Promise<{ result: ValidationResult; markdown: string; exitCode: number }> {
  const databaseUrl = opts.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for validation");
  }

  const PrismaClient = await loadPrismaClient();
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

  const criticalFailures: string[] = [];
  const warnings: string[] = [];

  try {
    const [
      userCount,
      passwordAccountCount,
      profileCount,
      preferencesCount,
      duplicateEmailGroups,
      usersWithoutProfiles,
      profilesWithoutUsers,
      accountsWithoutUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.authAccount.count({ where: { provider: "password" } }),
      prisma.profile.count(),
      prisma.preference.count(),
      prisma.$queryRaw<{ email_normalized: string; c: bigint }[]>`
        SELECT email_normalized, COUNT(*)::bigint AS c
        FROM users
        WHERE email_normalized IS NOT NULL
        GROUP BY email_normalized
        HAVING COUNT(*) > 1
      `,
      prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c
        FROM users u
        LEFT JOIN profiles p ON p.user_id = u.id
        WHERE p.id IS NULL
      `,
      prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c
        FROM profiles p
        LEFT JOIN users u ON u.id = p.user_id
        WHERE u.id IS NULL
      `,
      prisma.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c
        FROM auth_accounts a
        LEFT JOIN users u ON u.id = a.user_id
        WHERE u.id IS NULL
      `,
    ]);

    const duplicateConvexUsers = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM (
        SELECT convex_id FROM users GROUP BY convex_id HAVING COUNT(*) > 1
      ) t
    `;

    const accounts = await prisma.authAccount.findMany({
      where: { provider: "password" },
      select: { passwordHash: true },
    });

    let malformedHashes = 0;
    let missingHashes = 0;
    let legacyHashes = 0;
    for (const account of accounts) {
      const kind = classifyPasswordHash(account.passwordHash);
      if (kind === "malformed") malformedHashes++;
      if (kind === "missing") missingHashes++;
      if (kind === "legacy_s2") legacyHashes++;
    }

    const counts = {
      users: userCount,
      passwordAccounts: passwordAccountCount,
      profiles: profileCount,
      preferences: preferencesCount,
      duplicateEmails: duplicateEmailGroups.length,
      usersWithoutProfiles: Number(usersWithoutProfiles[0]?.c ?? 0),
      profilesWithoutUsers: Number(profilesWithoutUsers[0]?.c ?? 0),
      passwordAccountsWithoutUsers: Number(accountsWithoutUsers[0]?.c ?? 0),
      duplicateConvexUserIds: Number(duplicateConvexUsers[0]?.c ?? 0),
      malformedPasswordHashes: malformedHashes,
      missingPasswordHashes: missingHashes,
      legacyPasswordHashes: legacyHashes,
    };

    if (counts.duplicateEmails > 0) {
      criticalFailures.push(`duplicate_emails=${counts.duplicateEmails}`);
    }
    if (counts.profilesWithoutUsers > 0) {
      criticalFailures.push(
        `profiles_without_users=${counts.profilesWithoutUsers}`
      );
    }
    if (counts.passwordAccountsWithoutUsers > 0) {
      criticalFailures.push(
        `password_accounts_without_users=${counts.passwordAccountsWithoutUsers}`
      );
    }
    if (counts.duplicateConvexUserIds > 0) {
      criticalFailures.push(
        `duplicate_convex_ids=${counts.duplicateConvexUserIds}`
      );
    }
    if (counts.malformedPasswordHashes > 0) {
      criticalFailures.push(
        `malformed_password_hashes=${counts.malformedPasswordHashes}`
      );
    }

    if (counts.usersWithoutProfiles > 0) {
      warnings.push(
        `users_without_profiles=${counts.usersWithoutProfiles} (may be expected for incomplete signups)`
      );
    }
    if (counts.missingPasswordHashes > 0) {
      warnings.push(
        `missing_password_hashes=${counts.missingPasswordHashes} (Path B reset candidates)`
      );
    }
    if (counts.legacyPasswordHashes > 0) {
      warnings.push(
        `legacy_s2_hashes=${counts.legacyPasswordHashes} (needs LegacyScrypt support)`
      );
    }

    const result: ValidationResult = {
      generatedAt: new Date().toISOString(),
      criticalFailures,
      warnings,
      counts,
      ok: criticalFailures.length === 0,
    };

    const markdown = [
      "# Migration validation report",
      "",
      `- Generated: ${result.generatedAt}`,
      `- Status: ${result.ok ? "PASS" : "FAIL"}`,
      "",
      "## Counts",
      "",
      ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`),
      "",
      "## Critical failures",
      "",
      ...(criticalFailures.length
        ? criticalFailures.map((f) => `- ${f}`)
        : ["- none"]),
      "",
      "## Warnings",
      "",
      ...(warnings.length ? warnings.map((w) => `- ${w}`) : ["- none"]),
      "",
    ].join("\n");

    if (opts.outDir) {
      await writeFile(
        path.join(opts.outDir, "validation-report.json"),
        JSON.stringify(result, null, 2),
        "utf8"
      );
      await writeFile(
        path.join(opts.outDir, "validation-report.md"),
        markdown,
        "utf8"
      );
    }

    return {
      result,
      markdown,
      exitCode: result.ok ? 0 : 1,
    };
  } finally {
    await prisma.$disconnect();
  }
}
