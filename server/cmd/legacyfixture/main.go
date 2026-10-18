// Command legacyfixture inserts a synthetic legacy user (old PBKDF2 login, AES-CBC encrypted entries) into a
// COPY of the production database, so the migration can be tried without touching real data.
package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/pbkdf2"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // PBKDF2-HMAC-SHA1 is the legacy format
	"database/sql"
	"encoding/base64"
	"errors"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/db"
)

const (
	legacyIV         = "d6c6b426090a5ae9"
	legacyIterations = 5000
	keyParamsSetting = -1
)

var diaryTexts = []string{
	"Heute war ein ruhiger Tag. Morgens Kaffee auf dem Balkon, danach ein langer Spaziergang an der Isar.",
	"Der Termin beim Zahnarzt ist besser gelaufen als gedacht. Abends habe ich mit Anna gekocht, es gab Linsensuppe.",
	"Viel Arbeit, wenig Schlaf. Ich muss dringend früher ins Bett gehen. Immerhin hat das Wetter gehalten.",
	"Wir waren am See schwimmen. Das Wasser war überraschend warm, und danach gab es Eis für alle.",
	"Regen den ganzen Tag. Ich habe aufgeräumt, Steuerunterlagen sortiert und ein neues Buch angefangen.",
	"Frühstück mit den Eltern, nachmittags Fußball im Park. Müde, aber richtig zufrieden.",
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "legacyfixture:", err)
		os.Exit(1)
	}
}

func run() error {
	dbPath := flag.String("db", "", "path to a COPY of maschnotes.db (required)")
	user := flag.String("user", "legacy", "username of the legacy account")
	password := flag.String("password", "legacy-pass", "password of the legacy account")
	entries := flag.Int("entries", 30, "number of diary entries")
	flag.Parse()
	if *dbPath == "" {
		return errors.New("-db is required")
	}
	if _, err := os.Stat(*dbPath); err != nil {
		return fmt.Errorf("database: %w", err)
	}
	if *entries < 2 {
		return errors.New("-entries must be at least 2")
	}

	d, err := db.Open(*dbPath)
	if err != nil {
		return err
	}
	defer func() { _ = d.Close() }()

	ctx := context.Background()
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := insertFixture(ctx, tx, *user, *password, *entries); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	fmt.Printf("inserted legacy user %q with %d diary entries and 1 notebook entry into %s\n", *user, *entries, *dbPath)
	return nil
}

