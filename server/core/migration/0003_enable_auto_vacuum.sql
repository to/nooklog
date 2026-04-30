-- Enable incremental auto-vacuum mode
-- Note: This requires a manual VACUUM execution to take effect.
PRAGMA auto_vacuum = INCREMENTAL;
VACUUM;
