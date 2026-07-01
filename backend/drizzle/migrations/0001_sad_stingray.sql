CREATE TABLE `change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text NOT NULL,
	`after` text,
	`actor_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `entries` ADD `business_date` text DEFAULT (date('now', '+5 hours')) NOT NULL;--> statement-breakpoint
CREATE TRIGGER postings_no_update BEFORE UPDATE ON postings BEGIN SELECT RAISE(ABORT, 'postings are append-only (ADR-0021)'); END;
--> statement-breakpoint
CREATE TRIGGER postings_no_delete BEFORE DELETE ON postings BEGIN SELECT RAISE(ABORT, 'postings are append-only (ADR-0021)'); END;
--> statement-breakpoint
CREATE TRIGGER change_log_no_update BEFORE UPDATE ON change_log BEGIN SELECT RAISE(ABORT, 'change_log is append-only (ADR-0021)'); END;
--> statement-breakpoint
CREATE TRIGGER change_log_no_delete BEFORE DELETE ON change_log BEGIN SELECT RAISE(ABORT, 'change_log is append-only (ADR-0021)'); END;
