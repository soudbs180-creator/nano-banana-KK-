# KK Studio Execution Roadmap

## Product Goal

Build KK Studio into a multi-provider AI workspace that can:

1. Route across many API providers reliably
2. Generate image/video with resilient recovery
3. Offer GPT-like chat UX for daily use
4. Keep media loading near-instant with cache + local fallback

## Phase Plan

## Phase 1 - Multi API compatibility foundation (In Progress)

### Delivered in this batch

- Added provider capability registry with explicit capability matrix
  - file: `src/services/llm/providerCapabilities.ts`
- Added capability/profile methods in LLM service
  - file: `src/services/llm/LLMService.ts`
- Added provider-model sanity check before chat/image generation routing

### Next tasks

- Wire capability profile into Settings UI for provider/model validation hints
- Add fallback policy per provider (priority + cooldown)
- Add model capability labels (chat/image/video/multimodal) in model picker

## Phase 2 - Image/video generation reliability

### Core tasks

- Standardize generation task states: queued/running/success/fail/retryable
- Add task-level retry policy with backoff and reason codes
- Persist generation logs with requestId/provider/model for diagnosis
- Ensure generated output is always written to both browser cache and local fallback

## Phase 3 - GPT-style chat assistant UX

### Core tasks

- Streaming message UX with partial rendering and cancellation
- Message actions: retry/edit/regenerate/branch conversation
- Session list improvements: pin/search/archive
- Multimodal message attachments linked to canvas nodes

## Phase 4 - Performance and observability

### Core tasks

- Add loading SLA metrics (thumbnail hit rate / first paint latency)
- Add cache health panel (memory/idb/local)
- Add chunking optimization and lazy split for large bundles
- Add error taxonomy and actionable user hints

## Current Bugfix Priorities

## P0 (Now)

- Sub-card preview load delays despite existing IDs
- Retry button not forcing true re-hydration path
- Inconsistent storage binding between image.id and storageId

## P1 (Short term)

- Long-session chat rendering lag
- Generation queue contention under high parallel count
- Local permission loss recovery issues

## Acceptance Targets

- Provider onboarding: add a new provider in less than one day
- Preview load: cache-hit cards render in under one second
- Recovery: failed generation retries succeed above 95% (transient failures)
- Chat: first stream token appears in under 300ms in normal network conditions
