---
title: Markdown Chunking Benchmark Document
author: Nooklog Lab
date: 2026-03-23
---

# 1. Introduction and Project Scope
This document serves as a standard test case for structural and size-aware Markdown chunking. It contains various elements intended to verify hierarchical splitting, specialized block handling, and content sanitization.

## 1.1 Architectural Concepts
### 1.1.1 Hierarchical Path Accumulation
Chunking logic should preserve the logical breadcrumb of headings. For example, this specific sentence should yield a title path representing Section 1, Subsection 1.1, and Sub-subsection 1.1.1.

#### 1.1.1.1 Deeply Nested Heading Level 4
Small paragraphs under deep headings like this H4 should be merged with their parent heading if they are below the threshold size, preventing fragmented context in RAG systems.

---

# 2. Specialized Data Structures
This section contains elements that must be treated as atomic or semi-atomic units to maintain semantic integrity.

## 2.1 Tabular Data Handling (isTable)
The following table represents complex data that should be preserved as a single chunk, regardless of its character length, to prevent column-row misalignment.

| Metric | Value | Threshold | Priority |
| :--- | :--- | :--- | :--- |
| Accuracy | 0.98 | 0.95 | High |
| Latency | 120ms | 200ms | Medium |
| Throughput | 50 req/s | 40 req/s | High |
| Stability | Verified | Required | Critical |

## 2.2 Verbatim Code Blocks (isCode)
Large code blocks should be skipped during the mechanical sub-chunking pass. They are treated as single units up to the maximum limitSize defined in the configuration.

```javascript
/**
 * Recursive chunking logic implementation sketch.
 * This should remain as a single chunk unless it exceeds limitSize.
 */
export const chunk = (text, options = {}) => {
  const { targetSize = 700, limitSize = 1900 } = options;
  // Maintaining structural integrity for code blocks.
  return process(text, targetSize, limitSize);
}
```

# 3. Structural Breakpoints and Cleaning
This section verifies the logic for explicit break points and sanitization of noisy strings.

**Strong leading paragraphs** like this one are often targeted as natural splitting points to increase structural density.

- List items can also trigger splits to avoid oversized blocks.
- Nested structures should be handled carefully during the structural scan.
  - Sub-item A for detailed testing.
  - Sub-item B for detailed testing.

Finally, we test the removal of long URLs which can introduce noise during vector embedding. The resultant chunk should not contain the following raw URL string.
https://www1.example.com/some/long/path/to/resource/with/query/parameter?id=12345&session=abcdefghi&tracker=true&version=beta#section-main

The end of the document.
