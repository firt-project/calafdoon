-- Phase 11: auth registration audit events
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'register_success';
ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'register_failed';
