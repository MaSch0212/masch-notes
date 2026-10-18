package auth

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	longTokenLifetime  = 365 * 24 * time.Hour
	shortTokenLifetime = 2 * time.Hour
)

type Tokens struct {
	key []byte
	now func() time.Time
}

func NewTokens(key []byte, now func() time.Time) *Tokens {
	return &Tokens{key: key, now: now}
}

// Issue creates an HS512 token for userID.
func (t *Tokens) Issue(userID int64, stayLoggedIn bool) (string, time.Time, error) {
	life := shortTokenLifetime
	if stayLoggedIn {
		life = longTokenLifetime
	}
	now := t.now()
	exp := now.Add(life)
	claims := jwt.RegisteredClaims{
		Subject:   strconv.FormatInt(userID, 10),
		ExpiresAt: jwt.NewNumericDate(exp),
		IssuedAt:  jwt.NewNumericDate(now),
	}
	s, err := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString(t.key)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign token: %w", err)
	}
	return s, exp, nil
}

// Parse validates the token and returns the user id it was issued for.
func (t *Tokens) Parse(token string) (int64, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) { return t.key, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS512.Alg()}),
		jwt.WithTimeFunc(t.now),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return 0, fmt.Errorf("invalid token: %w", err)
	}
	id, err := strconv.ParseInt(claims.Subject, 10, 64)
	if err != nil {
		return 0, errors.New("invalid token: bad subject")
	}
	return id, nil
}
