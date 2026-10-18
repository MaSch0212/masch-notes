package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/db"
)

type Entry struct {
	ID, NotebookID int64
	Name, Category *string
	Date           *time.Time
	EncVersion     int
	Content        []byte
	HasContentV2   bool
}

const entrySelect = `SELECT [e].[id], [e].[notebookid], [e].[name], [c].[name], CAST([e].[date] AS TEXT),
       [e].[encversion], %s, [e].[contentv2] IS NOT NULL
FROM [notebookentries] [e]
LEFT JOIN [notebookcategories] [c] ON [e].[categoryid] = [c].[id] AND [e].[notebookid] = [c].[notebookid]`

type rowScanner interface{ Scan(dest ...any) error }

func scanEntry(r rowScanner) (Entry, error) {
	var e Entry
	var date sql.NullString
	if err := r.Scan(&e.ID, &e.NotebookID, &e.Name, &e.Category, &date, &e.EncVersion, &e.Content, &e.HasContentV2); err != nil {
		return Entry{}, err
	}
	d, err := db.ParseNullTime(date)
	if err != nil {
		return Entry{}, fmt.Errorf("entry %d: %w", e.ID, err)
	}
	e.Date = d
	return e, nil
}

func dayString(t time.Time) string { return t.Format("2006-01-02") }

// ListEntries lists a notebook's entries, optionally restricted to a day range
// (inclusive). Entries without a date are excluded when a range is given.
func (s *Store) ListEntries(ctx context.Context, notebookID int64, from, to *time.Time, includeContent bool) ([]Entry, error) {
	col := "NULL"
	if includeContent {
		col = "[e].[content]"
	}
	query := fmt.Sprintf(entrySelect, col) + ` WHERE [e].[notebookid] = ?`
	args := []any{notebookID}
	if from != nil {
		query += ` AND substr([e].[date], 1, 10) >= ?`
		args = append(args, dayString(*from))
	}
	if to != nil {
		query += ` AND substr([e].[date], 1, 10) <= ?`
		args = append(args, dayString(*to))
	}
	query += ` ORDER BY substr([e].[date], 1, 10), [e].[id]`
	rows, err := s.q().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []Entry{}
	for rows.Next() {
		e, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) GetEntry(ctx context.Context, id int64) (Entry, error) {
	e, err := scanEntry(s.q().QueryRowContext(ctx,
		fmt.Sprintf(entrySelect, "[e].[content]")+` WHERE [e].[id] = ?`, id))
	return e, mapNoRows(err)
}

// EntryByDate returns the (first) entry of the notebook on the given calendar day.
func (s *Store) EntryByDate(ctx context.Context, notebookID int64, date time.Time) (Entry, error) {
	e, err := scanEntry(s.q().QueryRowContext(ctx,
		fmt.Sprintf(entrySelect, "[e].[content]")+
			` WHERE [e].[notebookid] = ? AND substr([e].[date], 1, 10) = ? ORDER BY [e].[id] LIMIT 1`,
		notebookID, dayString(date)))
	return e, mapNoRows(err)
}

func (s *Store) upsertCategory(ctx context.Context, notebookID int64, category *string) error {
	if category == nil || *category == "" {
		return nil
	}
	_, err := s.q().ExecContext(ctx,
		`INSERT OR IGNORE INTO [notebookcategories] ([notebookid], [name]) VALUES (?, ?)`, notebookID, *category)
	return err
}

func categoryArg(c *string) any {
	if c == nil || *c == "" {
		return nil
	}
	return *c
}

func dateArg(d *time.Time) any {
	if d == nil {
		return nil
	}
	return db.FormatDate(*d)
}

func (s *Store) deleteUnusedCategories(ctx context.Context) error {
	_, err := s.q().ExecContext(ctx,
		`DELETE FROM [notebookcategories] WHERE [id] NOT IN
		   (SELECT DISTINCT [categoryid] FROM [notebookentries] WHERE [categoryid] IS NOT NULL)`)
	return err
}

// CreateEntry inserts an entry (EncVersion defaults to 1) and returns it with its new id.
func (s *Store) CreateEntry(ctx context.Context, notebookID int64, e Entry) (Entry, error) {
	if e.EncVersion == 0 {
		e.EncVersion = 1
	}
	err := s.Tx(ctx, func(s *Store) error {
		if err := s.upsertCategory(ctx, notebookID, e.Category); err != nil {
			return err
		}
		res, err := s.q().ExecContext(ctx,
			`INSERT INTO [notebookentries] ([notebookid], [name], [categoryid], [date], [content], [encversion])
			 VALUES (?, ?, (SELECT [id] FROM [notebookcategories] WHERE [notebookid] = ? AND [name] = ?), ?, ?, ?)`,
			notebookID, e.Name, notebookID, categoryArg(e.Category), dateArg(e.Date), e.Content, e.EncVersion)
		if err != nil {
			return err
		}
		e.ID, err = res.LastInsertId()
		return err
	})
	if err != nil {
		return Entry{}, err
	}
	e.NotebookID = notebookID
	e.HasContentV2 = false
	return e, nil
}

// UpdateEntry replaces name, category, date and content of an entry, clears any
// pending v2 re-encryption and drops categories that are no longer used. A zero
// EncVersion keeps the stored one.
func (s *Store) UpdateEntry(ctx context.Context, e Entry) error {
	return s.Tx(ctx, func(s *Store) error {
		var notebookID int64
		if err := s.q().QueryRowContext(ctx,
			`SELECT [notebookid] FROM [notebookentries] WHERE [id] = ?`, e.ID).Scan(&notebookID); err != nil {
			return mapNoRows(err)
		}
		if err := s.upsertCategory(ctx, notebookID, e.Category); err != nil {
			return err
		}
		if err := affected(s.q().ExecContext(ctx,
			`UPDATE [notebookentries]
			 SET [name] = ?,
			     [categoryid] = (SELECT [id] FROM [notebookcategories] WHERE [notebookid] = ? AND [name] = ?),
			     [date] = ?, [content] = ?, [contentv2] = NULL,
			     [encversion] = CASE WHEN ? = 0 THEN [encversion] ELSE ? END
			 WHERE [id] = ?`,
			e.Name, notebookID, categoryArg(e.Category), dateArg(e.Date), e.Content,
			e.EncVersion, e.EncVersion, e.ID)); err != nil {
			return err
		}
		return s.deleteUnusedCategories(ctx)
	})
}

func (s *Store) DeleteEntry(ctx context.Context, id int64) error {
	return s.Tx(ctx, func(s *Store) error {
		if err := affected(s.q().ExecContext(ctx, `DELETE FROM [notebookentries] WHERE [id] = ?`, id)); err != nil {
			return err
		}
		return s.deleteUnusedCategories(ctx)
	})
}

func (s *Store) ListCategories(ctx context.Context, notebookID int64) ([]string, error) {
	rows, err := s.q().QueryContext(ctx,
		`SELECT [name] FROM [notebookcategories] WHERE [notebookid] = ? ORDER BY [name]`, notebookID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}
