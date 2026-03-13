// supabase/functions/secure-model-proxy/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
function parseSystemModelRoute(input) {
  const rawModelId = String(input || "").trim();
  const [baseModelId, rawSuffix = ""] = rawModelId.split("@");
  const suffix = rawSuffix.trim().toLowerCase();
  const systemMatch = suffix.match(/^system(?:_(.+))?$/);
  if (!systemMatch) {
    return {
      baseModelId: baseModelId.trim(),
      routeIndex: null,
      routeKey: null
    };
  }
  const rawRouteToken = String(systemMatch[1] || "").trim();
  if (!rawRouteToken) {
    return {
      baseModelId: baseModelId.trim(),
      routeIndex: null,
      routeKey: null
    };
  }
  if (/^\d+$/.test(rawRouteToken)) {
    const parsedIndex = Number(rawRouteToken) - 1;
    return {
      baseModelId: baseModelId.trim(),
      routeIndex: Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0,
      routeKey: null
    };
  }
  let routeKey = rawRouteToken;
  try {
    routeKey = decodeURIComponent(rawRouteToken);
  } catch {
    routeKey = rawRouteToken;
  }
  return {
    baseModelId: baseModelId.trim(),
    routeIndex: null,
    routeKey: routeKey.toLowerCase()
  };
}
function pickRandomKey(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const valid = keys.filter((key) => typeof key === "string" && key.trim().length > 0);
  if (valid.length === 0) return null;
  const index = Math.floor(Math.random() * valid.length);
  return valid[index];
}
function normalizeImageSize(imageSize) {
  const raw = String(imageSize || "1K").toUpperCase();
  if (raw.includes("4K")) return "4K";
  if (raw.includes("2K")) return "2K";
  if (raw.includes("0.5K") || raw.includes("512")) return "0.5K";
  return "1K";
}
function sortCreditModelRoutes(routes) {
  return [...routes].sort((left, right) => {
    const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
    if (priorityDiff !== 0) return priorityDiff;
    const weightDiff = Number(right.weight || 0) - Number(left.weight || 0);
    if (weightDiff !== 0) return weightDiff;
    const providerDiff = String(left.provider_id || "").localeCompare(String(right.provider_id || ""));
    if (providerDiff !== 0) return providerDiff;
    return String(left.model_id || "").localeCompare(String(right.model_id || ""));
  });
}
function normalizeQualityPricing(pricing, fallbackCost) {
  const safeCost = Math.max(1, Number(fallbackCost || 1));
  const defaults = {
    "0.5K": { enabled: true, creditCost: Math.max(1, Math.floor(safeCost * 0.5)) },
    "1K": { enabled: true, creditCost: safeCost },
    "2K": { enabled: true, creditCost: safeCost * 2 },
    "4K": { enabled: true, creditCost: safeCost * 4 }
  };
  if (!pricing || typeof pricing !== "object") {
    return defaults;
  }
  for (const size of ["0.5K", "1K", "2K", "4K"]) {
    const item = pricing[size];
    if (!item || typeof item !== "object") continue;
    defaults[size] = {
      enabled: item.enabled !== false,
      creditCost: Math.max(1, Number(item.creditCost || item.credit_cost || defaults[size].creditCost))
    };
  }
  return defaults;
}
function isRouteQualityEnabled(route, requestedSize) {
  if (!route.advanced_enabled) return true;
  const pricing = normalizeQualityPricing(route.quality_pricing, Number(route.credit_cost || 1));
  return pricing[requestedSize]?.enabled !== false;
}
function getRouteCreditCost(route, requestedSize) {
  if (!route.advanced_enabled) {
    return Math.max(1, Number(route.credit_cost || 1));
  }
  const pricing = normalizeQualityPricing(route.quality_pricing, Number(route.credit_cost || 1));
  return Math.max(1, Number(pricing[requestedSize]?.creditCost || route.credit_cost || 1));
}
function pickRandomRoute(routes) {
  if (routes.length === 0) return null;
  if (routes.length === 1) return routes[0];
  const index = Math.floor(Math.random() * routes.length);
  return routes[index] ?? routes[0] ?? null;
}
function pickCheapestRoute(routes, requestedSize, options) {
  if (routes.length === 0) return null;
  const onlyEnabledForRequestedSize = options?.onlyEnabledForRequestedSize !== false;
  const useBaseCreditCost = options?.useBaseCreditCost === true;
  const scopedRoutes = onlyEnabledForRequestedSize ? routes.filter((route) => isRouteQualityEnabled(route, requestedSize)) : routes;
  if (scopedRoutes.length === 0) return null;
  const pricedRoutes = scopedRoutes.map((route) => ({
    route,
    requiredCredits: useBaseCreditCost ? Math.max(1, Number(route.credit_cost || 1)) : getRouteCreditCost(route, requestedSize)
  }));
  const lowestCost = Math.min(...pricedRoutes.map((item) => item.requiredCredits));
  const cheapestRoutes = pricedRoutes.filter((item) => item.requiredCredits === lowestCost);
  return pickRandomRoute(cheapestRoutes);
}
function pickCreditModelRoute(routes, requestedSize, routeIndex, routeKey) {
  const sortedRoutes = sortCreditModelRoutes(routes);
  const mixedRoutes = sortedRoutes.filter((route) => route.mix_with_same_model === true);
  const eligibleRoutes = sortedRoutes.filter((route) => isRouteQualityEnabled(route, requestedSize));
  const eligibleMixedRoutes = mixedRoutes.filter((route) => isRouteQualityEnabled(route, requestedSize));
  if (routeKey) {
    const exactRoute = sortedRoutes.find(
      (route) => String(route.provider_id || "").trim().toLowerCase() === routeKey
    );
    if (!exactRoute || !isRouteQualityEnabled(exactRoute, requestedSize)) {
      return null;
    }
    return {
      route: exactRoute,
      requiredCredits: getRouteCreditCost(exactRoute, requestedSize)
    };
  }
  if ((routeIndex === null || routeIndex === 0) && mixedRoutes.length > 1) {
    const selectedForRequestedSize = pickCheapestRoute(mixedRoutes, requestedSize, {
      onlyEnabledForRequestedSize: true,
      useBaseCreditCost: false
    });
    if (selectedForRequestedSize) {
      return selectedForRequestedSize;
    }
    return pickCheapestRoute(mixedRoutes, requestedSize, {
      onlyEnabledForRequestedSize: false,
      useBaseCreditCost: true
    });
  }
  if (routeIndex !== null) {
    const exactRoute = sortedRoutes[routeIndex] || sortedRoutes[0];
    if (!exactRoute || !isRouteQualityEnabled(exactRoute, requestedSize)) {
      return null;
    }
    return {
      route: exactRoute,
      requiredCredits: getRouteCreditCost(exactRoute, requestedSize)
    };
  }
  if (eligibleRoutes.length === 0) return null;
  const selectedRoute = eligibleRoutes[0];
  return {
    route: selectedRoute,
    requiredCredits: getRouteCreditCost(selectedRoute, requestedSize)
  };
}
function mapAspectRatioToOpenAI(aspectRatio) {
  switch (aspectRatio) {
    case "16:9":
      return "1792x1024";
    case "9:16":
      return "1024x1792";
    case "3:2":
      return "1536x1024";
    case "2:3":
      return "1024x1536";
    case "4:3":
      return "1024x768";
    case "3:4":
      return "768x1024";
    default:
      return "1024x1024";
  }
}
async function signTaskPayload(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return Array.from(new Uint8Array(signature)).map((item) => item.toString(16).padStart(2, "0")).join("");
}
async function encodeTaskPayload(payload, secret) {
  const sig = await signTaskPayload(secret, payload);
  return `system_proxy:${btoa(JSON.stringify({ ...payload, sig }))}`;
}
async function decodeTaskPayload(taskId, secret) {
  if (!taskId.startsWith("system_proxy:")) return null;
  try {
    const raw = atob(taskId.slice("system_proxy:".length));
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.kind !== "video" || typeof parsed.modelId !== "string" || parsed.providerId !== void 0 && typeof parsed.providerId !== "string" || typeof parsed.endpointType !== "string" || typeof parsed.operationName !== "string" || typeof parsed.transactionId !== "string" || typeof parsed.userId !== "string" || typeof parsed.sig !== "string") {
      return null;
    }
    const payload = {
      kind: "video",
      modelId: parsed.modelId,
      providerId: typeof parsed.providerId === "string" ? parsed.providerId : void 0,
      endpointType: parsed.endpointType === "gemini" ? "gemini" : "openai",
      operationName: parsed.operationName,
      transactionId: parsed.transactionId,
      userId: parsed.userId
    };
    const expectedSig = await signTaskPayload(secret, payload);
    if (expectedSig !== parsed.sig) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
function normalizeAspectRatio(aspectRatio) {
  const value = String(aspectRatio || "").trim();
  if (!value || value.toLowerCase() === "auto") return void 0;
  return value;
}
function getVideoDurationSeconds(body) {
  if (typeof body.duration === "number" && Number.isFinite(body.duration) && body.duration > 0) {
    return Math.round(body.duration);
  }
  const legacyValue = Number.parseInt(String(body.videoDuration || "").trim(), 10);
  if (Number.isFinite(legacyValue) && legacyValue > 0) {
    return legacyValue;
  }
  return void 0;
}
function isGeminiImageCompatModel(modelId) {
  const lower = modelId.toLowerCase();
  return lower.includes("gemini") && lower.includes("image") || lower.includes("nano-banana") || lower.includes("banana");
}
function toOpenAIImageUrl(ref) {
  if (typeof ref === "string") {
    if (ref.startsWith("data:")) return ref;
    return null;
  }
  const rawData = String(ref.data || "");
  if (!rawData) return null;
  if (rawData.startsWith("data:")) return rawData;
  return `data:${ref.mimeType || "image/png"};base64,${rawData}`;
}
function extractImageUrlsFromOpenAICompatPayload(data) {
  const urls = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) {
      urls.push(value.trim());
    }
  };
  const candidates = [
    ...Array.isArray(data?.data) ? data.data : [],
    ...Array.isArray(data?.images) ? data.images : [],
    ...Array.isArray(data?.choices?.[0]?.message?.images) ? data.choices[0].message.images : []
  ];
  candidates.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const b64 = item.b64_json || item.b64 || item.base64;
    if (typeof b64 === "string" && b64.trim()) {
      urls.push(`data:image/png;base64,${b64.replace(/\s+/g, "")}`);
      return;
    }
    push(item.url);
    push(item.image_url);
  });
  const content = String(data?.choices?.[0]?.message?.content || "");
  const markdownMatch = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  if (markdownMatch?.[1]) {
    push(markdownMatch[1]);
  }
  const dataUrlMatch = content.match(/data:(image\/[^;]+);base64,([A-Za-z0-9+/=\s]+)/);
  if (dataUrlMatch?.[2]) {
    urls.push(`data:${dataUrlMatch[1]};base64,${dataUrlMatch[2].replace(/\s+/g, "")}`);
  }
  return Array.from(new Set(urls));
}
async function tryDeleteUpstreamVideoTask(endpointType, baseUrl, selectedKey, operationName) {
  try {
    if (endpointType === "gemini") {
      const apiBase = baseUrl.includes("/v1") ? baseUrl : `${baseUrl}/v1beta`;
      await fetch(`${apiBase}/${operationName}?key=${encodeURIComponent(selectedKey)}`, {
        method: "DELETE",
        headers: {
          "x-goog-api-key": selectedKey
        }
      }).catch(() => void 0);
      return;
    }
    const openaiBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
    const candidateUrls = [
      `${openaiBase}/videos/${operationName}`,
      `${openaiBase}/videos/generations/${operationName}`
    ];
    for (const url of candidateUrls) {
      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${selectedKey}`
        }
      }).catch(() => null);
      if (response && (response.ok || response.status === 404 || response.status === 409)) {
        break;
      }
    }
  } catch {
  }
}
async function downloadVideoAsDataUrl(videoUrl, headers) {
  const downloadResponse = await fetch(videoUrl, { headers });
  if (!downloadResponse.ok) {
    throw new Error("Failed to download generated video");
  }
  const videoBuffer = await downloadResponse.arrayBuffer();
  const bytes = new Uint8Array(videoBuffer);
  const chunkSize = 32768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64Video = btoa(binary);
  return `data:video/mp4;base64,${base64Video}`;
}
function buildGoogleImageExtraBody(body) {
  const imageConfig = {};
  const aspectRatio = normalizeAspectRatio(body.aspectRatio);
  if (aspectRatio) {
    imageConfig.aspect_ratio = aspectRatio;
  }
  if (body.imageSize) {
    imageConfig.image_size = normalizeImageSize(body.imageSize);
  }
  if (!Object.keys(imageConfig).length) {
    return void 0;
  }
  return {
    google: {
      image_config: imageConfig
    }
  };
}
async function appendOpenAIVideoReference(formData, imageSource) {
  if (!imageSource) return;
  if (imageSource.startsWith("data:")) {
    const response = await fetch(imageSource);
    const blob = await response.blob();
    formData.append("input_reference", blob, "reference-image.png");
    return;
  }
  try {
    const response = await fetch(imageSource);
    if (response.ok) {
      const blob = await response.blob();
      const fileName = blob.type.includes("jpeg") ? "reference-image.jpg" : "reference-image.png";
      formData.append("input_reference", blob, fileName);
      return;
    }
  } catch {
  }
  formData.append("image", imageSource);
}
async function fetchJsonWithFallback(urls, init) {
  let lastErrorText = "";
  let lastStatus = 0;
  for (const url of urls) {
    const response = await fetch(url, init);
    if (response.ok) {
      return {
        data: await response.json(),
        url
      };
    }
    lastStatus = response.status;
    lastErrorText = await response.text().catch(() => "");
  }
  throw new Error(`Upstream error: ${lastStatus} ${lastErrorText}`);
}
async function toInlineImagePart(ref) {
  if (typeof ref === "string") {
    const match2 = ref.match(/^data:(.+?);base64,(.+)$/);
    if (match2) {
      return {
        inlineData: {
          mimeType: match2[1] || "image/png",
          data: match2[2] || ""
        }
      };
    }
    return null;
  }
  const rawData = String(ref.data || "");
  const match = rawData.match(/^data:(.+?);base64,(.+)$/);
  if (match) {
    return {
      inlineData: {
        mimeType: match[1] || ref.mimeType || "image/png",
        data: match[2] || ""
      }
    };
  }
  return {
    inlineData: {
      mimeType: ref.mimeType || "image/png",
      data: rawData
    }
  };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  let fatalRefund = null;
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const taskSecret = Deno.env.get("SYSTEM_PROXY_TASK_SECRET") || serviceRoleKey;
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !taskSecret) {
      return json({ success: false, error: "Supabase env vars are missing" }, 500);
    }
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    const body = await req.json();
    if (!body || !["chat", "image", "video", "audio", "task_status", "cancel_task", "delete_task", "download_task"].includes(body.mode)) {
      return json({ success: false, error: "Unsupported mode" }, 400);
    }
    if (body.mode === "task_status" || body.mode === "cancel_task" || body.mode === "delete_task" || body.mode === "download_task") {
      const taskPayload = await decodeTaskPayload(String(body.taskId || ""), taskSecret);
      if (!taskPayload) {
        return json({ success: false, error: "Invalid task id" }, 400);
      }
      const { data: transactionRow, error: transactionError } = await serviceClient.from("credit_transactions").select("id, user_id, model_id, status").eq("id", taskPayload.transactionId).maybeSingle();
      if (transactionError || !transactionRow) {
        return json({ success: false, error: "Task transaction not found" }, 404);
      }
      if (String(transactionRow.user_id || "") !== user.id || taskPayload.userId !== user.id) {
        return json({ success: false, error: "Forbidden task access" }, 403);
      }
      if (String(transactionRow.model_id || "") !== taskPayload.modelId) {
        return json({ success: false, error: "Task metadata mismatch" }, 400);
      }
      let creditModelQuery = serviceClient.from("admin_credit_models").select("base_url, api_keys, endpoint_type, model_id").eq("model_id", taskPayload.modelId).eq("is_active", true);
      if (taskPayload.providerId) {
        creditModelQuery = creditModelQuery.eq("provider_id", taskPayload.providerId);
      }
      const { data: creditModel2, error: modelError2 } = await creditModelQuery.order("priority", { ascending: false }).limit(1).maybeSingle();
      if (modelError2 || !creditModel2) {
        return json({ success: false, error: "Model route not found" }, 404);
      }
      const selectedKey2 = pickRandomKey(creditModel2.api_keys || []);
      if (!selectedKey2) {
        return json({ success: false, error: "Provider key is not configured" }, 500);
      }
      const refundTaskCredits = async (reason) => {
        const { data: refundRows, error: refundError } = await serviceClient.rpc("refund_credits", {
          p_transaction_id: taskPayload.transactionId,
          p_reason: reason
        });
        const refundResult = Array.isArray(refundRows) ? refundRows[0] : refundRows;
        return {
          success: !refundError && Boolean(refundResult?.success),
          message: refundError?.message || refundResult?.message
        };
      };
      const baseUrl2 = String(creditModel2.base_url || "").replace(/\/$/, "");
      if (body.mode === "delete_task") {
        await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl2, selectedKey2, taskPayload.operationName);
        return json({ success: true, status: "deleted", deducted: true });
      }
      if (body.mode === "cancel_task" && taskPayload.endpointType === "gemini") {
        const apiBase = baseUrl2.includes("/v1") ? baseUrl2 : `${baseUrl2}/v1beta`;
        const cancelResponse = await fetch(`${apiBase}/${taskPayload.operationName}:cancel?key=${encodeURIComponent(selectedKey2)}`, {
          method: "POST",
          headers: {
            "x-goog-api-key": selectedKey2
          }
        });
        if (!cancelResponse.ok) {
          const errorText = await cancelResponse.text();
          return json({ success: false, error: `Cancel failed: ${cancelResponse.status} ${errorText}` }, 502);
        }
        const refundResult = await refundTaskCredits("video_generation_cancelled");
        if (!refundResult.success) {
          return json({ success: false, error: `Cancel succeeded but credit rollback failed: ${refundResult.message || "unknown error"}` }, 500);
        }
        return json({ success: true, status: "failed", deducted: true });
      }
      if (body.mode === "cancel_task") {
        const openaiBase2 = baseUrl2.endsWith("/v1") ? baseUrl2 : `${baseUrl2}/v1`;
        const candidateUrls = [
          `${openaiBase2}/videos/${taskPayload.operationName}`,
          `${openaiBase2}/videos/generations/${taskPayload.operationName}`
        ];
        let cancelled = false;
        for (const url of candidateUrls) {
          const response = await fetch(url, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${selectedKey2}`
            }
          });
          if (response.ok || response.status === 404 || response.status === 409) {
            cancelled = true;
            break;
          }
        }
        if (!cancelled) {
          return json({ success: false, error: "Cancel failed for upstream video task" }, 502);
        }
        const refundResult = await refundTaskCredits("video_generation_cancelled");
        if (!refundResult.success) {
          return json({ success: false, error: `Cancel succeeded but credit rollback failed: ${refundResult.message || "unknown error"}` }, 500);
        }
        return json({ success: true, status: "failed", deducted: true });
      }
      if (taskPayload.endpointType === "gemini") {
        const apiBase = baseUrl2.includes("/v1") ? baseUrl2 : `${baseUrl2}/v1beta`;
        const statusResponse = await fetch(`${apiBase}/${taskPayload.operationName}?key=${encodeURIComponent(selectedKey2)}`, {
          headers: {
            "x-goog-api-key": selectedKey2
          }
        });
        if (!statusResponse.ok) {
          const errorText = await statusResponse.text();
          return json({ success: false, error: `Status polling failed: ${statusResponse.status} ${errorText}` }, 502);
        }
        const statusData2 = await statusResponse.json();
        if (!statusData2.done) {
          return json({ success: true, status: "pending", deducted: true });
        }
        const videoUri = statusData2.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!videoUri) {
          const refundResult = await refundTaskCredits("video_generation_failed");
          if (!refundResult.success) {
            return json({ success: false, error: `Task failed and credit rollback failed: ${refundResult.message || "unknown error"}` }, 500);
          }
          return json({ success: true, status: "failed", deducted: true });
        }
        const dataUrl = await downloadVideoAsDataUrl(videoUri, {
          "x-goog-api-key": selectedKey2
        });
        await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl2, selectedKey2, taskPayload.operationName);
        return json({
          success: true,
          status: "success",
          url: dataUrl,
          deducted: true
        });
      }
      const openaiBase = baseUrl2.endsWith("/v1") ? baseUrl2 : `${baseUrl2}/v1`;
      const { data: statusData } = await fetchJsonWithFallback(
        [
          `${openaiBase}/videos/${taskPayload.operationName}`,
          `${openaiBase}/videos/generations/${taskPayload.operationName}`
        ],
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${selectedKey2}`
          }
        }
      );
      const status = String(statusData?.status || statusData?.data?.status || "pending").toLowerCase();
      const directUrl = statusData?.video_url || statusData?.url || statusData?.video?.url || statusData?.data?.video_url || statusData?.data?.output || (Array.isArray(statusData?.data?.outputs) ? statusData.data.outputs[0] : "");
      if (body.mode === "download_task" && directUrl) {
        return json({ success: true, status: "success", url: directUrl, deducted: true });
      }
      if (["success", "completed", "succeed"].includes(status)) {
        if (directUrl) {
          await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl2, selectedKey2, taskPayload.operationName);
          return json({ success: true, status: "success", url: directUrl, deducted: true });
        }
        const contentCandidates = [
          `${openaiBase}/videos/${taskPayload.operationName}/content`,
          `${openaiBase}/videos/generations/${taskPayload.operationName}/content`
        ];
        for (const contentUrl of contentCandidates) {
          const contentResponse = await fetch(contentUrl, {
            headers: {
              Authorization: `Bearer ${selectedKey2}`
            }
          });
          if (!contentResponse.ok) continue;
          const base64Video = await downloadVideoAsDataUrl(contentUrl, {
            Authorization: `Bearer ${selectedKey2}`
          });
          await tryDeleteUpstreamVideoTask(taskPayload.endpointType, baseUrl2, selectedKey2, taskPayload.operationName);
          return json({
            success: true,
            status: "success",
            url: base64Video,
            deducted: true
          });
        }
      }
      if (["failure", "failed", "error"].includes(status)) {
        const refundResult = await refundTaskCredits("video_generation_failed");
        if (!refundResult.success) {
          return json({ success: false, error: `Task failed and credit rollback failed: ${refundResult.message || "unknown error"}` }, 500);
        }
        return json({ success: true, status: "failed", deducted: true });
      }
      if (body.mode === "download_task") {
        return json({ success: false, error: "Task content is not ready yet" }, 409);
      }
      return json({ success: true, status: "pending", deducted: true });
    }
    const modelRoute = parseSystemModelRoute(body.modelId);
    const modelId = modelRoute.baseModelId;
    if (!modelId) {
      return json({ success: false, error: "modelId is required" }, 400);
    }
    const requestedImageSize = normalizeImageSize(body.imageSize);
    const { data: creditModels, error: modelError } = await serviceClient.from("admin_credit_models").select("base_url, api_keys, endpoint_type, model_id, credit_cost, display_name, provider_id, priority, weight, advanced_enabled, mix_with_same_model, quality_pricing").eq("model_id", modelId).eq("is_active", true).order("priority", { ascending: false }).order("weight", { ascending: false });
    if (modelError || !creditModels || creditModels.length === 0) {
      return json({ success: false, error: "Model route not found" }, 404);
    }
    const selectedRoute = pickCreditModelRoute(
      creditModels || [],
      requestedImageSize,
      modelRoute.routeIndex,
      modelRoute.routeKey
    );
    if (!selectedRoute) {
      return json({ success: false, error: `\u5F53\u524D\u6A21\u578B\u672A\u542F\u7528 ${requestedImageSize} \u753B\u8D28` }, 409);
    }
    const creditModel = selectedRoute.route;
    const selectedKey = pickRandomKey(creditModel.api_keys || []);
    if (!selectedKey) {
      return json({ success: false, error: "Provider key is not configured" }, 500);
    }
    const requiredCredits = Math.max(1, Number(selectedRoute.requiredCredits || creditModel.credit_cost || 1));
    const { data: balanceRow, error: balanceError } = await serviceClient.from("user_credits").select("balance").eq("user_id", user.id).maybeSingle();
    const currentBalance = Number(balanceRow?.balance || 0);
    if (balanceError || currentBalance < requiredCredits) {
      return json({ success: false, error: "Insufficient credits" }, 402);
    }
    const { data: consumeRows, error: consumeError } = await serviceClient.rpc("consume_credits", {
      p_user_id: user.id,
      p_amount: requiredCredits,
      p_model_id: modelId,
      p_model_name: String(creditModel.display_name || modelId),
      p_provider_id: String(creditModel.provider_id || "system"),
      p_description: `\u7CFB\u7EDF\u79EF\u5206\u6A21\u578B\u8C03\u7528\uFF1A${modelId} / ${requestedImageSize}`
    });
    const consumeResult = Array.isArray(consumeRows) ? consumeRows[0] : consumeRows;
    const transactionId = String(consumeResult?.transaction_id || "");
    if (consumeError || !consumeResult?.success || !transactionId) {
      return json({ success: false, error: consumeResult?.message || consumeError?.message || "Credit deduction failed" }, 402);
    }
    const refundCredits = async (reason) => {
      const { data: refundRows, error: refundError } = await serviceClient.rpc("refund_credits", {
        p_transaction_id: transactionId,
        p_reason: reason
      });
      const refundResult = Array.isArray(refundRows) ? refundRows[0] : refundRows;
      return !refundError && Boolean(refundResult?.success);
    };
    const failWithRefund = async (errorMessage, status = 502, refundReason = "upstream_request_failed") => {
      const refunded = await refundCredits(refundReason);
      if (!refunded) {
        return json({ success: false, error: `${errorMessage} (credit rollback failed)` }, status);
      }
      return json({ success: false, error: errorMessage }, status);
    };
    fatalRefund = failWithRefund;
    const endpointType = creditModel.endpoint_type === "gemini" ? "gemini" : "openai";
    const baseUrl = String(creditModel.base_url || "").replace(/\/$/, "");
    let content = "";
    let imageUrls = [];
    let audioUrl = "";
    let usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0
    };
    if (body.mode === "chat" && endpointType === "gemini") {
      const geminiMessages = (body.messages || []).map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content || "" }]
      }));
      const geminiResponse = await fetch(
        `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(selectedKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: geminiMessages,
            generationConfig: {
              temperature: body.temperature ?? 0.7,
              maxOutputTokens: body.maxTokens ?? 2048
            }
          })
        }
      );
      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        return await failWithRefund(`Upstream error: ${geminiResponse.status} ${errorText}`);
      }
      const result = await geminiResponse.json();
      content = result?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      usage = {
        promptTokens: Number(result?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(result?.usageMetadata?.candidatesTokenCount || 0),
        totalTokens: Number(result?.usageMetadata?.totalTokenCount || 0)
      };
    } else if (body.mode === "chat") {
      const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${selectedKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages: body.messages,
          max_tokens: body.maxTokens ?? 2048,
          temperature: body.temperature ?? 0.7,
          stream: false
        })
      });
      if (!chatResponse.ok) {
        const errorText = await chatResponse.text();
        return await failWithRefund(`Upstream error: ${chatResponse.status} ${errorText}`);
      }
      const result = await chatResponse.json();
      content = result?.choices?.[0]?.message?.content || "";
      usage = {
        promptTokens: Number(result?.usage?.prompt_tokens || 0),
        completionTokens: Number(result?.usage?.completion_tokens || 0),
        totalTokens: Number(result?.usage?.total_tokens || 0)
      };
    } else if (body.mode === "image" && endpointType === "gemini") {
      const parts = [];
      for (const ref of body.referenceImages || []) {
        const inlinePart = await toInlineImagePart(ref);
        if (inlinePart) parts.push(inlinePart);
      }
      parts.push({ text: body.prompt || "" });
      const generationConfig = {
        responseModalities: ["IMAGE"]
      };
      const imageConfig = {};
      const aspectRatio = normalizeAspectRatio(body.aspectRatio);
      if (aspectRatio) {
        imageConfig.aspectRatio = aspectRatio;
      }
      if (body.imageSize) {
        imageConfig.imageSize = normalizeImageSize(body.imageSize);
      }
      if (Object.keys(imageConfig).length) {
        generationConfig.imageConfig = imageConfig;
      }
      const imageResponse = await fetch(
        `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(selectedKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig
          })
        }
      );
      if (!imageResponse.ok) {
        const errorText = await imageResponse.text();
        return await failWithRefund(`Upstream error: ${imageResponse.status} ${errorText}`);
      }
      const result = await imageResponse.json();
      const partsList = result?.candidates?.[0]?.content?.parts || [];
      const imagePart = partsList.find((part) => part?.inlineData || part?.inline_data);
      const inline = imagePart?.inlineData || imagePart?.inline_data;
      const mimeType = inline?.mimeType || inline?.mime_type || "image/png";
      const imageData = String(inline?.data || "").replace(/\s+/g, "");
      if (!imageData) {
        return await failWithRefund("No image data returned from upstream");
      }
      usage = {
        promptTokens: Number(result?.usageMetadata?.promptTokenCount || 0),
        completionTokens: Number(result?.usageMetadata?.candidatesTokenCount || 0),
        totalTokens: Number(result?.usageMetadata?.totalTokenCount || 0)
      };
      imageUrls = [`data:${mimeType};base64,${imageData}`];
    } else if (body.mode === "image") {
      if (isGeminiImageCompatModel(modelId)) {
        const contentParts = [{ type: "text", text: body.prompt || "" }];
        for (const ref of body.referenceImages || []) {
          const dataUrl = toOpenAIImageUrl(ref);
          if (!dataUrl) continue;
          contentParts.push({
            type: "image_url",
            image_url: { url: dataUrl }
          });
        }
        const requestBody = {
          model: modelId,
          messages: [
            {
              role: "user",
              content: contentParts
            }
          ],
          stream: false
        };
        const extraBody = buildGoogleImageExtraBody(body);
        if (extraBody) {
          requestBody.extra_body = extraBody;
        }
        const imageResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${selectedKey}`
          },
          body: JSON.stringify(requestBody)
        });
        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          return await failWithRefund(`Upstream error: ${imageResponse.status} ${errorText}`);
        }
        const result = await imageResponse.json();
        imageUrls = extractImageUrlsFromOpenAICompatPayload(result);
        if (!imageUrls.length) {
          return await failWithRefund("No image data returned from upstream");
        }
        usage = {
          promptTokens: Number(result?.usage?.prompt_tokens || 0),
          completionTokens: Number(result?.usage?.completion_tokens || 0),
          totalTokens: Number(result?.usage?.total_tokens || 0)
        };
      } else {
        const imageResponse = await fetch(`${baseUrl}/v1/images/generations`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${selectedKey}`
          },
          body: JSON.stringify({
            model: modelId,
            prompt: body.prompt || "",
            n: Math.max(1, Number(body.imageCount || 1)),
            size: mapAspectRatioToOpenAI(normalizeAspectRatio(body.aspectRatio)),
            quality: normalizeImageSize(body.imageSize) === "1K" ? "standard" : "hd",
            response_format: "b64_json"
          })
        });
        if (!imageResponse.ok) {
          const errorText = await imageResponse.text();
          return await failWithRefund(`Upstream error: ${imageResponse.status} ${errorText}`);
        }
        const result = await imageResponse.json();
        imageUrls = Array.isArray(result?.data) ? result.data.map((item) => item?.b64_json ? `data:image/png;base64,${String(item.b64_json).replace(/\s+/g, "")}` : null).filter(Boolean) : [];
        if (!imageUrls.length) {
          return await failWithRefund("No image data returned from upstream");
        }
        usage = {
          promptTokens: Number(result?.usage?.prompt_tokens || 0),
          completionTokens: Number(result?.usage?.completion_tokens || 0),
          totalTokens: Number(result?.usage?.total_tokens || 0)
        };
      }
    } else if (body.mode === "video" && endpointType === "gemini") {
      const instance = {
        prompt: body.prompt || ""
      };
      if (body.imageUrl) {
        const match = String(body.imageUrl).match(/^data:image\/.+;base64,(.+)$/);
        if (match) {
          instance.image = { bytesBase64Encoded: match[1] };
        }
      }
      if (body.imageTailUrl) {
        const match = String(body.imageTailUrl).match(/^data:image\/.+;base64,(.+)$/);
        if (match) {
          instance.lastFrame = { bytesBase64Encoded: match[1] };
        }
      }
      const requestBody = { instances: [instance] };
      const parameters = {};
      const aspectRatio = normalizeAspectRatio(body.aspectRatio);
      if (aspectRatio) parameters.aspectRatio = aspectRatio;
      if (body.resolution) parameters.resolution = body.resolution;
      const durationSeconds = getVideoDurationSeconds(body);
      if (durationSeconds) parameters.seconds = durationSeconds;
      if (Object.keys(parameters).length) requestBody.parameters = parameters;
      const apiBase = baseUrl.includes("/v1") ? baseUrl : `${baseUrl}/v1beta`;
      const initResponse = await fetch(
        `${apiBase}/models/${modelId}:predictLongRunning?key=${encodeURIComponent(selectedKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": selectedKey
          },
          body: JSON.stringify(requestBody)
        }
      );
      if (!initResponse.ok) {
        const errorText = await initResponse.text();
        return await failWithRefund(`Upstream error: ${initResponse.status} ${errorText}`);
      }
      const initData = await initResponse.json();
      const operationName = String(initData?.name || "");
      if (!operationName) {
        return await failWithRefund("Missing operation name from upstream");
      }
      return json({
        success: true,
        status: "pending",
        taskId: await encodeTaskPayload({
          kind: "video",
          modelId,
          providerId: String(creditModel.provider_id || ""),
          endpointType,
          operationName,
          transactionId,
          userId: user.id
        }, taskSecret),
        deducted: true,
        endpointType
      });
    } else if (body.mode === "video") {
      const openaiBase = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
      const durationSeconds = getVideoDurationSeconds(body);
      let submitData = null;
      let lastVideoError = "";
      try {
        const formData = new FormData();
        formData.append("model", modelId);
        formData.append("prompt", body.prompt || "");
        if (durationSeconds) {
          formData.append("seconds", String(durationSeconds));
        }
        if (body.imageUrl) {
          await appendOpenAIVideoReference(formData, body.imageUrl);
        }
        const strictResponse = await fetch(`${openaiBase}/videos`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${selectedKey}`
          },
          body: formData
        });
        if (strictResponse.ok) {
          submitData = await strictResponse.json();
        } else {
          lastVideoError = `Upstream error: ${strictResponse.status} ${await strictResponse.text().catch(() => "")}`;
        }
      } catch (error) {
        lastVideoError = error instanceof Error ? error.message : "Unknown upstream error";
      }
      if (!submitData) {
        const legacyRequestBody = {
          model: modelId,
          prompt: body.prompt || ""
        };
        if (durationSeconds) legacyRequestBody.seconds = durationSeconds;
        const aspectRatio = normalizeAspectRatio(body.aspectRatio);
        if (aspectRatio) legacyRequestBody.aspect_ratio = aspectRatio;
        if (body.resolution) legacyRequestBody.resolution = body.resolution;
        if (body.imageUrl) legacyRequestBody.images = [body.imageUrl];
        if (body.imageTailUrl) legacyRequestBody.last_image = body.imageTailUrl;
        try {
          const legacyResponse = await fetch(`${openaiBase}/videos/generations`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${selectedKey}`
            },
            body: JSON.stringify(legacyRequestBody)
          });
          if (!legacyResponse.ok) {
            const errorText = await legacyResponse.text().catch(() => "");
            return await failWithRefund(lastVideoError || `Upstream error: ${legacyResponse.status} ${errorText}`);
          }
          submitData = await legacyResponse.json();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown upstream error";
          return await failWithRefund(lastVideoError || message);
        }
      }
      const taskId = String(submitData?.id || submitData?.task_id || submitData?.data?.task_id || "");
      const taskStatus = String(submitData?.status || submitData?.data?.status || "pending").toLowerCase();
      const directUrl = submitData?.video_url || submitData?.url || submitData?.video?.url || submitData?.data?.video_url || submitData?.data?.output || (Array.isArray(submitData?.data?.outputs) ? submitData.data.outputs[0] : "");
      if (taskId) {
        return json({
          success: true,
          status: ["success", "completed", "succeed"].includes(taskStatus) ? "success" : "pending",
          taskId: await encodeTaskPayload({
            kind: "video",
            modelId,
            providerId: String(creditModel.provider_id || ""),
            endpointType: "openai",
            operationName: taskId,
            transactionId,
            userId: user.id
          }, taskSecret),
          url: directUrl || void 0,
          deducted: true,
          endpointType: "openai"
        });
      }
      if (directUrl) {
        return json({
          success: true,
          status: "success",
          url: directUrl,
          deducted: true,
          endpointType: "openai"
        });
      }
      return await failWithRefund("Missing task id from upstream video API");
    } else if (body.mode === "audio" && endpointType === "gemini") {
      const isLyria = modelId.toLowerCase().includes("lyria");
      if (isLyria) {
        const audioResponse = await fetch(
          `${baseUrl}/v1beta/models/${modelId}:predict?key=${encodeURIComponent(selectedKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              instances: [{ prompt: body.prompt || "" }],
              parameters: { audioConfig: { audioFormat: "audio/wav" } }
            })
          }
        );
        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          return await failWithRefund(`Upstream error: ${audioResponse.status} ${errorText}`);
        }
        const result = await audioResponse.json();
        const b64 = result?.predictions?.[0]?.bytesBase64Encoded;
        if (!b64) {
          return await failWithRefund("No audio data returned from upstream");
        }
        audioUrl = `data:audio/wav;base64,${String(b64).replace(/\s+/g, "")}`;
      } else {
        const audioResponse = await fetch(
          `${baseUrl}/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(selectedKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: body.prompt || "" }] }],
              generationConfig: {
                responseModalities: ["AUDIO"],
                audioConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } }
              }
            })
          }
        );
        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          return await failWithRefund(`Upstream error: ${audioResponse.status} ${errorText}`);
        }
        const result = await audioResponse.json();
        const audioPart = result?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData || part?.inline_data);
        const inline = audioPart?.inlineData || audioPart?.inline_data;
        const mimeType = inline?.mimeType || inline?.mime_type || "audio/wav";
        const audioData = String(inline?.data || "").replace(/\s+/g, "");
        if (!audioData) {
          return await failWithRefund("No audio data returned from upstream");
        }
        audioUrl = `data:${mimeType};base64,${audioData}`;
      }
    } else {
      return await failWithRefund("Unsupported mode", 400, "unsupported_mode");
    }
    if (body.mode === "chat") {
      return json({
        success: true,
        content,
        usage,
        endpointType,
        deducted: true
      });
    }
    if (body.mode === "image") {
      return json({
        success: true,
        urls: imageUrls,
        usage,
        endpointType,
        deducted: true
      });
    }
    if (body.mode === "audio") {
      return json({
        success: true,
        url: audioUrl,
        usage,
        endpointType,
        deducted: true
      });
    }
    return json({ success: false, error: "Unsupported mode" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (fatalRefund) {
      return await fatalRefund(message, 500, "proxy_internal_error");
    }
    return json({ success: false, error: message }, 500);
  }
});
