package db

import (
	"database/sql"
	"testing"
	"time"
)

func TestParseTimeFormats(t *testing.T) {
	cases := map[string]time.Time{
		"2023-10-22 00:00:00":          time.Date(2023, 10, 22, 0, 0, 0, 0, time.UTC),
		"2014-10-07T00:00:00.0000000":  time.Date(2014, 10, 7, 0, 0, 0, 0, time.UTC),
		"2020-09-19T11:17:49.4301152Z": time.Date(2020, 9, 19, 11, 17, 49, 430115200, time.UTC),
		"2021-01-01 10:00:00.1234567":  time.Date(2021, 1, 1, 10, 0, 0, 123456700, time.UTC),
		"2021-01-01T10:00:00Z":         time.Date(2021, 1, 1, 10, 0, 0, 0, time.UTC),
		"2021-01-01T10:00:00.5+02:00":  time.Date(2021, 1, 1, 8, 0, 0, 500000000, time.UTC),
	}
	for in, want := range cases {
		got, err := ParseTime(in)
		if err != nil {
			t.Errorf("%q: %v", in, err)
			continue
		}
		if !got.Equal(want) {
			t.Errorf("%q: got %v want %v", in, got, want)
		}
	}
	if _, err := ParseTime("garbage"); err == nil {
		t.Error("expected error")
	}
}

func TestParseNullTime(t *testing.T) {
	got, err := ParseNullTime(sql.NullString{})
	if err != nil || got != nil {
		t.Fatalf("got %v %v", got, err)
	}
	got, err = ParseNullTime(sql.NullString{String: "2023-10-22 00:00:00", Valid: true})
	if err != nil || got == nil || got.Day() != 22 {
		t.Fatalf("got %v %v", got, err)
	}
}

func TestFormatDate(t *testing.T) {
	d := time.Date(2026, 10, 18, 13, 4, 5, 0, time.UTC)
	if got := FormatDate(d); got != "2026-10-18T00:00:00.0000000" {
		t.Fatal(got)
	}
}

func TestFormatTimestamp(t *testing.T) {
	d := time.Date(2026, 10, 18, 11, 5, 3, 123456700, time.FixedZone("x", 7200))
	if got := FormatTimestamp(d); got != "2026-10-18T09:05:03.1234567Z" {
		t.Fatal(got)
	}
}

func TestDateOnly(t *testing.T) {
	d, err := DateOnly("2026-10-18")
	if err != nil || d.Year() != 2026 || d.Month() != 10 || d.Day() != 18 {
		t.Fatalf("%v %v", d, err)
	}
	if _, err := DateOnly("2026-10-18T00:00:00"); err == nil {
		t.Fatal("expected error")
	}
}
