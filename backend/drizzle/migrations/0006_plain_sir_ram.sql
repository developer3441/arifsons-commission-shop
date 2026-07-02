CREATE TABLE `lot_bags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`lot_number` integer NOT NULL,
	`gross_kg` real NOT NULL,
	FOREIGN KEY (`lot_number`) REFERENCES `lots`(`lot_number`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lots` (
	`lot_number` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`farmer_id` text NOT NULL,
	`business_date` text DEFAULT (date('now', '+5 hours')) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`farmer_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
