package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/db"
)

type PendingEntry struct {
	ID           int64
	NotebookID   int64
	NotebookName string
	Date         *time.Time
	Content      []byte
}

const ownedLegacy = `[encversion] = 1 AND [notebookid] IN (SELECT [id] FROM [notebooks] WHERE [userid] = ?)`

// MigrationCounts returns the number of legacy entries of the user and how many
// of those are already re-encrypted (contentv2 present) or explicitly skipped.
func (s *Store) MigrationCounts(ctx context.Context, userID int64) (total, migrated int, err error) {
	err = s.q().QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM([contentv2] IS NOT NULL OR [migrationskipped] = 1), 0)
		 FROM [notebookentries] WHERE `+ownedLegacy, userID).Scan(&total, &migrated)
	return total, migrated, err
}

// PendingEntries returns up to limit legacy entries still needing migration.
func (s *Store) PendingEntries(ctx context.Context, userID int64, limit int) ([]PendingEntry, error) {
	rows, err := s.q().QueryContext(ctx,
		`SELECT [e].[id], [e].[notebookid], CAST([n].[name] AS TEXT), CAST([e].[date] AS TEXT), [e].[content]
		 FROM [notebookentries] [e] JOIN [notebooks] [n] ON [n].[id] = [e].[notebookid]
		 WHERE [n].[userid] = ? AND [e].[encversion] = 1 AND [e].[contentv2] IS NULL AND [e].[migrationskipped] = 0
		 ORDER BY [e].[id] LIMIT ?`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []PendingEntry{}
	for rows.Next() {
		var p PendingEntry
		var date sql.NullString
		if err := rows.Scan(&p.ID, &p.NotebookID, &p.NotebookName, &date, &p.Content); err != nil {
			return nil, err
		}
		if p.Date, err = db.ParseNullTime(date); err != nil {
			return nil, fmt.Errorf("entry %d: %w", p.ID, err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// SetContentV2 stores re-encrypted content for entries owned by the user that are still legacy.
func (s *Store) SetContentV2(ctx context.Context, userID int64, items map[int64][]byte) error {
	return s.Tx(ctx, func(s *Store) error {
		for id, content := range items {
			if _, err := s.q().ExecContext(ctx,
				`UPDATE [notebookentries] SET [contentv2] = ? WHERE [id] = ? AND `+ownedLegacy,
				content, id, userID); err != nil {
				return err
			}
		}
		return nil
	})
}

// SkipEntries marks legacy entries of the user as explicitly skipped.
func (s *Store) SkipEntries(ctx context.Context, userID int64, ids []int64) error {
	return s.Tx(ctx, func(s *Store) error {
		for _, id := range ids {
			if _, err := s.q().ExecContext(ctx,
				`UPDATE [notebookentries] SET [migrationskipped] = 1 WHERE [id] = ? AND `+ownedLegacy,
				id, userID); err != nil {
				return err
			}
		}
		return nil
	})
}

// FinalizeMigration swaps contentv2 into content for all migrated entries. It
// returns ErrConflict if any legacy entry is neither migrated nor skipped.
func (s *Store) FinalizeMigration(ctx context.Context, userID int64) error {
	return s.Tx(ctx, func(s *Store) error {
		total, migrated, err := s.MigrationCounts(ctx, userID)
		if err != nil {
			return err
		}
		if migrated < total {
			return ErrConflict
		}
		_, err = s.q().ExecContext(ctx,
			`UPDATE [notebookentries] SET [content] = [contentv2], [contentv2] = NULL, [encversion] = 2
			 WHERE [contentv2] IS NOT NULL AND `+ownedLegacy, userID)
		return err
	})
}
