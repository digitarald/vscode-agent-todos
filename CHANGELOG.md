# Change Log

All notable changes to the "agent-plan" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Initial release with todo management tools for AI assistants
- Interactive tree view in VS Code panel
- Support for pending/in-progress/completed status and priority levels
- Auto-inject mode for synchronizing with `.github/copilot-instructions.md`
- File monitoring: automatically sync changes from instructions file when auto-inject is enabled
- Bidirectional synchronization between extension and markdown file

### Changed
- Updated status values from todo/in-progress/completed to pending/in_progress/completed
- Enhanced validation to ensure only one task can be in_progress at a time
- Improved model descriptions with usage guidance based on TodoWrite best practices