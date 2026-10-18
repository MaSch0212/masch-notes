package db

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"
)

// TestMigrateProdCopy runs against a copy of the production database. It is
// skipped unless MASCHNOTES_PROD_COPY points to the file; the original is only
// ever read, never opened.
func TestMigrateProdCopy(t *testing.T) {
	src := os.Getenv("MASCHNOTES_PROD_COPY")
	if src == "" {
		t.Skip("MASCHNOTES_PROD_COPY not set")
	}
	dst := filepath.Join(t.TempDir(), "maschnotes.db")
	in, err := os.Open(src)
	if err != nil {
		t.Fatal(err)
	}
	out, err := os.Create(dst)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.Copy(out, in); err != nil {
		t.Fatal(err)
	}
	_ = in.Close()
	if err := out.Close(); err != nil {
		t.Fatal(err)
	}

	d, err := Open(dst)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if err := Migrate(context.Background(), d, dst, fixedNow); err != nil {
		t.Fatal(err)
	}
	for tbl, want := range map[string]int{"users": 5, "notebooks": 6, "notebookentries": 1010, "dayratings": 648, "apikeys": 2} {
		if got := count(t, d, "SELECT COUNT(*) FROM "+tbl); got != want {
			t.Errorf("%s: got %d want %d", tbl, got, want)
		}
	}
	if len(backups(t, dst)) != 1 {
		t.Error("expected one backup")
	}
}
