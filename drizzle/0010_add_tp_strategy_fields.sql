-- Add new TP strategy fields to bot_settings table
ALTER TABLE bot_settings ADD COLUMN tp_count INTEGER NOT NULL DEFAULT 3;
ALTER TABLE bot_settings ADD COLUMN tp1_rr REAL NOT NULL DEFAULT 1.0;
ALTER TABLE bot_settings ADD COLUMN tp1_percent REAL NOT NULL DEFAULT 50.0;
ALTER TABLE bot_settings ADD COLUMN tp2_rr REAL NOT NULL DEFAULT 2.0;
ALTER TABLE bot_settings ADD COLUMN tp2_percent REAL NOT NULL DEFAULT 30.0;
ALTER TABLE bot_settings ADD COLUMN tp3_rr REAL NOT NULL DEFAULT 3.0;
ALTER TABLE bot_settings ADD COLUMN tp3_percent REAL NOT NULL DEFAULT 20.0;
ALTER TABLE bot_settings ADD COLUMN sl_management_after_tp1 TEXT NOT NULL DEFAULT 'breakeven';
ALTER TABLE bot_settings ADD COLUMN sl_trailing_distance REAL NOT NULL DEFAULT 0.5;
