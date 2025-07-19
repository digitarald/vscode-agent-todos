# Implementation Plan: AutoInject Feature Updates

## Executive Summary

This plan covers changing the autoInject feature to write to `.github/instructions/todos.instructions.md` instead of `.github/copilot-instructions.md`, and adding the required frontmatter template with the `applyTo: '**'` directive before the `<todos>` XML section.

## Codebase Analysis

### Current Architecture
The autoInject feature currently uses:
- **CopilotInstructionsManager** (VS Code mode) - handles file operations via VS Code APIs
- **StandaloneCopilotWriter** (standalone MCP mode) - handles file operations via Node.js fs APIs
- **Configuration**: `agentTodos.autoInjectFilePath` setting with default `.github/copilot-instructions.md`
- **Template**: Direct XML `<todos>` section prepended to existing content

### Key Components Identified
- `src/copilotInstructionsManager.ts`: VS Code file operations
- `src/mcp/standaloneCopilotWriter.ts`: Standalone file operations  
- `package.json`: Configuration schema and default value
- `src/todoManager.ts`: Configuration reading logic
- `src/mcp/standaloneTodoManager.ts`: Configuration handling for standalone mode

### Current Template Structure
```xml
<todos title="${title}" rule="Review steps frequently throughout the conversation and DO NOT stop between steps unless they explicitly require it.">
${todoMarkdown}
</todos>
```

## Requirements Understanding

### Primary Changes Required
1. **Default File Path Change**: `.github/copilot-instructions.md` → `.github/instructions/todos.instructions.md`
2. **Template Enhancement**: Add frontmatter before the `<todos>` XML section:
   ```yaml
   ---
   applyTo: '**'
   ---
   ```

### Key Constraints
- Change default behavior for all users (no backward compatibility)
- Preserve existing frontmatter if present, add if missing
- Handle directory creation for the new nested structure
- Support both absolute and relative paths as before
- Maintain the write-only pattern (never read back from the file)

## Implementation Strategy

### Recommended Approach
**Direct update strategy** - Update default configuration and template format for all users.

**Key Benefits:**
- Cleaner implementation without compatibility layers
- All users get consistent new behavior
- Simpler code maintenance
- Clear migration path

### Alternative Approaches Considered
- **Migration approach**: Auto-migrate existing files from old to new location
  - **Pros**: Preserves user data location
  - **Cons**: Complex migration logic, risk of data loss
- **Backward compatibility approach**: Support both old and new formats simultaneously
  - **Pros**: No user disruption  
  - **Cons**: Increased complexity, maintenance burden, rejected per requirements

## Phase Breakdown

### Phase 1: Configuration Update — Update default paths — Low — none
**Goal**: Change default configuration to point to new file location
**Deliverables**:
- Updated `package.json` default value
- Updated fallback defaults in code

**Success Criteria**:
- All installations use `.github/instructions/todos.instructions.md` by default
- Existing users automatically switch to new path on next update

### Phase 2: Template Enhancement — Add frontmatter template — Low — Phase 1
**Goal**: Add frontmatter to the generated file template
**Deliverables**:
- Updated template in both `CopilotInstructionsManager` and `StandaloneCopilotWriter`
- Preserved existing XML structure

**Success Criteria**:
- New files include the required frontmatter
- Existing files preserve existing frontmatter and add todos section
- XML todos structure remains functional

### Phase 3: Directory Handling — Ensure nested directory creation — Low — Phase 1
**Goal**: Handle creation of nested `.github/instructions/` directory
**Deliverables**:
- Enhanced directory creation logic in both implementations
- Validation that nested paths work correctly

**Success Criteria**:
- Directory creation works for nested paths
- File operations succeed in new directory structure
- Error handling for directory creation failures

## Component Map

- `package.json`: configuration default (modify) — Update default autoInjectFilePath value
- `src/copilotInstructionsManager.ts`: template format (modify) — Add frontmatter to updateInstructionsWithTodos method
- `src/mcp/standaloneCopilotWriter.ts`: template format (modify) — Add frontmatter to updateInstructionsWithTodos method
- `src/todoManager.ts`: fallback default (modify) — Update getAutoInjectFilePath default value  
- `src/mcp/standaloneTodoManager.ts`: fallback default (modify) — Update constructor default parameter
- `.github/copilot-instructions.md`: architecture documentation (modify) — Update references to new default path

## Data Architecture

### Template Structure Changes
**Current Structure:**
```
<todos title="..." rule="...">
${todoMarkdown}
</todos>
```

**New Structure:**
```yaml
---
applyTo: '**'
---

<todos title="..." rule="...">
${todoMarkdown}
</todos>
```

### File Path Changes
- **Old Default**: `.github/copilot-instructions.md`
- **New Default**: `.github/instructions/todos.instructions.md`
- **Directory**: Will auto-create `.github/instructions/` if needed

## Testing Strategy

### Unit Test Requirements
- Verify frontmatter is added to new files only when missing
- Verify existing frontmatter is preserved when present
- Test directory creation for nested paths
- Validate template format matches requirements
- Test new default path behavior

### Integration Test Scenarios
- Create new todos with new default path
- Update existing todos, preserving existing frontmatter
- Handle directory creation failures gracefully
- Verify file content structure after updates

### E2E Validation
- Test VS Code extension with new defaults
- Test standalone MCP server with new defaults
- Verify new file creation in clean workspace
- Test frontmatter preservation with existing files

## Risk Analysis

