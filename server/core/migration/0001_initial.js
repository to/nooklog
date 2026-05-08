export default async db => {
	await db.client.batch([
		`CREATE TABLE IF NOT EXISTS bookmark (
			row_id INTEGER PRIMARY KEY AUTOINCREMENT,
			id TEXT UNIQUE NOT NULL,
			url TEXT,
			title TEXT,
			memo TEXT,
			rating INTEGER,
			tags TEXT, -- JSON array
			created_at INTEGER,
			updated_at INTEGER,
			html TEXT,
			markdown TEXT,
			summary TEXT,
			meta TEXT DEFAULT '{}' -- JSON object for management
		)`,
		`CREATE TABLE IF NOT EXISTS meta (
			id TEXT PRIMARY KEY,
			value TEXT
		)`,
		`CREATE INDEX IF NOT EXISTS bookmark_updated_at_idx ON bookmark (updated_at DESC)`,
		`CREATE INDEX IF NOT EXISTS bookmark_created_at_idx ON bookmark (created_at DESC)`,
		`CREATE INDEX IF NOT EXISTS bookmark_rating_idx ON bookmark (rating)`,
		// Vector table stub (will be dropped/re-created by initializeVectorTable)
		`CREATE TABLE IF NOT EXISTS bookmark_vector (bookmark_id INTEGER, vector F32_BLOB(768))`,
	], 'write');
};
