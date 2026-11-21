CREATE TABLE IF NOT EXISTS discovery_articles (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, account TEXT NOT NULL, published_at TEXT,
 read_count INTEGER, data_json TEXT NOT NULL, first_seen TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS discovery_published ON discovery_articles(published_at DESC,id);
CREATE INDEX IF NOT EXISTS discovery_reads ON discovery_articles(read_count DESC,id);
CREATE INDEX IF NOT EXISTS discovery_article_url ON discovery_articles(json_extract(data_json,'$.url'));
CREATE TABLE IF NOT EXISTS discovery_memberships (
 article_id TEXT NOT NULL REFERENCES discovery_articles(id), category TEXT NOT NULL, source TEXT NOT NULL,
 PRIMARY KEY(article_id,category,source)
);
CREATE INDEX IF NOT EXISTS discovery_category ON discovery_memberships(category,article_id);
CREATE TABLE IF NOT EXISTS discovery_snapshots (
 article_id TEXT NOT NULL REFERENCES discovery_articles(id), job_id TEXT NOT NULL, captured_at TEXT NOT NULL,
 data_json TEXT NOT NULL, PRIMARY KEY(article_id,job_id)
);
CREATE TABLE IF NOT EXISTS discovery_jobs (
 id TEXT PRIMARY KEY, status TEXT NOT NULL, params_json TEXT NOT NULL, created_at TEXT NOT NULL,
 finished_at TEXT, new_count INTEGER DEFAULT 0, updated_count INTEGER DEFAULT 0,
 skipped_count INTEGER DEFAULT 0, error TEXT
);
CREATE TABLE IF NOT EXISTS discovery_usage (day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS discovery_job_steps (
 job_id TEXT NOT NULL REFERENCES discovery_jobs(id), step_index INTEGER NOT NULL,
 params_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempted INTEGER NOT NULL DEFAULT 0,
 started_at TEXT, finished_at TEXT, new_count INTEGER NOT NULL DEFAULT 0,
 updated_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0, error TEXT,
 PRIMARY KEY(job_id,step_index)
);
CREATE TABLE IF NOT EXISTS topics (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 angle TEXT NOT NULL DEFAULT '', audience TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'research', revision INTEGER NOT NULL DEFAULT 0,
 tags_json TEXT NOT NULL DEFAULT '[]',
 current_brief TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS topics_owner ON topics(user_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS topic_sources (
 topic_id TEXT NOT NULL REFERENCES topics(id), article_id TEXT NOT NULL REFERENCES discovery_articles(id),
 PRIMARY KEY(topic_id,article_id)
);
CREATE INDEX IF NOT EXISTS topic_sources_article ON topic_sources(article_id,topic_id);
CREATE TABLE IF NOT EXISTS topic_briefs (
 id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id), markdown TEXT NOT NULL,
 kind TEXT NOT NULL, model TEXT, input_json TEXT, created_at TEXT NOT NULL
);
