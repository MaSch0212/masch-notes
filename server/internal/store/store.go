// Package store is the persistence layer over the SQLite database.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type Store struct {
	DB *sql.DB
	// Now is the clock used for stored timestamps; time.Now when nil.
	Now func() time.Time

	tx *sql.Tx
}

func New(db *sql.DB) *Store { return &Store{DB: db} }

func (s *Store) q() querier {
	if s.tx != nil {
		return s.tx
	}
	return s.DB
}

func (s *Store) now() time.Time {
	if s.Now != nil {
		return s.Now()
	}
	return time.Now()
}

// Tx runs fn in a transaction; the Store passed to fn uses it. Nested calls join
// the outer transaction. The transaction is rolled back if fn returns an error.
func (s *Store) Tx(ctx context.Context, fn func(*Store) error) error {
	if s.tx != nil {
		return fn(s)
	}
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()
	if err := fn(&Store{DB: s.DB, Now: s.Now, tx: tx}); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}
	committed = true
	return nil
}

func mapNoRows(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// affected returns ErrNotFound when the statement changed no rows.
func affected(res sql.Result, err error) error {
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
