package db

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var fixedNow = func() time.Time { return time.Date(2026, 10, 18, 12, 0, 0, 0, time.UTC) }

func openTemp(t *testing.T) (*sql.DB, string) {
	t.Helper()
	p := filepath.Join(t.TempDir(), "maschnotes.db")
	d, err := Open(p)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	return d, p
}

func count(t *testing.T, d *sql.DB, q string, args ...any) int {
	t.Helper()
	var n int
	if err := d.QueryRow(q, args...).Scan(&n); err != nil {
		t.Fatalf("%s: %v", q, err)
	}
	return n
}

func backups(t *testing.T, p string) []string {
	t.Helper()
	m, err := filepath.Glob(p + ".bak-*")
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestMigrateFreshDB(t *testing.T) {
	d, p := openTemp(t)
	if err := Migrate(context.Background(), d, p, fixedNow); err != nil {
		t.Fatal(err)
	}
	for _, tbl := range []string{
		"users", "accounts", "settings", "apikeys", "notebooks",
		"notebookcategories", "notebookentries", "dayratings", "userkeys",
	} {
		if count(t, d, "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?", tbl) != 1 {
			t.Errorf("table %s missing", tbl)
		}
	}
	if v := count(t, d, "PRAGMA user_version"); v != 1 {
		t.Errorf("user_version %d", v)
	}
	if b := backups(t, p); len(b) != 0 {
		t.Errorf("unexpected backups %v", b)
	}
}

func legacyDB(t *testing.T) (*sql.DB, string) {
	t.Helper()
	d, p := openTemp(t)
	ddl, err := os.ReadFile("testdata/legacy_schema.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(string(ddl)); err != nil {
		t.Fatal(err)
	}
	stmts := []string{
		"INSERT INTO users (id, givenname, surname, email) VALUES (1, 'A', 'B', 'a@b.c')",
		"INSERT INTO accounts (name, password, userid) VALUES ('alice', 'x', 1)",
		"INSERT INTO notebooks (id, userid, name, isdiary) VALUES (1, 1, 'Diary', 1)",
		"INSERT INTO notebookentries (id, notebookid, name, categoryid, date, content) VALUES (1, 1, NULL, NULL, '2014-10-07T00:00:00.0000000', x'0102')",
		"INSERT INTO notebookentries (id, notebookid, name, categoryid, date, content) VALUES (2, 1, NULL, NULL, '2023-10-22 00:00:00', x'0304')",
		"INSERT INTO dayratings (userid, date, rating) VALUES (1, '2014-10-07T00:00:00.0000000', 3)",
		"INSERT INTO apikeys (id, key, name, userid, timestamp) VALUES (1, 'k', 'n', 1, '2020-09-19T11:17:49.4301152Z')",
	}
	for _, s := range stmts {
		if _, err := d.Exec(s); err != nil {
			t.Fatalf("%s: %v", s, err)
		}
	}
	return d, p
}

func TestMigrateLegacyDB(t *testing.T) {
	d, p := legacyDB(t)
	if err := Migrate(context.Background(), d, p, fixedNow); err != nil {
		t.Fatal(err)
	}
	b := backups(t, p)
	if len(b) != 1 || !strings.HasSuffix(b[0], "maschnotes.db.bak-20261018-120000") {
		t.Fatalf("backups: %v", b)
	}
	bd, err := Open(b[0])
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bd.Close() })
	if count(t, bd, "SELECT COUNT(*) FROM notebookentries") != 2 || count(t, bd, "SELECT COUNT(*) FROM users") != 1 {
		t.Error("backup row counts differ")
	}
	if count(t, bd, "SELECT COUNT(*) FROM pragma_table_info('notebookentries') WHERE name='encversion'") != 0 {
		t.Error("backup must hold the pre-migration schema")
	}
	if count(t, d, "SELECT COUNT(*) FROM notebookentries WHERE encversion = 1 AND migrationskipped = 0 AND contentv2 IS NULL") != 2 {
		t.Error("old rows should default to encversion=1")
	}
	if v := count(t, d, "PRAGMA user_version"); v != 1 {
		t.Errorf("user_version %d", v)
	}
	if count(t, d, "SELECT COUNT(*) FROM pragma_table_info('userkeys') WHERE name='pendingauthhash'") != 1 {
		t.Error("pendingauthhash missing")
	}
}

func TestMigrateIdempotent(t *testing.T) {
	d, p := legacyDB(t)
	ctx := context.Background()
	if err := Migrate(ctx, d, p, fixedNow); err != nil {
		t.Fatal(err)
	}
	later := func() time.Time { return fixedNow().Add(time.Hour) }
	if err := Migrate(ctx, d, p, later); err != nil {
		t.Fatal(err)
	}
	if b := backups(t, p); len(b) != 1 {
		t.Fatalf("backups: %v", b)
	}
}
