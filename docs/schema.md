# Database Schema

Schema definition for Nooklog.
Powered by LibSQL (SQLite), supporting Full-Text Search (FTS5) and Vector Search.

## Table Definition

```sql
-- Main table for storing bookmarks
CREATE TABLE bookmark (
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
);

-- Internal metadata and configuration
CREATE TABLE meta (
    id TEXT PRIMARY KEY,
    value TEXT
);

-- Full-Text Search (FTS5)
CREATE VIRTUAL TABLE bookmark_fts USING fts5(
    title,
    memo,
    summary,
    markdown,
    url,
    tokenize="unicode61 categories 'L* N* P* S*'" -- unigram
);

-- Vector Search
CREATE TABLE bookmark_vector (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id INTEGER,
    chunk_index INTEGER,
    field TEXT,
    content TEXT,
    position INTEGER,
    vector F32_BLOB(768) -- dimension depends on the model
);

CREATE INDEX bookmark_updated_at_idx ON bookmark (updated_at DESC);
CREATE INDEX bookmark_created_at_idx ON bookmark (created_at DESC);
CREATE INDEX bookmark_rating_idx ON bookmark (rating);
CREATE INDEX bookmark_vector_bookmark_id_idx ON bookmark_vector (bookmark_id);
```
