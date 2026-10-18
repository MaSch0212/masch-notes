package db

import (
	"database/sql"
	"fmt"
	"time"
)

var timeLayouts = []string{
	"2006-01-02 15:04:05",
	"2006-01-02T15:04:05",
	"2006-01-02T15:04:05Z07:00",
	"2006-01-02",
}

// ParseTime parses the date formats found in the database. Fractional seconds
// of any length are accepted; values without zone information are UTC.
func ParseTime(s string) (time.Time, error) {
	for _, l := range timeLayouts {
		if t, err := time.Parse(l, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognised date %q", s)
}

// ParseNullTime parses a nullable date column; NULL yields nil.
func ParseNullTime(ns sql.NullString) (*time.Time, error) {
	if !ns.Valid {
		return nil, nil //nolint:nilnil // nil means NULL
	}
	t, err := ParseTime(ns.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// FormatDate writes a date-only value the way the legacy server did.
func FormatDate(t time.Time) string {
	return t.Format("2006-01-02") + "T00:00:00.0000000"
}

// FormatTimestamp writes a UTC timestamp like .NET's "o" format.
func FormatTimestamp(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.0000000Z")
}

// DateOnly parses an API date (yyyy-MM-dd) as a civil date at midnight UTC.
func DateOnly(s string) (time.Time, error) {
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid date %q: %w", s, err)
	}
	return t, nil
}
