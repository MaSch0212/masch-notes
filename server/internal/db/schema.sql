CREATE TABLE IF NOT EXISTS [users] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [givenname]     VARCHAR(50) NOT NULL,
    [surname]       VARCHAR(50) NOT NULL,
    [email]         VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS [accounts] (
    [name]          VARCHAR(255) NOT NULL PRIMARY KEY,
    [password]      VARCHAR(255) NOT NULL,
    [userid]        INTEGER NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS [settings] (
    [userid]        INTEGER NOT NULL,
    [settingid]     INTEGER NOT NULL,
    [value]         TEXT NOT NULL,
    PRIMARY KEY ([userid], [settingid]),
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS [apikeys] (
    [id]        INT NOT NULL PRIMARY KEY,
    [key]       VARCHAR(255) NOT NULL,
    [name]      VARCHAR(255) NOT NULL,
    [userid]    INTEGER NOT NULL,
    [timestamp] DATETIME NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS [notebooks] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [userid]        INTEGER NOT NULL,
    [name]          INTEGER NOT NULL,
    [isdiary]       BOOLEAN NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS [notebookcategories] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [notebookid]    INTEGER NOT NULL,
    [name]          VARCHAR(255) NOT NULL,
    FOREIGN KEY ([notebookid]) REFERENCES [notebooks] ([id]) ON DELETE CASCADE,
    UNIQUE([notebookid], [name])
);

CREATE TABLE IF NOT EXISTS [notebookentries] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [notebookid]    INTEGER NOT NULL,
    [name]          VARCHAR(255) NULL,
    [categoryid]    INTEGER NULL,
    [date]          DATETIME NULL,
    [content]       BLOB NOT NULL,
    FOREIGN KEY ([notebookid]) REFERENCES [notebooks] ([id]) ON DELETE CASCADE,
    FOREIGN KEY ([categoryid]) REFERENCES [notebookcategories] ([id]) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS [dayratings] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [userid]        INTEGER NOT NULL,
    [date]          DATETIME NOT NULL,
    [rating]        INTEGER NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE,
    UNIQUE([userid], [date])
)
