package store

import "context"

type Notebook struct {
	ID, UserID int64
	Name       string
	IsDiary    bool
}

func (s *Store) ListNotebooks(ctx context.Context, userID int64) ([]Notebook, error) {
	rows, err := s.q().QueryContext(ctx,
		`SELECT [id], [userid], [name], [isdiary] FROM [notebooks] WHERE [userid] = ? ORDER BY [id]`, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []Notebook{}
	for rows.Next() {
		var n Notebook
		if err := rows.Scan(&n.ID, &n.UserID, &n.Name, &n.IsDiary); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) GetNotebook(ctx context.Context, id int64) (Notebook, error) {
	var n Notebook
	err := s.q().QueryRowContext(ctx,
		`SELECT [id], [userid], [name], [isdiary] FROM [notebooks] WHERE [id] = ?`, id).
		Scan(&n.ID, &n.UserID, &n.Name, &n.IsDiary)
	return n, mapNoRows(err)
}

func (s *Store) CreateNotebook(ctx context.Context, userID int64, name string, isDiary bool) (Notebook, error) {
	res, err := s.q().ExecContext(ctx,
		`INSERT INTO [notebooks] ([userid], [name], [isdiary]) VALUES (?, ?, ?)`, userID, name, isDiary)
	if err != nil {
		return Notebook{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Notebook{}, err
	}
	return Notebook{ID: id, UserID: userID, Name: name, IsDiary: isDiary}, nil
}

func (s *Store) RenameNotebook(ctx context.Context, id int64, name string) error {
	return affected(s.q().ExecContext(ctx, `UPDATE [notebooks] SET [name] = ? WHERE [id] = ?`, name, id))
}

func (s *Store) DeleteNotebook(ctx context.Context, id int64) error {
	return affected(s.q().ExecContext(ctx, `DELETE FROM [notebooks] WHERE [id] = ?`, id))
}