func insertFixture(ctx context.Context, tx *sql.Tx, username, password string, n int) error {
	var exists int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM [accounts] WHERE [name] = ? COLLATE NOCASE`, username).Scan(&exists); err != nil {
		return err
	}
	if exists > 0 {
		return fmt.Errorf("account %q already exists", username)
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return err
	}
	key, err := legacyKey(username, password, salt)
	if err != nil {
		return err
	}

	res, err := tx.ExecContext(ctx, `INSERT INTO [users] ([givenname], [surname], [email]) VALUES (?, ?, ?)`,
		"Legacy", "Fixture", "legacy@example.com")
	if err != nil {
		return err
	}
	userID, err := res.LastInsertId()
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO [accounts] ([name], [password], [userid]) VALUES (?, ?, ?)`,
		username, auth.NewLegacyHash(password), userID); err != nil {
		return err
	}
	params := fmt.Sprintf("pbkdf2:%d:%s:32", legacyIterations, base64.StdEncoding.EncodeToString(salt))
	if _, err := tx.ExecContext(ctx, `INSERT INTO [settings] ([userid], [settingid], [value]) VALUES (?, ?, ?)`,
		userID, keyParamsSetting, params); err != nil {
		return err
	}

	diaryID, err := insertNotebook(ctx, tx, userID, "Tagebuch", true)
	if err != nil {
		return err
	}
	notesID, err := insertNotebook(ctx, tx, userID, "Notizen", false)
	if err != nil {
		return err
	}

	today := time.Now().UTC().Truncate(24 * time.Hour)
	for i := range n {
		day := today.AddDate(0, 0, -i)
		// Both formats occur in production: "yyyy-MM-dd HH:mm:ss" and the .NET round-trip format.
		stored := day.Format("2006-01-02T15:04:05") + ".0000000"
		if i%2 == 1 {
			stored = day.Format("2006-01-02") + " 00:00:00"
		}
		if err := insertEntry(ctx, tx, key, diaryID, nil, nil, &stored, entryText(i)); err != nil {
			return err
		}
		if i%3 != 2 { // some days without rating
			rated := day.Format("2006-01-02T15:04:05") + ".0000000"
			if _, err := tx.ExecContext(ctx, `INSERT INTO [dayratings] ([userid], [date], [rating]) VALUES (?, ?, ?)`,
				userID, rated, i%5); err != nil {
				return err
			}
		}
	}
	// A second entry for an already used day (duplicate dates exist in production).
	dup := today.Format("2006-01-02") + " 00:00:00"
	if err := insertEntry(ctx, tx, key, diaryID, nil, nil, &dup, "Nachtrag zum selben Tag: Abends noch lange telefoniert."); err != nil {
		return err
	}

	catID, err := insertCategory(ctx, tx, notesID, "Ideen")
	if err != nil {
		return err
	}
	title := "Wochenendplanung"
	noteDate := today.Format("2006-01-02T15:04:05") + ".0000000"
	return insertEntry(ctx, tx, key, notesID, &title, &catID, &noteDate,
		"Samstag: Wocheneinkauf und Flohmarkt.\nSonntag: Radtour zum Ammersee, Picknick einpacken.")
}

func entryText(i int) string {
	return diaryTexts[i%len(diaryTexts)] + fmt.Sprintf(" (Eintrag %d)", i+1)
}

func insertNotebook(ctx context.Context, tx *sql.Tx, userID int64, name string, diary bool) (int64, error) {
	res, err := tx.ExecContext(ctx, `INSERT INTO [notebooks] ([userid], [name], [isdiary]) VALUES (?, ?, ?)`, userID, name, diary)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func insertCategory(ctx context.Context, tx *sql.Tx, notebookID int64, name string) (int64, error) {
	res, err := tx.ExecContext(ctx, `INSERT INTO [notebookcategories] ([notebookid], [name]) VALUES (?, ?)`, notebookID, name)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func insertEntry(ctx context.Context, tx *sql.Tx, key []byte, notebookID int64, name *string, categoryID *int64, date *string, text string) error {
	ct, err := legacyEncrypt(key, text)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO [notebookentries] ([notebookid], [name], [categoryid], [date], [content]) VALUES (?, ?, ?, ?, ?)`,
		notebookID, name, categoryID, date, ct)
	return err
}

// legacyKey derives the content key exactly like the old server: encryptPass = base64(PBKDF2-SHA1(username,
// UTF-8(password), 5000, 64)); key = PBKDF2-SHA1(encryptPass, salt, 5000, 32).
func legacyKey(username, password string, salt []byte) ([]byte, error) {
	pass, err := pbkdf2.Key(sha1.New, username, []byte(password), legacyIterations, 64)
	if err != nil {
		return nil, err
	}
	encryptPass := base64.StdEncoding.EncodeToString(pass)
	return pbkdf2.Key(sha1.New, encryptPass, salt, legacyIterations, 32)
}

// legacyEncrypt is AES-256-CBC with PKCS7 padding and the fixed IV of the old app.
func legacyEncrypt(key []byte, text string) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	pt := []byte(text)
	pad := aes.BlockSize - len(pt)%aes.BlockSize
	for range pad {
		pt = append(pt, byte(pad))
	}
	out := make([]byte, len(pt))
	cipher.NewCBCEncrypter(block, []byte(legacyIV)).CryptBlocks(out, pt) //nolint:gosec // fixed IV is the legacy format
	return out, nil
}
