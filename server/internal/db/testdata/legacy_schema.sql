CREATE TABLE [users] (
    [id]        INTEGER NOT NULL PRIMARY KEY,
    [givenname] VARCHAR(50) NOT NULL,
    [surname]   VARCHAR(50) NOT NULL,
    [email]     VARCHAR(100) NOT NULL
);

CREATE TABLE [accounts] (
    [name]      VARCHAR(255) NOT NULL PRIMARY KEY,
    [password]  VARCHAR(255) NOT NULL,
    [userid]    INTEGER NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE [settings] (
    [userid]    INTEGER NOT NULL,
    [settingid] INTEGER NOT NULL,
    [value]     TEXT NOT NULL,
    PRIMARY KEY ([userid], [settingid]),
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE [notebooks] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [userid]        INTEGER NOT NULL,
    [name]          INTEGER NOT NULL,
    [isdiary]       BOOLEAN NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE
);

CREATE TABLE [notebookcategories] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [notebookid]    INTEGER NOT NULL,
    [name]          VARCHAR(255) NOT NULL,
    FOREIGN KEY ([notebookid]) REFERENCES [notebooks] ([id]) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `UQ_categories_notebookid_name` ON `notebookcategories` (
	`notebookid`,
	`name`
);

CREATE TABLE "notebookentries" (
	`id`	INTEGER NOT NULL,
	`notebookid`	INTEGER NOT NULL,
	`name`	VARCHAR ( 255 ),
	`categoryid`	INTEGER,
	`date`	DATETIME,
	`content`	BLOB NOT NULL,
	PRIMARY KEY(`id`),
	FOREIGN KEY(`notebookid`) REFERENCES `notebooks`(`id`) ON DELETE CASCADE,
	FOREIGN KEY(`categoryid`) REFERENCES `notebookcategories`(`id`) ON DELETE CASCADE
);

CREATE TABLE [dayratings] (
    [id]            INTEGER NOT NULL PRIMARY KEY,
    [userid]        INTEGER NOT NULL,
    [date]          DATETIME NOT NULL,
    [rating]        INTEGER NOT NULL,
    FOREIGN KEY ([userid]) REFERENCES [users] ([id]) ON DELETE CASCADE,
    UNIQUE([userid], [date])
);

CREATE TABLE "apikeys" (
	`id`	INTEGER NOT NULL,
	`key`	VARCHAR ( 255 ) NOT NULL,
	`name`	VARCHAR ( 255 ) NOT NULL,
	`userid`	INTEGER NOT NULL,
	`timestamp`	DATETIME NOT NULL,
	PRIMARY KEY(`id`),
	FOREIGN KEY(`userid`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
