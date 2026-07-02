CREATE TABLE `shop_config` (
	`id` text PRIMARY KEY NOT NULL,
	`farmer_commission_rate` real NOT NULL,
	`buyer_commission_rate` real NOT NULL,
	`katt_kg_per_bag` real NOT NULL,
	`per_bag_labour` integer NOT NULL,
	`per_bag_charge` integer NOT NULL,
	`bag_bearer` text NOT NULL,
	`labour_bearer` text NOT NULL,
	`cess_rate` real NOT NULL
);
