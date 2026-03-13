# API Stable Baseline

This file records the API documents that are the source of truth for this project.

If runtime behavior, old code, or a third-party compatibility guess conflicts with these docs, the docs win.

## Authoritative docs

- 12AI general API: http://doc.12ai.org/api/
- 12AI Gemini image API: https://doc.12ai.org/api/gemini-image/
- NewAPI Gemini image relay v1beta: https://docs.newapi.pro/zh/docs/api/ai-model/images/gemini/geminirelayv1beta-383837589
- NewAPI Gemini image relay v1beta: https://docs.newapi.pro/zh/docs/api/ai-model/images/gemini/geminirelayv1beta-389846313
- NewAPI OpenAI image edits: https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-edits
- NewAPI OpenAI image generations: https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-generations
- NewAPI chat create message: https://docs.newapi.pro/zh/docs/api/ai-model/chat/createmessage
- NewAPI Gemini chat relay v1beta: https://docs.newapi.pro/zh/docs/api/ai-model/chat/gemini/geminirelayv1beta-391536411
- NewAPI Gemini chat relay v1beta: https://docs.newapi.pro/zh/docs/api/ai-model/chat/gemini/geminirelayv1beta
- NewAPI OpenAI chat completions: https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createchatcompletion
- NewAPI OpenAI responses: https://docs.newapi.pro/zh/docs/api/ai-model/chat/openai/createresponse
- NewAPI completions: https://docs.newapi.pro/zh/docs/api/ai-model/completions/createcompletion
- Wuyin API doc: https://api.wuyinkeji.com/doc/65

## Stable routing rules

### 1. 12AI Gemini image native

Use Gemini native routing for 12AI Gemini image channels when the channel format is Gemini-native.

- Endpoint: `POST /v1beta/models/{model}:generateContent?key=...`
- Auth: query-string API key
- Body must use Gemini-native schema
- Include `generationConfig.imageConfig`
- Include `responseModalities`

Do not silently rewrite this route into OpenAI chat or OpenAI image endpoints unless the channel is explicitly configured as OpenAI-compatible.

### 2. OpenAI-compatible image generation

For OpenAI/NewAPI image generation:

- Endpoint: `POST /v1/images/generations`
- Content type: JSON
- Main fields: `model`, `prompt`, `n`, `size`, `response_format`

Model-specific limits that must be respected:

- `gpt-image-1`: `1024x1024`, `1536x1024`, `1024x1536`, `auto`
- `dall-e-2`: `256x256`, `512x512`, `1024x1024`
- `dall-e-3`: `1024x1024`, `1792x1024`, `1024x1792`
- `dall-e-3` must be clamped to `n = 1`

### 2.5. Gemini-native auth is provider-specific

Gemini-native routing is not one single auth style.

- 12AI Gemini-native docs use `?key=...`
- Google official Gemini docs are compatible with query-style key auth
- NewAPI Gemini relay docs use `Authorization: Bearer <token>`
- Wuyin API doc shows `Authorization: <token>` and its request example also accepts `?key=...`

Rules:

- Do not hardcode all Gemini-native channels to query auth
- Default auth should follow the provider base URL and the authoritative doc
- If the channel is explicitly configured as Gemini format on a non-Google, non-12AI gateway, prefer Bearer auth unless the provider doc says otherwise
- Do not automatically prepend `Bearer ` when a provider doc requires a raw `Authorization` token value

### 3. OpenAI-compatible image edits

For image edit / inpaint / mask flows:

- Endpoint: `POST /v1/images/edits`
- Content type: `multipart/form-data`
- Main fields: `image`, optional `mask`, `model`, `prompt`, `size`, `response_format`

Edit size must stay within documented values:

- `256x256`
- `512x512`
- `1024x1024`

Do not send edit payloads to `/v1/images/generations` when the operation is an edit and the provider follows the OpenAI-style edits doc.

### 4. Chat APIs are not the default image path

The chat docs are authoritative for chat endpoints, not a blanket replacement for images.

Rules:

- Do not default Gemini image channels to chat if an image-native route exists in the authoritative docs
- Do not default OpenAI-compatible image channels to `/v1/chat/completions` unless the provider explicitly documents image generation through chat
- Treat undocumented chat-image fallbacks as compatibility exceptions, not as the stable path

### 5. OpenAI-compatible auth

For OpenAI-compatible routes:

- Prefer `Authorization: Bearer <token>`
- If a provider explicitly documents a different header, follow that provider doc exactly

For Gemini-native routes:

- Prefer `?key=...` when the authoritative doc specifies query auth
- Do not force Bearer auth onto Gemini-native endpoints

### 6. Video compatibility

For OpenAI-compatible video channels, prefer the provider's documented video endpoints over heuristic chat/image fallback.

Current stable assumptions used by the app:

- Submit: `POST /v1/videos`
- Poll: `GET /v1/videos/{id}`
- Content download: `GET /v1/videos/{id}/content`

If a provider's own authoritative doc explicitly uses `/v1/video/generations/{task_id}`, that route may be supported as a compatibility poll path, but it is not the default unless documented.

### 7. Connection testing

Connection tests must validate protocol compatibility without creating billed image/video jobs when avoidable.

Rules:

- Gemini-native channels: prefer lightweight Gemini-native checks
- OpenAI-compatible channels: prefer model-list or lightweight chat checks
- Image/video channels should not be marked broken just because `/v1/chat/completions` is unsupported

## Engineering policy

- Runtime vendor matching now belongs in `src/services/api/providerStrategy.ts`.
- When adding a new documented provider, update the strategy registry first, then wire any provider-specific payload differences only where strictly necessary.
- When changing `OpenAICompatibleAdapter`, `VideoCompatibleAdapter`, `GoogleAdapter`, or connection testing, check this baseline first
- Avoid undocumented automatic fallback between chat, images, and native Gemini routes
- Prefer explicit channel format over model-name guessing
- If a provider is not covered by these docs, add a local note before introducing a new heuristic
