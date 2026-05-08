export default async db => {
	await db.client.execute(
		`CREATE INDEX IF NOT EXISTS bookmark_vector_idx ON bookmark_vector (
			libsql_vector_idx (vector, 'metric=cosine', 'max_neighbors=16', 'compress_neighbors=float8'))`);
};
