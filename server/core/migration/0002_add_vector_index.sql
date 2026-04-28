-- Add vector index for existing users
-- (This might fail for brand new users without vector column, but initializeVectorTable will handle it)
CREATE INDEX IF NOT EXISTS bookmark_vector_idx ON bookmark_vector (libsql_vector_idx(vector, 'metric=cosine'));
