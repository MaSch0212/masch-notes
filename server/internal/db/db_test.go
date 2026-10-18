package db

import "testing"

func TestOpenPragmas(t *testing.T) {
	d, _ := openTemp(t)
	var fk int
	if err := d.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil || fk != 1 {
		t.Fatalf("foreign_keys=%d err=%v", fk, err)
	}
	var mode string
	if err := d.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil || mode != "wal" {
		t.Fatalf("journal_mode=%q err=%v", mode, err)
	}
}
