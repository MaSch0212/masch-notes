// Package db opens the SQLite database and applies schema migrations.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"path/filepath"

	_ "modernc.org/sqlite" // driver "sqlite"
)

// Open opens (creating if necessary) the SQLite database at path.
func Open(path string) (*sql.DB, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("resolve db path: %w", err)
	}
	u := url.URL{Scheme: "file", Opaque: url.PathEscape(filepath.ToSlash(abs))}
	q := url.Values{}
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "busy_timeout(5000)")
	u.RawQuery = q.Encode()

	d, err := sql.Open("sqlite", u.String())
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	d.SetMaxOpenConns(1)
	if err := d.PingContext(context.Background()); err != nil {
		_ = d.Close()
		return nil, fmt.Errorf("open db: %w", err)
	}
	return d, nil
}
