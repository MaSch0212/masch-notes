package db

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

//go:embed schema.sql
var schemaSQL string

// migrations[i] upgrades user_version i to i+1. Migrations are additive only.
var migrations = []string{
	// 1: key-wrapped encryption support
	`CREATE TABLE userkeys (
    userid          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    kdfsalt         BLOB NOT NULL,
    kdfiterations   INTEGER NOT NULL,
    wrappedkey      BLOB NOT NULL,
    status          TEXT NOT NULL,
    updatedat       TEXT NOT NULL,
    pendingauthhash TEXT NULL
);
ALTER TABLE notebookentries ADD COLUMN encversion INTEGER NOT NULL DEFAULT 1;
ALTER TABLE notebookentries ADD COLUMN contentv2 BLOB NULL;
ALTER TABLE notebookentries ADD COLUMN migrationskipped INTEGER NOT NULL DEFAULT 0;`,
}

// Migrate creates missing tables and applies pending versioned migrations.
// Before touching an existing database it writes a consistent backup next to
// dbPath named "<file>.bak-<yyyyMMdd-HHmmss>".
func Migrate(ctx context.Context, db *sql.DB, dbPath string, now func() time.Time) error {
	var version int
	if err := db.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}
	if version > len(migrations) {
		return fmt.Errorf("database version %d is newer than supported %d", version, len(migrations))
	}

	var tables int
	if err := db.QueryRowContext(ctx,
		"SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users'").Scan(&tables); err != nil {
		return fmt.Errorf("inspect schema: %w", err)
	}
	existing := tables > 0

	if existing && version < len(migrations) {
		if err := backup(ctx, db, dbPath, now()); err != nil {
			return err
		}
	}

	if _, err := db.ExecContext(ctx, schemaSQL); err != nil {
		return fmt.Errorf("create tables: %w", err)
	}

	for v := version; v < len(migrations); v++ {
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration %d: %w", v+1, err)
		}
		if _, err := tx.ExecContext(ctx, migrations[v]); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %d: %w", v+1, err)
		}
		if _, err := tx.ExecContext(ctx, fmt.Sprintf("PRAGMA user_version = %d", v+1)); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("migration %d: set version: %w", v+1, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %d: %w", v+1, err)
		}
	}
	return nil
}

func backup(ctx context.Context, db *sql.DB, dbPath string, at time.Time) error {
	if _, err := db.ExecContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)"); err != nil {
		return fmt.Errorf("checkpoint: %w", err)
	}
	dest := filepath.Join(filepath.Dir(dbPath), filepath.Base(dbPath)+".bak-"+at.Format("20060102-150405"))
	if _, err := os.Stat(dest); err == nil {
		return fmt.Errorf("backup file %s already exists", dest)
	}
	abs, err := filepath.Abs(dest)
	if err != nil {
		return fmt.Errorf("resolve backup path: %w", err)
	}
	if _, err := db.ExecContext(ctx, "VACUUM INTO ?", filepath.ToSlash(abs)); err != nil {
		return fmt.Errorf("backup database: %w", err)
	}
	return nil
}
