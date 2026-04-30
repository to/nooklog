[🇯🇵](README_ja.md)

# Normal Bookmark, Nooklog

![Twinkle Catchphrase](image/banner.png)

## Introduction
While browsing the web\
A wonderful page just vanished; ;\
A word you heard somewhere but cannot recall; ;\
Flooded with information you want to remember but it is all a mess > <\
Does that happen to you?

Why not turn the information🌊 flowing away before your eyes into precious and meaningful crystals💎?

Leave the tedious task of remembering to\
Normal Bookmark, Nooklog✨

**[🚀 Demo Site (No Vector Search / Read-only)](https://p01--nooklog-demo--dxnz489y9tm9.code.run/)**

## System Architecture
Server / Database / AI (Optional). You can deploy these freely on local or cloud environments.\
Windows / Mac / Linux. Various platforms.\
docker / pm2 / Electron (Planned). Various installation methods.

![Deployment Map](image/dployment.png)

- Run easily as a standalone app on local only
- Place only the database on the cloud (Turso) to share data between home and office
- Deploy to the cloud (Northflank + Turso) at low cost using only full-text search without AI
- Write only from PC and use a read-only lightweight server (Northflank + Turso) from outside
- Place everything on the cloud and use full power (If you have the budget)

## Features

> [!WARNING]\
> This software is currently in the early stages of development.\
> There are many minor bugs and missing features (unimplemented).\
> Also please perform frequent backups to prepare for data corruption.

**⚙️ Adding Bookmarks**\
A very small bookmark editor is quickly embedded and displayed on the page. It does not interfere with your reading.\
Smart tag completion and Ctrl + Enter to save. Complete the process in an instant using only the keyboard.\
Use the feature to copy selected text to notes and gather only the parts important for search and memory as if you were putting words into a shopping cart.

![Adding Bookmarks](image/save.png)

**⚙️ Browsing Bookmarks**\
The entire content of the page is saved as Markdown (structured plain text). (Continuous pages can be connected using browser extensions like uAutoPagerize).\
Use Reader Mode to browse collected pages continuously. (Arrow keys / Ctrl + J(K) / Alt + Arrow keys).

![Browsing Bookmarks](image/home.png)

**⚙️ Checking Bookmarks**\
A badge is displayed on the browser extension icon if the page is already bookmarked.\
You can immediately know "Did I bookmark this page?"

![Checking Bookmarks](image/icon-badge.png)

Searching for selected text via the context menu is also convenient. You can quickly check things like "That word HNSW  I felt like I saw it somewhere before.."

![Search from Context Menu](image/contextmenu-search.png)

**⚙️ Searching Bookmarks**\
All search states are included in the URL. You can set your favorite search conditions as your top page or save frequently used searches like a smart playlist.\
Register "http://<your_nooklog_site>/?query=%s" as "n" in your browser search engine and use it like "n claude code" from the address bar.

**⚙️ Full-Text Search**\
You can search not only the title and notes but the entire text (Markdown) of the page content.\
You can also target only the URL to narrow down searches to specific sites (Quick search by clicking the site favicon). Searches like "Recent Zenn pages I bookmarked" can be done in two clicks.\
The text splitting for indexing can be chosen between Word and Exact Partial Match (unigram).\
Unigram can search languages that are not space-separated like Chinese/Japanese/Korean and words containing symbols like "node-llama-cpp" with exact match.

**⚙️ Vector Search**\
Search for similar concepts like "Cat"  "Feline"  "Kitty".\
Text is carefully sliced at appropriate granularity (larger chunks for code blocks) according to the Markdown hierarchy.\
You can switch between fast approximate nearest neighbor (ANN) search and accurate brute-force scan.

**⚙️ Tag Input / Tag Search**\
Smart matching (scattered matching) like searching for "javascript" with "js" can be used for tag completion.\
Quickly search for tags by clicking them in the search results. Find related bookmarks one after another while filtering down from a single entry.

**⚙️ Rating**\
★★★☆☆ Rate input and sort by rating.\
Can be hidden if unnecessary.

**⚙️ libsql/Turso**\
Turso is a wonderful service that allows access to SQLite databases on remote servers just like local ones.\
Synchronize one data set between two locations like home and office at a low price.

**⚙️ Open API**\
[Open API (Scalar)](https://p01--nooklog-demo--dxnz489y9tm9.code.run/openapi.html)

**⚙️ Batch Maintenance**\
For batch processing of the database such as bulk tag replacement  URL formatting or content interpolation by crawlers  please check the following. \
It is easy if you ask an AI agent to read it and generate a script.

**[📖 Maintenance Guide](https://github.com/to/nooklog/blob/main/.apm/skills/nooklog-maintenance/SKILL.md)**

**⚙️ Patching with user.js / User Styles**\
You can freely add features with user.js (Tampermonkey/Greasemonkey). Refer to the following sample scripts.

- [Auto_Save.user.js](../tool/userjs/Auto_Save.user.js) (Automatically save specific site visits in the background. Logs.)
- [Auto_Tagging.user.js](../tool/userjs/Auto_Tagging.user.js) (Automatically determine tags based on URL.)
- [Auto_Summary.user.js](../tool/userjs/Auto_Summary.user.js) (Ask LLM to generate summaries.)

You can also freely change the appearance according to your preference with User Styles.

**⚙️ Import**\
You can import bookmarks in the following formats:\
Bookmark HTML (Chrome/Firefox/Hatena) / Pinboard / Linkwarden / Karakeep / Session Buddy / Tab Session Manager\
Feel free to import your data into Nooklog and see how it looks!

**⚙️ Export**\
You can export in the standard bookmark HTML format  so you can switch to other services at any time.\
You can also export in JSON format containing the complete text. There is no worry about losing access to your precious data ;-)\
You can also download only the content text (Markdown) as a zip file.\
Export targets can be chosen between global and search results. Useful for extracting all text files from specific keywords or specific sites.

## Installation
Quick start and operation check:

```sh
git clone https://github.com/to/nooklog.git
cd nooklog
npm install --omit=dev
npm start
```

For detailed installation methods including docker  pm2 or cloud deployment  please check here:

**[📖 Installation Guide](https://github.com/to/nooklog/blob/main/.apm/skills/nooklog-installation/SKILL.md)**

### Tech Stack

| Part | Technology |
| --- | --- |
| Frontend | Vanilla JS / Web Components |
| Server | Node.js / express |
| Content Extraction | readability / turndown |
| Chunking | unified / remark |
| AI | OpenAI (Ollama/...) |
| Database | SQLite (libsql/Turso) |

## License
**PolyForm NonCommercial 1.0.0**\
Credit is optional. Not following it is not a license violation.

> [!NOTE]\
> This software is not free. Because I really need money.\
> If I could get 10 dollars  I could survive for 3 days.
>
> It is a simple software  but I made it carefully with humans and AI working together to make sure everyone likes it.\
> There are no restrictions at all even for free. Please try it at your own pace for months and years and see how it feels.\
> If Nooklog helped you  if it made your life more vibrant  please consider supporting us ✨

## Roadmap
- Mobile Support (PWA)
- Electron
- AI Summary
- Date Search
- Speed / Memory Optimization
- Agentic Search / MCP / Skills / CLI
- Extended Search / HyDE
- PDF / Image (OCR) / Video (Subtitles)
- Crawler / Markdown Backfill / Plain Text Import
- Markdown Upload / Obsidian Integration

## Related Products

### Services
- [Pinboard](https://pinboard.in/)
- [Raindrop.io](https://raindrop.io/)

### Projects
- [linkding](https://github.com/sissbruecker/linkding)
- [Karakeep](https://github.com/karakeep-app/karakeep)
- [Linkwarden](https://github.com/linkwarden/linkwarden)
- [Readeck](https://codeberg.org/readeck/readeck)
- [Archivist](https://github.com/tokuhirom/Archivist)
