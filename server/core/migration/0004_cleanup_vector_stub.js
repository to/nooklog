export default async db => {
	const info = await db.execute("PRAGMA table_info('bookmark_vector')");
	const isStub = info.length > 0 && !info.some(c => c.name === 'chunk_index');

	// If it's a legacy stub, recreate it with the full schema so other operations
	// like deletion can proceed even if the vector engine is not initialized.
	if (isStub) {
		await db.client.batch([
			'DROP TABLE IF EXISTS bookmark_vector',
			`CREATE TABLE bookmark_vector (
				row_id INTEGER PRIMARY KEY AUTOINCREMENT,
				bookmark_id INTEGER,
				chunk_index INTEGER,
				field TEXT,
				content TEXT,
				position INTEGER,
				vector F32_BLOB(768)
			)`,
			'CREATE INDEX IF NOT EXISTS bookmark_vector_bookmark_id_idx ON bookmark_vector (bookmark_id)',
		], 'write');
	}
};