### Risk: Directory Creation Failures
**Mitigation**: Enhanced error handling with fallback directory creation
**Monitoring**: Log directory creation attempts and failures

### Risk: Frontmatter Detection
**Description**: Need to detect existing frontmatter to avoid duplication
**Mitigation**: Simple regex check for existing frontmatter before adding
**Monitoring**: Log frontmatter detection and addition

### Risk: User File Location Change
**Description**: Users will need to update their workflows for new file location
**Mitigation**: Update documentation and consider notification message
**Monitoring**: Track usage of new vs old file paths

## Tasks

- [x] TASK-1: Update package.json default configuration — CONFIG-1 — S — none
  - **Acceptance**: `agentTodos.autoInjectFilePath` default changed to `.github/instructions/todos.instructions.md`
  
- [x] TASK-2: Update CopilotInstructionsManager template — TEMPLATE-1 — M — TASK-1
  - **Acceptance**: Frontmatter added only if missing before `<todos>` section in updateInstructionsWithTodos method
  
- [x] TASK-3: Update StandaloneCopilotWriter template — TEMPLATE-1 — M — TASK-1
  - **Acceptance**: Frontmatter added only if missing before `<todos>` section in updateInstructionsWithTodos method
  
- [x] TASK-4: Update TodoManager fallback default — CONFIG-1 — S — TASK-1
  - **Acceptance**: getAutoInjectFilePath method uses new default when VS Code config unavailable
  
- [x] TASK-5: Update StandaloneTodoManager fallback default — CONFIG-1 — S — TASK-1
  - **Acceptance**: StandaloneCopilotWriter constructor uses new default file path
  
- [x] TASK-6: Enhance directory creation logic — INFRA-1 — M — none
  - **Acceptance**: Both implementations handle nested directory creation correctly
  
- [x] TASK-7: Update architecture documentation — DOC-1 — S — TASK-1
  - **Acceptance**: References to file paths updated in .github/copilot-instructions.md

## Decisions Log

- **2025-01-19**: Chose direct update strategy over backward compatibility to simplify implementation
- **2025-01-19**: Decided to preserve existing frontmatter and only add when missing
- **2025-01-19**: Selected simple string template approach without YAML validation
- **2025-01-19**: All users will get new default file path behavior
- **2025-01-19**: TASK-1 completed - Updated all default configuration paths from `.github/copilot-instructions.md` to `.github/instructions/todos.instructions.md` in package.json, todoManager.ts, copilotInstructionsManager.ts, and standaloneCopilotWriter.ts
- **2025-01-19**: TASK-2 completed - Added frontmatter detection and addition to CopilotInstructionsManager with tests
- **2025-01-19**: TASK-3 completed - Added frontmatter detection and addition to StandaloneCopilotWriter with tests  
- **2025-01-19**: TASK-4,5 completed as part of TASK-1 - All fallback defaults updated
- **2025-01-19**: TASK-6 verified complete - Directory creation already working with recursive: true
- **2025-01-19**: TASK-7 completed - Updated all documentation references to new default paths
- **2025-01-19**: **BUG FIX** - Fixed frontmatter accumulation issue where frontmatter was being added after todos section instead of preserved from original file, causing multiple frontmatter blocks to accumulate. Root cause: Logic was checking for frontmatter AFTER prepending todos section, not before. Solution: Check original content for frontmatter first, then either preserve existing frontmatter or add new frontmatter appropriately.

## Open Questions & Decisions

### Requirements
- **Q1**: Should we provide any user notification about the file path change?
  - **Context**: Users will see their todos appear in a new file location
  - **Impact**: User awareness and workflow adaptation
  - **Recommendation**: Add one-time notification or update documentation prominently

### Technical  
- **D1**: Use simple string detection for frontmatter presence
  - **Approach**: Check if file starts with `---` to detect existing frontmatter
  - **Pros**: Simple, reliable, no parsing required
  - **Cons**: Could false positive on non-frontmatter content starting with `---`
  - **Decision**: Use regex check for `^---\n.*?\n---\n` pattern

### Architecture
- **Q2**: Should the frontmatter template be configurable?
  - **Context**: Users might want different `applyTo` values
  - **Impact**: Determines if we need additional configuration options
  - **Recommendation**: Keep it fixed for now, can add configuration later if needed

**PAUSE FOR FEEDBACK**

## Implementation Status: COMPLETE ✅

All tasks have been successfully implemented and tested:

### Completed Features
1. **Default Path Change**: All users now use `.github/instructions/todos.instructions.md` by default
2. **Frontmatter Template**: Automatically adds `applyTo: '**'` frontmatter when missing
3. **Frontmatter Preservation**: Existing frontmatter is preserved during updates
4. **Directory Creation**: Nested directory structure is created automatically
5. **Documentation Updates**: All references updated to new paths

### Implementation Summary
- ✅ Updated 4 files for default path configuration
- ✅ Added frontmatter detection and addition logic to both VS Code and standalone modes
- ✅ Created comprehensive test suites for new functionality
- ✅ Updated all documentation and UI text references
- ✅ Verified directory creation works for nested paths
- ✅ Created integration tests covering complete workflow

### Breaking Changes
- **Default file location changed** from `.github/copilot-instructions.md` to `.github/instructions/todos.instructions.md`
- **Frontmatter added automatically** to all generated files with `applyTo: '**'`
- **Command titles updated** to be generic instead of file-specific

All changes maintain backward compatibility for users who have customized the file path setting.
