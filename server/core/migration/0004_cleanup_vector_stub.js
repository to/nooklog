export default async db => {
	const info = await db.execute("PRAGMA table_info('bookmark_vector')");
	const isStub = info.length > 0 && !info.some(c => c.name === 'chunk_index');

	// Drop the legacy stub table to force database.js to recreate it with the full schema.
	// This ensures that existing "full" tables with data are preserved.
	if (isStub)
		await db.execute('DROP TABLE IF EXISTS bookmark_vector');
};
