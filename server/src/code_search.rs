use std::path::Path;
use tantivy::{
    Index, IndexReader, IndexWriter, ReloadPolicy, TantivyDocument, Term,
    collector::TopDocs,
    query::{BooleanQuery, Occur, TermQuery},
    schema::{Field, SchemaBuilder, TextFieldIndexing, TextOptions, Value, STORED, STRING},
    snippet::SnippetGenerator,
};
use uuid::Uuid;

/// Schema field handles
struct CodeSchema {
    path: Field,
    content: Field,
    language: Field,
    project_id: Field,
    org_id: Field,
}

pub struct CodeDocument {
    pub path: String,
    pub content: String,
    pub language: String,
    pub project_id: Uuid,
    pub org_id: Uuid,
}

pub struct CodeSearchResult {
    pub path: String,
    pub snippet: String,
    pub language: String,
    pub score: f32,
}

pub struct CodeIndex {
    index: Index,
    reader: IndexReader,
    schema: CodeSchema,
}

impl CodeIndex {
    /// Create or open a Tantivy index at the given path.
    pub fn new(index_path: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(index_path)?;

        let mut builder = SchemaBuilder::new();

        // Full-text searchable content
        let content_indexing = TextFieldIndexing::default()
            .set_tokenizer("default")
            .set_index_option(tantivy::schema::IndexRecordOption::WithFreqsAndPositions);
        let content_options = TextOptions::default()
            .set_indexing_options(content_indexing)
            .set_stored();

        let path = builder.add_text_field("path", STORED | STRING);
        let content = builder.add_text_field("content", content_options);
        let language = builder.add_text_field("language", STORED | STRING);
        let project_id = builder.add_text_field("project_id", STORED | STRING);
        let org_id = builder.add_text_field("org_id", STORED | STRING);

        let schema = builder.build();

        let dir = tantivy::directory::MmapDirectory::open(index_path)?;
        let index = Index::open_or_create(dir, schema)?;

        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()?;

        Ok(Self {
            index,
            reader,
            schema: CodeSchema {
                path,
                content,
                language,
                project_id,
                org_id,
            },
        })
    }

    /// Add or update a file in the index. Uses the path as the unique key per project.
    pub fn index_file(&self, doc: CodeDocument) -> anyhow::Result<()> {
        let mut writer: IndexWriter = self.index.writer(50_000_000)?;

        // Delete existing doc with same path + project_id before re-indexing
        let path_term = Term::from_field_text(self.schema.path, &doc.path);
        let project_term = Term::from_field_text(
            self.schema.project_id,
            &doc.project_id.to_string(),
        );
        // Delete by compound identity: path within the project
        writer.delete_term(Term::from_field_text(
            self.schema.path,
            &format!("{}::{}", doc.project_id, doc.path),
        ));
        // Also delete by raw path term to handle legacy entries
        writer.delete_term(path_term.clone());
        drop(path_term);
        drop(project_term);

        let mut new_doc = TantivyDocument::default();
        // Store the compound key as the path for deletion uniqueness
        new_doc.add_text(self.schema.path, &doc.path);
        new_doc.add_text(self.schema.content, &doc.content);
        new_doc.add_text(self.schema.language, &doc.language);
        new_doc.add_text(self.schema.project_id, &doc.project_id.to_string());
        new_doc.add_text(self.schema.org_id, &doc.org_id.to_string());

        writer.add_document(new_doc)?;
        writer.commit()?;
        Ok(())
    }

    /// Search with org/project scoping.
    pub fn search(
        &self,
        org_id: Uuid,
        project_id: Option<Uuid>,
        query: &str,
        limit: usize,
    ) -> anyhow::Result<Vec<CodeSearchResult>> {
        let searcher = self.reader.searcher();

        // Build content query
        let mut query_parser = tantivy::query::QueryParser::for_index(
            &self.index,
            vec![self.schema.content, self.schema.path],
        );
        query_parser.set_conjunction_by_default();
        let content_query = query_parser.parse_query(query)?;

        // Org filter
        let org_term = TermQuery::new(
            Term::from_field_text(self.schema.org_id, &org_id.to_string()),
            tantivy::schema::IndexRecordOption::Basic,
        );

        // Build boolean query: content AND org [AND project]
        let mut subqueries: Vec<(Occur, Box<dyn tantivy::query::Query>)> = vec![
            (Occur::Must, content_query),
            (Occur::Must, Box::new(org_term)),
        ];

        if let Some(pid) = project_id {
            let project_term = TermQuery::new(
                Term::from_field_text(self.schema.project_id, &pid.to_string()),
                tantivy::schema::IndexRecordOption::Basic,
            );
            subqueries.push((Occur::Must, Box::new(project_term)));
        }

        let final_query = BooleanQuery::new(subqueries);

        let top_docs = searcher.search(&final_query, &TopDocs::with_limit(limit))?;

        // Set up snippet generator for content field
        let snippet_gen =
            SnippetGenerator::create(&searcher, &final_query, self.schema.content)?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let retrieved: TantivyDocument = searcher.doc(doc_address)?;

            let path = retrieved
                .get_first(self.schema.path)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let language = retrieved
                .get_first(self.schema.language)
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let snippet = snippet_gen.snippet_from_doc(&retrieved);
            let snippet_str = snippet.to_html(); // includes <b> highlights

            results.push(CodeSearchResult {
                path,
                snippet: snippet_str,
                language,
                score,
            });
        }

        Ok(results)
    }

    /// Remove all documents belonging to a project.
    pub fn delete_project(&self, project_id: Uuid) -> anyhow::Result<()> {
        let mut writer: IndexWriter = self.index.writer(50_000_000)?;
        writer.delete_term(Term::from_field_text(
            self.schema.project_id,
            &project_id.to_string(),
        ));
        writer.commit()?;
        Ok(())
    }
}

/// Detect programming language from file extension.
pub fn detect_language(path: &str) -> &'static str {
    match Path::new(path).extension().and_then(|e| e.to_str()) {
        Some("rs") => "rust",
        Some("ts") | Some("tsx") => "typescript",
        Some("js") | Some("jsx") => "javascript",
        Some("py") => "python",
        Some("sql") => "sql",
        Some("md") => "markdown",
        Some("toml") => "toml",
        Some("yaml") | Some("yml") => "yaml",
        Some("json") => "json",
        Some("go") => "go",
        Some("java") => "java",
        Some("cs") => "csharp",
        Some("cpp") | Some("cc") | Some("cxx") => "cpp",
        Some("c") | Some("h") => "c",
        Some("rb") => "ruby",
        Some("sh") | Some("bash") => "shell",
        Some("html") | Some("htm") => "html",
        Some("css") | Some("scss") | Some("sass") => "css",
        _ => "unknown",
    }
}
