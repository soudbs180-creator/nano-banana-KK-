var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/tslib/tslib.es6.mjs
function __rest(s, e) {
  var t = {};
  for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
    t[p] = s[p];
  if (s != null && typeof Object.getOwnPropertySymbols === "function")
    for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
      if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
        t[p[i]] = s[p[i]];
    }
  return t;
}
function __awaiter(thisArg, _arguments, P, generator) {
  function adopt(value) {
    return value instanceof P ? value : new P(function(resolve) {
      resolve(value);
    });
  }
  return new (P || (P = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}
var init_tslib_es6 = __esm({
  "node_modules/tslib/tslib.es6.mjs"() {
  }
});

// node_modules/@supabase/functions-js/dist/module/helper.js
var resolveFetch;
var init_helper = __esm({
  "node_modules/@supabase/functions-js/dist/module/helper.js"() {
    resolveFetch = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
  }
});

// node_modules/@supabase/functions-js/dist/module/types.js
var FunctionsError, FunctionsFetchError, FunctionsRelayError, FunctionsHttpError, FunctionRegion;
var init_types = __esm({
  "node_modules/@supabase/functions-js/dist/module/types.js"() {
    FunctionsError = class extends Error {
      constructor(message, name = "FunctionsError", context) {
        super(message);
        this.name = name;
        this.context = context;
      }
    };
    FunctionsFetchError = class extends FunctionsError {
      constructor(context) {
        super("Failed to send a request to the Edge Function", "FunctionsFetchError", context);
      }
    };
    FunctionsRelayError = class extends FunctionsError {
      constructor(context) {
        super("Relay Error invoking the Edge Function", "FunctionsRelayError", context);
      }
    };
    FunctionsHttpError = class extends FunctionsError {
      constructor(context) {
        super("Edge Function returned a non-2xx status code", "FunctionsHttpError", context);
      }
    };
    (function(FunctionRegion2) {
      FunctionRegion2["Any"] = "any";
      FunctionRegion2["ApNortheast1"] = "ap-northeast-1";
      FunctionRegion2["ApNortheast2"] = "ap-northeast-2";
      FunctionRegion2["ApSouth1"] = "ap-south-1";
      FunctionRegion2["ApSoutheast1"] = "ap-southeast-1";
      FunctionRegion2["ApSoutheast2"] = "ap-southeast-2";
      FunctionRegion2["CaCentral1"] = "ca-central-1";
      FunctionRegion2["EuCentral1"] = "eu-central-1";
      FunctionRegion2["EuWest1"] = "eu-west-1";
      FunctionRegion2["EuWest2"] = "eu-west-2";
      FunctionRegion2["EuWest3"] = "eu-west-3";
      FunctionRegion2["SaEast1"] = "sa-east-1";
      FunctionRegion2["UsEast1"] = "us-east-1";
      FunctionRegion2["UsWest1"] = "us-west-1";
      FunctionRegion2["UsWest2"] = "us-west-2";
    })(FunctionRegion || (FunctionRegion = {}));
  }
});

// node_modules/@supabase/functions-js/dist/module/FunctionsClient.js
var FunctionsClient;
var init_FunctionsClient = __esm({
  "node_modules/@supabase/functions-js/dist/module/FunctionsClient.js"() {
    init_tslib_es6();
    init_helper();
    init_types();
    FunctionsClient = class {
      /**
       * Creates a new Functions client bound to an Edge Functions URL.
       *
       * @example
       * ```ts
       * import { FunctionsClient, FunctionRegion } from '@supabase/functions-js'
       *
       * const functions = new FunctionsClient('https://xyzcompany.supabase.co/functions/v1', {
       *   headers: { apikey: 'public-anon-key' },
       *   region: FunctionRegion.UsEast1,
       * })
       * ```
       */
      constructor(url, { headers = {}, customFetch, region = FunctionRegion.Any } = {}) {
        this.url = url;
        this.headers = headers;
        this.region = region;
        this.fetch = resolveFetch(customFetch);
      }
      /**
       * Updates the authorization header
       * @param token - the new jwt token sent in the authorisation header
       * @example
       * ```ts
       * functions.setAuth(session.access_token)
       * ```
       */
      setAuth(token) {
        this.headers.Authorization = `Bearer ${token}`;
      }
      /**
       * Invokes a function
       * @param functionName - The name of the Function to invoke.
       * @param options - Options for invoking the Function.
       * @example
       * ```ts
       * const { data, error } = await functions.invoke('hello-world', {
       *   body: { name: 'Ada' },
       * })
       * ```
       */
      invoke(functionName_1) {
        return __awaiter(this, arguments, void 0, function* (functionName, options = {}) {
          var _a;
          let timeoutId;
          let timeoutController;
          try {
            const { headers, method, body: functionArgs, signal, timeout } = options;
            let _headers = {};
            let { region } = options;
            if (!region) {
              region = this.region;
            }
            const url = new URL(`${this.url}/${functionName}`);
            if (region && region !== "any") {
              _headers["x-region"] = region;
              url.searchParams.set("forceFunctionRegion", region);
            }
            let body;
            if (functionArgs && (headers && !Object.prototype.hasOwnProperty.call(headers, "Content-Type") || !headers)) {
              if (typeof Blob !== "undefined" && functionArgs instanceof Blob || functionArgs instanceof ArrayBuffer) {
                _headers["Content-Type"] = "application/octet-stream";
                body = functionArgs;
              } else if (typeof functionArgs === "string") {
                _headers["Content-Type"] = "text/plain";
                body = functionArgs;
              } else if (typeof FormData !== "undefined" && functionArgs instanceof FormData) {
                body = functionArgs;
              } else {
                _headers["Content-Type"] = "application/json";
                body = JSON.stringify(functionArgs);
              }
            } else {
              if (functionArgs && typeof functionArgs !== "string" && !(typeof Blob !== "undefined" && functionArgs instanceof Blob) && !(functionArgs instanceof ArrayBuffer) && !(typeof FormData !== "undefined" && functionArgs instanceof FormData)) {
                body = JSON.stringify(functionArgs);
              } else {
                body = functionArgs;
              }
            }
            let effectiveSignal = signal;
            if (timeout) {
              timeoutController = new AbortController();
              timeoutId = setTimeout(() => timeoutController.abort(), timeout);
              if (signal) {
                effectiveSignal = timeoutController.signal;
                signal.addEventListener("abort", () => timeoutController.abort());
              } else {
                effectiveSignal = timeoutController.signal;
              }
            }
            const response = yield this.fetch(url.toString(), {
              method: method || "POST",
              // headers priority is (high to low):
              // 1. invoke-level headers
              // 2. client-level headers
              // 3. default Content-Type header
              headers: Object.assign(Object.assign(Object.assign({}, _headers), this.headers), headers),
              body,
              signal: effectiveSignal
            }).catch((fetchError) => {
              throw new FunctionsFetchError(fetchError);
            });
            const isRelayError = response.headers.get("x-relay-error");
            if (isRelayError && isRelayError === "true") {
              throw new FunctionsRelayError(response);
            }
            if (!response.ok) {
              throw new FunctionsHttpError(response);
            }
            let responseType = ((_a = response.headers.get("Content-Type")) !== null && _a !== void 0 ? _a : "text/plain").split(";")[0].trim();
            let data;
            if (responseType === "application/json") {
              data = yield response.json();
            } else if (responseType === "application/octet-stream" || responseType === "application/pdf") {
              data = yield response.blob();
            } else if (responseType === "text/event-stream") {
              data = response;
            } else if (responseType === "multipart/form-data") {
              data = yield response.formData();
            } else {
              data = yield response.text();
            }
            return { data, error: null, response };
          } catch (error) {
            return {
              data: null,
              error,
              response: error instanceof FunctionsHttpError || error instanceof FunctionsRelayError ? error.context : void 0
            };
          } finally {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
          }
        });
      }
    };
  }
});

// node_modules/@supabase/functions-js/dist/module/index.js
var init_module = __esm({
  "node_modules/@supabase/functions-js/dist/module/index.js"() {
    init_FunctionsClient();
  }
});

// node_modules/@supabase/postgrest-js/dist/index.mjs
function _typeof(o) {
  "@babel/helpers - typeof";
  return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
    return typeof o$1;
  } : function(o$1) {
    return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
  }, _typeof(o);
}
function toPrimitive(t, r) {
  if ("object" != _typeof(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey(t) {
  var i = toPrimitive(t, "string");
  return "symbol" == _typeof(i) ? i : i + "";
}
function _defineProperty(e, r, t) {
  return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r$1) {
      return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r$1) {
      _defineProperty(e, r$1, t[r$1]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r$1) {
      Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
    });
  }
  return e;
}
var PostgrestError, PostgrestBuilder, PostgrestTransformBuilder, PostgrestReservedCharsRegexp, PostgrestFilterBuilder, PostgrestQueryBuilder, PostgrestClient;
var init_dist = __esm({
  "node_modules/@supabase/postgrest-js/dist/index.mjs"() {
    PostgrestError = class extends Error {
      /**
      * @example
      * ```ts
      * import PostgrestError from '@supabase/postgrest-js'
      *
      * throw new PostgrestError({
      *   message: 'Row level security prevented the request',
      *   details: 'RLS denied the insert',
      *   hint: 'Check your policies',
      *   code: 'PGRST301',
      * })
      * ```
      */
      constructor(context) {
        super(context.message);
        this.name = "PostgrestError";
        this.details = context.details;
        this.hint = context.hint;
        this.code = context.code;
      }
    };
    PostgrestBuilder = class {
      /**
      * Creates a builder configured for a specific PostgREST request.
      *
      * @example
      * ```ts
      * import PostgrestQueryBuilder from '@supabase/postgrest-js'
      *
      * const builder = new PostgrestQueryBuilder(
      *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
      *   { headers: new Headers({ apikey: 'public-anon-key' }) }
      * )
      * ```
      */
      constructor(builder) {
        var _builder$shouldThrowO, _builder$isMaybeSingl, _builder$urlLengthLim;
        this.shouldThrowOnError = false;
        this.method = builder.method;
        this.url = builder.url;
        this.headers = new Headers(builder.headers);
        this.schema = builder.schema;
        this.body = builder.body;
        this.shouldThrowOnError = (_builder$shouldThrowO = builder.shouldThrowOnError) !== null && _builder$shouldThrowO !== void 0 ? _builder$shouldThrowO : false;
        this.signal = builder.signal;
        this.isMaybeSingle = (_builder$isMaybeSingl = builder.isMaybeSingle) !== null && _builder$isMaybeSingl !== void 0 ? _builder$isMaybeSingl : false;
        this.urlLengthLimit = (_builder$urlLengthLim = builder.urlLengthLimit) !== null && _builder$urlLengthLim !== void 0 ? _builder$urlLengthLim : 8e3;
        if (builder.fetch) this.fetch = builder.fetch;
        else this.fetch = fetch;
      }
      /**
      * If there's an error with the query, throwOnError will reject the promise by
      * throwing the error instead of returning it as part of a successful response.
      *
      * {@link https://github.com/supabase/supabase-js/issues/92}
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Set an HTTP header for the request.
      */
      setHeader(name, value) {
        this.headers = new Headers(this.headers);
        this.headers.set(name, value);
        return this;
      }
      then(onfulfilled, onrejected) {
        var _this = this;
        if (this.schema === void 0) {
        } else if (["GET", "HEAD"].includes(this.method)) this.headers.set("Accept-Profile", this.schema);
        else this.headers.set("Content-Profile", this.schema);
        if (this.method !== "GET" && this.method !== "HEAD") this.headers.set("Content-Type", "application/json");
        const _fetch = this.fetch;
        let res = _fetch(this.url.toString(), {
          method: this.method,
          headers: this.headers,
          body: JSON.stringify(this.body),
          signal: this.signal
        }).then(async (res$1) => {
          let error = null;
          let data = null;
          let count = null;
          let status = res$1.status;
          let statusText = res$1.statusText;
          if (res$1.ok) {
            var _this$headers$get2, _res$headers$get;
            if (_this.method !== "HEAD") {
              var _this$headers$get;
              const body = await res$1.text();
              if (body === "") {
              } else if (_this.headers.get("Accept") === "text/csv") data = body;
              else if (_this.headers.get("Accept") && ((_this$headers$get = _this.headers.get("Accept")) === null || _this$headers$get === void 0 ? void 0 : _this$headers$get.includes("application/vnd.pgrst.plan+text"))) data = body;
              else data = JSON.parse(body);
            }
            const countHeader = (_this$headers$get2 = _this.headers.get("Prefer")) === null || _this$headers$get2 === void 0 ? void 0 : _this$headers$get2.match(/count=(exact|planned|estimated)/);
            const contentRange = (_res$headers$get = res$1.headers.get("content-range")) === null || _res$headers$get === void 0 ? void 0 : _res$headers$get.split("/");
            if (countHeader && contentRange && contentRange.length > 1) count = parseInt(contentRange[1]);
            if (_this.isMaybeSingle && _this.method === "GET" && Array.isArray(data)) if (data.length > 1) {
              error = {
                code: "PGRST116",
                details: `Results contain ${data.length} rows, application/vnd.pgrst.object+json requires 1 row`,
                hint: null,
                message: "JSON object requested, multiple (or no) rows returned"
              };
              data = null;
              count = null;
              status = 406;
              statusText = "Not Acceptable";
            } else if (data.length === 1) data = data[0];
            else data = null;
          } else {
            var _error$details;
            const body = await res$1.text();
            try {
              error = JSON.parse(body);
              if (Array.isArray(error) && res$1.status === 404) {
                data = [];
                error = null;
                status = 200;
                statusText = "OK";
              }
            } catch (_unused) {
              if (res$1.status === 404 && body === "") {
                status = 204;
                statusText = "No Content";
              } else error = { message: body };
            }
            if (error && _this.isMaybeSingle && (error === null || error === void 0 || (_error$details = error.details) === null || _error$details === void 0 ? void 0 : _error$details.includes("0 rows"))) {
              error = null;
              status = 200;
              statusText = "OK";
            }
            if (error && _this.shouldThrowOnError) throw new PostgrestError(error);
          }
          return {
            error,
            data,
            count,
            status,
            statusText
          };
        });
        if (!this.shouldThrowOnError) res = res.catch((fetchError) => {
          var _fetchError$name2;
          let errorDetails = "";
          let hint = "";
          let code = "";
          const cause = fetchError === null || fetchError === void 0 ? void 0 : fetchError.cause;
          if (cause) {
            var _cause$message, _cause$code, _fetchError$name, _cause$name;
            const causeMessage = (_cause$message = cause === null || cause === void 0 ? void 0 : cause.message) !== null && _cause$message !== void 0 ? _cause$message : "";
            const causeCode = (_cause$code = cause === null || cause === void 0 ? void 0 : cause.code) !== null && _cause$code !== void 0 ? _cause$code : "";
            errorDetails = `${(_fetchError$name = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name !== void 0 ? _fetchError$name : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`;
            errorDetails += `

Caused by: ${(_cause$name = cause === null || cause === void 0 ? void 0 : cause.name) !== null && _cause$name !== void 0 ? _cause$name : "Error"}: ${causeMessage}`;
            if (causeCode) errorDetails += ` (${causeCode})`;
            if (cause === null || cause === void 0 ? void 0 : cause.stack) errorDetails += `
${cause.stack}`;
          } else {
            var _fetchError$stack;
            errorDetails = (_fetchError$stack = fetchError === null || fetchError === void 0 ? void 0 : fetchError.stack) !== null && _fetchError$stack !== void 0 ? _fetchError$stack : "";
          }
          const urlLength = this.url.toString().length;
          if ((fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) === "AbortError" || (fetchError === null || fetchError === void 0 ? void 0 : fetchError.code) === "ABORT_ERR") {
            code = "";
            hint = "Request was aborted (timeout or manual cancellation)";
            if (urlLength > this.urlLengthLimit) hint += `. Note: Your request URL is ${urlLength} characters, which may exceed server limits. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [many IDs])), consider using an RPC function to pass values server-side.`;
          } else if ((cause === null || cause === void 0 ? void 0 : cause.name) === "HeadersOverflowError" || (cause === null || cause === void 0 ? void 0 : cause.code) === "UND_ERR_HEADERS_OVERFLOW") {
            code = "";
            hint = "HTTP headers exceeded server limits (typically 16KB)";
            if (urlLength > this.urlLengthLimit) hint += `. Your request URL is ${urlLength} characters. If selecting many fields, consider using views. If filtering with large arrays (e.g., .in('id', [200+ IDs])), consider using an RPC function instead.`;
          }
          return {
            error: {
              message: `${(_fetchError$name2 = fetchError === null || fetchError === void 0 ? void 0 : fetchError.name) !== null && _fetchError$name2 !== void 0 ? _fetchError$name2 : "FetchError"}: ${fetchError === null || fetchError === void 0 ? void 0 : fetchError.message}`,
              details: errorDetails,
              hint,
              code
            },
            data: null,
            count: null,
            status: 0,
            statusText: ""
          };
        });
        return res.then(onfulfilled, onrejected);
      }
      /**
      * Override the type of the returned `data`.
      *
      * @typeParam NewResult - The new result type to override with
      * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
      */
      returns() {
        return this;
      }
      /**
      * Override the type of the returned `data` field in the response.
      *
      * @typeParam NewResult - The new type to cast the response data to
      * @typeParam Options - Optional type configuration (defaults to { merge: true })
      * @typeParam Options.merge - When true, merges the new type with existing return type. When false, replaces the existing types entirely (defaults to true)
      * @example
      * ```typescript
      * // Merge with existing types (default behavior)
      * const query = supabase
      *   .from('users')
      *   .select()
      *   .overrideTypes<{ custom_field: string }>()
      *
      * // Replace existing types completely
      * const replaceQuery = supabase
      *   .from('users')
      *   .select()
      *   .overrideTypes<{ id: number; name: string }, { merge: false }>()
      * ```
      * @returns A PostgrestBuilder instance with the new type
      */
      overrideTypes() {
        return this;
      }
    };
    PostgrestTransformBuilder = class extends PostgrestBuilder {
      /**
      * Perform a SELECT on the query result.
      *
      * By default, `.insert()`, `.update()`, `.upsert()`, and `.delete()` do not
      * return modified rows. By calling this method, modified rows are returned in
      * `data`.
      *
      * @param columns - The columns to retrieve, separated by commas
      */
      select(columns) {
        let quoted = false;
        const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
          if (/\s/.test(c) && !quoted) return "";
          if (c === '"') quoted = !quoted;
          return c;
        }).join("");
        this.url.searchParams.set("select", cleanedColumns);
        this.headers.append("Prefer", "return=representation");
        return this;
      }
      /**
      * Order the query result by `column`.
      *
      * You can call this method multiple times to order by multiple columns.
      *
      * You can order referenced tables, but it only affects the ordering of the
      * parent table if you use `!inner` in the query.
      *
      * @param column - The column to order by
      * @param options - Named parameters
      * @param options.ascending - If `true`, the result will be in ascending order
      * @param options.nullsFirst - If `true`, `null`s appear first. If `false`,
      * `null`s appear last.
      * @param options.referencedTable - Set this to order a referenced table by
      * its columns
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      order(column, { ascending = true, nullsFirst, foreignTable, referencedTable = foreignTable } = {}) {
        const key = referencedTable ? `${referencedTable}.order` : "order";
        const existingOrder = this.url.searchParams.get(key);
        this.url.searchParams.set(key, `${existingOrder ? `${existingOrder},` : ""}${column}.${ascending ? "asc" : "desc"}${nullsFirst === void 0 ? "" : nullsFirst ? ".nullsfirst" : ".nullslast"}`);
        return this;
      }
      /**
      * Limit the query result by `count`.
      *
      * @param count - The maximum number of rows to return
      * @param options - Named parameters
      * @param options.referencedTable - Set this to limit rows of referenced
      * tables instead of the parent table
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      limit(count, { foreignTable, referencedTable = foreignTable } = {}) {
        const key = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
        this.url.searchParams.set(key, `${count}`);
        return this;
      }
      /**
      * Limit the query result by starting at an offset `from` and ending at the offset `to`.
      * Only records within this range are returned.
      * This respects the query order and if there is no order clause the range could behave unexpectedly.
      * The `from` and `to` values are 0-based and inclusive: `range(1, 3)` will include the second, third
      * and fourth rows of the query.
      *
      * @param from - The starting index from which to limit the result
      * @param to - The last index to which to limit the result
      * @param options - Named parameters
      * @param options.referencedTable - Set this to limit rows of referenced
      * tables instead of the parent table
      * @param options.foreignTable - Deprecated, use `options.referencedTable`
      * instead
      */
      range(from, to, { foreignTable, referencedTable = foreignTable } = {}) {
        const keyOffset = typeof referencedTable === "undefined" ? "offset" : `${referencedTable}.offset`;
        const keyLimit = typeof referencedTable === "undefined" ? "limit" : `${referencedTable}.limit`;
        this.url.searchParams.set(keyOffset, `${from}`);
        this.url.searchParams.set(keyLimit, `${to - from + 1}`);
        return this;
      }
      /**
      * Set the AbortSignal for the fetch request.
      *
      * @param signal - The AbortSignal to use for the fetch request
      */
      abortSignal(signal) {
        this.signal = signal;
        return this;
      }
      /**
      * Return `data` as a single object instead of an array of objects.
      *
      * Query result must be one row (e.g. using `.limit(1)`), otherwise this
      * returns an error.
      */
      single() {
        this.headers.set("Accept", "application/vnd.pgrst.object+json");
        return this;
      }
      /**
      * Return `data` as a single object instead of an array of objects.
      *
      * Query result must be zero or one row (e.g. using `.limit(1)`), otherwise
      * this returns an error.
      */
      maybeSingle() {
        if (this.method === "GET") this.headers.set("Accept", "application/json");
        else this.headers.set("Accept", "application/vnd.pgrst.object+json");
        this.isMaybeSingle = true;
        return this;
      }
      /**
      * Return `data` as a string in CSV format.
      */
      csv() {
        this.headers.set("Accept", "text/csv");
        return this;
      }
      /**
      * Return `data` as an object in [GeoJSON](https://geojson.org) format.
      */
      geojson() {
        this.headers.set("Accept", "application/geo+json");
        return this;
      }
      /**
      * Return `data` as the EXPLAIN plan for the query.
      *
      * You need to enable the
      * [db_plan_enabled](https://supabase.com/docs/guides/database/debugging-performance#enabling-explain)
      * setting before using this method.
      *
      * @param options - Named parameters
      *
      * @param options.analyze - If `true`, the query will be executed and the
      * actual run time will be returned
      *
      * @param options.verbose - If `true`, the query identifier will be returned
      * and `data` will include the output columns of the query
      *
      * @param options.settings - If `true`, include information on configuration
      * parameters that affect query planning
      *
      * @param options.buffers - If `true`, include information on buffer usage
      *
      * @param options.wal - If `true`, include information on WAL record generation
      *
      * @param options.format - The format of the output, can be `"text"` (default)
      * or `"json"`
      */
      explain({ analyze = false, verbose = false, settings = false, buffers = false, wal = false, format = "text" } = {}) {
        var _this$headers$get;
        const options = [
          analyze ? "analyze" : null,
          verbose ? "verbose" : null,
          settings ? "settings" : null,
          buffers ? "buffers" : null,
          wal ? "wal" : null
        ].filter(Boolean).join("|");
        const forMediatype = (_this$headers$get = this.headers.get("Accept")) !== null && _this$headers$get !== void 0 ? _this$headers$get : "application/json";
        this.headers.set("Accept", `application/vnd.pgrst.plan+${format}; for="${forMediatype}"; options=${options};`);
        if (format === "json") return this;
        else return this;
      }
      /**
      * Rollback the query.
      *
      * `data` will still be returned, but the query is not committed.
      */
      rollback() {
        this.headers.append("Prefer", "tx=rollback");
        return this;
      }
      /**
      * Override the type of the returned `data`.
      *
      * @typeParam NewResult - The new result type to override with
      * @deprecated Use overrideTypes<yourType, { merge: false }>() method at the end of your call chain instead
      */
      returns() {
        return this;
      }
      /**
      * Set the maximum number of rows that can be affected by the query.
      * Only available in PostgREST v13+ and only works with PATCH and DELETE methods.
      *
      * @param value - The maximum number of rows that can be affected
      */
      maxAffected(value) {
        this.headers.append("Prefer", "handling=strict");
        this.headers.append("Prefer", `max-affected=${value}`);
        return this;
      }
    };
    PostgrestReservedCharsRegexp = /* @__PURE__ */ new RegExp("[,()]");
    PostgrestFilterBuilder = class extends PostgrestTransformBuilder {
      /**
      * Match only rows where `column` is equal to `value`.
      *
      * To check if the value of `column` is NULL, you should use `.is()` instead.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      eq(column, value) {
        this.url.searchParams.append(column, `eq.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is not equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      neq(column, value) {
        this.url.searchParams.append(column, `neq.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is greater than `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      gt(column, value) {
        this.url.searchParams.append(column, `gt.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is greater than or equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      gte(column, value) {
        this.url.searchParams.append(column, `gte.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is less than `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      lt(column, value) {
        this.url.searchParams.append(column, `lt.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is less than or equal to `value`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      lte(column, value) {
        this.url.searchParams.append(column, `lte.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` matches `pattern` case-sensitively.
      *
      * @param column - The column to filter on
      * @param pattern - The pattern to match with
      */
      like(column, pattern) {
        this.url.searchParams.append(column, `like.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches all of `patterns` case-sensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      likeAllOf(column, patterns) {
        this.url.searchParams.append(column, `like(all).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches any of `patterns` case-sensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      likeAnyOf(column, patterns) {
        this.url.searchParams.append(column, `like(any).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches `pattern` case-insensitively.
      *
      * @param column - The column to filter on
      * @param pattern - The pattern to match with
      */
      ilike(column, pattern) {
        this.url.searchParams.append(column, `ilike.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches all of `patterns` case-insensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      ilikeAllOf(column, patterns) {
        this.url.searchParams.append(column, `ilike(all).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches any of `patterns` case-insensitively.
      *
      * @param column - The column to filter on
      * @param patterns - The patterns to match with
      */
      ilikeAnyOf(column, patterns) {
        this.url.searchParams.append(column, `ilike(any).{${patterns.join(",")}}`);
        return this;
      }
      /**
      * Match only rows where `column` matches the PostgreSQL regex `pattern`
      * case-sensitively (using the `~` operator).
      *
      * @param column - The column to filter on
      * @param pattern - The PostgreSQL regular expression pattern to match with
      */
      regexMatch(column, pattern) {
        this.url.searchParams.append(column, `match.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` matches the PostgreSQL regex `pattern`
      * case-insensitively (using the `~*` operator).
      *
      * @param column - The column to filter on
      * @param pattern - The PostgreSQL regular expression pattern to match with
      */
      regexIMatch(column, pattern) {
        this.url.searchParams.append(column, `imatch.${pattern}`);
        return this;
      }
      /**
      * Match only rows where `column` IS `value`.
      *
      * For non-boolean columns, this is only relevant for checking if the value of
      * `column` is NULL by setting `value` to `null`.
      *
      * For boolean columns, you can also set `value` to `true` or `false` and it
      * will behave the same way as `.eq()`.
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      is(column, value) {
        this.url.searchParams.append(column, `is.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` IS DISTINCT FROM `value`.
      *
      * Unlike `.neq()`, this treats `NULL` as a comparable value. Two `NULL` values
      * are considered equal (not distinct), and comparing `NULL` with any non-NULL
      * value returns true (distinct).
      *
      * @param column - The column to filter on
      * @param value - The value to filter with
      */
      isDistinct(column, value) {
        this.url.searchParams.append(column, `isdistinct.${value}`);
        return this;
      }
      /**
      * Match only rows where `column` is included in the `values` array.
      *
      * @param column - The column to filter on
      * @param values - The values array to filter with
      */
      in(column, values) {
        const cleanedValues = Array.from(new Set(values)).map((s) => {
          if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
          else return `${s}`;
        }).join(",");
        this.url.searchParams.append(column, `in.(${cleanedValues})`);
        return this;
      }
      /**
      * Match only rows where `column` is NOT included in the `values` array.
      *
      * @param column - The column to filter on
      * @param values - The values array to filter with
      */
      notIn(column, values) {
        const cleanedValues = Array.from(new Set(values)).map((s) => {
          if (typeof s === "string" && PostgrestReservedCharsRegexp.test(s)) return `"${s}"`;
          else return `${s}`;
        }).join(",");
        this.url.searchParams.append(column, `not.in.(${cleanedValues})`);
        return this;
      }
      /**
      * Only relevant for jsonb, array, and range columns. Match only rows where
      * `column` contains every element appearing in `value`.
      *
      * @param column - The jsonb, array, or range column to filter on
      * @param value - The jsonb, array, or range value to filter with
      */
      contains(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `cs.${value}`);
        else if (Array.isArray(value)) this.url.searchParams.append(column, `cs.{${value.join(",")}}`);
        else this.url.searchParams.append(column, `cs.${JSON.stringify(value)}`);
        return this;
      }
      /**
      * Only relevant for jsonb, array, and range columns. Match only rows where
      * every element appearing in `column` is contained by `value`.
      *
      * @param column - The jsonb, array, or range column to filter on
      * @param value - The jsonb, array, or range value to filter with
      */
      containedBy(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `cd.${value}`);
        else if (Array.isArray(value)) this.url.searchParams.append(column, `cd.{${value.join(",")}}`);
        else this.url.searchParams.append(column, `cd.${JSON.stringify(value)}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is greater than any element in `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeGt(column, range) {
        this.url.searchParams.append(column, `sr.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is either contained in `range` or greater than any element in
      * `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeGte(column, range) {
        this.url.searchParams.append(column, `nxl.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is less than any element in `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeLt(column, range) {
        this.url.searchParams.append(column, `sl.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where every element in
      * `column` is either contained in `range` or less than any element in
      * `range`.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeLte(column, range) {
        this.url.searchParams.append(column, `nxr.${range}`);
        return this;
      }
      /**
      * Only relevant for range columns. Match only rows where `column` is
      * mutually exclusive to `range` and there can be no element between the two
      * ranges.
      *
      * @param column - The range column to filter on
      * @param range - The range to filter with
      */
      rangeAdjacent(column, range) {
        this.url.searchParams.append(column, `adj.${range}`);
        return this;
      }
      /**
      * Only relevant for array and range columns. Match only rows where
      * `column` and `value` have an element in common.
      *
      * @param column - The array or range column to filter on
      * @param value - The array or range value to filter with
      */
      overlaps(column, value) {
        if (typeof value === "string") this.url.searchParams.append(column, `ov.${value}`);
        else this.url.searchParams.append(column, `ov.{${value.join(",")}}`);
        return this;
      }
      /**
      * Only relevant for text and tsvector columns. Match only rows where
      * `column` matches the query string in `query`.
      *
      * @param column - The text or tsvector column to filter on
      * @param query - The query text to match with
      * @param options - Named parameters
      * @param options.config - The text search configuration to use
      * @param options.type - Change how the `query` text is interpreted
      */
      textSearch(column, query, { config, type } = {}) {
        let typePart = "";
        if (type === "plain") typePart = "pl";
        else if (type === "phrase") typePart = "ph";
        else if (type === "websearch") typePart = "w";
        const configPart = config === void 0 ? "" : `(${config})`;
        this.url.searchParams.append(column, `${typePart}fts${configPart}.${query}`);
        return this;
      }
      /**
      * Match only rows where each column in `query` keys is equal to its
      * associated value. Shorthand for multiple `.eq()`s.
      *
      * @param query - The object to filter with, with column names as keys mapped
      * to their filter values
      */
      match(query) {
        Object.entries(query).forEach(([column, value]) => {
          this.url.searchParams.append(column, `eq.${value}`);
        });
        return this;
      }
      /**
      * Match only rows which doesn't satisfy the filter.
      *
      * Unlike most filters, `opearator` and `value` are used as-is and need to
      * follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure they are properly sanitized.
      *
      * @param column - The column to filter on
      * @param operator - The operator to be negated to filter with, following
      * PostgREST syntax
      * @param value - The value to filter with, following PostgREST syntax
      */
      not(column, operator, value) {
        this.url.searchParams.append(column, `not.${operator}.${value}`);
        return this;
      }
      /**
      * Match only rows which satisfy at least one of the filters.
      *
      * Unlike most filters, `filters` is used as-is and needs to follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure it's properly sanitized.
      *
      * It's currently not possible to do an `.or()` filter across multiple tables.
      *
      * @param filters - The filters to use, following PostgREST syntax
      * @param options - Named parameters
      * @param options.referencedTable - Set this to filter on referenced tables
      * instead of the parent table
      * @param options.foreignTable - Deprecated, use `referencedTable` instead
      */
      or(filters, { foreignTable, referencedTable = foreignTable } = {}) {
        const key = referencedTable ? `${referencedTable}.or` : "or";
        this.url.searchParams.append(key, `(${filters})`);
        return this;
      }
      /**
      * Match only rows which satisfy the filter. This is an escape hatch - you
      * should use the specific filter methods wherever possible.
      *
      * Unlike most filters, `opearator` and `value` are used as-is and need to
      * follow [PostgREST
      * syntax](https://postgrest.org/en/stable/api.html#operators). You also need
      * to make sure they are properly sanitized.
      *
      * @param column - The column to filter on
      * @param operator - The operator to filter with, following PostgREST syntax
      * @param value - The value to filter with, following PostgREST syntax
      */
      filter(column, operator, value) {
        this.url.searchParams.append(column, `${operator}.${value}`);
        return this;
      }
    };
    PostgrestQueryBuilder = class {
      /**
      * Creates a query builder scoped to a Postgres table or view.
      *
      * @example
      * ```ts
      * import PostgrestQueryBuilder from '@supabase/postgrest-js'
      *
      * const query = new PostgrestQueryBuilder(
      *   new URL('https://xyzcompany.supabase.co/rest/v1/users'),
      *   { headers: { apikey: 'public-anon-key' } }
      * )
      * ```
      */
      constructor(url, { headers = {}, schema, fetch: fetch$1, urlLengthLimit = 8e3 }) {
        this.url = url;
        this.headers = new Headers(headers);
        this.schema = schema;
        this.fetch = fetch$1;
        this.urlLengthLimit = urlLengthLimit;
      }
      /**
      * Clone URL and headers to prevent shared state between operations.
      */
      cloneRequestState() {
        return {
          url: new URL(this.url.toString()),
          headers: new Headers(this.headers)
        };
      }
      /**
      * Perform a SELECT query on the table or view.
      *
      * @param columns - The columns to retrieve, separated by commas. Columns can be renamed when returned with `customName:columnName`
      *
      * @param options - Named parameters
      *
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      *
      * @param options.count - Count algorithm to use to count rows in the table or view.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @remarks
      * When using `count` with `.range()` or `.limit()`, the returned `count` is the total number of rows
      * that match your filters, not the number of rows in the current page. Use this to build pagination UI.
      
      * - By default, Supabase projects return a maximum of 1,000 rows. This setting can be changed in your project's [API settings](/dashboard/project/_/settings/api). It's recommended that you keep it low to limit the payload size of accidental or malicious requests. You can use `range()` queries to paginate through your data.
      * - `select()` can be combined with [Filters](/docs/reference/javascript/using-filters)
      * - `select()` can be combined with [Modifiers](/docs/reference/javascript/using-modifiers)
      * - `apikey` is a reserved keyword if you're using the [Supabase Platform](/docs/guides/platform) and [should be avoided as a column name](https://github.com/supabase/supabase/issues/5465). *
      * @category Database
      *
      * @example Getting your data
      * ```js
      * const { data, error } = await supabase
      *   .from('characters')
      *   .select()
      * ```
      *
      * @exampleSql Getting your data
      * ```sql
      * create table
      *   characters (id int8 primary key, name text);
      *
      * insert into
      *   characters (id, name)
      * values
      *   (1, 'Harry'),
      *   (2, 'Frodo'),
      *   (3, 'Katniss');
      * ```
      *
      * @exampleResponse Getting your data
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "Harry"
      *     },
      *     {
      *       "id": 2,
      *       "name": "Frodo"
      *     },
      *     {
      *       "id": 3,
      *       "name": "Katniss"
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @example Selecting specific columns
      * ```js
      * const { data, error } = await supabase
      *   .from('characters')
      *   .select('name')
      * ```
      *
      * @exampleSql Selecting specific columns
      * ```sql
      * create table
      *   characters (id int8 primary key, name text);
      *
      * insert into
      *   characters (id, name)
      * values
      *   (1, 'Frodo'),
      *   (2, 'Harry'),
      *   (3, 'Katniss');
      * ```
      *
      * @exampleResponse Selecting specific columns
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "Frodo"
      *     },
      *     {
      *       "name": "Harry"
      *     },
      *     {
      *       "name": "Katniss"
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Query referenced tables
      * If your database has foreign key relationships, you can query related tables too.
      *
      * @example Query referenced tables
      * ```js
      * const { data, error } = await supabase
      *   .from('orchestral_sections')
      *   .select(`
      *     name,
      *     instruments (
      *       name
      *     )
      *   `)
      * ```
      *
      * @exampleSql Query referenced tables
      * ```sql
      * create table
      *   orchestral_sections (id int8 primary key, name text);
      * create table
      *   instruments (
      *     id int8 primary key,
      *     section_id int8 not null references orchestral_sections,
      *     name text
      *   );
      *
      * insert into
      *   orchestral_sections (id, name)
      * values
      *   (1, 'strings'),
      *   (2, 'woodwinds');
      * insert into
      *   instruments (id, section_id, name)
      * values
      *   (1, 2, 'flute'),
      *   (2, 1, 'violin');
      * ```
      *
      * @exampleResponse Query referenced tables
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "strings",
      *       "instruments": [
      *         {
      *           "name": "violin"
      *         }
      *       ]
      *     },
      *     {
      *       "name": "woodwinds",
      *       "instruments": [
      *         {
      *           "name": "flute"
      *         }
      *       ]
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Query referenced tables with spaces in their names
      * If your table name contains spaces, you must use double quotes in the `select` statement to reference the table.
      *
      * @example Query referenced tables with spaces in their names
      * ```js
      * const { data, error } = await supabase
      *   .from('orchestral sections')
      *   .select(`
      *     name,
      *     "musical instruments" (
      *       name
      *     )
      *   `)
      * ```
      *
      * @exampleSql Query referenced tables with spaces in their names
      * ```sql
      * create table
      *   "orchestral sections" (id int8 primary key, name text);
      * create table
      *   "musical instruments" (
      *     id int8 primary key,
      *     section_id int8 not null references "orchestral sections",
      *     name text
      *   );
      *
      * insert into
      *   "orchestral sections" (id, name)
      * values
      *   (1, 'strings'),
      *   (2, 'woodwinds');
      * insert into
      *   "musical instruments" (id, section_id, name)
      * values
      *   (1, 2, 'flute'),
      *   (2, 1, 'violin');
      * ```
      *
      * @exampleResponse Query referenced tables with spaces in their names
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "strings",
      *       "musical instruments": [
      *         {
      *           "name": "violin"
      *         }
      *       ]
      *     },
      *     {
      *       "name": "woodwinds",
      *       "musical instruments": [
      *         {
      *           "name": "flute"
      *         }
      *       ]
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Query referenced tables through a join table
      * If you're in a situation where your tables are **NOT** directly
      * related, but instead are joined by a _join table_, you can still use
      * the `select()` method to query the related data. The join table needs
      * to have the foreign keys as part of its composite primary key.
      *
      * @example Query referenced tables through a join table
      * ```ts
      * const { data, error } = await supabase
      *   .from('users')
      *   .select(`
      *     name,
      *     teams (
      *       name
      *     )
      *   `)
      *   
      * ```
      *
      * @exampleSql Query referenced tables through a join table
      * ```sql
      * create table
      *   users (
      *     id int8 primary key,
      *     name text
      *   );
      * create table
      *   teams (
      *     id int8 primary key,
      *     name text
      *   );
      * -- join table
      * create table
      *   users_teams (
      *     user_id int8 not null references users,
      *     team_id int8 not null references teams,
      *     -- both foreign keys must be part of a composite primary key
      *     primary key (user_id, team_id)
      *   );
      *
      * insert into
      *   users (id, name)
      * values
      *   (1, 'Kiran'),
      *   (2, 'Evan');
      * insert into
      *   teams (id, name)
      * values
      *   (1, 'Green'),
      *   (2, 'Blue');
      * insert into
      *   users_teams (user_id, team_id)
      * values
      *   (1, 1),
      *   (1, 2),
      *   (2, 2);
      * ```
      *
      * @exampleResponse Query referenced tables through a join table
      * ```json
      *   {
      *     "data": [
      *       {
      *         "name": "Kiran",
      *         "teams": [
      *           {
      *             "name": "Green"
      *           },
      *           {
      *             "name": "Blue"
      *           }
      *         ]
      *       },
      *       {
      *         "name": "Evan",
      *         "teams": [
      *           {
      *             "name": "Blue"
      *           }
      *         ]
      *       }
      *     ],
      *     "status": 200,
      *     "statusText": "OK"
      *   }
      *   
      * ```
      *
      * @exampleDescription Query the same referenced table multiple times
      * If you need to query the same referenced table twice, use the name of the
      * joined column to identify which join to use. You can also give each
      * column an alias.
      *
      * @example Query the same referenced table multiple times
      * ```ts
      * const { data, error } = await supabase
      *   .from('messages')
      *   .select(`
      *     content,
      *     from:sender_id(name),
      *     to:receiver_id(name)
      *   `)
      *
      * // To infer types, use the name of the table (in this case `users`) and
      * // the name of the foreign key constraint.
      * const { data, error } = await supabase
      *   .from('messages')
      *   .select(`
      *     content,
      *     from:users!messages_sender_id_fkey(name),
      *     to:users!messages_receiver_id_fkey(name)
      *   `)
      * ```
      *
      * @exampleSql Query the same referenced table multiple times
      * ```sql
      *  create table
      *  users (id int8 primary key, name text);
      *
      *  create table
      *    messages (
      *      sender_id int8 not null references users,
      *      receiver_id int8 not null references users,
      *      content text
      *    );
      *
      *  insert into
      *    users (id, name)
      *  values
      *    (1, 'Kiran'),
      *    (2, 'Evan');
      *
      *  insert into
      *    messages (sender_id, receiver_id, content)
      *  values
      *    (1, 2, '👋');
      *  ```
      * ```
      *
      * @exampleResponse Query the same referenced table multiple times
      * ```json
      * {
      *   "data": [
      *     {
      *       "content": "👋",
      *       "from": {
      *         "name": "Kiran"
      *       },
      *       "to": {
      *         "name": "Evan"
      *       }
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Query nested foreign tables through a join table
      * You can use the result of a joined table to gather data in
      * another foreign table. With multiple references to the same foreign
      * table you must specify the column on which to conduct the join.
      *
      * @example Query nested foreign tables through a join table
      * ```ts
      *   const { data, error } = await supabase
      *     .from('games')
      *     .select(`
      *       game_id:id,
      *       away_team:teams!games_away_team_fkey (
      *         users (
      *           id,
      *           name
      *         )
      *       )
      *     `)
      *   
      * ```
      *
      * @exampleSql Query nested foreign tables through a join table
      * ```sql
      * ```sql
      * create table
      *   users (
      *     id int8 primary key,
      *     name text
      *   );
      * create table
      *   teams (
      *     id int8 primary key,
      *     name text
      *   );
      * -- join table
      * create table
      *   users_teams (
      *     user_id int8 not null references users,
      *     team_id int8 not null references teams,
      *
      *     primary key (user_id, team_id)
      *   );
      * create table
      *   games (
      *     id int8 primary key,
      *     home_team int8 not null references teams,
      *     away_team int8 not null references teams,
      *     name text
      *   );
      *
      * insert into users (id, name)
      * values
      *   (1, 'Kiran'),
      *   (2, 'Evan');
      * insert into
      *   teams (id, name)
      * values
      *   (1, 'Green'),
      *   (2, 'Blue');
      * insert into
      *   users_teams (user_id, team_id)
      * values
      *   (1, 1),
      *   (1, 2),
      *   (2, 2);
      * insert into
      *   games (id, home_team, away_team, name)
      * values
      *   (1, 1, 2, 'Green vs Blue'),
      *   (2, 2, 1, 'Blue vs Green');
      * ```
      *
      * @exampleResponse Query nested foreign tables through a join table
      * ```json
      *   {
      *     "data": [
      *       {
      *         "game_id": 1,
      *         "away_team": {
      *           "users": [
      *             {
      *               "id": 1,
      *               "name": "Kiran"
      *             },
      *             {
      *               "id": 2,
      *               "name": "Evan"
      *             }
      *           ]
      *         }
      *       },
      *       {
      *         "game_id": 2,
      *         "away_team": {
      *           "users": [
      *             {
      *               "id": 1,
      *               "name": "Kiran"
      *             }
      *           ]
      *         }
      *       }
      *     ],
      *     "status": 200,
      *     "statusText": "OK"
      *   }
      *   
      * ```
      *
      * @exampleDescription Filtering through referenced tables
      * If the filter on a referenced table's column is not satisfied, the referenced
      * table returns `[]` or `null` but the parent table is not filtered out.
      * If you want to filter out the parent table rows, use the `!inner` hint
      *
      * @example Filtering through referenced tables
      * ```ts
      * const { data, error } = await supabase
      *   .from('instruments')
      *   .select('name, orchestral_sections(*)')
      *   .eq('orchestral_sections.name', 'percussion')
      * ```
      *
      * @exampleSql Filtering through referenced tables
      * ```sql
      * create table
      *   orchestral_sections (id int8 primary key, name text);
      * create table
      *   instruments (
      *     id int8 primary key,
      *     section_id int8 not null references orchestral_sections,
      *     name text
      *   );
      *
      * insert into
      *   orchestral_sections (id, name)
      * values
      *   (1, 'strings'),
      *   (2, 'woodwinds');
      * insert into
      *   instruments (id, section_id, name)
      * values
      *   (1, 2, 'flute'),
      *   (2, 1, 'violin');
      * ```
      *
      * @exampleResponse Filtering through referenced tables
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "flute",
      *       "orchestral_sections": null
      *     },
      *     {
      *       "name": "violin",
      *       "orchestral_sections": null
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Querying referenced table with count
      * You can get the number of rows in a related table by using the
      * **count** property.
      *
      * @example Querying referenced table with count
      * ```ts
      * const { data, error } = await supabase
      *   .from('orchestral_sections')
      *   .select(`*, instruments(count)`)
      * ```
      *
      * @exampleSql Querying referenced table with count
      * ```sql
      * create table orchestral_sections (
      *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
      *   "name" text
      * );
      *
      * create table characters (
      *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
      *   "name" text,
      *   "section_id" "uuid" references public.orchestral_sections on delete cascade
      * );
      *
      * with section as (
      *   insert into orchestral_sections (name)
      *   values ('strings') returning id
      * )
      * insert into instruments (name, section_id) values
      * ('violin', (select id from section)),
      * ('viola', (select id from section)),
      * ('cello', (select id from section)),
      * ('double bass', (select id from section));
      * ```
      *
      * @exampleResponse Querying referenced table with count
      * ```json
      * [
      *   {
      *     "id": "693694e7-d993-4360-a6d7-6294e325d9b6",
      *     "name": "strings",
      *     "instruments": [
      *       {
      *         "count": 4
      *       }
      *     ]
      *   }
      * ]
      * ```
      *
      * @exampleDescription Querying with count option
      * You can get the number of rows by using the
      * [count](/docs/reference/javascript/select#parameters) option.
      *
      * @example Querying with count option
      * ```ts
      * const { count, error } = await supabase
      *   .from('characters')
      *   .select('*', { count: 'exact', head: true })
      * ```
      *
      * @exampleSql Querying with count option
      * ```sql
      * create table
      *   characters (id int8 primary key, name text);
      *
      * insert into
      *   characters (id, name)
      * values
      *   (1, 'Luke'),
      *   (2, 'Leia'),
      *   (3, 'Han');
      * ```
      *
      * @exampleResponse Querying with count option
      * ```json
      * {
      *   "count": 3,
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Querying JSON data
      * You can select and filter data inside of
      * [JSON](/docs/guides/database/json) columns. Postgres offers some
      * [operators](/docs/guides/database/json#query-the-jsonb-data) for
      * querying JSON data.
      *
      * @example Querying JSON data
      * ```ts
      * const { data, error } = await supabase
      *   .from('users')
      *   .select(`
      *     id, name,
      *     address->city
      *   `)
      * ```
      *
      * @exampleSql Querying JSON data
      * ```sql
      * create table
      *   users (
      *     id int8 primary key,
      *     name text,
      *     address jsonb
      *   );
      *
      * insert into
      *   users (id, name, address)
      * values
      *   (1, 'Frodo', '{"city":"Hobbiton"}');
      * ```
      *
      * @exampleResponse Querying JSON data
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "Frodo",
      *       "city": "Hobbiton"
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Querying referenced table with inner join
      * If you don't want to return the referenced table contents, you can leave the parenthesis empty.
      * Like `.select('name, orchestral_sections!inner()')`.
      *
      * @example Querying referenced table with inner join
      * ```ts
      * const { data, error } = await supabase
      *   .from('instruments')
      *   .select('name, orchestral_sections!inner(name)')
      *   .eq('orchestral_sections.name', 'woodwinds')
      *   .limit(1)
      * ```
      *
      * @exampleSql Querying referenced table with inner join
      * ```sql
      * create table orchestral_sections (
      *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
      *   "name" text
      * );
      *
      * create table instruments (
      *   "id" "uuid" primary key default "extensions"."uuid_generate_v4"() not null,
      *   "name" text,
      *   "section_id" "uuid" references public.orchestral_sections on delete cascade
      * );
      *
      * with section as (
      *   insert into orchestral_sections (name)
      *   values ('woodwinds') returning id
      * )
      * insert into instruments (name, section_id) values
      * ('flute', (select id from section)),
      * ('clarinet', (select id from section)),
      * ('bassoon', (select id from section)),
      * ('piccolo', (select id from section));
      * ```
      *
      * @exampleResponse Querying referenced table with inner join
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "flute",
      *       "orchestral_sections": {"name": "woodwinds"}
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Switching schemas per query
      * In addition to setting the schema during initialization, you can also switch schemas on a per-query basis.
      * Make sure you've set up your [database privileges and API settings](/docs/guides/api/using-custom-schemas).
      *
      * @example Switching schemas per query
      * ```ts
      * const { data, error } = await supabase
      *   .schema('myschema')
      *   .from('mytable')
      *   .select()
      * ```
      *
      * @exampleSql Switching schemas per query
      * ```sql
      * create schema myschema;
      *
      * create table myschema.mytable (
      *   id uuid primary key default gen_random_uuid(),
      *   data text
      * );
      *
      * insert into myschema.mytable (data) values ('mydata');
      * ```
      *
      * @exampleResponse Switching schemas per query
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": "4162e008-27b0-4c0f-82dc-ccaeee9a624d",
      *       "data": "mydata"
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      */
      select(columns, options) {
        const { head: head2 = false, count } = options !== null && options !== void 0 ? options : {};
        const method = head2 ? "HEAD" : "GET";
        let quoted = false;
        const cleanedColumns = (columns !== null && columns !== void 0 ? columns : "*").split("").map((c) => {
          if (/\s/.test(c) && !quoted) return "";
          if (c === '"') quoted = !quoted;
          return c;
        }).join("");
        const { url, headers } = this.cloneRequestState();
        url.searchParams.set("select", cleanedColumns);
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          fetch: this.fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform an INSERT into the table or view.
      *
      * By default, inserted rows are not returned. To return it, chain the call
      * with `.select()`.
      *
      * @param values - The values to insert. Pass an object to insert a single row
      * or an array to insert multiple rows.
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count inserted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @param options.defaultToNull - Make missing fields default to `null`.
      * Otherwise, use the default value for the column. Only applies for bulk
      * inserts.
      *
      * @category Database
      *
      * @example Create a record
      * ```ts
      * const { error } = await supabase
      *   .from('countries')
      *   .insert({ id: 1, name: 'Mordor' })
      * ```
      *
      * @exampleSql Create a record
      * ```sql
      * create table
      *   countries (id int8 primary key, name text);
      * ```
      *
      * @exampleResponse Create a record
      * ```json
      * {
      *   "status": 201,
      *   "statusText": "Created"
      * }
      * ```
      *
      * @example Create a record and return it
      * ```ts
      * const { data, error } = await supabase
      *   .from('countries')
      *   .insert({ id: 1, name: 'Mordor' })
      *   .select()
      * ```
      *
      * @exampleSql Create a record and return it
      * ```sql
      * create table
      *   countries (id int8 primary key, name text);
      * ```
      *
      * @exampleResponse Create a record and return it
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "Mordor"
      *     }
      *   ],
      *   "status": 201,
      *   "statusText": "Created"
      * }
      * ```
      *
      * @exampleDescription Bulk create
      * A bulk create operation is handled in a single transaction.
      * If any of the inserts fail, none of the rows are inserted.
      *
      * @example Bulk create
      * ```ts
      * const { error } = await supabase
      *   .from('countries')
      *   .insert([
      *     { id: 1, name: 'Mordor' },
      *     { id: 1, name: 'The Shire' },
      *   ])
      * ```
      *
      * @exampleSql Bulk create
      * ```sql
      * create table
      *   countries (id int8 primary key, name text);
      * ```
      *
      * @exampleResponse Bulk create
      * ```json
      * {
      *   "error": {
      *     "code": "23505",
      *     "details": "Key (id)=(1) already exists.",
      *     "hint": null,
      *     "message": "duplicate key value violates unique constraint \"countries_pkey\""
      *   },
      *   "status": 409,
      *   "statusText": "Conflict"
      * }
      * ```
      */
      insert(values, { count, defaultToNull = true } = {}) {
        var _this$fetch;
        const method = "POST";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        if (!defaultToNull) headers.append("Prefer", `missing=default`);
        if (Array.isArray(values)) {
          const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
          if (columns.length > 0) {
            const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
            url.searchParams.set("columns", uniqueColumns.join(","));
          }
        }
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform an UPSERT on the table or view. Depending on the column(s) passed
      * to `onConflict`, `.upsert()` allows you to perform the equivalent of
      * `.insert()` if a row with the corresponding `onConflict` columns doesn't
      * exist, or if it does exist, perform an alternative action depending on
      * `ignoreDuplicates`.
      *
      * By default, upserted rows are not returned. To return it, chain the call
      * with `.select()`.
      *
      * @param values - The values to upsert with. Pass an object to upsert a
      * single row or an array to upsert multiple rows.
      *
      * @param options - Named parameters
      *
      * @param options.onConflict - Comma-separated UNIQUE column(s) to specify how
      * duplicate rows are determined. Two rows are duplicates if all the
      * `onConflict` columns are equal.
      *
      * @param options.ignoreDuplicates - If `true`, duplicate rows are ignored. If
      * `false`, duplicate rows are merged with existing rows.
      *
      * @param options.count - Count algorithm to use to count upserted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @param options.defaultToNull - Make missing fields default to `null`.
      * Otherwise, use the default value for the column. This only applies when
      * inserting new rows, not when merging with existing rows under
      * `ignoreDuplicates: false`. This also only applies when doing bulk upserts.
      *
      * @example Upsert a single row using a unique key
      * ```ts
      * // Upserting a single row, overwriting based on the 'username' unique column
      * const { data, error } = await supabase
      *   .from('users')
      *   .upsert({ username: 'supabot' }, { onConflict: 'username' })
      *
      * // Example response:
      * // {
      * //   data: [
      * //     { id: 4, message: 'bar', username: 'supabot' }
      * //   ],
      * //   error: null
      * // }
      * ```
      *
      * @example Upsert with conflict resolution and exact row counting
      * ```ts
      * // Upserting and returning exact count
      * const { data, error, count } = await supabase
      *   .from('users')
      *   .upsert(
      *     {
      *       id: 3,
      *       message: 'foo',
      *       username: 'supabot'
      *     },
      *     {
      *       onConflict: 'username',
      *       count: 'exact'
      *     }
      *   )
      *
      * // Example response:
      * // {
      * //   data: [
      * //     {
      * //       id: 42,
      * //       handle: "saoirse",
      * //       display_name: "Saoirse"
      * //     }
      * //   ],
      * //   count: 1,
      * //   error: null
      * // }
      * ```
      *
      * @category Database
      *
      * @remarks
      * - Primary keys must be included in `values` to use upsert.
      *
      * @example Upsert your data
      * ```ts
      * const { data, error } = await supabase
      *   .from('instruments')
      *   .upsert({ id: 1, name: 'piano' })
      *   .select()
      * ```
      *
      * @exampleSql Upsert your data
      * ```sql
      * create table
      *   instruments (id int8 primary key, name text);
      *
      * insert into
      *   instruments (id, name)
      * values
      *   (1, 'harpsichord');
      * ```
      *
      * @exampleResponse Upsert your data
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "piano"
      *     }
      *   ],
      *   "status": 201,
      *   "statusText": "Created"
      * }
      * ```
      *
      * @example Bulk Upsert your data
      * ```ts
      * const { data, error } = await supabase
      *   .from('instruments')
      *   .upsert([
      *     { id: 1, name: 'piano' },
      *     { id: 2, name: 'harp' },
      *   ])
      *   .select()
      * ```
      *
      * @exampleSql Bulk Upsert your data
      * ```sql
      * create table
      *   instruments (id int8 primary key, name text);
      *
      * insert into
      *   instruments (id, name)
      * values
      *   (1, 'harpsichord');
      * ```
      *
      * @exampleResponse Bulk Upsert your data
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "piano"
      *     },
      *     {
      *       "id": 2,
      *       "name": "harp"
      *     }
      *   ],
      *   "status": 201,
      *   "statusText": "Created"
      * }
      * ```
      *
      * @exampleDescription Upserting into tables with constraints
      * In the following query, `upsert()` implicitly uses the `id`
      * (primary key) column to determine conflicts. If there is no existing
      * row with the same `id`, `upsert()` inserts a new row, which
      * will fail in this case as there is already a row with `handle` `"saoirse"`.
      * Using the `onConflict` option, you can instruct `upsert()` to use
      * another column with a unique constraint to determine conflicts.
      *
      * @example Upserting into tables with constraints
      * ```ts
      * const { data, error } = await supabase
      *   .from('users')
      *   .upsert({ id: 42, handle: 'saoirse', display_name: 'Saoirse' })
      *   .select()
      * ```
      *
      * @exampleSql Upserting into tables with constraints
      * ```sql
      * create table
      *   users (
      *     id int8 generated by default as identity primary key,
      *     handle text not null unique,
      *     display_name text
      *   );
      *
      * insert into
      *   users (id, handle, display_name)
      * values
      *   (1, 'saoirse', null);
      * ```
      *
      * @exampleResponse Upserting into tables with constraints
      * ```json
      * {
      *   "error": {
      *     "code": "23505",
      *     "details": "Key (handle)=(saoirse) already exists.",
      *     "hint": null,
      *     "message": "duplicate key value violates unique constraint \"users_handle_key\""
      *   },
      *   "status": 409,
      *   "statusText": "Conflict"
      * }
      * ```
      */
      upsert(values, { onConflict, ignoreDuplicates = false, count, defaultToNull = true } = {}) {
        var _this$fetch2;
        const method = "POST";
        const { url, headers } = this.cloneRequestState();
        headers.append("Prefer", `resolution=${ignoreDuplicates ? "ignore" : "merge"}-duplicates`);
        if (onConflict !== void 0) url.searchParams.set("on_conflict", onConflict);
        if (count) headers.append("Prefer", `count=${count}`);
        if (!defaultToNull) headers.append("Prefer", "missing=default");
        if (Array.isArray(values)) {
          const columns = values.reduce((acc, x) => acc.concat(Object.keys(x)), []);
          if (columns.length > 0) {
            const uniqueColumns = [...new Set(columns)].map((column) => `"${column}"`);
            url.searchParams.set("columns", uniqueColumns.join(","));
          }
        }
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch2 = this.fetch) !== null && _this$fetch2 !== void 0 ? _this$fetch2 : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform an UPDATE on the table or view.
      *
      * By default, updated rows are not returned. To return it, chain the call
      * with `.select()` after filters.
      *
      * @param values - The values to update with
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count updated rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @category Database
      *
      * @remarks
      * - `update()` should always be combined with [Filters](/docs/reference/javascript/using-filters) to target the item(s) you wish to update.
      *
      * @example Updating your data
      * ```ts
      * const { error } = await supabase
      *   .from('instruments')
      *   .update({ name: 'piano' })
      *   .eq('id', 1)
      * ```
      *
      * @exampleSql Updating your data
      * ```sql
      * create table
      *   instruments (id int8 primary key, name text);
      *
      * insert into
      *   instruments (id, name)
      * values
      *   (1, 'harpsichord');
      * ```
      *
      * @exampleResponse Updating your data
      * ```json
      * {
      *   "status": 204,
      *   "statusText": "No Content"
      * }
      * ```
      *
      * @example Update a record and return it
      * ```ts
      * const { data, error } = await supabase
      *   .from('instruments')
      *   .update({ name: 'piano' })
      *   .eq('id', 1)
      *   .select()
      * ```
      *
      * @exampleSql Update a record and return it
      * ```sql
      * create table
      *   instruments (id int8 primary key, name text);
      *
      * insert into
      *   instruments (id, name)
      * values
      *   (1, 'harpsichord');
      * ```
      *
      * @exampleResponse Update a record and return it
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "piano"
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      *
      * @exampleDescription Updating JSON data
      * Postgres offers some
      * [operators](/docs/guides/database/json#query-the-jsonb-data) for
      * working with JSON data. Currently, it is only possible to update the entire JSON document.
      *
      * @example Updating JSON data
      * ```ts
      * const { data, error } = await supabase
      *   .from('users')
      *   .update({
      *     address: {
      *       street: 'Melrose Place',
      *       postcode: 90210
      *     }
      *   })
      *   .eq('address->postcode', 90210)
      *   .select()
      * ```
      *
      * @exampleSql Updating JSON data
      * ```sql
      * create table
      *   users (
      *     id int8 primary key,
      *     name text,
      *     address jsonb
      *   );
      *
      * insert into
      *   users (id, name, address)
      * values
      *   (1, 'Michael', '{ "postcode": 90210 }');
      * ```
      *
      * @exampleResponse Updating JSON data
      * ```json
      * {
      *   "data": [
      *     {
      *       "id": 1,
      *       "name": "Michael",
      *       "address": {
      *         "street": "Melrose Place",
      *         "postcode": 90210
      *       }
      *     }
      *   ],
      *   "status": 200,
      *   "statusText": "OK"
      * }
      * ```
      */
      update(values, { count } = {}) {
        var _this$fetch3;
        const method = "PATCH";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          body: values,
          fetch: (_this$fetch3 = this.fetch) !== null && _this$fetch3 !== void 0 ? _this$fetch3 : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform a DELETE on the table or view.
      *
      * By default, deleted rows are not returned. To return it, chain the call
      * with `.select()` after filters.
      *
      * @param options - Named parameters
      *
      * @param options.count - Count algorithm to use to count deleted rows.
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      delete({ count } = {}) {
        var _this$fetch4;
        const method = "DELETE";
        const { url, headers } = this.cloneRequestState();
        if (count) headers.append("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schema,
          fetch: (_this$fetch4 = this.fetch) !== null && _this$fetch4 !== void 0 ? _this$fetch4 : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
    };
    PostgrestClient = class PostgrestClient2 {
      /**
      * Creates a PostgREST client.
      *
      * @param url - URL of the PostgREST endpoint
      * @param options - Named parameters
      * @param options.headers - Custom headers
      * @param options.schema - Postgres schema to switch to
      * @param options.fetch - Custom fetch
      * @param options.timeout - Optional timeout in milliseconds for all requests. When set, requests will automatically abort after this duration to prevent indefinite hangs.
      * @param options.urlLengthLimit - Maximum URL length in characters before warnings/errors are triggered. Defaults to 8000.
      * @example
      * ```ts
      * import PostgrestClient from '@supabase/postgrest-js'
      *
      * const postgrest = new PostgrestClient('https://xyzcompany.supabase.co/rest/v1', {
      *   headers: { apikey: 'public-anon-key' },
      *   schema: 'public',
      *   timeout: 30000, // 30 second timeout
      * })
      * ```
      */
      constructor(url, { headers = {}, schema, fetch: fetch$1, timeout, urlLengthLimit = 8e3 } = {}) {
        this.url = url;
        this.headers = new Headers(headers);
        this.schemaName = schema;
        this.urlLengthLimit = urlLengthLimit;
        const originalFetch = fetch$1 !== null && fetch$1 !== void 0 ? fetch$1 : globalThis.fetch;
        if (timeout !== void 0 && timeout > 0) this.fetch = (input, init) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          const existingSignal = init === null || init === void 0 ? void 0 : init.signal;
          if (existingSignal) {
            if (existingSignal.aborted) {
              clearTimeout(timeoutId);
              return originalFetch(input, init);
            }
            const abortHandler = () => {
              clearTimeout(timeoutId);
              controller.abort();
            };
            existingSignal.addEventListener("abort", abortHandler, { once: true });
            return originalFetch(input, _objectSpread2(_objectSpread2({}, init), {}, { signal: controller.signal })).finally(() => {
              clearTimeout(timeoutId);
              existingSignal.removeEventListener("abort", abortHandler);
            });
          }
          return originalFetch(input, _objectSpread2(_objectSpread2({}, init), {}, { signal: controller.signal })).finally(() => clearTimeout(timeoutId));
        };
        else this.fetch = originalFetch;
      }
      /**
      * Perform a query on a table or a view.
      *
      * @param relation - The table or view name to query
      */
      from(relation) {
        if (!relation || typeof relation !== "string" || relation.trim() === "") throw new Error("Invalid relation name: relation must be a non-empty string.");
        return new PostgrestQueryBuilder(new URL(`${this.url}/${relation}`), {
          headers: new Headers(this.headers),
          schema: this.schemaName,
          fetch: this.fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Select a schema to query or perform an function (rpc) call.
      *
      * The schema needs to be on the list of exposed schemas inside Supabase.
      *
      * @param schema - The schema to query
      */
      schema(schema) {
        return new PostgrestClient2(this.url, {
          headers: this.headers,
          schema,
          fetch: this.fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
      /**
      * Perform a function call.
      *
      * @param fn - The function name to call
      * @param args - The arguments to pass to the function call
      * @param options - Named parameters
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      * @param options.get - When set to `true`, the function will be called with
      * read-only access mode.
      * @param options.count - Count algorithm to use to count rows returned by the
      * function. Only applicable for [set-returning
      * functions](https://www.postgresql.org/docs/current/functions-srf.html).
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      *
      * @example
      * ```ts
      * // For cross-schema functions where type inference fails, use overrideTypes:
      * const { data } = await supabase
      *   .schema('schema_b')
      *   .rpc('function_a', {})
      *   .overrideTypes<{ id: string; user_id: string }[]>()
      * ```
      */
      rpc(fn, args = {}, { head: head2 = false, get: get2 = false, count } = {}) {
        var _this$fetch;
        let method;
        const url = new URL(`${this.url}/rpc/${fn}`);
        let body;
        const _isObject = (v) => v !== null && typeof v === "object" && (!Array.isArray(v) || v.some(_isObject));
        const _hasObjectArg = head2 && Object.values(args).some(_isObject);
        if (_hasObjectArg) {
          method = "POST";
          body = args;
        } else if (head2 || get2) {
          method = head2 ? "HEAD" : "GET";
          Object.entries(args).filter(([_, value]) => value !== void 0).map(([name, value]) => [name, Array.isArray(value) ? `{${value.join(",")}}` : `${value}`]).forEach(([name, value]) => {
            url.searchParams.append(name, value);
          });
        } else {
          method = "POST";
          body = args;
        }
        const headers = new Headers(this.headers);
        if (_hasObjectArg) headers.set("Prefer", count ? `count=${count},return=minimal` : "return=minimal");
        else if (count) headers.set("Prefer", `count=${count}`);
        return new PostgrestFilterBuilder({
          method,
          url,
          headers,
          schema: this.schemaName,
          body,
          fetch: (_this$fetch = this.fetch) !== null && _this$fetch !== void 0 ? _this$fetch : fetch,
          urlLengthLimit: this.urlLengthLimit
        });
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/websocket-factory.js
var WebSocketFactory, websocket_factory_default;
var init_websocket_factory = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/websocket-factory.js"() {
    WebSocketFactory = class {
      /**
       * Static-only utility – prevent instantiation.
       */
      constructor() {
      }
      static detectEnvironment() {
        var _a;
        if (typeof WebSocket !== "undefined") {
          return { type: "native", constructor: WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket !== "undefined") {
          return { type: "native", constructor: globalThis.WebSocket };
        }
        if (typeof global !== "undefined" && typeof global.WebSocket !== "undefined") {
          return { type: "native", constructor: global.WebSocket };
        }
        if (typeof globalThis !== "undefined" && typeof globalThis.WebSocketPair !== "undefined" && typeof globalThis.WebSocket === "undefined") {
          return {
            type: "cloudflare",
            error: "Cloudflare Workers detected. WebSocket clients are not supported in Cloudflare Workers.",
            workaround: "Use Cloudflare Workers WebSocket API for server-side WebSocket handling, or deploy to a different runtime."
          };
        }
        if (typeof globalThis !== "undefined" && globalThis.EdgeRuntime || typeof navigator !== "undefined" && ((_a = navigator.userAgent) === null || _a === void 0 ? void 0 : _a.includes("Vercel-Edge"))) {
          return {
            type: "unsupported",
            error: "Edge runtime detected (Vercel Edge/Netlify Edge). WebSockets are not supported in edge functions.",
            workaround: "Use serverless functions or a different deployment target for WebSocket functionality."
          };
        }
        const _process = globalThis["process"];
        if (_process) {
          const processVersions = _process["versions"];
          if (processVersions && processVersions["node"]) {
            const versionString = processVersions["node"];
            const nodeVersion = parseInt(versionString.replace(/^v/, "").split(".")[0]);
            if (nodeVersion >= 22) {
              if (typeof globalThis.WebSocket !== "undefined") {
                return { type: "native", constructor: globalThis.WebSocket };
              }
              return {
                type: "unsupported",
                error: `Node.js ${nodeVersion} detected but native WebSocket not found.`,
                workaround: "Provide a WebSocket implementation via the transport option."
              };
            }
            return {
              type: "unsupported",
              error: `Node.js ${nodeVersion} detected without native WebSocket support.`,
              workaround: 'For Node.js < 22, install "ws" package and provide it via the transport option:\nimport ws from "ws"\nnew RealtimeClient(url, { transport: ws })'
            };
          }
        }
        return {
          type: "unsupported",
          error: "Unknown JavaScript runtime without WebSocket support.",
          workaround: "Ensure you're running in a supported environment (browser, Node.js, Deno) or provide a custom WebSocket implementation."
        };
      }
      /**
       * Returns the best available WebSocket constructor for the current runtime.
       *
       * @example
       * ```ts
       * const WS = WebSocketFactory.getWebSocketConstructor()
       * const socket = new WS('wss://realtime.supabase.co/socket')
       * ```
       */
      static getWebSocketConstructor() {
        const env = this.detectEnvironment();
        if (env.constructor) {
          return env.constructor;
        }
        let errorMessage = env.error || "WebSocket not supported in this environment.";
        if (env.workaround) {
          errorMessage += `

Suggested solution: ${env.workaround}`;
        }
        throw new Error(errorMessage);
      }
      /**
       * Creates a WebSocket using the detected constructor.
       *
       * @example
       * ```ts
       * const socket = WebSocketFactory.createWebSocket('wss://realtime.supabase.co/socket')
       * ```
       */
      static createWebSocket(url, protocols) {
        const WS = this.getWebSocketConstructor();
        return new WS(url, protocols);
      }
      /**
       * Detects whether the runtime can establish WebSocket connections.
       *
       * @example
       * ```ts
       * if (!WebSocketFactory.isWebSocketSupported()) {
       *   console.warn('Falling back to long polling')
       * }
       * ```
       */
      static isWebSocketSupported() {
        try {
          const env = this.detectEnvironment();
          return env.type === "native" || env.type === "ws";
        } catch (_a) {
          return false;
        }
      }
    };
    websocket_factory_default = WebSocketFactory;
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/version.js
var version;
var init_version = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/version.js"() {
    version = "2.99.1";
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/constants.js
var DEFAULT_VERSION, VSN_1_0_0, VSN_2_0_0, DEFAULT_VSN, DEFAULT_TIMEOUT, WS_CLOSE_NORMAL, MAX_PUSH_BUFFER_SIZE, SOCKET_STATES, CHANNEL_STATES, CHANNEL_EVENTS, TRANSPORTS, CONNECTION_STATE;
var init_constants = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/constants.js"() {
    init_version();
    DEFAULT_VERSION = `realtime-js/${version}`;
    VSN_1_0_0 = "1.0.0";
    VSN_2_0_0 = "2.0.0";
    DEFAULT_VSN = VSN_2_0_0;
    DEFAULT_TIMEOUT = 1e4;
    WS_CLOSE_NORMAL = 1e3;
    MAX_PUSH_BUFFER_SIZE = 100;
    (function(SOCKET_STATES2) {
      SOCKET_STATES2[SOCKET_STATES2["connecting"] = 0] = "connecting";
      SOCKET_STATES2[SOCKET_STATES2["open"] = 1] = "open";
      SOCKET_STATES2[SOCKET_STATES2["closing"] = 2] = "closing";
      SOCKET_STATES2[SOCKET_STATES2["closed"] = 3] = "closed";
    })(SOCKET_STATES || (SOCKET_STATES = {}));
    (function(CHANNEL_STATES2) {
      CHANNEL_STATES2["closed"] = "closed";
      CHANNEL_STATES2["errored"] = "errored";
      CHANNEL_STATES2["joined"] = "joined";
      CHANNEL_STATES2["joining"] = "joining";
      CHANNEL_STATES2["leaving"] = "leaving";
    })(CHANNEL_STATES || (CHANNEL_STATES = {}));
    (function(CHANNEL_EVENTS2) {
      CHANNEL_EVENTS2["close"] = "phx_close";
      CHANNEL_EVENTS2["error"] = "phx_error";
      CHANNEL_EVENTS2["join"] = "phx_join";
      CHANNEL_EVENTS2["reply"] = "phx_reply";
      CHANNEL_EVENTS2["leave"] = "phx_leave";
      CHANNEL_EVENTS2["access_token"] = "access_token";
    })(CHANNEL_EVENTS || (CHANNEL_EVENTS = {}));
    (function(TRANSPORTS2) {
      TRANSPORTS2["websocket"] = "websocket";
    })(TRANSPORTS || (TRANSPORTS = {}));
    (function(CONNECTION_STATE2) {
      CONNECTION_STATE2["Connecting"] = "connecting";
      CONNECTION_STATE2["Open"] = "open";
      CONNECTION_STATE2["Closing"] = "closing";
      CONNECTION_STATE2["Closed"] = "closed";
    })(CONNECTION_STATE || (CONNECTION_STATE = {}));
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/serializer.js
var Serializer;
var init_serializer = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/serializer.js"() {
    Serializer = class {
      constructor(allowedMetadataKeys) {
        this.HEADER_LENGTH = 1;
        this.USER_BROADCAST_PUSH_META_LENGTH = 6;
        this.KINDS = { userBroadcastPush: 3, userBroadcast: 4 };
        this.BINARY_ENCODING = 0;
        this.JSON_ENCODING = 1;
        this.BROADCAST_EVENT = "broadcast";
        this.allowedMetadataKeys = [];
        this.allowedMetadataKeys = allowedMetadataKeys !== null && allowedMetadataKeys !== void 0 ? allowedMetadataKeys : [];
      }
      encode(msg, callback) {
        if (msg.event === this.BROADCAST_EVENT && !(msg.payload instanceof ArrayBuffer) && typeof msg.payload.event === "string") {
          return callback(this._binaryEncodeUserBroadcastPush(msg));
        }
        let payload = [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
        return callback(JSON.stringify(payload));
      }
      _binaryEncodeUserBroadcastPush(message) {
        var _a;
        if (this._isArrayBuffer((_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload)) {
          return this._encodeBinaryUserBroadcastPush(message);
        } else {
          return this._encodeJsonUserBroadcastPush(message);
        }
      }
      _encodeBinaryUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : new ArrayBuffer(0);
        return this._encodeUserBroadcastPush(message, this.BINARY_ENCODING, userPayload);
      }
      _encodeJsonUserBroadcastPush(message) {
        var _a, _b;
        const userPayload = (_b = (_a = message.payload) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : {};
        const encoder = new TextEncoder();
        const encodedUserPayload = encoder.encode(JSON.stringify(userPayload)).buffer;
        return this._encodeUserBroadcastPush(message, this.JSON_ENCODING, encodedUserPayload);
      }
      _encodeUserBroadcastPush(message, encodingType, encodedPayload) {
        var _a, _b;
        const topic = message.topic;
        const ref = (_a = message.ref) !== null && _a !== void 0 ? _a : "";
        const joinRef = (_b = message.join_ref) !== null && _b !== void 0 ? _b : "";
        const userEvent = message.payload.event;
        const rest = this.allowedMetadataKeys ? this._pick(message.payload, this.allowedMetadataKeys) : {};
        const metadata = Object.keys(rest).length === 0 ? "" : JSON.stringify(rest);
        if (joinRef.length > 255) {
          throw new Error(`joinRef length ${joinRef.length} exceeds maximum of 255`);
        }
        if (ref.length > 255) {
          throw new Error(`ref length ${ref.length} exceeds maximum of 255`);
        }
        if (topic.length > 255) {
          throw new Error(`topic length ${topic.length} exceeds maximum of 255`);
        }
        if (userEvent.length > 255) {
          throw new Error(`userEvent length ${userEvent.length} exceeds maximum of 255`);
        }
        if (metadata.length > 255) {
          throw new Error(`metadata length ${metadata.length} exceeds maximum of 255`);
        }
        const metaLength = this.USER_BROADCAST_PUSH_META_LENGTH + joinRef.length + ref.length + topic.length + userEvent.length + metadata.length;
        const header = new ArrayBuffer(this.HEADER_LENGTH + metaLength);
        let view = new DataView(header);
        let offset = 0;
        view.setUint8(offset++, this.KINDS.userBroadcastPush);
        view.setUint8(offset++, joinRef.length);
        view.setUint8(offset++, ref.length);
        view.setUint8(offset++, topic.length);
        view.setUint8(offset++, userEvent.length);
        view.setUint8(offset++, metadata.length);
        view.setUint8(offset++, encodingType);
        Array.from(joinRef, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(ref, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(topic, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(userEvent, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        Array.from(metadata, (char) => view.setUint8(offset++, char.charCodeAt(0)));
        var combined = new Uint8Array(header.byteLength + encodedPayload.byteLength);
        combined.set(new Uint8Array(header), 0);
        combined.set(new Uint8Array(encodedPayload), header.byteLength);
        return combined.buffer;
      }
      decode(rawPayload, callback) {
        if (this._isArrayBuffer(rawPayload)) {
          let result = this._binaryDecode(rawPayload);
          return callback(result);
        }
        if (typeof rawPayload === "string") {
          const jsonPayload = JSON.parse(rawPayload);
          const [join_ref, ref, topic, event, payload] = jsonPayload;
          return callback({ join_ref, ref, topic, event, payload });
        }
        return callback({});
      }
      _binaryDecode(buffer) {
        const view = new DataView(buffer);
        const kind = view.getUint8(0);
        const decoder = new TextDecoder();
        switch (kind) {
          case this.KINDS.userBroadcast:
            return this._decodeUserBroadcast(buffer, view, decoder);
        }
      }
      _decodeUserBroadcast(buffer, view, decoder) {
        const topicSize = view.getUint8(1);
        const userEventSize = view.getUint8(2);
        const metadataSize = view.getUint8(3);
        const payloadEncoding = view.getUint8(4);
        let offset = this.HEADER_LENGTH + 4;
        const topic = decoder.decode(buffer.slice(offset, offset + topicSize));
        offset = offset + topicSize;
        const userEvent = decoder.decode(buffer.slice(offset, offset + userEventSize));
        offset = offset + userEventSize;
        const metadata = decoder.decode(buffer.slice(offset, offset + metadataSize));
        offset = offset + metadataSize;
        const payload = buffer.slice(offset, buffer.byteLength);
        const parsedPayload = payloadEncoding === this.JSON_ENCODING ? JSON.parse(decoder.decode(payload)) : payload;
        const data = {
          type: this.BROADCAST_EVENT,
          event: userEvent,
          payload: parsedPayload
        };
        if (metadataSize > 0) {
          data["meta"] = JSON.parse(metadata);
        }
        return { join_ref: null, ref: null, topic, event: this.BROADCAST_EVENT, payload: data };
      }
      _isArrayBuffer(buffer) {
        var _a;
        return buffer instanceof ArrayBuffer || ((_a = buffer === null || buffer === void 0 ? void 0 : buffer.constructor) === null || _a === void 0 ? void 0 : _a.name) === "ArrayBuffer";
      }
      _pick(obj, keys) {
        if (!obj || typeof obj !== "object") {
          return {};
        }
        return Object.fromEntries(Object.entries(obj).filter(([key]) => keys.includes(key)));
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/timer.js
var Timer;
var init_timer = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/timer.js"() {
    Timer = class {
      constructor(callback, timerCalc) {
        this.callback = callback;
        this.timerCalc = timerCalc;
        this.timer = void 0;
        this.tries = 0;
        this.callback = callback;
        this.timerCalc = timerCalc;
      }
      reset() {
        this.tries = 0;
        clearTimeout(this.timer);
        this.timer = void 0;
      }
      // Cancels any previous scheduleTimeout and schedules callback
      scheduleTimeout() {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.tries = this.tries + 1;
          this.callback();
        }, this.timerCalc(this.tries + 1));
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/transformers.js
var PostgresTypes, convertChangeData, convertColumn, convertCell, noop, toBoolean, toNumber, toJson, toArray, toTimestampString, httpEndpointURL;
var init_transformers = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/transformers.js"() {
    (function(PostgresTypes2) {
      PostgresTypes2["abstime"] = "abstime";
      PostgresTypes2["bool"] = "bool";
      PostgresTypes2["date"] = "date";
      PostgresTypes2["daterange"] = "daterange";
      PostgresTypes2["float4"] = "float4";
      PostgresTypes2["float8"] = "float8";
      PostgresTypes2["int2"] = "int2";
      PostgresTypes2["int4"] = "int4";
      PostgresTypes2["int4range"] = "int4range";
      PostgresTypes2["int8"] = "int8";
      PostgresTypes2["int8range"] = "int8range";
      PostgresTypes2["json"] = "json";
      PostgresTypes2["jsonb"] = "jsonb";
      PostgresTypes2["money"] = "money";
      PostgresTypes2["numeric"] = "numeric";
      PostgresTypes2["oid"] = "oid";
      PostgresTypes2["reltime"] = "reltime";
      PostgresTypes2["text"] = "text";
      PostgresTypes2["time"] = "time";
      PostgresTypes2["timestamp"] = "timestamp";
      PostgresTypes2["timestamptz"] = "timestamptz";
      PostgresTypes2["timetz"] = "timetz";
      PostgresTypes2["tsrange"] = "tsrange";
      PostgresTypes2["tstzrange"] = "tstzrange";
    })(PostgresTypes || (PostgresTypes = {}));
    convertChangeData = (columns, record, options = {}) => {
      var _a;
      const skipTypes = (_a = options.skipTypes) !== null && _a !== void 0 ? _a : [];
      if (!record) {
        return {};
      }
      return Object.keys(record).reduce((acc, rec_key) => {
        acc[rec_key] = convertColumn(rec_key, columns, record, skipTypes);
        return acc;
      }, {});
    };
    convertColumn = (columnName, columns, record, skipTypes) => {
      const column = columns.find((x) => x.name === columnName);
      const colType = column === null || column === void 0 ? void 0 : column.type;
      const value = record[columnName];
      if (colType && !skipTypes.includes(colType)) {
        return convertCell(colType, value);
      }
      return noop(value);
    };
    convertCell = (type, value) => {
      if (type.charAt(0) === "_") {
        const dataType = type.slice(1, type.length);
        return toArray(value, dataType);
      }
      switch (type) {
        case PostgresTypes.bool:
          return toBoolean(value);
        case PostgresTypes.float4:
        case PostgresTypes.float8:
        case PostgresTypes.int2:
        case PostgresTypes.int4:
        case PostgresTypes.int8:
        case PostgresTypes.numeric:
        case PostgresTypes.oid:
          return toNumber(value);
        case PostgresTypes.json:
        case PostgresTypes.jsonb:
          return toJson(value);
        case PostgresTypes.timestamp:
          return toTimestampString(value);
        // Format to be consistent with PostgREST
        case PostgresTypes.abstime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.date:
        // To allow users to cast it based on Timezone
        case PostgresTypes.daterange:
        case PostgresTypes.int4range:
        case PostgresTypes.int8range:
        case PostgresTypes.money:
        case PostgresTypes.reltime:
        // To allow users to cast it based on Timezone
        case PostgresTypes.text:
        case PostgresTypes.time:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timestamptz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.timetz:
        // To allow users to cast it based on Timezone
        case PostgresTypes.tsrange:
        case PostgresTypes.tstzrange:
          return noop(value);
        default:
          return noop(value);
      }
    };
    noop = (value) => {
      return value;
    };
    toBoolean = (value) => {
      switch (value) {
        case "t":
          return true;
        case "f":
          return false;
        default:
          return value;
      }
    };
    toNumber = (value) => {
      if (typeof value === "string") {
        const parsedValue = parseFloat(value);
        if (!Number.isNaN(parsedValue)) {
          return parsedValue;
        }
      }
      return value;
    };
    toJson = (value) => {
      if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch (_a) {
          return value;
        }
      }
      return value;
    };
    toArray = (value, type) => {
      if (typeof value !== "string") {
        return value;
      }
      const lastIdx = value.length - 1;
      const closeBrace = value[lastIdx];
      const openBrace = value[0];
      if (openBrace === "{" && closeBrace === "}") {
        let arr;
        const valTrim = value.slice(1, lastIdx);
        try {
          arr = JSON.parse("[" + valTrim + "]");
        } catch (_) {
          arr = valTrim ? valTrim.split(",") : [];
        }
        return arr.map((val) => convertCell(type, val));
      }
      return value;
    };
    toTimestampString = (value) => {
      if (typeof value === "string") {
        return value.replace(" ", "T");
      }
      return value;
    };
    httpEndpointURL = (socketUrl) => {
      const wsUrl = new URL(socketUrl);
      wsUrl.protocol = wsUrl.protocol.replace(/^ws/i, "http");
      wsUrl.pathname = wsUrl.pathname.replace(/\/+$/, "").replace(/\/socket\/websocket$/i, "").replace(/\/socket$/i, "").replace(/\/websocket$/i, "");
      if (wsUrl.pathname === "" || wsUrl.pathname === "/") {
        wsUrl.pathname = "/api/broadcast";
      } else {
        wsUrl.pathname = wsUrl.pathname + "/api/broadcast";
      }
      return wsUrl.href;
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/lib/push.js
var Push;
var init_push = __esm({
  "node_modules/@supabase/realtime-js/dist/module/lib/push.js"() {
    init_constants();
    Push = class {
      /**
       * Initializes the Push
       *
       * @param channel The Channel
       * @param event The event, for example `"phx_join"`
       * @param payload The payload, for example `{user_id: 123}`
       * @param timeout The push timeout in milliseconds
       */
      constructor(channel, event, payload = {}, timeout = DEFAULT_TIMEOUT) {
        this.channel = channel;
        this.event = event;
        this.payload = payload;
        this.timeout = timeout;
        this.sent = false;
        this.timeoutTimer = void 0;
        this.ref = "";
        this.receivedResp = null;
        this.recHooks = [];
        this.refEvent = null;
      }
      resend(timeout) {
        this.timeout = timeout;
        this._cancelRefEvent();
        this.ref = "";
        this.refEvent = null;
        this.receivedResp = null;
        this.sent = false;
        this.send();
      }
      send() {
        if (this._hasReceived("timeout")) {
          return;
        }
        this.startTimeout();
        this.sent = true;
        this.channel.socket.push({
          topic: this.channel.topic,
          event: this.event,
          payload: this.payload,
          ref: this.ref,
          join_ref: this.channel._joinRef()
        });
      }
      updatePayload(payload) {
        this.payload = Object.assign(Object.assign({}, this.payload), payload);
      }
      receive(status, callback) {
        var _a;
        if (this._hasReceived(status)) {
          callback((_a = this.receivedResp) === null || _a === void 0 ? void 0 : _a.response);
        }
        this.recHooks.push({ status, callback });
        return this;
      }
      startTimeout() {
        if (this.timeoutTimer) {
          return;
        }
        this.ref = this.channel.socket._makeRef();
        this.refEvent = this.channel._replyEventName(this.ref);
        const callback = (payload) => {
          this._cancelRefEvent();
          this._cancelTimeout();
          this.receivedResp = payload;
          this._matchReceive(payload);
        };
        this.channel._on(this.refEvent, {}, callback);
        this.timeoutTimer = setTimeout(() => {
          this.trigger("timeout", {});
        }, this.timeout);
      }
      trigger(status, response) {
        if (this.refEvent)
          this.channel._trigger(this.refEvent, { status, response });
      }
      destroy() {
        this._cancelRefEvent();
        this._cancelTimeout();
      }
      _cancelRefEvent() {
        if (!this.refEvent) {
          return;
        }
        this.channel._off(this.refEvent, {});
      }
      _cancelTimeout() {
        clearTimeout(this.timeoutTimer);
        this.timeoutTimer = void 0;
      }
      _matchReceive({ status, response }) {
        this.recHooks.filter((h) => h.status === status).forEach((h) => h.callback(response));
      }
      _hasReceived(status) {
        return this.receivedResp && this.receivedResp.status === status;
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/RealtimePresence.js
var REALTIME_PRESENCE_LISTEN_EVENTS, RealtimePresence;
var init_RealtimePresence = __esm({
  "node_modules/@supabase/realtime-js/dist/module/RealtimePresence.js"() {
    (function(REALTIME_PRESENCE_LISTEN_EVENTS2) {
      REALTIME_PRESENCE_LISTEN_EVENTS2["SYNC"] = "sync";
      REALTIME_PRESENCE_LISTEN_EVENTS2["JOIN"] = "join";
      REALTIME_PRESENCE_LISTEN_EVENTS2["LEAVE"] = "leave";
    })(REALTIME_PRESENCE_LISTEN_EVENTS || (REALTIME_PRESENCE_LISTEN_EVENTS = {}));
    RealtimePresence = class _RealtimePresence {
      /**
       * Creates a Presence helper that keeps the local presence state in sync with the server.
       *
       * @param channel - The realtime channel to bind to.
       * @param opts - Optional custom event names, e.g. `{ events: { state: 'state', diff: 'diff' } }`.
       *
       * @example
       * ```ts
       * const presence = new RealtimePresence(channel)
       *
       * channel.on('presence', ({ event, key }) => {
       *   console.log(`Presence ${event} on ${key}`)
       * })
       * ```
       */
      constructor(channel, opts) {
        this.channel = channel;
        this.state = {};
        this.pendingDiffs = [];
        this.joinRef = null;
        this.enabled = false;
        this.caller = {
          onJoin: () => {
          },
          onLeave: () => {
          },
          onSync: () => {
          }
        };
        const events = (opts === null || opts === void 0 ? void 0 : opts.events) || {
          state: "presence_state",
          diff: "presence_diff"
        };
        this.channel._on(events.state, {}, (newState) => {
          const { onJoin, onLeave, onSync } = this.caller;
          this.joinRef = this.channel._joinRef();
          this.state = _RealtimePresence.syncState(this.state, newState, onJoin, onLeave);
          this.pendingDiffs.forEach((diff) => {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
          });
          this.pendingDiffs = [];
          onSync();
        });
        this.channel._on(events.diff, {}, (diff) => {
          const { onJoin, onLeave, onSync } = this.caller;
          if (this.inPendingSyncState()) {
            this.pendingDiffs.push(diff);
          } else {
            this.state = _RealtimePresence.syncDiff(this.state, diff, onJoin, onLeave);
            onSync();
          }
        });
        this.onJoin((key, currentPresences, newPresences) => {
          this.channel._trigger("presence", {
            event: "join",
            key,
            currentPresences,
            newPresences
          });
        });
        this.onLeave((key, currentPresences, leftPresences) => {
          this.channel._trigger("presence", {
            event: "leave",
            key,
            currentPresences,
            leftPresences
          });
        });
        this.onSync(() => {
          this.channel._trigger("presence", { event: "sync" });
        });
      }
      /**
       * Used to sync the list of presences on the server with the
       * client's state.
       *
       * An optional `onJoin` and `onLeave` callback can be provided to
       * react to changes in the client's local presences across
       * disconnects and reconnects with the server.
       *
       * @internal
       */
      static syncState(currentState, newState, onJoin, onLeave) {
        const state = this.cloneDeep(currentState);
        const transformedState = this.transformState(newState);
        const joins = {};
        const leaves = {};
        this.map(state, (key, presences) => {
          if (!transformedState[key]) {
            leaves[key] = presences;
          }
        });
        this.map(transformedState, (key, newPresences) => {
          const currentPresences = state[key];
          if (currentPresences) {
            const newPresenceRefs = newPresences.map((m) => m.presence_ref);
            const curPresenceRefs = currentPresences.map((m) => m.presence_ref);
            const joinedPresences = newPresences.filter((m) => curPresenceRefs.indexOf(m.presence_ref) < 0);
            const leftPresences = currentPresences.filter((m) => newPresenceRefs.indexOf(m.presence_ref) < 0);
            if (joinedPresences.length > 0) {
              joins[key] = joinedPresences;
            }
            if (leftPresences.length > 0) {
              leaves[key] = leftPresences;
            }
          } else {
            joins[key] = newPresences;
          }
        });
        return this.syncDiff(state, { joins, leaves }, onJoin, onLeave);
      }
      /**
       * Used to sync a diff of presence join and leave events from the
       * server, as they happen.
       *
       * Like `syncState`, `syncDiff` accepts optional `onJoin` and
       * `onLeave` callbacks to react to a user joining or leaving from a
       * device.
       *
       * @internal
       */
      static syncDiff(state, diff, onJoin, onLeave) {
        const { joins, leaves } = {
          joins: this.transformState(diff.joins),
          leaves: this.transformState(diff.leaves)
        };
        if (!onJoin) {
          onJoin = () => {
          };
        }
        if (!onLeave) {
          onLeave = () => {
          };
        }
        this.map(joins, (key, newPresences) => {
          var _a;
          const currentPresences = (_a = state[key]) !== null && _a !== void 0 ? _a : [];
          state[key] = this.cloneDeep(newPresences);
          if (currentPresences.length > 0) {
            const joinedPresenceRefs = state[key].map((m) => m.presence_ref);
            const curPresences = currentPresences.filter((m) => joinedPresenceRefs.indexOf(m.presence_ref) < 0);
            state[key].unshift(...curPresences);
          }
          onJoin(key, currentPresences, newPresences);
        });
        this.map(leaves, (key, leftPresences) => {
          let currentPresences = state[key];
          if (!currentPresences)
            return;
          const presenceRefsToRemove = leftPresences.map((m) => m.presence_ref);
          currentPresences = currentPresences.filter((m) => presenceRefsToRemove.indexOf(m.presence_ref) < 0);
          state[key] = currentPresences;
          onLeave(key, currentPresences, leftPresences);
          if (currentPresences.length === 0)
            delete state[key];
        });
        return state;
      }
      /** @internal */
      static map(obj, func) {
        return Object.getOwnPropertyNames(obj).map((key) => func(key, obj[key]));
      }
      /**
       * Remove 'metas' key
       * Change 'phx_ref' to 'presence_ref'
       * Remove 'phx_ref' and 'phx_ref_prev'
       *
       * @example
       * // returns {
       *  abc123: [
       *    { presence_ref: '2', user_id: 1 },
       *    { presence_ref: '3', user_id: 2 }
       *  ]
       * }
       * RealtimePresence.transformState({
       *  abc123: {
       *    metas: [
       *      { phx_ref: '2', phx_ref_prev: '1' user_id: 1 },
       *      { phx_ref: '3', user_id: 2 }
       *    ]
       *  }
       * })
       *
       * @internal
       */
      static transformState(state) {
        state = this.cloneDeep(state);
        return Object.getOwnPropertyNames(state).reduce((newState, key) => {
          const presences = state[key];
          if ("metas" in presences) {
            newState[key] = presences.metas.map((presence) => {
              presence["presence_ref"] = presence["phx_ref"];
              delete presence["phx_ref"];
              delete presence["phx_ref_prev"];
              return presence;
            });
          } else {
            newState[key] = presences;
          }
          return newState;
        }, {});
      }
      /** @internal */
      static cloneDeep(obj) {
        return JSON.parse(JSON.stringify(obj));
      }
      /** @internal */
      onJoin(callback) {
        this.caller.onJoin = callback;
      }
      /** @internal */
      onLeave(callback) {
        this.caller.onLeave = callback;
      }
      /** @internal */
      onSync(callback) {
        this.caller.onSync = callback;
      }
      /** @internal */
      inPendingSyncState() {
        return !this.joinRef || this.joinRef !== this.channel._joinRef();
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.js
var REALTIME_POSTGRES_CHANGES_LISTEN_EVENT, REALTIME_LISTEN_TYPES, REALTIME_SUBSCRIBE_STATES, RealtimeChannel;
var init_RealtimeChannel = __esm({
  "node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.js"() {
    init_constants();
    init_push();
    init_timer();
    init_RealtimePresence();
    init_transformers();
    init_transformers();
    (function(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2) {
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["ALL"] = "*";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["INSERT"] = "INSERT";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["UPDATE"] = "UPDATE";
      REALTIME_POSTGRES_CHANGES_LISTEN_EVENT2["DELETE"] = "DELETE";
    })(REALTIME_POSTGRES_CHANGES_LISTEN_EVENT || (REALTIME_POSTGRES_CHANGES_LISTEN_EVENT = {}));
    (function(REALTIME_LISTEN_TYPES2) {
      REALTIME_LISTEN_TYPES2["BROADCAST"] = "broadcast";
      REALTIME_LISTEN_TYPES2["PRESENCE"] = "presence";
      REALTIME_LISTEN_TYPES2["POSTGRES_CHANGES"] = "postgres_changes";
      REALTIME_LISTEN_TYPES2["SYSTEM"] = "system";
    })(REALTIME_LISTEN_TYPES || (REALTIME_LISTEN_TYPES = {}));
    (function(REALTIME_SUBSCRIBE_STATES2) {
      REALTIME_SUBSCRIBE_STATES2["SUBSCRIBED"] = "SUBSCRIBED";
      REALTIME_SUBSCRIBE_STATES2["TIMED_OUT"] = "TIMED_OUT";
      REALTIME_SUBSCRIBE_STATES2["CLOSED"] = "CLOSED";
      REALTIME_SUBSCRIBE_STATES2["CHANNEL_ERROR"] = "CHANNEL_ERROR";
    })(REALTIME_SUBSCRIBE_STATES || (REALTIME_SUBSCRIBE_STATES = {}));
    RealtimeChannel = class _RealtimeChannel {
      /**
       * Creates a channel that can broadcast messages, sync presence, and listen to Postgres changes.
       *
       * The topic determines which realtime stream you are subscribing to. Config options let you
       * enable acknowledgement for broadcasts, presence tracking, or private channels.
       *
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * const channel = new RealtimeChannel('realtime:public:messages', { config: {} }, client)
       * ```
       */
      constructor(topic, params = { config: {} }, socket) {
        var _a, _b;
        this.topic = topic;
        this.params = params;
        this.socket = socket;
        this.bindings = {};
        this.state = CHANNEL_STATES.closed;
        this.joinedOnce = false;
        this.pushBuffer = [];
        this.subTopic = topic.replace(/^realtime:/i, "");
        this.params.config = Object.assign({
          broadcast: { ack: false, self: false },
          presence: { key: "", enabled: false },
          private: false
        }, params.config);
        this.timeout = this.socket.timeout;
        this.joinPush = new Push(this, CHANNEL_EVENTS.join, this.params, this.timeout);
        this.rejoinTimer = new Timer(() => this._rejoinUntilConnected(), this.socket.reconnectAfterMs);
        this.joinPush.receive("ok", () => {
          this.state = CHANNEL_STATES.joined;
          this.rejoinTimer.reset();
          this.pushBuffer.forEach((pushEvent) => pushEvent.send());
          this.pushBuffer = [];
        });
        this._onClose(() => {
          this.rejoinTimer.reset();
          this.socket.log("channel", `close ${this.topic} ${this._joinRef()}`);
          this.state = CHANNEL_STATES.closed;
          this.socket._remove(this);
        });
        this._onError((reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("timeout", () => {
          if (!this._isJoining()) {
            return;
          }
          this.socket.log("channel", `timeout ${this.topic}`, this.joinPush.timeout);
          this.state = CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this.joinPush.receive("error", (reason) => {
          if (this._isLeaving() || this._isClosed()) {
            return;
          }
          this.socket.log("channel", `error ${this.topic}`, reason);
          this.state = CHANNEL_STATES.errored;
          this.rejoinTimer.scheduleTimeout();
        });
        this._on(CHANNEL_EVENTS.reply, {}, (payload, ref) => {
          this._trigger(this._replyEventName(ref), payload);
        });
        this.presence = new RealtimePresence(this);
        this.broadcastEndpointURL = httpEndpointURL(this.socket.endPoint);
        this.private = this.params.config.private || false;
        if (!this.private && ((_b = (_a = this.params.config) === null || _a === void 0 ? void 0 : _a.broadcast) === null || _b === void 0 ? void 0 : _b.replay)) {
          throw `tried to use replay on public channel '${this.topic}'. It must be a private channel.`;
        }
      }
      /** Subscribe registers your client with the server */
      subscribe(callback, timeout = this.timeout) {
        var _a, _b, _c;
        if (!this.socket.isConnected()) {
          this.socket.connect();
        }
        if (this.state == CHANNEL_STATES.closed) {
          const { config: { broadcast, presence, private: isPrivate } } = this.params;
          const postgres_changes = (_b = (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.map((r) => r.filter)) !== null && _b !== void 0 ? _b : [];
          const presence_enabled = !!this.bindings[REALTIME_LISTEN_TYPES.PRESENCE] && this.bindings[REALTIME_LISTEN_TYPES.PRESENCE].length > 0 || ((_c = this.params.config.presence) === null || _c === void 0 ? void 0 : _c.enabled) === true;
          const accessTokenPayload = {};
          const config = {
            broadcast,
            presence: Object.assign(Object.assign({}, presence), { enabled: presence_enabled }),
            postgres_changes,
            private: isPrivate
          };
          if (this.socket.accessTokenValue) {
            accessTokenPayload.access_token = this.socket.accessTokenValue;
          }
          this._onError((e) => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, e));
          this._onClose(() => callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CLOSED));
          this.updateJoinPayload(Object.assign({ config }, accessTokenPayload));
          this.joinedOnce = true;
          this._rejoin(timeout);
          this.joinPush.receive("ok", async ({ postgres_changes: postgres_changes2 }) => {
            var _a2;
            if (!this.socket._isManualToken()) {
              this.socket.setAuth();
            }
            if (postgres_changes2 === void 0) {
              callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              return;
            } else {
              const clientPostgresBindings = this.bindings.postgres_changes;
              const bindingsLen = (_a2 = clientPostgresBindings === null || clientPostgresBindings === void 0 ? void 0 : clientPostgresBindings.length) !== null && _a2 !== void 0 ? _a2 : 0;
              const newPostgresBindings = [];
              for (let i = 0; i < bindingsLen; i++) {
                const clientPostgresBinding = clientPostgresBindings[i];
                const { filter: { event, schema, table, filter } } = clientPostgresBinding;
                const serverPostgresFilter = postgres_changes2 && postgres_changes2[i];
                if (serverPostgresFilter && serverPostgresFilter.event === event && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.schema, schema) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.table, table) && _RealtimeChannel.isFilterValueEqual(serverPostgresFilter.filter, filter)) {
                  newPostgresBindings.push(Object.assign(Object.assign({}, clientPostgresBinding), { id: serverPostgresFilter.id }));
                } else {
                  this.unsubscribe();
                  this.state = CHANNEL_STATES.errored;
                  callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error("mismatch between server and client bindings for postgres changes"));
                  return;
                }
              }
              this.bindings.postgres_changes = newPostgresBindings;
              callback && callback(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED);
              return;
            }
          }).receive("error", (error) => {
            this.state = CHANNEL_STATES.errored;
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, new Error(JSON.stringify(Object.values(error).join(", ") || "error")));
            return;
          }).receive("timeout", () => {
            callback === null || callback === void 0 ? void 0 : callback(REALTIME_SUBSCRIBE_STATES.TIMED_OUT);
            return;
          });
        }
        return this;
      }
      /**
       * Returns the current presence state for this channel.
       *
       * The shape is a map keyed by presence key (for example a user id) where each entry contains the
       * tracked metadata for that user.
       */
      presenceState() {
        return this.presence.state;
      }
      /**
       * Sends the supplied payload to the presence tracker so other subscribers can see that this
       * client is online. Use `untrack` to stop broadcasting presence for the same key.
       */
      async track(payload, opts = {}) {
        return await this.send({
          type: "presence",
          event: "track",
          payload
        }, opts.timeout || this.timeout);
      }
      /**
       * Removes the current presence state for this client.
       */
      async untrack(opts = {}) {
        return await this.send({
          type: "presence",
          event: "untrack"
        }, opts);
      }
      on(type, filter, callback) {
        if (this.state === CHANNEL_STATES.joined && type === REALTIME_LISTEN_TYPES.PRESENCE) {
          this.socket.log("channel", `resubscribe to ${this.topic} due to change in presence callbacks on joined channel`);
          this.unsubscribe().then(async () => await this.subscribe());
        }
        return this._on(type, filter, callback);
      }
      /**
       * Sends a broadcast message explicitly via REST API.
       *
       * This method always uses the REST API endpoint regardless of WebSocket connection state.
       * Useful when you want to guarantee REST delivery or when gradually migrating from implicit REST fallback.
       *
       * @param event The name of the broadcast event
       * @param payload Payload to be sent (required)
       * @param opts Options including timeout
       * @returns Promise resolving to object with success status, and error details if failed
       */
      async httpSend(event, payload, opts = {}) {
        var _a;
        if (payload === void 0 || payload === null) {
          return Promise.reject("Payload is required for httpSend()");
        }
        const headers = {
          apikey: this.socket.apiKey ? this.socket.apiKey : "",
          "Content-Type": "application/json"
        };
        if (this.socket.accessTokenValue) {
          headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
        }
        const options = {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: [
              {
                topic: this.subTopic,
                event,
                payload,
                private: this.private
              }
            ]
          })
        };
        const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
        if (response.status === 202) {
          return { success: true };
        }
        let errorMessage = response.statusText;
        try {
          const errorBody = await response.json();
          errorMessage = errorBody.error || errorBody.message || errorMessage;
        } catch (_b) {
        }
        return Promise.reject(new Error(errorMessage));
      }
      /**
       * Sends a message into the channel.
       *
       * @param args Arguments to send to channel
       * @param args.type The type of event to send
       * @param args.event The name of the event being sent
       * @param args.payload Payload to be sent
       * @param opts Options to be used during the send process
       */
      async send(args, opts = {}) {
        var _a, _b;
        if (!this._canPush() && args.type === "broadcast") {
          console.warn("Realtime send() is automatically falling back to REST API. This behavior will be deprecated in the future. Please use httpSend() explicitly for REST delivery.");
          const { event, payload: endpoint_payload } = args;
          const headers = {
            apikey: this.socket.apiKey ? this.socket.apiKey : "",
            "Content-Type": "application/json"
          };
          if (this.socket.accessTokenValue) {
            headers["Authorization"] = `Bearer ${this.socket.accessTokenValue}`;
          }
          const options = {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: [
                {
                  topic: this.subTopic,
                  event,
                  payload: endpoint_payload,
                  private: this.private
                }
              ]
            })
          };
          try {
            const response = await this._fetchWithTimeout(this.broadcastEndpointURL, options, (_a = opts.timeout) !== null && _a !== void 0 ? _a : this.timeout);
            await ((_b = response.body) === null || _b === void 0 ? void 0 : _b.cancel());
            return response.ok ? "ok" : "error";
          } catch (error) {
            if (error.name === "AbortError") {
              return "timed out";
            } else {
              return "error";
            }
          }
        } else {
          return new Promise((resolve) => {
            var _a2, _b2, _c;
            const push = this._push(args.type, args, opts.timeout || this.timeout);
            if (args.type === "broadcast" && !((_c = (_b2 = (_a2 = this.params) === null || _a2 === void 0 ? void 0 : _a2.config) === null || _b2 === void 0 ? void 0 : _b2.broadcast) === null || _c === void 0 ? void 0 : _c.ack)) {
              resolve("ok");
            }
            push.receive("ok", () => resolve("ok"));
            push.receive("error", () => resolve("error"));
            push.receive("timeout", () => resolve("timed out"));
          });
        }
      }
      /**
       * Updates the payload that will be sent the next time the channel joins (reconnects).
       * Useful for rotating access tokens or updating config without re-creating the channel.
       */
      updateJoinPayload(payload) {
        this.joinPush.updatePayload(payload);
      }
      /**
       * Leaves the channel.
       *
       * Unsubscribes from server events, and instructs channel to terminate on server.
       * Triggers onClose() hooks.
       *
       * To receive leave acknowledgements, use the a `receive` hook to bind to the server ack, ie:
       * channel.unsubscribe().receive("ok", () => alert("left!") )
       */
      unsubscribe(timeout = this.timeout) {
        this.state = CHANNEL_STATES.leaving;
        const onClose = () => {
          this.socket.log("channel", `leave ${this.topic}`);
          this._trigger(CHANNEL_EVENTS.close, "leave", this._joinRef());
        };
        this.joinPush.destroy();
        let leavePush = null;
        return new Promise((resolve) => {
          leavePush = new Push(this, CHANNEL_EVENTS.leave, {}, timeout);
          leavePush.receive("ok", () => {
            onClose();
            resolve("ok");
          }).receive("timeout", () => {
            onClose();
            resolve("timed out");
          }).receive("error", () => {
            resolve("error");
          });
          leavePush.send();
          if (!this._canPush()) {
            leavePush.trigger("ok", {});
          }
        }).finally(() => {
          leavePush === null || leavePush === void 0 ? void 0 : leavePush.destroy();
        });
      }
      /**
       * Teardown the channel.
       *
       * Destroys and stops related timers.
       */
      teardown() {
        this.pushBuffer.forEach((push) => push.destroy());
        this.pushBuffer = [];
        this.rejoinTimer.reset();
        this.joinPush.destroy();
        this.state = CHANNEL_STATES.closed;
        this.bindings = {};
      }
      /** @internal */
      async _fetchWithTimeout(url, options, timeout) {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        const response = await this.socket.fetch(url, Object.assign(Object.assign({}, options), { signal: controller.signal }));
        clearTimeout(id);
        return response;
      }
      /** @internal */
      _push(event, payload, timeout = this.timeout) {
        if (!this.joinedOnce) {
          throw `tried to push '${event}' to '${this.topic}' before joining. Use channel.subscribe() before pushing events`;
        }
        let pushEvent = new Push(this, event, payload, timeout);
        if (this._canPush()) {
          pushEvent.send();
        } else {
          this._addToPushBuffer(pushEvent);
        }
        return pushEvent;
      }
      /** @internal */
      _addToPushBuffer(pushEvent) {
        pushEvent.startTimeout();
        this.pushBuffer.push(pushEvent);
        if (this.pushBuffer.length > MAX_PUSH_BUFFER_SIZE) {
          const removedPush = this.pushBuffer.shift();
          if (removedPush) {
            removedPush.destroy();
            this.socket.log("channel", `discarded push due to buffer overflow: ${removedPush.event}`, removedPush.payload);
          }
        }
      }
      /**
       * Overridable message hook
       *
       * Receives all events for specialized message handling before dispatching to the channel callbacks.
       * Must return the payload, modified or unmodified.
       *
       * @internal
       */
      _onMessage(_event, payload, _ref) {
        return payload;
      }
      /** @internal */
      _isMember(topic) {
        return this.topic === topic;
      }
      /** @internal */
      _joinRef() {
        return this.joinPush.ref;
      }
      /** @internal */
      _trigger(type, payload, ref) {
        var _a, _b;
        const typeLower = type.toLocaleLowerCase();
        const { close, error, leave, join } = CHANNEL_EVENTS;
        const events = [close, error, leave, join];
        if (ref && events.indexOf(typeLower) >= 0 && ref !== this._joinRef()) {
          return;
        }
        let handledPayload = this._onMessage(typeLower, payload, ref);
        if (payload && !handledPayload) {
          throw "channel onMessage callbacks must return the payload, modified or unmodified";
        }
        if (["insert", "update", "delete"].includes(typeLower)) {
          (_a = this.bindings.postgres_changes) === null || _a === void 0 ? void 0 : _a.filter((bind) => {
            var _a2, _b2, _c;
            return ((_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event) === "*" || ((_c = (_b2 = bind.filter) === null || _b2 === void 0 ? void 0 : _b2.event) === null || _c === void 0 ? void 0 : _c.toLocaleLowerCase()) === typeLower;
          }).map((bind) => bind.callback(handledPayload, ref));
        } else {
          (_b = this.bindings[typeLower]) === null || _b === void 0 ? void 0 : _b.filter((bind) => {
            var _a2, _b2, _c, _d, _e, _f;
            if (["broadcast", "presence", "postgres_changes"].includes(typeLower)) {
              if ("id" in bind) {
                const bindId = bind.id;
                const bindEvent = (_a2 = bind.filter) === null || _a2 === void 0 ? void 0 : _a2.event;
                return bindId && ((_b2 = payload.ids) === null || _b2 === void 0 ? void 0 : _b2.includes(bindId)) && (bindEvent === "*" || (bindEvent === null || bindEvent === void 0 ? void 0 : bindEvent.toLocaleLowerCase()) === ((_c = payload.data) === null || _c === void 0 ? void 0 : _c.type.toLocaleLowerCase()));
              } else {
                const bindEvent = (_e = (_d = bind === null || bind === void 0 ? void 0 : bind.filter) === null || _d === void 0 ? void 0 : _d.event) === null || _e === void 0 ? void 0 : _e.toLocaleLowerCase();
                return bindEvent === "*" || bindEvent === ((_f = payload === null || payload === void 0 ? void 0 : payload.event) === null || _f === void 0 ? void 0 : _f.toLocaleLowerCase());
              }
            } else {
              return bind.type.toLocaleLowerCase() === typeLower;
            }
          }).map((bind) => {
            if (typeof handledPayload === "object" && "ids" in handledPayload) {
              const postgresChanges = handledPayload.data;
              const { schema, table, commit_timestamp, type: type2, errors } = postgresChanges;
              const enrichedPayload = {
                schema,
                table,
                commit_timestamp,
                eventType: type2,
                new: {},
                old: {},
                errors
              };
              handledPayload = Object.assign(Object.assign({}, enrichedPayload), this._getPayloadRecords(postgresChanges));
            }
            bind.callback(handledPayload, ref);
          });
        }
      }
      /** @internal */
      _isClosed() {
        return this.state === CHANNEL_STATES.closed;
      }
      /** @internal */
      _isJoined() {
        return this.state === CHANNEL_STATES.joined;
      }
      /** @internal */
      _isJoining() {
        return this.state === CHANNEL_STATES.joining;
      }
      /** @internal */
      _isLeaving() {
        return this.state === CHANNEL_STATES.leaving;
      }
      /** @internal */
      _replyEventName(ref) {
        return `chan_reply_${ref}`;
      }
      /** @internal */
      _on(type, filter, callback) {
        const typeLower = type.toLocaleLowerCase();
        const binding = {
          type: typeLower,
          filter,
          callback
        };
        if (this.bindings[typeLower]) {
          this.bindings[typeLower].push(binding);
        } else {
          this.bindings[typeLower] = [binding];
        }
        return this;
      }
      /** @internal */
      _off(type, filter) {
        const typeLower = type.toLocaleLowerCase();
        if (this.bindings[typeLower]) {
          this.bindings[typeLower] = this.bindings[typeLower].filter((bind) => {
            var _a;
            return !(((_a = bind.type) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase()) === typeLower && _RealtimeChannel.isEqual(bind.filter, filter));
          });
        }
        return this;
      }
      /** @internal */
      static isEqual(obj1, obj2) {
        if (Object.keys(obj1).length !== Object.keys(obj2).length) {
          return false;
        }
        for (const k in obj1) {
          if (obj1[k] !== obj2[k]) {
            return false;
          }
        }
        return true;
      }
      /**
       * Compares two optional filter values for equality.
       * Treats undefined, null, and empty string as equivalent empty values.
       * @internal
       */
      static isFilterValueEqual(serverValue, clientValue) {
        const normalizedServer = serverValue !== null && serverValue !== void 0 ? serverValue : void 0;
        const normalizedClient = clientValue !== null && clientValue !== void 0 ? clientValue : void 0;
        return normalizedServer === normalizedClient;
      }
      /** @internal */
      _rejoinUntilConnected() {
        this.rejoinTimer.scheduleTimeout();
        if (this.socket.isConnected()) {
          this._rejoin();
        }
      }
      /**
       * Registers a callback that will be executed when the channel closes.
       *
       * @internal
       */
      _onClose(callback) {
        this._on(CHANNEL_EVENTS.close, {}, callback);
      }
      /**
       * Registers a callback that will be executed when the channel encounteres an error.
       *
       * @internal
       */
      _onError(callback) {
        this._on(CHANNEL_EVENTS.error, {}, (reason) => callback(reason));
      }
      /**
       * Returns `true` if the socket is connected and the channel has been joined.
       *
       * @internal
       */
      _canPush() {
        return this.socket.isConnected() && this._isJoined();
      }
      /** @internal */
      _rejoin(timeout = this.timeout) {
        if (this._isLeaving()) {
          return;
        }
        this.socket._leaveOpenTopic(this.topic);
        this.state = CHANNEL_STATES.joining;
        this.joinPush.resend(timeout);
      }
      /** @internal */
      _getPayloadRecords(payload) {
        const records = {
          new: {},
          old: {}
        };
        if (payload.type === "INSERT" || payload.type === "UPDATE") {
          records.new = convertChangeData(payload.columns, payload.record);
        }
        if (payload.type === "UPDATE" || payload.type === "DELETE") {
          records.old = convertChangeData(payload.columns, payload.old_record);
        }
        return records;
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js
var noop2, CONNECTION_TIMEOUTS, RECONNECT_INTERVALS, DEFAULT_RECONNECT_FALLBACK, WORKER_SCRIPT, RealtimeClient;
var init_RealtimeClient = __esm({
  "node_modules/@supabase/realtime-js/dist/module/RealtimeClient.js"() {
    init_websocket_factory();
    init_constants();
    init_serializer();
    init_timer();
    init_transformers();
    init_RealtimeChannel();
    noop2 = () => {
    };
    CONNECTION_TIMEOUTS = {
      HEARTBEAT_INTERVAL: 25e3,
      RECONNECT_DELAY: 10,
      HEARTBEAT_TIMEOUT_FALLBACK: 100
    };
    RECONNECT_INTERVALS = [1e3, 2e3, 5e3, 1e4];
    DEFAULT_RECONNECT_FALLBACK = 1e4;
    WORKER_SCRIPT = `
  addEventListener("message", (e) => {
    if (e.data.event === "start") {
      setInterval(() => postMessage({ event: "keepAlive" }), e.data.interval);
    }
  });`;
    RealtimeClient = class {
      /**
       * Initializes the Socket.
       *
       * @param endPoint The string WebSocket endpoint, ie, "ws://example.com/socket", "wss://example.com", "/socket" (inherited host & protocol)
       * @param httpEndpoint The string HTTP endpoint, ie, "https://example.com", "/" (inherited host & protocol)
       * @param options.transport The Websocket Transport, for example WebSocket. This can be a custom implementation
       * @param options.timeout The default timeout in milliseconds to trigger push timeouts.
       * @param options.params The optional params to pass when connecting.
       * @param options.headers Deprecated: headers cannot be set on websocket connections and this option will be removed in the future.
       * @param options.heartbeatIntervalMs The millisec interval to send a heartbeat message.
       * @param options.heartbeatCallback The optional function to handle heartbeat status and latency.
       * @param options.logger The optional function for specialized logging, ie: logger: (kind, msg, data) => { console.log(`${kind}: ${msg}`, data) }
       * @param options.logLevel Sets the log level for Realtime
       * @param options.encode The function to encode outgoing messages. Defaults to JSON: (payload, callback) => callback(JSON.stringify(payload))
       * @param options.decode The function to decode incoming messages. Defaults to Serializer's decode.
       * @param options.reconnectAfterMs he optional function that returns the millsec reconnect interval. Defaults to stepped backoff off.
       * @param options.worker Use Web Worker to set a side flow. Defaults to false.
       * @param options.workerUrl The URL of the worker script. Defaults to https://realtime.supabase.com/worker.js that includes a heartbeat event call to keep the connection alive.
       * @param options.vsn The protocol version to use when connecting. Supported versions are "1.0.0" and "2.0.0". Defaults to "2.0.0".
       * @example
       * ```ts
       * import RealtimeClient from '@supabase/realtime-js'
       *
       * const client = new RealtimeClient('https://xyzcompany.supabase.co/realtime/v1', {
       *   params: { apikey: 'public-anon-key' },
       * })
       * client.connect()
       * ```
       */
      constructor(endPoint, options) {
        var _a;
        this.accessTokenValue = null;
        this.apiKey = null;
        this._manuallySetToken = false;
        this.channels = new Array();
        this.endPoint = "";
        this.httpEndpoint = "";
        this.headers = {};
        this.params = {};
        this.timeout = DEFAULT_TIMEOUT;
        this.transport = null;
        this.heartbeatIntervalMs = CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.heartbeatTimer = void 0;
        this.pendingHeartbeatRef = null;
        this.heartbeatCallback = noop2;
        this.ref = 0;
        this.reconnectTimer = null;
        this.vsn = DEFAULT_VSN;
        this.logger = noop2;
        this.conn = null;
        this.sendBuffer = [];
        this.serializer = new Serializer();
        this.stateChangeCallbacks = {
          open: [],
          close: [],
          error: [],
          message: []
        };
        this.accessToken = null;
        this._connectionState = "disconnected";
        this._wasManualDisconnect = false;
        this._authPromise = null;
        this._heartbeatSentAt = null;
        this._resolveFetch = (customFetch) => {
          if (customFetch) {
            return (...args) => customFetch(...args);
          }
          return (...args) => fetch(...args);
        };
        if (!((_a = options === null || options === void 0 ? void 0 : options.params) === null || _a === void 0 ? void 0 : _a.apikey)) {
          throw new Error("API key is required to connect to Realtime");
        }
        this.apiKey = options.params.apikey;
        this.endPoint = `${endPoint}/${TRANSPORTS.websocket}`;
        this.httpEndpoint = httpEndpointURL(endPoint);
        this._initializeOptions(options);
        this._setupReconnectionTimer();
        this.fetch = this._resolveFetch(options === null || options === void 0 ? void 0 : options.fetch);
      }
      /**
       * Connects the socket, unless already connected.
       */
      connect() {
        if (this.isConnecting() || this.isDisconnecting() || this.conn !== null && this.isConnected()) {
          return;
        }
        this._setConnectionState("connecting");
        if (this.accessToken && !this._authPromise) {
          this._setAuthSafely("connect");
        }
        if (this.transport) {
          this.conn = new this.transport(this.endpointURL());
        } else {
          try {
            this.conn = websocket_factory_default.createWebSocket(this.endpointURL());
          } catch (error) {
            this._setConnectionState("disconnected");
            const errorMessage = error.message;
            if (errorMessage.includes("Node.js")) {
              throw new Error(`${errorMessage}

To use Realtime in Node.js, you need to provide a WebSocket implementation:

Option 1: Use Node.js 22+ which has native WebSocket support
Option 2: Install and provide the "ws" package:

  npm install ws

  import ws from "ws"
  const client = new RealtimeClient(url, {
    ...options,
    transport: ws
  })`);
            }
            throw new Error(`WebSocket not available: ${errorMessage}`);
          }
        }
        this._setupConnectionHandlers();
      }
      /**
       * Returns the URL of the websocket.
       * @returns string The URL of the websocket.
       */
      endpointURL() {
        return this._appendParams(this.endPoint, Object.assign({}, this.params, { vsn: this.vsn }));
      }
      /**
       * Disconnects the socket.
       *
       * @param code A numeric status code to send on disconnect.
       * @param reason A custom reason for the disconnect.
       */
      disconnect(code, reason) {
        if (this.isDisconnecting()) {
          return;
        }
        this._setConnectionState("disconnecting", true);
        if (this.conn) {
          const fallbackTimer = setTimeout(() => {
            this._setConnectionState("disconnected");
          }, 100);
          this.conn.onclose = () => {
            clearTimeout(fallbackTimer);
            this._setConnectionState("disconnected");
          };
          if (typeof this.conn.close === "function") {
            if (code) {
              this.conn.close(code, reason !== null && reason !== void 0 ? reason : "");
            } else {
              this.conn.close();
            }
          }
          this._teardownConnection();
        } else {
          this._setConnectionState("disconnected");
        }
      }
      /**
       * Returns all created channels
       */
      getChannels() {
        return this.channels;
      }
      /**
       * Unsubscribes and removes a single channel
       * @param channel A RealtimeChannel instance
       */
      async removeChannel(channel) {
        const status = await channel.unsubscribe();
        if (this.channels.length === 0) {
          this.disconnect();
        }
        return status;
      }
      /**
       * Unsubscribes and removes all channels
       */
      async removeAllChannels() {
        const values_1 = await Promise.all(this.channels.map((channel) => channel.unsubscribe()));
        this.channels = [];
        this.disconnect();
        return values_1;
      }
      /**
       * Logs the message.
       *
       * For customized logging, `this.logger` can be overridden.
       */
      log(kind, msg, data) {
        this.logger(kind, msg, data);
      }
      /**
       * Returns the current state of the socket.
       */
      connectionState() {
        switch (this.conn && this.conn.readyState) {
          case SOCKET_STATES.connecting:
            return CONNECTION_STATE.Connecting;
          case SOCKET_STATES.open:
            return CONNECTION_STATE.Open;
          case SOCKET_STATES.closing:
            return CONNECTION_STATE.Closing;
          default:
            return CONNECTION_STATE.Closed;
        }
      }
      /**
       * Returns `true` is the connection is open.
       */
      isConnected() {
        return this.connectionState() === CONNECTION_STATE.Open;
      }
      /**
       * Returns `true` if the connection is currently connecting.
       */
      isConnecting() {
        return this._connectionState === "connecting";
      }
      /**
       * Returns `true` if the connection is currently disconnecting.
       */
      isDisconnecting() {
        return this._connectionState === "disconnecting";
      }
      /**
       * Creates (or reuses) a {@link RealtimeChannel} for the provided topic.
       *
       * Topics are automatically prefixed with `realtime:` to match the Realtime service.
       * If a channel with the same topic already exists it will be returned instead of creating
       * a duplicate connection.
       */
      channel(topic, params = { config: {} }) {
        const realtimeTopic = `realtime:${topic}`;
        const exists = this.getChannels().find((c) => c.topic === realtimeTopic);
        if (!exists) {
          const chan = new RealtimeChannel(`realtime:${topic}`, params, this);
          this.channels.push(chan);
          return chan;
        } else {
          return exists;
        }
      }
      /**
       * Push out a message if the socket is connected.
       *
       * If the socket is not connected, the message gets enqueued within a local buffer, and sent out when a connection is next established.
       */
      push(data) {
        const { topic, event, payload, ref } = data;
        const callback = () => {
          this.encode(data, (result) => {
            var _a;
            (_a = this.conn) === null || _a === void 0 ? void 0 : _a.send(result);
          });
        };
        this.log("push", `${topic} ${event} (${ref})`, payload);
        if (this.isConnected()) {
          callback();
        } else {
          this.sendBuffer.push(callback);
        }
      }
      /**
       * Sets the JWT access token used for channel subscription authorization and Realtime RLS.
       *
       * If param is null it will use the `accessToken` callback function or the token set on the client.
       *
       * On callback used, it will set the value of the token internal to the client.
       *
       * When a token is explicitly provided, it will be preserved across channel operations
       * (including removeChannel and resubscribe). The `accessToken` callback will not be
       * invoked until `setAuth()` is called without arguments.
       *
       * @param token A JWT string to override the token set on the client.
       *
       * @example
       * // Use a manual token (preserved across resubscribes, ignores accessToken callback)
       * client.realtime.setAuth('my-custom-jwt')
       *
       * // Switch back to using the accessToken callback
       * client.realtime.setAuth()
       */
      async setAuth(token = null) {
        this._authPromise = this._performAuth(token);
        try {
          await this._authPromise;
        } finally {
          this._authPromise = null;
        }
      }
      /**
       * Returns true if the current access token was explicitly set via setAuth(token),
       * false if it was obtained via the accessToken callback.
       * @internal
       */
      _isManualToken() {
        return this._manuallySetToken;
      }
      /**
       * Sends a heartbeat message if the socket is connected.
       */
      async sendHeartbeat() {
        var _a;
        if (!this.isConnected()) {
          try {
            this.heartbeatCallback("disconnected");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          return;
        }
        if (this.pendingHeartbeatRef) {
          this.pendingHeartbeatRef = null;
          this._heartbeatSentAt = null;
          this.log("transport", "heartbeat timeout. Attempting to re-establish connection");
          try {
            this.heartbeatCallback("timeout");
          } catch (e) {
            this.log("error", "error in heartbeat callback", e);
          }
          this._wasManualDisconnect = false;
          (_a = this.conn) === null || _a === void 0 ? void 0 : _a.close(WS_CLOSE_NORMAL, "heartbeat timeout");
          setTimeout(() => {
            var _a2;
            if (!this.isConnected()) {
              (_a2 = this.reconnectTimer) === null || _a2 === void 0 ? void 0 : _a2.scheduleTimeout();
            }
          }, CONNECTION_TIMEOUTS.HEARTBEAT_TIMEOUT_FALLBACK);
          return;
        }
        this._heartbeatSentAt = Date.now();
        this.pendingHeartbeatRef = this._makeRef();
        this.push({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: this.pendingHeartbeatRef
        });
        try {
          this.heartbeatCallback("sent");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
        this._setAuthSafely("heartbeat");
      }
      /**
       * Sets a callback that receives lifecycle events for internal heartbeat messages.
       * Useful for instrumenting connection health (e.g. sent/ok/timeout/disconnected).
       */
      onHeartbeat(callback) {
        this.heartbeatCallback = callback;
      }
      /**
       * Flushes send buffer
       */
      flushSendBuffer() {
        if (this.isConnected() && this.sendBuffer.length > 0) {
          this.sendBuffer.forEach((callback) => callback());
          this.sendBuffer = [];
        }
      }
      /**
       * Return the next message ref, accounting for overflows
       *
       * @internal
       */
      _makeRef() {
        let newRef = this.ref + 1;
        if (newRef === this.ref) {
          this.ref = 0;
        } else {
          this.ref = newRef;
        }
        return this.ref.toString();
      }
      /**
       * Unsubscribe from channels with the specified topic.
       *
       * @internal
       */
      _leaveOpenTopic(topic) {
        let dupChannel = this.channels.find((c) => c.topic === topic && (c._isJoined() || c._isJoining()));
        if (dupChannel) {
          this.log("transport", `leaving duplicate topic "${topic}"`);
          dupChannel.unsubscribe();
        }
      }
      /**
       * Removes a subscription from the socket.
       *
       * @param channel An open subscription.
       *
       * @internal
       */
      _remove(channel) {
        this.channels = this.channels.filter((c) => c.topic !== channel.topic);
      }
      /** @internal */
      _onConnMessage(rawMessage) {
        this.decode(rawMessage.data, (msg) => {
          if (msg.topic === "phoenix" && msg.event === "phx_reply" && msg.ref && msg.ref === this.pendingHeartbeatRef) {
            const latency = this._heartbeatSentAt ? Date.now() - this._heartbeatSentAt : void 0;
            try {
              this.heartbeatCallback(msg.payload.status === "ok" ? "ok" : "error", latency);
            } catch (e) {
              this.log("error", "error in heartbeat callback", e);
            }
            this._heartbeatSentAt = null;
            this.pendingHeartbeatRef = null;
          }
          const { topic, event, payload, ref } = msg;
          const refString = ref ? `(${ref})` : "";
          const status = payload.status || "";
          this.log("receive", `${status} ${topic} ${event} ${refString}`.trim(), payload);
          this.channels.filter((channel) => channel._isMember(topic)).forEach((channel) => channel._trigger(event, payload, ref));
          this._triggerStateCallbacks("message", msg);
        });
      }
      /**
       * Clear specific timer
       * @internal
       */
      _clearTimer(timer) {
        var _a;
        if (timer === "heartbeat" && this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer);
          this.heartbeatTimer = void 0;
        } else if (timer === "reconnect") {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.reset();
        }
      }
      /**
       * Clear all timers
       * @internal
       */
      _clearAllTimers() {
        this._clearTimer("heartbeat");
        this._clearTimer("reconnect");
      }
      /**
       * Setup connection handlers for WebSocket events
       * @internal
       */
      _setupConnectionHandlers() {
        if (!this.conn)
          return;
        if ("binaryType" in this.conn) {
          ;
          this.conn.binaryType = "arraybuffer";
        }
        this.conn.onopen = () => this._onConnOpen();
        this.conn.onerror = (error) => this._onConnError(error);
        this.conn.onmessage = (event) => this._onConnMessage(event);
        this.conn.onclose = (event) => this._onConnClose(event);
        if (this.conn.readyState === SOCKET_STATES.open) {
          this._onConnOpen();
        }
      }
      /**
       * Teardown connection and cleanup resources
       * @internal
       */
      _teardownConnection() {
        if (this.conn) {
          if (this.conn.readyState === SOCKET_STATES.open || this.conn.readyState === SOCKET_STATES.connecting) {
            try {
              this.conn.close();
            } catch (e) {
              this.log("error", "Error closing connection", e);
            }
          }
          this.conn.onopen = null;
          this.conn.onerror = null;
          this.conn.onmessage = null;
          this.conn.onclose = null;
          this.conn = null;
        }
        this._clearAllTimers();
        this._terminateWorker();
        this.channels.forEach((channel) => channel.teardown());
      }
      /** @internal */
      _onConnOpen() {
        this._setConnectionState("connected");
        this.log("transport", `connected to ${this.endpointURL()}`);
        const authPromise = this._authPromise || (this.accessToken && !this.accessTokenValue ? this.setAuth() : Promise.resolve());
        authPromise.then(() => {
          if (this.accessTokenValue) {
            this.channels.forEach((channel) => {
              channel.updateJoinPayload({ access_token: this.accessTokenValue });
            });
            this.sendBuffer = [];
            this.channels.forEach((channel) => {
              if (channel._isJoining()) {
                channel.joinPush.sent = false;
                channel.joinPush.send();
              }
            });
          }
          this.flushSendBuffer();
        }).catch((e) => {
          this.log("error", "error waiting for auth on connect", e);
          this.flushSendBuffer();
        });
        this._clearTimer("reconnect");
        if (!this.worker) {
          this._startHeartbeat();
        } else {
          if (!this.workerRef) {
            this._startWorkerHeartbeat();
          }
        }
        this._triggerStateCallbacks("open");
      }
      /** @internal */
      _startHeartbeat() {
        this.heartbeatTimer && clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), this.heartbeatIntervalMs);
      }
      /** @internal */
      _startWorkerHeartbeat() {
        if (this.workerUrl) {
          this.log("worker", `starting worker for from ${this.workerUrl}`);
        } else {
          this.log("worker", `starting default worker`);
        }
        const objectUrl = this._workerObjectUrl(this.workerUrl);
        this.workerRef = new Worker(objectUrl);
        this.workerRef.onerror = (error) => {
          this.log("worker", "worker error", error.message);
          this._terminateWorker();
        };
        this.workerRef.onmessage = (event) => {
          if (event.data.event === "keepAlive") {
            this.sendHeartbeat();
          }
        };
        this.workerRef.postMessage({
          event: "start",
          interval: this.heartbeatIntervalMs
        });
      }
      /**
       * Terminate the Web Worker and clear the reference
       * @internal
       */
      _terminateWorker() {
        if (this.workerRef) {
          this.log("worker", "terminating worker");
          this.workerRef.terminate();
          this.workerRef = void 0;
        }
      }
      /** @internal */
      _onConnClose(event) {
        var _a;
        this._setConnectionState("disconnected");
        this.log("transport", "close", event);
        this._triggerChanError();
        this._clearTimer("heartbeat");
        if (!this._wasManualDisconnect) {
          (_a = this.reconnectTimer) === null || _a === void 0 ? void 0 : _a.scheduleTimeout();
        }
        this._triggerStateCallbacks("close", event);
      }
      /** @internal */
      _onConnError(error) {
        this._setConnectionState("disconnected");
        this.log("transport", `${error}`);
        this._triggerChanError();
        this._triggerStateCallbacks("error", error);
        try {
          this.heartbeatCallback("error");
        } catch (e) {
          this.log("error", "error in heartbeat callback", e);
        }
      }
      /** @internal */
      _triggerChanError() {
        this.channels.forEach((channel) => channel._trigger(CHANNEL_EVENTS.error));
      }
      /** @internal */
      _appendParams(url, params) {
        if (Object.keys(params).length === 0) {
          return url;
        }
        const prefix = url.match(/\?/) ? "&" : "?";
        const query = new URLSearchParams(params);
        return `${url}${prefix}${query}`;
      }
      _workerObjectUrl(url) {
        let result_url;
        if (url) {
          result_url = url;
        } else {
          const blob = new Blob([WORKER_SCRIPT], { type: "application/javascript" });
          result_url = URL.createObjectURL(blob);
        }
        return result_url;
      }
      /**
       * Set connection state with proper state management
       * @internal
       */
      _setConnectionState(state, manual = false) {
        this._connectionState = state;
        if (state === "connecting") {
          this._wasManualDisconnect = false;
        } else if (state === "disconnecting") {
          this._wasManualDisconnect = manual;
        }
      }
      /**
       * Perform the actual auth operation
       * @internal
       */
      async _performAuth(token = null) {
        let tokenToSend;
        let isManualToken = false;
        if (token) {
          tokenToSend = token;
          isManualToken = true;
        } else if (this.accessToken) {
          try {
            tokenToSend = await this.accessToken();
          } catch (e) {
            this.log("error", "Error fetching access token from callback", e);
            tokenToSend = this.accessTokenValue;
          }
        } else {
          tokenToSend = this.accessTokenValue;
        }
        if (isManualToken) {
          this._manuallySetToken = true;
        } else if (this.accessToken) {
          this._manuallySetToken = false;
        }
        if (this.accessTokenValue != tokenToSend) {
          this.accessTokenValue = tokenToSend;
          this.channels.forEach((channel) => {
            const payload = {
              access_token: tokenToSend,
              version: DEFAULT_VERSION
            };
            tokenToSend && channel.updateJoinPayload(payload);
            if (channel.joinedOnce && channel._isJoined()) {
              channel._push(CHANNEL_EVENTS.access_token, {
                access_token: tokenToSend
              });
            }
          });
        }
      }
      /**
       * Wait for any in-flight auth operations to complete
       * @internal
       */
      async _waitForAuthIfNeeded() {
        if (this._authPromise) {
          await this._authPromise;
        }
      }
      /**
       * Safely call setAuth with standardized error handling
       * @internal
       */
      _setAuthSafely(context = "general") {
        if (!this._isManualToken()) {
          this.setAuth().catch((e) => {
            this.log("error", `Error setting auth in ${context}`, e);
          });
        }
      }
      /**
       * Trigger state change callbacks with proper error handling
       * @internal
       */
      _triggerStateCallbacks(event, data) {
        try {
          this.stateChangeCallbacks[event].forEach((callback) => {
            try {
              callback(data);
            } catch (e) {
              this.log("error", `error in ${event} callback`, e);
            }
          });
        } catch (e) {
          this.log("error", `error triggering ${event} callbacks`, e);
        }
      }
      /**
       * Setup reconnection timer with proper configuration
       * @internal
       */
      _setupReconnectionTimer() {
        this.reconnectTimer = new Timer(async () => {
          setTimeout(async () => {
            await this._waitForAuthIfNeeded();
            if (!this.isConnected()) {
              this.connect();
            }
          }, CONNECTION_TIMEOUTS.RECONNECT_DELAY);
        }, this.reconnectAfterMs);
      }
      /**
       * Initialize client options with defaults
       * @internal
       */
      _initializeOptions(options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        this.transport = (_a = options === null || options === void 0 ? void 0 : options.transport) !== null && _a !== void 0 ? _a : null;
        this.timeout = (_b = options === null || options === void 0 ? void 0 : options.timeout) !== null && _b !== void 0 ? _b : DEFAULT_TIMEOUT;
        this.heartbeatIntervalMs = (_c = options === null || options === void 0 ? void 0 : options.heartbeatIntervalMs) !== null && _c !== void 0 ? _c : CONNECTION_TIMEOUTS.HEARTBEAT_INTERVAL;
        this.worker = (_d = options === null || options === void 0 ? void 0 : options.worker) !== null && _d !== void 0 ? _d : false;
        this.accessToken = (_e = options === null || options === void 0 ? void 0 : options.accessToken) !== null && _e !== void 0 ? _e : null;
        this.heartbeatCallback = (_f = options === null || options === void 0 ? void 0 : options.heartbeatCallback) !== null && _f !== void 0 ? _f : noop2;
        this.vsn = (_g = options === null || options === void 0 ? void 0 : options.vsn) !== null && _g !== void 0 ? _g : DEFAULT_VSN;
        if (options === null || options === void 0 ? void 0 : options.params)
          this.params = options.params;
        if (options === null || options === void 0 ? void 0 : options.logger)
          this.logger = options.logger;
        if ((options === null || options === void 0 ? void 0 : options.logLevel) || (options === null || options === void 0 ? void 0 : options.log_level)) {
          this.logLevel = options.logLevel || options.log_level;
          this.params = Object.assign(Object.assign({}, this.params), { log_level: this.logLevel });
        }
        this.reconnectAfterMs = (_h = options === null || options === void 0 ? void 0 : options.reconnectAfterMs) !== null && _h !== void 0 ? _h : (tries) => {
          return RECONNECT_INTERVALS[tries - 1] || DEFAULT_RECONNECT_FALLBACK;
        };
        switch (this.vsn) {
          case VSN_1_0_0:
            this.encode = (_j = options === null || options === void 0 ? void 0 : options.encode) !== null && _j !== void 0 ? _j : (payload, callback) => {
              return callback(JSON.stringify(payload));
            };
            this.decode = (_k = options === null || options === void 0 ? void 0 : options.decode) !== null && _k !== void 0 ? _k : (payload, callback) => {
              return callback(JSON.parse(payload));
            };
            break;
          case VSN_2_0_0:
            this.encode = (_l = options === null || options === void 0 ? void 0 : options.encode) !== null && _l !== void 0 ? _l : this.serializer.encode.bind(this.serializer);
            this.decode = (_m = options === null || options === void 0 ? void 0 : options.decode) !== null && _m !== void 0 ? _m : this.serializer.decode.bind(this.serializer);
            break;
          default:
            throw new Error(`Unsupported serializer version: ${this.vsn}`);
        }
        if (this.worker) {
          if (typeof window !== "undefined" && !window.Worker) {
            throw new Error("Web Worker is not supported");
          }
          this.workerUrl = options === null || options === void 0 ? void 0 : options.workerUrl;
        }
      }
    };
  }
});

// node_modules/@supabase/realtime-js/dist/module/index.js
var init_module2 = __esm({
  "node_modules/@supabase/realtime-js/dist/module/index.js"() {
    init_RealtimeClient();
    init_RealtimeChannel();
    init_RealtimePresence();
    init_websocket_factory();
  }
});

// node_modules/iceberg-js/dist/index.mjs
function buildUrl(baseUrl, path, query) {
  const url = new URL(path, baseUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== void 0) {
        url.searchParams.set(key, value);
      }
    }
  }
  return url.toString();
}
async function buildAuthHeaders(auth) {
  if (!auth || auth.type === "none") {
    return {};
  }
  if (auth.type === "bearer") {
    return { Authorization: `Bearer ${auth.token}` };
  }
  if (auth.type === "header") {
    return { [auth.name]: auth.value };
  }
  if (auth.type === "custom") {
    return await auth.getHeaders();
  }
  return {};
}
function createFetchClient(options) {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  return {
    async request({
      method,
      path,
      query,
      body,
      headers
    }) {
      const url = buildUrl(options.baseUrl, path, query);
      const authHeaders = await buildAuthHeaders(options.auth);
      const res = await fetchFn(url, {
        method,
        headers: {
          ...body ? { "Content-Type": "application/json" } : {},
          ...authHeaders,
          ...headers
        },
        body: body ? JSON.stringify(body) : void 0
      });
      const text = await res.text();
      const isJson = (res.headers.get("content-type") || "").includes("application/json");
      const data = isJson && text ? JSON.parse(text) : text;
      if (!res.ok) {
        const errBody = isJson ? data : void 0;
        const errorDetail = errBody?.error;
        throw new IcebergError(
          errorDetail?.message ?? `Request failed with status ${res.status}`,
          {
            status: res.status,
            icebergType: errorDetail?.type,
            icebergCode: errorDetail?.code,
            details: errBody
          }
        );
      }
      return { status: res.status, headers: res.headers, data };
    }
  };
}
function namespaceToPath(namespace) {
  return namespace.join("");
}
function namespaceToPath2(namespace) {
  return namespace.join("");
}
var IcebergError, NamespaceOperations, TableOperations, IcebergRestCatalog;
var init_dist2 = __esm({
  "node_modules/iceberg-js/dist/index.mjs"() {
    IcebergError = class extends Error {
      constructor(message, opts) {
        super(message);
        this.name = "IcebergError";
        this.status = opts.status;
        this.icebergType = opts.icebergType;
        this.icebergCode = opts.icebergCode;
        this.details = opts.details;
        this.isCommitStateUnknown = opts.icebergType === "CommitStateUnknownException" || [500, 502, 504].includes(opts.status) && opts.icebergType?.includes("CommitState") === true;
      }
      /**
       * Returns true if the error is a 404 Not Found error.
       */
      isNotFound() {
        return this.status === 404;
      }
      /**
       * Returns true if the error is a 409 Conflict error.
       */
      isConflict() {
        return this.status === 409;
      }
      /**
       * Returns true if the error is a 419 Authentication Timeout error.
       */
      isAuthenticationTimeout() {
        return this.status === 419;
      }
    };
    NamespaceOperations = class {
      constructor(client, prefix = "") {
        this.client = client;
        this.prefix = prefix;
      }
      async listNamespaces(parent) {
        const query = parent ? { parent: namespaceToPath(parent.namespace) } : void 0;
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces`,
          query
        });
        return response.data.namespaces.map((ns) => ({ namespace: ns }));
      }
      async createNamespace(id, metadata) {
        const request = {
          namespace: id.namespace,
          properties: metadata?.properties
        };
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces`,
          body: request
        });
        return response.data;
      }
      async dropNamespace(id) {
        await this.client.request({
          method: "DELETE",
          path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
        });
      }
      async loadNamespaceMetadata(id) {
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
        });
        return {
          properties: response.data.properties
        };
      }
      async namespaceExists(id) {
        try {
          await this.client.request({
            method: "HEAD",
            path: `${this.prefix}/namespaces/${namespaceToPath(id.namespace)}`
          });
          return true;
        } catch (error) {
          if (error instanceof IcebergError && error.status === 404) {
            return false;
          }
          throw error;
        }
      }
      async createNamespaceIfNotExists(id, metadata) {
        try {
          return await this.createNamespace(id, metadata);
        } catch (error) {
          if (error instanceof IcebergError && error.status === 409) {
            return;
          }
          throw error;
        }
      }
    };
    TableOperations = class {
      constructor(client, prefix = "", accessDelegation) {
        this.client = client;
        this.prefix = prefix;
        this.accessDelegation = accessDelegation;
      }
      async listTables(namespace) {
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`
        });
        return response.data.identifiers;
      }
      async createTable(namespace, request) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces/${namespaceToPath2(namespace.namespace)}/tables`,
          body: request,
          headers
        });
        return response.data.metadata;
      }
      async updateTable(id, request) {
        const response = await this.client.request({
          method: "POST",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          body: request
        });
        return {
          "metadata-location": response.data["metadata-location"],
          metadata: response.data.metadata
        };
      }
      async dropTable(id, options) {
        await this.client.request({
          method: "DELETE",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          query: { purgeRequested: String(options?.purge ?? false) }
        });
      }
      async loadTable(id) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        const response = await this.client.request({
          method: "GET",
          path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
          headers
        });
        return response.data.metadata;
      }
      async tableExists(id) {
        const headers = {};
        if (this.accessDelegation) {
          headers["X-Iceberg-Access-Delegation"] = this.accessDelegation;
        }
        try {
          await this.client.request({
            method: "HEAD",
            path: `${this.prefix}/namespaces/${namespaceToPath2(id.namespace)}/tables/${id.name}`,
            headers
          });
          return true;
        } catch (error) {
          if (error instanceof IcebergError && error.status === 404) {
            return false;
          }
          throw error;
        }
      }
      async createTableIfNotExists(namespace, request) {
        try {
          return await this.createTable(namespace, request);
        } catch (error) {
          if (error instanceof IcebergError && error.status === 409) {
            return await this.loadTable({ namespace: namespace.namespace, name: request.name });
          }
          throw error;
        }
      }
    };
    IcebergRestCatalog = class {
      /**
       * Creates a new Iceberg REST Catalog client.
       *
       * @param options - Configuration options for the catalog client
       */
      constructor(options) {
        let prefix = "v1";
        if (options.catalogName) {
          prefix += `/${options.catalogName}`;
        }
        const baseUrl = options.baseUrl.endsWith("/") ? options.baseUrl : `${options.baseUrl}/`;
        this.client = createFetchClient({
          baseUrl,
          auth: options.auth,
          fetchImpl: options.fetch
        });
        this.accessDelegation = options.accessDelegation?.join(",");
        this.namespaceOps = new NamespaceOperations(this.client, prefix);
        this.tableOps = new TableOperations(this.client, prefix, this.accessDelegation);
      }
      /**
       * Lists all namespaces in the catalog.
       *
       * @param parent - Optional parent namespace to list children under
       * @returns Array of namespace identifiers
       *
       * @example
       * ```typescript
       * // List all top-level namespaces
       * const namespaces = await catalog.listNamespaces();
       *
       * // List namespaces under a parent
       * const children = await catalog.listNamespaces({ namespace: ['analytics'] });
       * ```
       */
      async listNamespaces(parent) {
        return this.namespaceOps.listNamespaces(parent);
      }
      /**
       * Creates a new namespace in the catalog.
       *
       * @param id - Namespace identifier to create
       * @param metadata - Optional metadata properties for the namespace
       * @returns Response containing the created namespace and its properties
       *
       * @example
       * ```typescript
       * const response = await catalog.createNamespace(
       *   { namespace: ['analytics'] },
       *   { properties: { owner: 'data-team' } }
       * );
       * console.log(response.namespace); // ['analytics']
       * console.log(response.properties); // { owner: 'data-team', ... }
       * ```
       */
      async createNamespace(id, metadata) {
        return this.namespaceOps.createNamespace(id, metadata);
      }
      /**
       * Drops a namespace from the catalog.
       *
       * The namespace must be empty (contain no tables) before it can be dropped.
       *
       * @param id - Namespace identifier to drop
       *
       * @example
       * ```typescript
       * await catalog.dropNamespace({ namespace: ['analytics'] });
       * ```
       */
      async dropNamespace(id) {
        await this.namespaceOps.dropNamespace(id);
      }
      /**
       * Loads metadata for a namespace.
       *
       * @param id - Namespace identifier to load
       * @returns Namespace metadata including properties
       *
       * @example
       * ```typescript
       * const metadata = await catalog.loadNamespaceMetadata({ namespace: ['analytics'] });
       * console.log(metadata.properties);
       * ```
       */
      async loadNamespaceMetadata(id) {
        return this.namespaceOps.loadNamespaceMetadata(id);
      }
      /**
       * Lists all tables in a namespace.
       *
       * @param namespace - Namespace identifier to list tables from
       * @returns Array of table identifiers
       *
       * @example
       * ```typescript
       * const tables = await catalog.listTables({ namespace: ['analytics'] });
       * console.log(tables); // [{ namespace: ['analytics'], name: 'events' }, ...]
       * ```
       */
      async listTables(namespace) {
        return this.tableOps.listTables(namespace);
      }
      /**
       * Creates a new table in the catalog.
       *
       * @param namespace - Namespace to create the table in
       * @param request - Table creation request including name, schema, partition spec, etc.
       * @returns Table metadata for the created table
       *
       * @example
       * ```typescript
       * const metadata = await catalog.createTable(
       *   { namespace: ['analytics'] },
       *   {
       *     name: 'events',
       *     schema: {
       *       type: 'struct',
       *       fields: [
       *         { id: 1, name: 'id', type: 'long', required: true },
       *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
       *       ],
       *       'schema-id': 0
       *     },
       *     'partition-spec': {
       *       'spec-id': 0,
       *       fields: [
       *         { source_id: 2, field_id: 1000, name: 'ts_day', transform: 'day' }
       *       ]
       *     }
       *   }
       * );
       * ```
       */
      async createTable(namespace, request) {
        return this.tableOps.createTable(namespace, request);
      }
      /**
       * Updates an existing table's metadata.
       *
       * Can update the schema, partition spec, or properties of a table.
       *
       * @param id - Table identifier to update
       * @param request - Update request with fields to modify
       * @returns Response containing the metadata location and updated table metadata
       *
       * @example
       * ```typescript
       * const response = await catalog.updateTable(
       *   { namespace: ['analytics'], name: 'events' },
       *   {
       *     properties: { 'read.split.target-size': '134217728' }
       *   }
       * );
       * console.log(response['metadata-location']); // s3://...
       * console.log(response.metadata); // TableMetadata object
       * ```
       */
      async updateTable(id, request) {
        return this.tableOps.updateTable(id, request);
      }
      /**
       * Drops a table from the catalog.
       *
       * @param id - Table identifier to drop
       *
       * @example
       * ```typescript
       * await catalog.dropTable({ namespace: ['analytics'], name: 'events' });
       * ```
       */
      async dropTable(id, options) {
        await this.tableOps.dropTable(id, options);
      }
      /**
       * Loads metadata for a table.
       *
       * @param id - Table identifier to load
       * @returns Table metadata including schema, partition spec, location, etc.
       *
       * @example
       * ```typescript
       * const metadata = await catalog.loadTable({ namespace: ['analytics'], name: 'events' });
       * console.log(metadata.schema);
       * console.log(metadata.location);
       * ```
       */
      async loadTable(id) {
        return this.tableOps.loadTable(id);
      }
      /**
       * Checks if a namespace exists in the catalog.
       *
       * @param id - Namespace identifier to check
       * @returns True if the namespace exists, false otherwise
       *
       * @example
       * ```typescript
       * const exists = await catalog.namespaceExists({ namespace: ['analytics'] });
       * console.log(exists); // true or false
       * ```
       */
      async namespaceExists(id) {
        return this.namespaceOps.namespaceExists(id);
      }
      /**
       * Checks if a table exists in the catalog.
       *
       * @param id - Table identifier to check
       * @returns True if the table exists, false otherwise
       *
       * @example
       * ```typescript
       * const exists = await catalog.tableExists({ namespace: ['analytics'], name: 'events' });
       * console.log(exists); // true or false
       * ```
       */
      async tableExists(id) {
        return this.tableOps.tableExists(id);
      }
      /**
       * Creates a namespace if it does not exist.
       *
       * If the namespace already exists, returns void. If created, returns the response.
       *
       * @param id - Namespace identifier to create
       * @param metadata - Optional metadata properties for the namespace
       * @returns Response containing the created namespace and its properties, or void if it already exists
       *
       * @example
       * ```typescript
       * const response = await catalog.createNamespaceIfNotExists(
       *   { namespace: ['analytics'] },
       *   { properties: { owner: 'data-team' } }
       * );
       * if (response) {
       *   console.log('Created:', response.namespace);
       * } else {
       *   console.log('Already exists');
       * }
       * ```
       */
      async createNamespaceIfNotExists(id, metadata) {
        return this.namespaceOps.createNamespaceIfNotExists(id, metadata);
      }
      /**
       * Creates a table if it does not exist.
       *
       * If the table already exists, returns its metadata instead.
       *
       * @param namespace - Namespace to create the table in
       * @param request - Table creation request including name, schema, partition spec, etc.
       * @returns Table metadata for the created or existing table
       *
       * @example
       * ```typescript
       * const metadata = await catalog.createTableIfNotExists(
       *   { namespace: ['analytics'] },
       *   {
       *     name: 'events',
       *     schema: {
       *       type: 'struct',
       *       fields: [
       *         { id: 1, name: 'id', type: 'long', required: true },
       *         { id: 2, name: 'timestamp', type: 'timestamp', required: true }
       *       ],
       *       'schema-id': 0
       *     }
       *   }
       * );
       * ```
       */
      async createTableIfNotExists(namespace, request) {
        return this.tableOps.createTableIfNotExists(namespace, request);
      }
    };
  }
});

// node_modules/@supabase/storage-js/dist/index.mjs
function isStorageError(error) {
  return typeof error === "object" && error !== null && "__isStorageError" in error;
}
function _typeof2(o) {
  "@babel/helpers - typeof";
  return _typeof2 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
    return typeof o$1;
  } : function(o$1) {
    return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
  }, _typeof2(o);
}
function toPrimitive2(t, r) {
  if ("object" != _typeof2(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof2(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey2(t) {
  var i = toPrimitive2(t, "string");
  return "symbol" == _typeof2(i) ? i : i + "";
}
function _defineProperty2(e, r, t) {
  return (r = toPropertyKey2(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys2(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r$1) {
      return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread22(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys2(Object(t), true).forEach(function(r$1) {
      _defineProperty2(e, r$1, t[r$1]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys2(Object(t)).forEach(function(r$1) {
      Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
    });
  }
  return e;
}
async function _handleRequest(fetcher, method, url, options, parameters, body, namespace) {
  return new Promise((resolve, reject) => {
    fetcher(url, _getRequestParams(method, options, parameters, body)).then((result) => {
      if (!result.ok) throw result;
      if (options === null || options === void 0 ? void 0 : options.noResolveJson) return result;
      if (namespace === "vectors") {
        const contentType = result.headers.get("content-type");
        if (result.headers.get("content-length") === "0" || result.status === 204) return {};
        if (!contentType || !contentType.includes("application/json")) return {};
      }
      return result.json();
    }).then((data) => resolve(data)).catch((error) => handleError(error, reject, options, namespace));
  });
}
function createFetchApi(namespace = "storage") {
  return {
    get: async (fetcher, url, options, parameters) => {
      return _handleRequest(fetcher, "GET", url, options, parameters, void 0, namespace);
    },
    post: async (fetcher, url, body, options, parameters) => {
      return _handleRequest(fetcher, "POST", url, options, parameters, body, namespace);
    },
    put: async (fetcher, url, body, options, parameters) => {
      return _handleRequest(fetcher, "PUT", url, options, parameters, body, namespace);
    },
    head: async (fetcher, url, options, parameters) => {
      return _handleRequest(fetcher, "HEAD", url, _objectSpread22(_objectSpread22({}, options), {}, { noResolveJson: true }), parameters, void 0, namespace);
    },
    remove: async (fetcher, url, body, options, parameters) => {
      return _handleRequest(fetcher, "DELETE", url, options, parameters, body, namespace);
    }
  };
}
var StorageError, StorageApiError, StorageUnknownError, resolveFetch2, isPlainObject, recursiveToCamel, isValidBucketName, _getErrorMessage, handleError, _getRequestParams, defaultApi, get, post, put, head, remove, vectorsApi, BaseApiClient, StreamDownloadBuilder, _Symbol$toStringTag, BlobDownloadBuilder, DEFAULT_SEARCH_OPTIONS, DEFAULT_FILE_OPTIONS, StorageFileApi, version2, DEFAULT_HEADERS, StorageBucketApi, StorageAnalyticsClient, VectorIndexApi, VectorDataApi, VectorBucketApi, StorageVectorsClient, VectorBucketScope, VectorIndexScope, StorageClient;
var init_dist3 = __esm({
  "node_modules/@supabase/storage-js/dist/index.mjs"() {
    init_dist2();
    StorageError = class extends Error {
      constructor(message, namespace = "storage", status, statusCode) {
        super(message);
        this.__isStorageError = true;
        this.namespace = namespace;
        this.name = namespace === "vectors" ? "StorageVectorsError" : "StorageError";
        this.status = status;
        this.statusCode = statusCode;
      }
    };
    StorageApiError = class extends StorageError {
      constructor(message, status, statusCode, namespace = "storage") {
        super(message, namespace, status, statusCode);
        this.name = namespace === "vectors" ? "StorageVectorsApiError" : "StorageApiError";
        this.status = status;
        this.statusCode = statusCode;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          statusCode: this.statusCode
        };
      }
    };
    StorageUnknownError = class extends StorageError {
      constructor(message, originalError, namespace = "storage") {
        super(message, namespace);
        this.name = namespace === "vectors" ? "StorageVectorsUnknownError" : "StorageUnknownError";
        this.originalError = originalError;
      }
    };
    resolveFetch2 = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    isPlainObject = (value) => {
      if (typeof value !== "object" || value === null) return false;
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype || Object.getPrototypeOf(prototype) === null) && !(Symbol.toStringTag in value) && !(Symbol.iterator in value);
    };
    recursiveToCamel = (item) => {
      if (Array.isArray(item)) return item.map((el) => recursiveToCamel(el));
      else if (typeof item === "function" || item !== Object(item)) return item;
      const result = {};
      Object.entries(item).forEach(([key, value]) => {
        const newKey = key.replace(/([-_][a-z])/gi, (c) => c.toUpperCase().replace(/[-_]/g, ""));
        result[newKey] = recursiveToCamel(value);
      });
      return result;
    };
    isValidBucketName = (bucketName) => {
      if (!bucketName || typeof bucketName !== "string") return false;
      if (bucketName.length === 0 || bucketName.length > 100) return false;
      if (bucketName.trim() !== bucketName) return false;
      if (bucketName.includes("/") || bucketName.includes("\\")) return false;
      return /^[\w!.\*'() &$@=;:+,?-]+$/.test(bucketName);
    };
    _getErrorMessage = (err) => {
      var _err$error;
      return err.msg || err.message || err.error_description || (typeof err.error === "string" ? err.error : (_err$error = err.error) === null || _err$error === void 0 ? void 0 : _err$error.message) || JSON.stringify(err);
    };
    handleError = async (error, reject, options, namespace) => {
      if (error && typeof error === "object" && "status" in error && "ok" in error && typeof error.status === "number") {
        const responseError = error;
        const status = responseError.status || 500;
        if (typeof responseError.json === "function") responseError.json().then((err) => {
          const statusCode = (err === null || err === void 0 ? void 0 : err.statusCode) || (err === null || err === void 0 ? void 0 : err.code) || status + "";
          reject(new StorageApiError(_getErrorMessage(err), status, statusCode, namespace));
        }).catch(() => {
          if (namespace === "vectors") {
            const statusCode = status + "";
            reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
          } else {
            const statusCode = status + "";
            reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
          }
        });
        else {
          const statusCode = status + "";
          reject(new StorageApiError(responseError.statusText || `HTTP ${status} error`, status, statusCode, namespace));
        }
      } else reject(new StorageUnknownError(_getErrorMessage(error), error, namespace));
    };
    _getRequestParams = (method, options, parameters, body) => {
      const params = {
        method,
        headers: (options === null || options === void 0 ? void 0 : options.headers) || {}
      };
      if (method === "GET" || method === "HEAD" || !body) return _objectSpread22(_objectSpread22({}, params), parameters);
      if (isPlainObject(body)) {
        params.headers = _objectSpread22({ "Content-Type": "application/json" }, options === null || options === void 0 ? void 0 : options.headers);
        params.body = JSON.stringify(body);
      } else params.body = body;
      if (options === null || options === void 0 ? void 0 : options.duplex) params.duplex = options.duplex;
      return _objectSpread22(_objectSpread22({}, params), parameters);
    };
    defaultApi = createFetchApi("storage");
    ({ get, post, put, head, remove } = defaultApi);
    vectorsApi = createFetchApi("vectors");
    BaseApiClient = class {
      /**
      * Creates a new BaseApiClient instance
      * @param url - Base URL for API requests
      * @param headers - Default headers for API requests
      * @param fetch - Optional custom fetch implementation
      * @param namespace - Error namespace ('storage' or 'vectors')
      */
      constructor(url, headers = {}, fetch$1, namespace = "storage") {
        this.shouldThrowOnError = false;
        this.url = url;
        this.headers = headers;
        this.fetch = resolveFetch2(fetch$1);
        this.namespace = namespace;
      }
      /**
      * Enable throwing errors instead of returning them.
      * When enabled, errors are thrown instead of returned in { data, error } format.
      *
      * @returns this - For method chaining
      */
      throwOnError() {
        this.shouldThrowOnError = true;
        return this;
      }
      /**
      * Set an HTTP header for the request.
      * Creates a shallow copy of headers to avoid mutating shared state.
      *
      * @param name - Header name
      * @param value - Header value
      * @returns this - For method chaining
      */
      setHeader(name, value) {
        this.headers = _objectSpread22(_objectSpread22({}, this.headers), {}, { [name]: value });
        return this;
      }
      /**
      * Handles API operation with standardized error handling
      * Eliminates repetitive try-catch blocks across all API methods
      *
      * This wrapper:
      * 1. Executes the operation
      * 2. Returns { data, error: null } on success
      * 3. Returns { data: null, error } on failure (if shouldThrowOnError is false)
      * 4. Throws error on failure (if shouldThrowOnError is true)
      *
      * @typeParam T - The expected data type from the operation
      * @param operation - Async function that performs the API call
      * @returns Promise with { data, error } tuple
      *
      * @example
      * ```typescript
      * async listBuckets() {
      *   return this.handleOperation(async () => {
      *     return await get(this.fetch, `${this.url}/bucket`, {
      *       headers: this.headers,
      *     })
      *   })
      * }
      * ```
      */
      async handleOperation(operation) {
        var _this = this;
        try {
          return {
            data: await operation(),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    StreamDownloadBuilder = class {
      constructor(downloadFn, shouldThrowOnError) {
        this.downloadFn = downloadFn;
        this.shouldThrowOnError = shouldThrowOnError;
      }
      then(onfulfilled, onrejected) {
        return this.execute().then(onfulfilled, onrejected);
      }
      async execute() {
        var _this = this;
        try {
          return {
            data: (await _this.downloadFn()).body,
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    _Symbol$toStringTag = Symbol.toStringTag;
    BlobDownloadBuilder = class {
      constructor(downloadFn, shouldThrowOnError) {
        this.downloadFn = downloadFn;
        this.shouldThrowOnError = shouldThrowOnError;
        this[_Symbol$toStringTag] = "BlobDownloadBuilder";
        this.promise = null;
      }
      asStream() {
        return new StreamDownloadBuilder(this.downloadFn, this.shouldThrowOnError);
      }
      then(onfulfilled, onrejected) {
        return this.getPromise().then(onfulfilled, onrejected);
      }
      catch(onrejected) {
        return this.getPromise().catch(onrejected);
      }
      finally(onfinally) {
        return this.getPromise().finally(onfinally);
      }
      getPromise() {
        if (!this.promise) this.promise = this.execute();
        return this.promise;
      }
      async execute() {
        var _this = this;
        try {
          return {
            data: await (await _this.downloadFn()).blob(),
            error: null
          };
        } catch (error) {
          if (_this.shouldThrowOnError) throw error;
          if (isStorageError(error)) return {
            data: null,
            error
          };
          throw error;
        }
      }
    };
    DEFAULT_SEARCH_OPTIONS = {
      limit: 100,
      offset: 0,
      sortBy: {
        column: "name",
        order: "asc"
      }
    };
    DEFAULT_FILE_OPTIONS = {
      cacheControl: "3600",
      contentType: "text/plain;charset=UTF-8",
      upsert: false
    };
    StorageFileApi = class extends BaseApiClient {
      constructor(url, headers = {}, bucketId, fetch$1) {
        super(url, headers, fetch$1, "storage");
        this.bucketId = bucketId;
      }
      /**
      * Uploads a file to an existing bucket or replaces an existing file at the specified path with a new one.
      *
      * @param method HTTP method.
      * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param fileBody The body of the file to be stored in the bucket.
      */
      async uploadOrUpdate(method, path, fileBody, fileOptions) {
        var _this = this;
        return _this.handleOperation(async () => {
          let body;
          const options = _objectSpread22(_objectSpread22({}, DEFAULT_FILE_OPTIONS), fileOptions);
          let headers = _objectSpread22(_objectSpread22({}, _this.headers), method === "POST" && { "x-upsert": String(options.upsert) });
          const metadata = options.metadata;
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            if (metadata) body.append("metadata", _this.encodeMetadata(metadata));
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            if (!body.has("cacheControl")) body.append("cacheControl", options.cacheControl);
            if (metadata && !body.has("metadata")) body.append("metadata", _this.encodeMetadata(metadata));
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
            if (metadata) headers["x-metadata"] = _this.toBase64(_this.encodeMetadata(metadata));
            if ((typeof ReadableStream !== "undefined" && body instanceof ReadableStream || body && typeof body === "object" && "pipe" in body && typeof body.pipe === "function") && !options.duplex) options.duplex = "half";
          }
          if (fileOptions === null || fileOptions === void 0 ? void 0 : fileOptions.headers) headers = _objectSpread22(_objectSpread22({}, headers), fileOptions.headers);
          const cleanPath = _this._removeEmptyFolders(path);
          const _path = _this._getFinalPath(cleanPath);
          const data = await (method == "PUT" ? put : post)(_this.fetch, `${_this.url}/object/${_path}`, body, _objectSpread22({ headers }, (options === null || options === void 0 ? void 0 : options.duplex) ? { duplex: options.duplex } : {}));
          return {
            path: cleanPath,
            id: data.Id,
            fullPath: data.Key
          };
        });
      }
      /**
      * Uploads a file to an existing bucket.
      *
      * @category File Buckets
      * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
      * @returns Promise with response containing file path, id, and fullPath or error
      *
      * @example Upload file
      * ```js
      * const avatarFile = event.target.files[0]
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .upload('public/avatar1.png', avatarFile, {
      *     cacheControl: '3600',
      *     upsert: false
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "public/avatar1.png",
      *     "fullPath": "avatars/public/avatar1.png"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Upload file using `ArrayBuffer` from base64 file data
      * ```js
      * import { decode } from 'base64-arraybuffer'
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .upload('public/avatar1.png', decode('base64FileData'), {
      *     contentType: 'image/png'
      *   })
      * ```
      */
      async upload(path, fileBody, fileOptions) {
        return this.uploadOrUpdate("POST", path, fileBody, fileOptions);
      }
      /**
      * Upload a file with a token generated from `createSignedUploadUrl`.
      *
      * @category File Buckets
      * @param path The file path, including the file name. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to upload.
      * @param token The token generated from `createSignedUploadUrl`
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions HTTP headers (cacheControl, contentType, etc.).
      * **Note:** The `upsert` option has no effect here. To enable upsert behavior,
      * pass `{ upsert: true }` when calling `createSignedUploadUrl()` instead.
      * @returns Promise with response containing file path and fullPath or error
      *
      * @example Upload to a signed URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .uploadToSignedUrl('folder/cat.jpg', 'token-from-createSignedUploadUrl', file)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "folder/cat.jpg",
      *     "fullPath": "avatars/folder/cat.jpg"
      *   },
      *   "error": null
      * }
      * ```
      */
      async uploadToSignedUrl(path, token, fileBody, fileOptions) {
        var _this3 = this;
        const cleanPath = _this3._removeEmptyFolders(path);
        const _path = _this3._getFinalPath(cleanPath);
        const url = new URL(_this3.url + `/object/upload/sign/${_path}`);
        url.searchParams.set("token", token);
        return _this3.handleOperation(async () => {
          let body;
          const options = _objectSpread22({ upsert: DEFAULT_FILE_OPTIONS.upsert }, fileOptions);
          const headers = _objectSpread22(_objectSpread22({}, _this3.headers), { "x-upsert": String(options.upsert) });
          if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
            body = new FormData();
            body.append("cacheControl", options.cacheControl);
            body.append("", fileBody);
          } else if (typeof FormData !== "undefined" && fileBody instanceof FormData) {
            body = fileBody;
            body.append("cacheControl", options.cacheControl);
          } else {
            body = fileBody;
            headers["cache-control"] = `max-age=${options.cacheControl}`;
            headers["content-type"] = options.contentType;
          }
          return {
            path: cleanPath,
            fullPath: (await put(_this3.fetch, url.toString(), body, { headers })).Key
          };
        });
      }
      /**
      * Creates a signed upload URL.
      * Signed upload URLs can be used to upload files to the bucket without further authentication.
      * They are valid for 2 hours.
      *
      * @category File Buckets
      * @param path The file path, including the current file name. For example `folder/image.png`.
      * @param options.upsert If set to true, allows the file to be overwritten if it already exists.
      * @returns Promise with response containing signed upload URL, token, and path or error
      *
      * @example Create Signed Upload URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUploadUrl('folder/cat.jpg')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "signedUrl": "https://example.supabase.co/storage/v1/object/upload/sign/avatars/folder/cat.jpg?token=<TOKEN>",
      *     "path": "folder/cat.jpg",
      *     "token": "<TOKEN>"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createSignedUploadUrl(path, options) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          let _path = _this4._getFinalPath(path);
          const headers = _objectSpread22({}, _this4.headers);
          if (options === null || options === void 0 ? void 0 : options.upsert) headers["x-upsert"] = "true";
          const data = await post(_this4.fetch, `${_this4.url}/object/upload/sign/${_path}`, {}, { headers });
          const url = new URL(_this4.url + data.url);
          const token = url.searchParams.get("token");
          if (!token) throw new StorageError("No token returned by API");
          return {
            signedUrl: url.toString(),
            path,
            token
          };
        });
      }
      /**
      * Replaces an existing file at the specified path with a new one.
      *
      * @category File Buckets
      * @param path The relative file path. Should be of the format `folder/subfolder/filename.png`. The bucket must already exist before attempting to update.
      * @param fileBody The body of the file to be stored in the bucket.
      * @param fileOptions Optional file upload options including cacheControl, contentType, upsert, and metadata.
      * @returns Promise with response containing file path, id, and fullPath or error
      *
      * @example Update file
      * ```js
      * const avatarFile = event.target.files[0]
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .update('public/avatar1.png', avatarFile, {
      *     cacheControl: '3600',
      *     upsert: true
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "public/avatar1.png",
      *     "fullPath": "avatars/public/avatar1.png"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Update file using `ArrayBuffer` from base64 file data
      * ```js
      * import {decode} from 'base64-arraybuffer'
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .update('public/avatar1.png', decode('base64FileData'), {
      *     contentType: 'image/png'
      *   })
      * ```
      */
      async update(path, fileBody, fileOptions) {
        return this.uploadOrUpdate("PUT", path, fileBody, fileOptions);
      }
      /**
      * Moves an existing file to a new path in the same bucket.
      *
      * @category File Buckets
      * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
      * @param toPath The new file path, including the new file name. For example `folder/image-new.png`.
      * @param options The destination options.
      * @returns Promise with response containing success message or error
      *
      * @example Move file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .move('public/avatar1.png', 'private/avatar2.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully moved"
      *   },
      *   "error": null
      * }
      * ```
      */
      async move(fromPath, toPath, options) {
        var _this6 = this;
        return _this6.handleOperation(async () => {
          return await post(_this6.fetch, `${_this6.url}/object/move`, {
            bucketId: _this6.bucketId,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
          }, { headers: _this6.headers });
        });
      }
      /**
      * Copies an existing file to a new path in the same bucket.
      *
      * @category File Buckets
      * @param fromPath The original file path, including the current file name. For example `folder/image.png`.
      * @param toPath The new file path, including the new file name. For example `folder/image-copy.png`.
      * @param options The destination options.
      * @returns Promise with response containing copied file path or error
      *
      * @example Copy file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .copy('public/avatar1.png', 'private/avatar2.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "path": "avatars/private/avatar2.png"
      *   },
      *   "error": null
      * }
      * ```
      */
      async copy(fromPath, toPath, options) {
        var _this7 = this;
        return _this7.handleOperation(async () => {
          return { path: (await post(_this7.fetch, `${_this7.url}/object/copy`, {
            bucketId: _this7.bucketId,
            sourceKey: fromPath,
            destinationKey: toPath,
            destinationBucket: options === null || options === void 0 ? void 0 : options.destinationBucket
          }, { headers: _this7.headers })).Key };
        });
      }
      /**
      * Creates a signed URL. Use a signed URL to share a file for a fixed amount of time.
      *
      * @category File Buckets
      * @param path The file path, including the current file name. For example `folder/image.png`.
      * @param expiresIn The number of seconds until the signed URL expires. For example, `60` for a URL which is valid for one minute.
      * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns Promise with response containing signed URL or error
      *
      * @example Create Signed URL
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
      *   },
      *   "error": null
      * }
      * ```
      *
      * @example Create a signed URL for an asset with transformations
      * ```js
      * const { data } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60, {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *     }
      *   })
      * ```
      *
      * @example Create a signed URL which triggers the download of the asset
      * ```js
      * const { data } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrl('folder/avatar1.png', 60, {
      *     download: true,
      *   })
      * ```
      */
      async createSignedUrl(path, expiresIn, options) {
        var _this8 = this;
        return _this8.handleOperation(async () => {
          let _path = _this8._getFinalPath(path);
          let data = await post(_this8.fetch, `${_this8.url}/object/sign/${_path}`, _objectSpread22({ expiresIn }, (options === null || options === void 0 ? void 0 : options.transform) ? { transform: options.transform } : {}), { headers: _this8.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          const returnedPath = (options === null || options === void 0 ? void 0 : options.transform) && data.signedURL.includes("/object/sign/") ? data.signedURL.replace("/object/sign/", "/render/image/sign/") : data.signedURL;
          return { signedUrl: encodeURI(`${_this8.url}${returnedPath}${downloadQueryParam}`) };
        });
      }
      /**
      * Creates multiple signed URLs. Use a signed URL to share a file for a fixed amount of time.
      *
      * @category File Buckets
      * @param paths The file paths to be downloaded, including the current file names. For example `['folder/image.png', 'folder2/image2.png']`.
      * @param expiresIn The number of seconds until the signed URLs expire. For example, `60` for URLs which are valid for one minute.
      * @param options.download triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @returns Promise with response containing array of objects with signedUrl, path, and error or error
      *
      * @example Create Signed URLs
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .createSignedUrls(['folder/avatar1.png', 'folder/avatar2.png'], 60)
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "error": null,
      *       "path": "folder/avatar1.png",
      *       "signedURL": "/object/sign/avatars/folder/avatar1.png?token=<TOKEN>",
      *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar1.png?token=<TOKEN>"
      *     },
      *     {
      *       "error": null,
      *       "path": "folder/avatar2.png",
      *       "signedURL": "/object/sign/avatars/folder/avatar2.png?token=<TOKEN>",
      *       "signedUrl": "https://example.supabase.co/storage/v1/object/sign/avatars/folder/avatar2.png?token=<TOKEN>"
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      */
      async createSignedUrls(paths, expiresIn, options) {
        var _this9 = this;
        return _this9.handleOperation(async () => {
          const data = await post(_this9.fetch, `${_this9.url}/object/sign/${_this9.bucketId}`, {
            expiresIn,
            paths
          }, { headers: _this9.headers });
          const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `&download=${options.download === true ? "" : options.download}` : "";
          return data.map((datum) => _objectSpread22(_objectSpread22({}, datum), {}, { signedUrl: datum.signedURL ? encodeURI(`${_this9.url}${datum.signedURL}${downloadQueryParam}`) : null }));
        });
      }
      /**
      * Downloads a file from a private bucket. For public buckets, make a request to the URL returned from `getPublicUrl` instead.
      *
      * @category File Buckets
      * @param path The full path and file name of the file to be downloaded. For example `folder/image.png`.
      * @param options.transform Transform the asset before serving it to the client.
      * @param parameters Additional fetch parameters like signal for cancellation. Supports standard fetch options including cache control.
      * @returns BlobDownloadBuilder instance for downloading the file
      *
      * @example Download file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": <BLOB>,
      *   "error": null
      * }
      * ```
      *
      * @example Download file with transformations
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *       quality: 80
      *     }
      *   })
      * ```
      *
      * @example Download with cache control (useful in Edge Functions)
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {}, { cache: 'no-store' })
      * ```
      *
      * @example Download with abort signal
      * ```js
      * const controller = new AbortController()
      * setTimeout(() => controller.abort(), 5000)
      *
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .download('folder/avatar1.png', {}, { signal: controller.signal })
      * ```
      */
      download(path, options, parameters) {
        const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image/authenticated" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        const queryString = transformationQuery ? `?${transformationQuery}` : "";
        const _path = this._getFinalPath(path);
        const downloadFn = () => get(this.fetch, `${this.url}/${renderPath}/${_path}${queryString}`, {
          headers: this.headers,
          noResolveJson: true
        }, parameters);
        return new BlobDownloadBuilder(downloadFn, this.shouldThrowOnError);
      }
      /**
      * Retrieves the details of an existing file.
      *
      * Returns detailed file metadata including size, content type, and timestamps.
      * Note: The API returns `last_modified` field, not `updated_at`.
      *
      * @category File Buckets
      * @param path The file path, including the file name. For example `folder/image.png`.
      * @returns Promise with response containing file metadata or error
      *
      * @example Get file info
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .info('folder/avatar1.png')
      *
      * if (data) {
      *   console.log('Last modified:', data.lastModified)
      *   console.log('Size:', data.size)
      * }
      * ```
      */
      async info(path) {
        var _this10 = this;
        const _path = _this10._getFinalPath(path);
        return _this10.handleOperation(async () => {
          return recursiveToCamel(await get(_this10.fetch, `${_this10.url}/object/info/${_path}`, { headers: _this10.headers }));
        });
      }
      /**
      * Checks the existence of a file.
      *
      * @category File Buckets
      * @param path The file path, including the file name. For example `folder/image.png`.
      * @returns Promise with response containing boolean indicating file existence or error
      *
      * @example Check file existence
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .exists('folder/avatar1.png')
      * ```
      */
      async exists(path) {
        var _this11 = this;
        const _path = _this11._getFinalPath(path);
        try {
          await head(_this11.fetch, `${_this11.url}/object/${_path}`, { headers: _this11.headers });
          return {
            data: true,
            error: null
          };
        } catch (error) {
          if (_this11.shouldThrowOnError) throw error;
          if (isStorageError(error)) {
            var _error$originalError;
            const status = error instanceof StorageApiError ? error.status : error instanceof StorageUnknownError ? (_error$originalError = error.originalError) === null || _error$originalError === void 0 ? void 0 : _error$originalError.status : void 0;
            if (status !== void 0 && [400, 404].includes(status)) return {
              data: false,
              error
            };
          }
          throw error;
        }
      }
      /**
      * A simple convenience function to get the URL for an asset in a public bucket. If you do not want to use this function, you can construct the public URL by concatenating the bucket URL with the path to the asset.
      * This function does not verify if the bucket is public. If a public URL is created for a bucket which is not public, you will not be able to download the asset.
      *
      * @category File Buckets
      * @param path The path and name of the file to generate the public URL for. For example `folder/image.png`.
      * @param options.download Triggers the file as a download if set to true. Set this parameter as the name of the file if you want to trigger the download with a different filename.
      * @param options.transform Transform the asset before serving it to the client.
      * @returns Object with public URL
      *
      * @example Returns the URL for an asset in a public bucket
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "publicUrl": "https://example.supabase.co/storage/v1/object/public/public-bucket/folder/avatar1.png"
      *   }
      * }
      * ```
      *
      * @example Returns the URL for an asset in a public bucket with transformations
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png', {
      *     transform: {
      *       width: 100,
      *       height: 100,
      *     }
      *   })
      * ```
      *
      * @example Returns the URL which triggers the download of an asset in a public bucket
      * ```js
      * const { data } = supabase
      *   .storage
      *   .from('public-bucket')
      *   .getPublicUrl('folder/avatar1.png', {
      *     download: true,
      *   })
      * ```
      */
      getPublicUrl(path, options) {
        const _path = this._getFinalPath(path);
        const _queryString = [];
        const downloadQueryParam = (options === null || options === void 0 ? void 0 : options.download) ? `download=${options.download === true ? "" : options.download}` : "";
        if (downloadQueryParam !== "") _queryString.push(downloadQueryParam);
        const renderPath = typeof (options === null || options === void 0 ? void 0 : options.transform) !== "undefined" ? "render/image" : "object";
        const transformationQuery = this.transformOptsToQueryString((options === null || options === void 0 ? void 0 : options.transform) || {});
        if (transformationQuery !== "") _queryString.push(transformationQuery);
        let queryString = _queryString.join("&");
        if (queryString !== "") queryString = `?${queryString}`;
        return { data: { publicUrl: encodeURI(`${this.url}/${renderPath}/public/${_path}${queryString}`) } };
      }
      /**
      * Deletes files within the same bucket
      *
      * Returns an array of FileObject entries for the deleted files. Note that deprecated
      * fields like `bucket_id` may or may not be present in the response - do not rely on them.
      *
      * @category File Buckets
      * @param paths An array of files to delete, including the path and file name. For example [`'folder/image.png'`].
      * @returns Promise with response containing array of deleted file objects or error
      *
      * @example Delete file
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .remove(['folder/avatar1.png'])
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [],
      *   "error": null
      * }
      * ```
      */
      async remove(paths) {
        var _this12 = this;
        return _this12.handleOperation(async () => {
          return await remove(_this12.fetch, `${_this12.url}/object/${_this12.bucketId}`, { prefixes: paths }, { headers: _this12.headers });
        });
      }
      /**
      * Get file metadata
      * @param id the file id to retrieve metadata
      */
      /**
      * Update file metadata
      * @param id the file id to update metadata
      * @param meta the new file metadata
      */
      /**
      * Lists all the files and folders within a path of the bucket.
      *
      * **Important:** For folder entries, fields like `id`, `updated_at`, `created_at`,
      * `last_accessed_at`, and `metadata` will be `null`. Only files have these fields populated.
      * Additionally, deprecated fields like `bucket_id`, `owner`, and `buckets` are NOT returned
      * by this method.
      *
      * @category File Buckets
      * @param path The folder path.
      * @param options Search options including limit (defaults to 100), offset, sortBy, and search
      * @param parameters Optional fetch parameters including signal for cancellation
      * @returns Promise with response containing array of files/folders or error
      *
      * @example List files in a bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .list('folder', {
      *     limit: 100,
      *     offset: 0,
      *     sortBy: { column: 'name', order: 'asc' },
      *   })
      *
      * // Handle files vs folders
      * data?.forEach(item => {
      *   if (item.id !== null) {
      *     // It's a file
      *     console.log('File:', item.name, 'Size:', item.metadata?.size)
      *   } else {
      *     // It's a folder
      *     console.log('Folder:', item.name)
      *   }
      * })
      * ```
      *
      * Response (file entry):
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "avatar1.png",
      *       "id": "e668cf7f-821b-4a2f-9dce-7dfa5dd1cfd2",
      *       "updated_at": "2024-05-22T23:06:05.580Z",
      *       "created_at": "2024-05-22T23:04:34.443Z",
      *       "last_accessed_at": "2024-05-22T23:04:34.443Z",
      *       "metadata": {
      *         "eTag": "\"c5e8c553235d9af30ef4f6e280790b92\"",
      *         "size": 32175,
      *         "mimetype": "image/png",
      *         "cacheControl": "max-age=3600",
      *         "lastModified": "2024-05-22T23:06:05.574Z",
      *         "contentLength": 32175,
      *         "httpStatusCode": 200
      *       }
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      *
      * @example Search files in a bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .list('folder', {
      *     limit: 100,
      *     offset: 0,
      *     sortBy: { column: 'name', order: 'asc' },
      *     search: 'jon'
      *   })
      * ```
      */
      async list(path, options, parameters) {
        var _this13 = this;
        return _this13.handleOperation(async () => {
          const body = _objectSpread22(_objectSpread22(_objectSpread22({}, DEFAULT_SEARCH_OPTIONS), options), {}, { prefix: path || "" });
          return await post(_this13.fetch, `${_this13.url}/object/list/${_this13.bucketId}`, body, { headers: _this13.headers }, parameters);
        });
      }
      /**
      * Lists all the files and folders within a bucket using the V2 API with pagination support.
      *
      * **Important:** Folder entries in the `folders` array only contain `name` and optionally `key` —
      * they have no `id`, timestamps, or `metadata` fields. Full file metadata is only available
      * on entries in the `objects` array.
      *
      * @experimental this method signature might change in the future
      *
      * @category File Buckets
      * @param options Search options including prefix, cursor for pagination, limit, with_delimiter
      * @param parameters Optional fetch parameters including signal for cancellation
      * @returns Promise with response containing folders/objects arrays with pagination info or error
      *
      * @example List files with pagination
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .from('avatars')
      *   .listV2({
      *     prefix: 'folder/',
      *     limit: 100,
      *   })
      *
      * // Handle pagination
      * if (data?.hasNext) {
      *   const nextPage = await supabase
      *     .storage
      *     .from('avatars')
      *     .listV2({
      *       prefix: 'folder/',
      *       cursor: data.nextCursor,
      *     })
      * }
      *
      * // Handle files vs folders
      * data?.objects.forEach(file => {
      *   if (file.id !== null) {
      *     console.log('File:', file.name, 'Size:', file.metadata?.size)
      *   }
      * })
      * data?.folders.forEach(folder => {
      *   console.log('Folder:', folder.name)
      * })
      * ```
      */
      async listV2(options, parameters) {
        var _this14 = this;
        return _this14.handleOperation(async () => {
          const body = _objectSpread22({}, options);
          return await post(_this14.fetch, `${_this14.url}/object/list-v2/${_this14.bucketId}`, body, { headers: _this14.headers }, parameters);
        });
      }
      encodeMetadata(metadata) {
        return JSON.stringify(metadata);
      }
      toBase64(data) {
        if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
        return btoa(data);
      }
      _getFinalPath(path) {
        return `${this.bucketId}/${path.replace(/^\/+/, "")}`;
      }
      _removeEmptyFolders(path) {
        return path.replace(/^\/|\/$/g, "").replace(/\/+/g, "/");
      }
      transformOptsToQueryString(transform) {
        const params = [];
        if (transform.width) params.push(`width=${transform.width}`);
        if (transform.height) params.push(`height=${transform.height}`);
        if (transform.resize) params.push(`resize=${transform.resize}`);
        if (transform.format) params.push(`format=${transform.format}`);
        if (transform.quality) params.push(`quality=${transform.quality}`);
        return params.join("&");
      }
    };
    version2 = "2.99.1";
    DEFAULT_HEADERS = { "X-Client-Info": `storage-js/${version2}` };
    StorageBucketApi = class extends BaseApiClient {
      constructor(url, headers = {}, fetch$1, opts) {
        const baseUrl = new URL(url);
        if (opts === null || opts === void 0 ? void 0 : opts.useNewHostname) {
          if (/supabase\.(co|in|red)$/.test(baseUrl.hostname) && !baseUrl.hostname.includes("storage.supabase.")) baseUrl.hostname = baseUrl.hostname.replace("supabase.", "storage.supabase.");
        }
        const finalUrl = baseUrl.href.replace(/\/$/, "");
        const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), headers);
        super(finalUrl, finalHeaders, fetch$1, "storage");
      }
      /**
      * Retrieves the details of all Storage buckets within an existing project.
      *
      * @category File Buckets
      * @param options Query parameters for listing buckets
      * @param options.limit Maximum number of buckets to return
      * @param options.offset Number of buckets to skip
      * @param options.sortColumn Column to sort by ('id', 'name', 'created_at', 'updated_at')
      * @param options.sortOrder Sort order ('asc' or 'desc')
      * @param options.search Search term to filter bucket names
      * @returns Promise with response containing array of buckets or error
      *
      * @example List buckets
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .listBuckets()
      * ```
      *
      * @example List buckets with options
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .listBuckets({
      *     limit: 10,
      *     offset: 0,
      *     sortColumn: 'created_at',
      *     sortOrder: 'desc',
      *     search: 'prod'
      *   })
      * ```
      */
      async listBuckets(options) {
        var _this = this;
        return _this.handleOperation(async () => {
          const queryString = _this.listBucketOptionsToQueryString(options);
          return await get(_this.fetch, `${_this.url}/bucket${queryString}`, { headers: _this.headers });
        });
      }
      /**
      * Retrieves the details of an existing Storage bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to retrieve.
      * @returns Promise with response containing bucket details or error
      *
      * @example Get bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .getBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "id": "avatars",
      *     "name": "avatars",
      *     "owner": "",
      *     "public": false,
      *     "file_size_limit": 1024,
      *     "allowed_mime_types": [
      *       "image/png"
      *     ],
      *     "created_at": "2024-05-22T22:26:05.100Z",
      *     "updated_at": "2024-05-22T22:26:05.100Z"
      *   },
      *   "error": null
      * }
      * ```
      */
      async getBucket(id) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await get(_this2.fetch, `${_this2.url}/bucket/${id}`, { headers: _this2.headers });
        });
      }
      /**
      * Creates a new Storage bucket
      *
      * @category File Buckets
      * @param id A unique identifier for the bucket you are creating.
      * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations. By default, buckets are private.
      * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
      * The global file size limit takes precedence over this value.
      * The default value is null, which doesn't set a per bucket file size limit.
      * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
      * The default value is null, which allows files with all mime types to be uploaded.
      * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
      * @param options.type (private-beta) specifies the bucket type. see `BucketType` for more details.
      *   - default bucket type is `STANDARD`
      * @returns Promise with response containing newly created bucket name or error
      *
      * @example Create bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .createBucket('avatars', {
      *     public: false,
      *     allowedMimeTypes: ['image/png'],
      *     fileSizeLimit: 1024
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "name": "avatars"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createBucket(id, options = { public: false }) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await post(_this3.fetch, `${_this3.url}/bucket`, {
            id,
            name: id,
            type: options.type,
            public: options.public,
            file_size_limit: options.fileSizeLimit,
            allowed_mime_types: options.allowedMimeTypes
          }, { headers: _this3.headers });
        });
      }
      /**
      * Updates a Storage bucket
      *
      * @category File Buckets
      * @param id A unique identifier for the bucket you are updating.
      * @param options.public The visibility of the bucket. Public buckets don't require an authorization token to download objects, but still require a valid token for all other operations.
      * @param options.fileSizeLimit specifies the max file size in bytes that can be uploaded to this bucket.
      * The global file size limit takes precedence over this value.
      * The default value is null, which doesn't set a per bucket file size limit.
      * @param options.allowedMimeTypes specifies the allowed mime types that this bucket can accept during upload.
      * The default value is null, which allows files with all mime types to be uploaded.
      * Each mime type specified can be a wildcard, e.g. image/*, or a specific mime type, e.g. image/png.
      * @returns Promise with response containing success message or error
      *
      * @example Update bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .updateBucket('avatars', {
      *     public: false,
      *     allowedMimeTypes: ['image/png'],
      *     fileSizeLimit: 1024
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully updated"
      *   },
      *   "error": null
      * }
      * ```
      */
      async updateBucket(id, options) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await put(_this4.fetch, `${_this4.url}/bucket/${id}`, {
            id,
            name: id,
            public: options.public,
            file_size_limit: options.fileSizeLimit,
            allowed_mime_types: options.allowedMimeTypes
          }, { headers: _this4.headers });
        });
      }
      /**
      * Removes all objects inside a single bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to empty.
      * @returns Promise with success message or error
      *
      * @example Empty bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .emptyBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully emptied"
      *   },
      *   "error": null
      * }
      * ```
      */
      async emptyBucket(id) {
        var _this5 = this;
        return _this5.handleOperation(async () => {
          return await post(_this5.fetch, `${_this5.url}/bucket/${id}/empty`, {}, { headers: _this5.headers });
        });
      }
      /**
      * Deletes an existing bucket. A bucket can't be deleted with existing objects inside it.
      * You must first `empty()` the bucket.
      *
      * @category File Buckets
      * @param id The unique identifier of the bucket you would like to delete.
      * @returns Promise with success message or error
      *
      * @example Delete bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .deleteBucket('avatars')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully deleted"
      *   },
      *   "error": null
      * }
      * ```
      */
      async deleteBucket(id) {
        var _this6 = this;
        return _this6.handleOperation(async () => {
          return await remove(_this6.fetch, `${_this6.url}/bucket/${id}`, {}, { headers: _this6.headers });
        });
      }
      listBucketOptionsToQueryString(options) {
        const params = {};
        if (options) {
          if ("limit" in options) params.limit = String(options.limit);
          if ("offset" in options) params.offset = String(options.offset);
          if (options.search) params.search = options.search;
          if (options.sortColumn) params.sortColumn = options.sortColumn;
          if (options.sortOrder) params.sortOrder = options.sortOrder;
        }
        return Object.keys(params).length > 0 ? "?" + new URLSearchParams(params).toString() : "";
      }
    };
    StorageAnalyticsClient = class extends BaseApiClient {
      /**
      * @alpha
      *
      * Creates a new StorageAnalyticsClient instance
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param url - The base URL for the storage API
      * @param headers - HTTP headers to include in requests
      * @param fetch - Optional custom fetch implementation
      *
      * @example
      * ```typescript
      * const client = new StorageAnalyticsClient(url, headers)
      * ```
      */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), headers);
        super(finalUrl, finalHeaders, fetch$1, "storage");
      }
      /**
      * @alpha
      *
      * Creates a new analytics bucket using Iceberg tables
      * Analytics buckets are optimized for analytical queries and data processing
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param name A unique name for the bucket you are creating
      * @returns Promise with response containing newly created analytics bucket or error
      *
      * @example Create analytics bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .createBucket('analytics-data')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "name": "analytics-data",
      *     "type": "ANALYTICS",
      *     "format": "iceberg",
      *     "created_at": "2024-05-22T22:26:05.100Z",
      *     "updated_at": "2024-05-22T22:26:05.100Z"
      *   },
      *   "error": null
      * }
      * ```
      */
      async createBucket(name) {
        var _this = this;
        return _this.handleOperation(async () => {
          return await post(_this.fetch, `${_this.url}/bucket`, { name }, { headers: _this.headers });
        });
      }
      /**
      * @alpha
      *
      * Retrieves the details of all Analytics Storage buckets within an existing project
      * Only returns buckets of type 'ANALYTICS'
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param options Query parameters for listing buckets
      * @param options.limit Maximum number of buckets to return
      * @param options.offset Number of buckets to skip
      * @param options.sortColumn Column to sort by ('name', 'created_at', 'updated_at')
      * @param options.sortOrder Sort order ('asc' or 'desc')
      * @param options.search Search term to filter bucket names
      * @returns Promise with response containing array of analytics buckets or error
      *
      * @example List analytics buckets
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .listBuckets({
      *     limit: 10,
      *     offset: 0,
      *     sortColumn: 'created_at',
      *     sortOrder: 'desc'
      *   })
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": [
      *     {
      *       "name": "analytics-data",
      *       "type": "ANALYTICS",
      *       "format": "iceberg",
      *       "created_at": "2024-05-22T22:26:05.100Z",
      *       "updated_at": "2024-05-22T22:26:05.100Z"
      *     }
      *   ],
      *   "error": null
      * }
      * ```
      */
      async listBuckets(options) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          const queryParams = new URLSearchParams();
          if ((options === null || options === void 0 ? void 0 : options.limit) !== void 0) queryParams.set("limit", options.limit.toString());
          if ((options === null || options === void 0 ? void 0 : options.offset) !== void 0) queryParams.set("offset", options.offset.toString());
          if (options === null || options === void 0 ? void 0 : options.sortColumn) queryParams.set("sortColumn", options.sortColumn);
          if (options === null || options === void 0 ? void 0 : options.sortOrder) queryParams.set("sortOrder", options.sortOrder);
          if (options === null || options === void 0 ? void 0 : options.search) queryParams.set("search", options.search);
          const queryString = queryParams.toString();
          const url = queryString ? `${_this2.url}/bucket?${queryString}` : `${_this2.url}/bucket`;
          return await get(_this2.fetch, url, { headers: _this2.headers });
        });
      }
      /**
      * @alpha
      *
      * Deletes an existing analytics bucket
      * A bucket can't be deleted with existing objects inside it
      * You must first empty the bucket before deletion
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param bucketName The unique identifier of the bucket you would like to delete
      * @returns Promise with response containing success message or error
      *
      * @example Delete analytics bucket
      * ```js
      * const { data, error } = await supabase
      *   .storage
      *   .analytics
      *   .deleteBucket('analytics-data')
      * ```
      *
      * Response:
      * ```json
      * {
      *   "data": {
      *     "message": "Successfully deleted"
      *   },
      *   "error": null
      * }
      * ```
      */
      async deleteBucket(bucketName) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await remove(_this3.fetch, `${_this3.url}/bucket/${bucketName}`, {}, { headers: _this3.headers });
        });
      }
      /**
      * @alpha
      *
      * Get an Iceberg REST Catalog client configured for a specific analytics bucket
      * Use this to perform advanced table and namespace operations within the bucket
      * The returned client provides full access to the Apache Iceberg REST Catalog API
      * with the Supabase `{ data, error }` pattern for consistent error handling on all operations.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @param bucketName - The name of the analytics bucket (warehouse) to connect to
      * @returns The wrapped Iceberg catalog client
      * @throws {StorageError} If the bucket name is invalid
      *
      * @example Get catalog and create table
      * ```js
      * // First, create an analytics bucket
      * const { data: bucket, error: bucketError } = await supabase
      *   .storage
      *   .analytics
      *   .createBucket('analytics-data')
      *
      * // Get the Iceberg catalog for that bucket
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // Create a namespace
      * const { error: nsError } = await catalog.createNamespace({ namespace: ['default'] })
      *
      * // Create a table with schema
      * const { data: tableMetadata, error: tableError } = await catalog.createTable(
      *   { namespace: ['default'] },
      *   {
      *     name: 'events',
      *     schema: {
      *       type: 'struct',
      *       fields: [
      *         { id: 1, name: 'id', type: 'long', required: true },
      *         { id: 2, name: 'timestamp', type: 'timestamp', required: true },
      *         { id: 3, name: 'user_id', type: 'string', required: false }
      *       ],
      *       'schema-id': 0,
      *       'identifier-field-ids': [1]
      *     },
      *     'partition-spec': {
      *       'spec-id': 0,
      *       fields: []
      *     },
      *     'write-order': {
      *       'order-id': 0,
      *       fields: []
      *     },
      *     properties: {
      *       'write.format.default': 'parquet'
      *     }
      *   }
      * )
      * ```
      *
      * @example List tables in namespace
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // List all tables in the default namespace
      * const { data: tables, error: listError } = await catalog.listTables({ namespace: ['default'] })
      * if (listError) {
      *   if (listError.isNotFound()) {
      *     console.log('Namespace not found')
      *   }
      *   return
      * }
      * console.log(tables) // [{ namespace: ['default'], name: 'events' }]
      * ```
      *
      * @example Working with namespaces
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // List all namespaces
      * const { data: namespaces } = await catalog.listNamespaces()
      *
      * // Create namespace with properties
      * await catalog.createNamespace(
      *   { namespace: ['production'] },
      *   { properties: { owner: 'data-team', env: 'prod' } }
      * )
      * ```
      *
      * @example Cleanup operations
      * ```js
      * const catalog = supabase.storage.analytics.from('analytics-data')
      *
      * // Drop table with purge option (removes all data)
      * const { error: dropError } = await catalog.dropTable(
      *   { namespace: ['default'], name: 'events' },
      *   { purge: true }
      * )
      *
      * if (dropError?.isNotFound()) {
      *   console.log('Table does not exist')
      * }
      *
      * // Drop namespace (must be empty)
      * await catalog.dropNamespace({ namespace: ['default'] })
      * ```
      *
      * @remarks
      * This method provides a bridge between Supabase's bucket management and the standard
      * Apache Iceberg REST Catalog API. The bucket name maps to the Iceberg warehouse parameter.
      * All authentication and configuration is handled automatically using your Supabase credentials.
      *
      * **Error Handling**: Invalid bucket names throw immediately. All catalog
      * operations return `{ data, error }` where errors are `IcebergError` instances from iceberg-js.
      * Use helper methods like `error.isNotFound()` or check `error.status` for specific error handling.
      * Use `.throwOnError()` on the analytics client if you prefer exceptions for catalog operations.
      *
      * **Cleanup Operations**: When using `dropTable`, the `purge: true` option permanently
      * deletes all table data. Without it, the table is marked as deleted but data remains.
      *
      * **Library Dependency**: The returned catalog wraps `IcebergRestCatalog` from iceberg-js.
      * For complete API documentation and advanced usage, refer to the
      * [iceberg-js documentation](https://supabase.github.io/iceberg-js/).
      */
      from(bucketName) {
        var _this4 = this;
        if (!isValidBucketName(bucketName)) throw new StorageError("Invalid bucket name: File, folder, and bucket names must follow AWS object key naming guidelines and should avoid the use of any other characters.");
        const catalog = new IcebergRestCatalog({
          baseUrl: this.url,
          catalogName: bucketName,
          auth: {
            type: "custom",
            getHeaders: async () => _this4.headers
          },
          fetch: this.fetch
        });
        const shouldThrowOnError = this.shouldThrowOnError;
        return new Proxy(catalog, { get(target, prop) {
          const value = target[prop];
          if (typeof value !== "function") return value;
          return async (...args) => {
            try {
              return {
                data: await value.apply(target, args),
                error: null
              };
            } catch (error) {
              if (shouldThrowOnError) throw error;
              return {
                data: null,
                error
              };
            }
          };
        } });
      }
    };
    VectorIndexApi = class extends BaseApiClient {
      /** Creates a new VectorIndexApi instance */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
        super(finalUrl, finalHeaders, fetch$1, "vectors");
      }
      /** Creates a new vector index within a bucket */
      async createIndex(options) {
        var _this = this;
        return _this.handleOperation(async () => {
          return await vectorsApi.post(_this.fetch, `${_this.url}/CreateIndex`, options, { headers: _this.headers }) || {};
        });
      }
      /** Retrieves metadata for a specific vector index */
      async getIndex(vectorBucketName, indexName) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetIndex`, {
            vectorBucketName,
            indexName
          }, { headers: _this2.headers });
        });
      }
      /** Lists vector indexes within a bucket with optional filtering and pagination */
      async listIndexes(options) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListIndexes`, options, { headers: _this3.headers });
        });
      }
      /** Deletes a vector index and all its data */
      async deleteIndex(vectorBucketName, indexName) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await vectorsApi.post(_this4.fetch, `${_this4.url}/DeleteIndex`, {
            vectorBucketName,
            indexName
          }, { headers: _this4.headers }) || {};
        });
      }
    };
    VectorDataApi = class extends BaseApiClient {
      /** Creates a new VectorDataApi instance */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
        super(finalUrl, finalHeaders, fetch$1, "vectors");
      }
      /** Inserts or updates vectors in batch (1-500 per request) */
      async putVectors(options) {
        var _this = this;
        if (options.vectors.length < 1 || options.vectors.length > 500) throw new Error("Vector batch size must be between 1 and 500 items");
        return _this.handleOperation(async () => {
          return await vectorsApi.post(_this.fetch, `${_this.url}/PutVectors`, options, { headers: _this.headers }) || {};
        });
      }
      /** Retrieves vectors by their keys in batch */
      async getVectors(options) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetVectors`, options, { headers: _this2.headers });
        });
      }
      /** Lists vectors in an index with pagination */
      async listVectors(options) {
        var _this3 = this;
        if (options.segmentCount !== void 0) {
          if (options.segmentCount < 1 || options.segmentCount > 16) throw new Error("segmentCount must be between 1 and 16");
          if (options.segmentIndex !== void 0) {
            if (options.segmentIndex < 0 || options.segmentIndex >= options.segmentCount) throw new Error(`segmentIndex must be between 0 and ${options.segmentCount - 1}`);
          }
        }
        return _this3.handleOperation(async () => {
          return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListVectors`, options, { headers: _this3.headers });
        });
      }
      /** Queries for similar vectors using approximate nearest neighbor search */
      async queryVectors(options) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await vectorsApi.post(_this4.fetch, `${_this4.url}/QueryVectors`, options, { headers: _this4.headers });
        });
      }
      /** Deletes vectors by their keys in batch (1-500 per request) */
      async deleteVectors(options) {
        var _this5 = this;
        if (options.keys.length < 1 || options.keys.length > 500) throw new Error("Keys batch size must be between 1 and 500 items");
        return _this5.handleOperation(async () => {
          return await vectorsApi.post(_this5.fetch, `${_this5.url}/DeleteVectors`, options, { headers: _this5.headers }) || {};
        });
      }
    };
    VectorBucketApi = class extends BaseApiClient {
      /** Creates a new VectorBucketApi instance */
      constructor(url, headers = {}, fetch$1) {
        const finalUrl = url.replace(/\/$/, "");
        const finalHeaders = _objectSpread22(_objectSpread22({}, DEFAULT_HEADERS), {}, { "Content-Type": "application/json" }, headers);
        super(finalUrl, finalHeaders, fetch$1, "vectors");
      }
      /** Creates a new vector bucket */
      async createBucket(vectorBucketName) {
        var _this = this;
        return _this.handleOperation(async () => {
          return await vectorsApi.post(_this.fetch, `${_this.url}/CreateVectorBucket`, { vectorBucketName }, { headers: _this.headers }) || {};
        });
      }
      /** Retrieves metadata for a specific vector bucket */
      async getBucket(vectorBucketName) {
        var _this2 = this;
        return _this2.handleOperation(async () => {
          return await vectorsApi.post(_this2.fetch, `${_this2.url}/GetVectorBucket`, { vectorBucketName }, { headers: _this2.headers });
        });
      }
      /** Lists vector buckets with optional filtering and pagination */
      async listBuckets(options = {}) {
        var _this3 = this;
        return _this3.handleOperation(async () => {
          return await vectorsApi.post(_this3.fetch, `${_this3.url}/ListVectorBuckets`, options, { headers: _this3.headers });
        });
      }
      /** Deletes a vector bucket (must be empty first) */
      async deleteBucket(vectorBucketName) {
        var _this4 = this;
        return _this4.handleOperation(async () => {
          return await vectorsApi.post(_this4.fetch, `${_this4.url}/DeleteVectorBucket`, { vectorBucketName }, { headers: _this4.headers }) || {};
        });
      }
    };
    StorageVectorsClient = class extends VectorBucketApi {
      /**
      * @alpha
      *
      * Creates a StorageVectorsClient that can manage buckets, indexes, and vectors.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param url - Base URL of the Storage Vectors REST API.
      * @param options.headers - Optional headers (for example `Authorization`) applied to every request.
      * @param options.fetch - Optional custom `fetch` implementation for non-browser runtimes.
      *
      * @example
      * ```typescript
      * const client = new StorageVectorsClient(url, options)
      * ```
      */
      constructor(url, options = {}) {
        super(url, options.headers || {}, options.fetch);
      }
      /**
      *
      * @alpha
      *
      * Access operations for a specific vector bucket
      * Returns a scoped client for index and vector operations within the bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket
      * @returns Bucket-scoped client with index and vector operations
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * ```
      */
      from(vectorBucketName) {
        return new VectorBucketScope(this.url, this.headers, vectorBucketName, this.fetch);
      }
      /**
      *
      * @alpha
      *
      * Creates a new vector bucket
      * Vector buckets are containers for vector indexes and their data
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Unique name for the vector bucket
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .createBucket('embeddings-prod')
      * ```
      */
      async createBucket(vectorBucketName) {
        var _superprop_getCreateBucket = () => super.createBucket, _this = this;
        return _superprop_getCreateBucket().call(_this, vectorBucketName);
      }
      /**
      *
      * @alpha
      *
      * Retrieves metadata for a specific vector bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket
      * @returns Promise with bucket metadata or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .getBucket('embeddings-prod')
      *
      * console.log('Bucket created:', data?.vectorBucket.creationTime)
      * ```
      */
      async getBucket(vectorBucketName) {
        var _superprop_getGetBucket = () => super.getBucket, _this2 = this;
        return _superprop_getGetBucket().call(_this2, vectorBucketName);
      }
      /**
      *
      * @alpha
      *
      * Lists all vector buckets with optional filtering and pagination
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Optional filters (prefix, maxResults, nextToken)
      * @returns Promise with list of buckets or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .listBuckets({ prefix: 'embeddings-' })
      *
      * data?.vectorBuckets.forEach(bucket => {
      *   console.log(bucket.vectorBucketName)
      * })
      * ```
      */
      async listBuckets(options = {}) {
        var _superprop_getListBuckets = () => super.listBuckets, _this3 = this;
        return _superprop_getListBuckets().call(_this3, options);
      }
      /**
      *
      * @alpha
      *
      * Deletes a vector bucket (bucket must be empty)
      * All indexes must be deleted before deleting the bucket
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param vectorBucketName - Name of the vector bucket to delete
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const { data, error } = await supabase
      *   .storage
      *   .vectors
      *   .deleteBucket('embeddings-old')
      * ```
      */
      async deleteBucket(vectorBucketName) {
        var _superprop_getDeleteBucket = () => super.deleteBucket, _this4 = this;
        return _superprop_getDeleteBucket().call(_this4, vectorBucketName);
      }
    };
    VectorBucketScope = class extends VectorIndexApi {
      /**
      * @alpha
      *
      * Creates a helper that automatically scopes all index operations to the provided bucket.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * ```
      */
      constructor(url, headers, vectorBucketName, fetch$1) {
        super(url, headers, fetch$1);
        this.vectorBucketName = vectorBucketName;
      }
      /**
      *
      * @alpha
      *
      * Creates a new vector index in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Index configuration (vectorBucketName is automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * await bucket.createIndex({
      *   indexName: 'documents-openai',
      *   dataType: 'float32',
      *   dimension: 1536,
      *   distanceMetric: 'cosine',
      *   metadataConfiguration: {
      *     nonFilterableMetadataKeys: ['raw_text']
      *   }
      * })
      * ```
      */
      async createIndex(options) {
        var _superprop_getCreateIndex = () => super.createIndex, _this5 = this;
        return _superprop_getCreateIndex().call(_this5, _objectSpread22(_objectSpread22({}, options), {}, { vectorBucketName: _this5.vectorBucketName }));
      }
      /**
      *
      * @alpha
      *
      * Lists indexes in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Listing options (vectorBucketName is automatically set)
      * @returns Promise with response containing indexes array and pagination token or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * const { data } = await bucket.listIndexes({ prefix: 'documents-' })
      * ```
      */
      async listIndexes(options = {}) {
        var _superprop_getListIndexes = () => super.listIndexes, _this6 = this;
        return _superprop_getListIndexes().call(_this6, _objectSpread22(_objectSpread22({}, options), {}, { vectorBucketName: _this6.vectorBucketName }));
      }
      /**
      *
      * @alpha
      *
      * Retrieves metadata for a specific index in this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index to retrieve
      * @returns Promise with index metadata or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * const { data } = await bucket.getIndex('documents-openai')
      * console.log('Dimension:', data?.index.dimension)
      * ```
      */
      async getIndex(indexName) {
        var _superprop_getGetIndex = () => super.getIndex, _this7 = this;
        return _superprop_getGetIndex().call(_this7, _this7.vectorBucketName, indexName);
      }
      /**
      *
      * @alpha
      *
      * Deletes an index from this bucket
      * Convenience method that automatically includes the bucket name
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index to delete
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const bucket = supabase.storage.vectors.from('embeddings-prod')
      * await bucket.deleteIndex('old-index')
      * ```
      */
      async deleteIndex(indexName) {
        var _superprop_getDeleteIndex = () => super.deleteIndex, _this8 = this;
        return _superprop_getDeleteIndex().call(_this8, _this8.vectorBucketName, indexName);
      }
      /**
      *
      * @alpha
      *
      * Access operations for a specific index within this bucket
      * Returns a scoped client for vector data operations
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param indexName - Name of the index
      * @returns Index-scoped client with vector data operations
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      *
      * // Insert vectors
      * await index.putVectors({
      *   vectors: [
      *     { key: 'doc-1', data: { float32: [...] }, metadata: { title: 'Intro' } }
      *   ]
      * })
      *
      * // Query similar vectors
      * const { data } = await index.queryVectors({
      *   queryVector: { float32: [...] },
      *   topK: 5
      * })
      * ```
      */
      index(indexName) {
        return new VectorIndexScope(this.url, this.headers, this.vectorBucketName, indexName, this.fetch);
      }
    };
    VectorIndexScope = class extends VectorDataApi {
      /**
      *
      * @alpha
      *
      * Creates a helper that automatically scopes all vector operations to the provided bucket/index names.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * ```
      */
      constructor(url, headers, vectorBucketName, indexName, fetch$1) {
        super(url, headers, fetch$1);
        this.vectorBucketName = vectorBucketName;
        this.indexName = indexName;
      }
      /**
      *
      * @alpha
      *
      * Inserts or updates vectors in this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Vector insertion options (bucket and index names automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * await index.putVectors({
      *   vectors: [
      *     {
      *       key: 'doc-1',
      *       data: { float32: [0.1, 0.2, ...] },
      *       metadata: { title: 'Introduction', page: 1 }
      *     }
      *   ]
      * })
      * ```
      */
      async putVectors(options) {
        var _superprop_getPutVectors = () => super.putVectors, _this9 = this;
        return _superprop_getPutVectors().call(_this9, _objectSpread22(_objectSpread22({}, options), {}, {
          vectorBucketName: _this9.vectorBucketName,
          indexName: _this9.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Retrieves vectors by keys from this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Vector retrieval options (bucket and index names automatically set)
      * @returns Promise with response containing vectors array or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.getVectors({
      *   keys: ['doc-1', 'doc-2'],
      *   returnMetadata: true
      * })
      * ```
      */
      async getVectors(options) {
        var _superprop_getGetVectors = () => super.getVectors, _this10 = this;
        return _superprop_getGetVectors().call(_this10, _objectSpread22(_objectSpread22({}, options), {}, {
          vectorBucketName: _this10.vectorBucketName,
          indexName: _this10.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Lists vectors in this index with pagination
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Listing options (bucket and index names automatically set)
      * @returns Promise with response containing vectors array and pagination token or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.listVectors({
      *   maxResults: 500,
      *   returnMetadata: true
      * })
      * ```
      */
      async listVectors(options = {}) {
        var _superprop_getListVectors = () => super.listVectors, _this11 = this;
        return _superprop_getListVectors().call(_this11, _objectSpread22(_objectSpread22({}, options), {}, {
          vectorBucketName: _this11.vectorBucketName,
          indexName: _this11.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Queries for similar vectors in this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Query options (bucket and index names automatically set)
      * @returns Promise with response containing matches array of similar vectors ordered by distance or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * const { data } = await index.queryVectors({
      *   queryVector: { float32: [0.1, 0.2, ...] },
      *   topK: 5,
      *   filter: { category: 'technical' },
      *   returnDistance: true,
      *   returnMetadata: true
      * })
      * ```
      */
      async queryVectors(options) {
        var _superprop_getQueryVectors = () => super.queryVectors, _this12 = this;
        return _superprop_getQueryVectors().call(_this12, _objectSpread22(_objectSpread22({}, options), {}, {
          vectorBucketName: _this12.vectorBucketName,
          indexName: _this12.indexName
        }));
      }
      /**
      *
      * @alpha
      *
      * Deletes vectors by keys from this index
      * Convenience method that automatically includes bucket and index names
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @param options - Deletion options (bucket and index names automatically set)
      * @returns Promise with empty response on success or error
      *
      * @example
      * ```typescript
      * const index = supabase.storage.vectors.from('embeddings-prod').index('documents-openai')
      * await index.deleteVectors({
      *   keys: ['doc-1', 'doc-2', 'doc-3']
      * })
      * ```
      */
      async deleteVectors(options) {
        var _superprop_getDeleteVectors = () => super.deleteVectors, _this13 = this;
        return _superprop_getDeleteVectors().call(_this13, _objectSpread22(_objectSpread22({}, options), {}, {
          vectorBucketName: _this13.vectorBucketName,
          indexName: _this13.indexName
        }));
      }
    };
    StorageClient = class extends StorageBucketApi {
      /**
      * Creates a client for Storage buckets, files, analytics, and vectors.
      *
      * @category File Buckets
      * @example
      * ```ts
      * import { StorageClient } from '@supabase/storage-js'
      *
      * const storage = new StorageClient('https://xyzcompany.supabase.co/storage/v1', {
      *   apikey: 'public-anon-key',
      * })
      * const avatars = storage.from('avatars')
      * ```
      */
      constructor(url, headers = {}, fetch$1, opts) {
        super(url, headers, fetch$1, opts);
      }
      /**
      * Perform file operation in a bucket.
      *
      * @category File Buckets
      * @param id The bucket id to operate on.
      *
      * @example
      * ```typescript
      * const avatars = supabase.storage.from('avatars')
      * ```
      */
      from(id) {
        return new StorageFileApi(this.url, this.headers, id, this.fetch);
      }
      /**
      *
      * @alpha
      *
      * Access vector storage operations.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Vector Buckets
      * @returns A StorageVectorsClient instance configured with the current storage settings.
      */
      get vectors() {
        return new StorageVectorsClient(this.url + "/vector", {
          headers: this.headers,
          fetch: this.fetch
        });
      }
      /**
      *
      * @alpha
      *
      * Access analytics storage operations using Iceberg tables.
      *
      * **Public alpha:** This API is part of a public alpha release and may not be available to your account type.
      *
      * @category Analytics Buckets
      * @returns A StorageAnalyticsClient instance configured with the current storage settings.
      */
      get analytics() {
        return new StorageAnalyticsClient(this.url + "/iceberg", this.headers, this.fetch);
      }
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/version.js
var version3;
var init_version2 = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/version.js"() {
    version3 = "2.99.1";
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/constants.js
var AUTO_REFRESH_TICK_DURATION_MS, AUTO_REFRESH_TICK_THRESHOLD, EXPIRY_MARGIN_MS, GOTRUE_URL, STORAGE_KEY, DEFAULT_HEADERS2, API_VERSION_HEADER_NAME, API_VERSIONS, BASE64URL_REGEX, JWKS_TTL;
var init_constants2 = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/constants.js"() {
    init_version2();
    AUTO_REFRESH_TICK_DURATION_MS = 30 * 1e3;
    AUTO_REFRESH_TICK_THRESHOLD = 3;
    EXPIRY_MARGIN_MS = AUTO_REFRESH_TICK_THRESHOLD * AUTO_REFRESH_TICK_DURATION_MS;
    GOTRUE_URL = "http://localhost:9999";
    STORAGE_KEY = "supabase.auth.token";
    DEFAULT_HEADERS2 = { "X-Client-Info": `gotrue-js/${version3}` };
    API_VERSION_HEADER_NAME = "X-Supabase-Api-Version";
    API_VERSIONS = {
      "2024-01-01": {
        timestamp: Date.parse("2024-01-01T00:00:00.0Z"),
        name: "2024-01-01"
      }
    };
    BASE64URL_REGEX = /^([a-z0-9_-]{4})*($|[a-z0-9_-]{3}$|[a-z0-9_-]{2}$)$/i;
    JWKS_TTL = 10 * 60 * 1e3;
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/errors.js
function isAuthError(error) {
  return typeof error === "object" && error !== null && "__isAuthError" in error;
}
function isAuthApiError(error) {
  return isAuthError(error) && error.name === "AuthApiError";
}
function isAuthSessionMissingError(error) {
  return isAuthError(error) && error.name === "AuthSessionMissingError";
}
function isAuthImplicitGrantRedirectError(error) {
  return isAuthError(error) && error.name === "AuthImplicitGrantRedirectError";
}
function isAuthRetryableFetchError(error) {
  return isAuthError(error) && error.name === "AuthRetryableFetchError";
}
var AuthError, AuthApiError, AuthUnknownError, CustomAuthError, AuthSessionMissingError, AuthInvalidTokenResponseError, AuthInvalidCredentialsError, AuthImplicitGrantRedirectError, AuthPKCEGrantCodeExchangeError, AuthPKCECodeVerifierMissingError, AuthRetryableFetchError, AuthWeakPasswordError, AuthInvalidJwtError;
var init_errors = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/errors.js"() {
    AuthError = class extends Error {
      constructor(message, status, code) {
        super(message);
        this.__isAuthError = true;
        this.name = "AuthError";
        this.status = status;
        this.code = code;
      }
    };
    AuthApiError = class extends AuthError {
      constructor(message, status, code) {
        super(message, status, code);
        this.name = "AuthApiError";
        this.status = status;
        this.code = code;
      }
    };
    AuthUnknownError = class extends AuthError {
      constructor(message, originalError) {
        super(message);
        this.name = "AuthUnknownError";
        this.originalError = originalError;
      }
    };
    CustomAuthError = class extends AuthError {
      constructor(message, name, status, code) {
        super(message, status, code);
        this.name = name;
        this.status = status;
      }
    };
    AuthSessionMissingError = class extends CustomAuthError {
      constructor() {
        super("Auth session missing!", "AuthSessionMissingError", 400, void 0);
      }
    };
    AuthInvalidTokenResponseError = class extends CustomAuthError {
      constructor() {
        super("Auth session or user missing", "AuthInvalidTokenResponseError", 500, void 0);
      }
    };
    AuthInvalidCredentialsError = class extends CustomAuthError {
      constructor(message) {
        super(message, "AuthInvalidCredentialsError", 400, void 0);
      }
    };
    AuthImplicitGrantRedirectError = class extends CustomAuthError {
      constructor(message, details = null) {
        super(message, "AuthImplicitGrantRedirectError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    AuthPKCEGrantCodeExchangeError = class extends CustomAuthError {
      constructor(message, details = null) {
        super(message, "AuthPKCEGrantCodeExchangeError", 500, void 0);
        this.details = null;
        this.details = details;
      }
      toJSON() {
        return {
          name: this.name,
          message: this.message,
          status: this.status,
          details: this.details
        };
      }
    };
    AuthPKCECodeVerifierMissingError = class extends CustomAuthError {
      constructor() {
        super("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared. For SSR frameworks (Next.js, SvelteKit, etc.), use @supabase/ssr on both the server and client to store the code verifier in cookies.", "AuthPKCECodeVerifierMissingError", 400, "pkce_code_verifier_not_found");
      }
    };
    AuthRetryableFetchError = class extends CustomAuthError {
      constructor(message, status) {
        super(message, "AuthRetryableFetchError", status, void 0);
      }
    };
    AuthWeakPasswordError = class extends CustomAuthError {
      constructor(message, status, reasons) {
        super(message, "AuthWeakPasswordError", status, "weak_password");
        this.reasons = reasons;
      }
    };
    AuthInvalidJwtError = class extends CustomAuthError {
      constructor(message) {
        super(message, "AuthInvalidJwtError", 400, "invalid_jwt");
      }
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/base64url.js
function byteToBase64URL(byte, state, emit) {
  if (byte !== null) {
    state.queue = state.queue << 8 | byte;
    state.queuedBits += 8;
    while (state.queuedBits >= 6) {
      const pos = state.queue >> state.queuedBits - 6 & 63;
      emit(TO_BASE64URL[pos]);
      state.queuedBits -= 6;
    }
  } else if (state.queuedBits > 0) {
    state.queue = state.queue << 6 - state.queuedBits;
    state.queuedBits = 6;
    while (state.queuedBits >= 6) {
      const pos = state.queue >> state.queuedBits - 6 & 63;
      emit(TO_BASE64URL[pos]);
      state.queuedBits -= 6;
    }
  }
}
function byteFromBase64URL(charCode, state, emit) {
  const bits = FROM_BASE64URL[charCode];
  if (bits > -1) {
    state.queue = state.queue << 6 | bits;
    state.queuedBits += 6;
    while (state.queuedBits >= 8) {
      emit(state.queue >> state.queuedBits - 8 & 255);
      state.queuedBits -= 8;
    }
  } else if (bits === -2) {
    return;
  } else {
    throw new Error(`Invalid Base64-URL character "${String.fromCharCode(charCode)}"`);
  }
}
function stringFromBase64URL(str) {
  const conv = [];
  const utf8Emit = (codepoint) => {
    conv.push(String.fromCodePoint(codepoint));
  };
  const utf8State = {
    utf8seq: 0,
    codepoint: 0
  };
  const b64State = { queue: 0, queuedBits: 0 };
  const byteEmit = (byte) => {
    stringFromUTF8(byte, utf8State, utf8Emit);
  };
  for (let i = 0; i < str.length; i += 1) {
    byteFromBase64URL(str.charCodeAt(i), b64State, byteEmit);
  }
  return conv.join("");
}
function codepointToUTF8(codepoint, emit) {
  if (codepoint <= 127) {
    emit(codepoint);
    return;
  } else if (codepoint <= 2047) {
    emit(192 | codepoint >> 6);
    emit(128 | codepoint & 63);
    return;
  } else if (codepoint <= 65535) {
    emit(224 | codepoint >> 12);
    emit(128 | codepoint >> 6 & 63);
    emit(128 | codepoint & 63);
    return;
  } else if (codepoint <= 1114111) {
    emit(240 | codepoint >> 18);
    emit(128 | codepoint >> 12 & 63);
    emit(128 | codepoint >> 6 & 63);
    emit(128 | codepoint & 63);
    return;
  }
  throw new Error(`Unrecognized Unicode codepoint: ${codepoint.toString(16)}`);
}
function stringToUTF8(str, emit) {
  for (let i = 0; i < str.length; i += 1) {
    let codepoint = str.charCodeAt(i);
    if (codepoint > 55295 && codepoint <= 56319) {
      const highSurrogate = (codepoint - 55296) * 1024 & 65535;
      const lowSurrogate = str.charCodeAt(i + 1) - 56320 & 65535;
      codepoint = (lowSurrogate | highSurrogate) + 65536;
      i += 1;
    }
    codepointToUTF8(codepoint, emit);
  }
}
function stringFromUTF8(byte, state, emit) {
  if (state.utf8seq === 0) {
    if (byte <= 127) {
      emit(byte);
      return;
    }
    for (let leadingBit = 1; leadingBit < 6; leadingBit += 1) {
      if ((byte >> 7 - leadingBit & 1) === 0) {
        state.utf8seq = leadingBit;
        break;
      }
    }
    if (state.utf8seq === 2) {
      state.codepoint = byte & 31;
    } else if (state.utf8seq === 3) {
      state.codepoint = byte & 15;
    } else if (state.utf8seq === 4) {
      state.codepoint = byte & 7;
    } else {
      throw new Error("Invalid UTF-8 sequence");
    }
    state.utf8seq -= 1;
  } else if (state.utf8seq > 0) {
    if (byte <= 127) {
      throw new Error("Invalid UTF-8 sequence");
    }
    state.codepoint = state.codepoint << 6 | byte & 63;
    state.utf8seq -= 1;
    if (state.utf8seq === 0) {
      emit(state.codepoint);
    }
  }
}
function base64UrlToUint8Array(str) {
  const result = [];
  const state = { queue: 0, queuedBits: 0 };
  const onByte = (byte) => {
    result.push(byte);
  };
  for (let i = 0; i < str.length; i += 1) {
    byteFromBase64URL(str.charCodeAt(i), state, onByte);
  }
  return new Uint8Array(result);
}
function stringToUint8Array(str) {
  const result = [];
  stringToUTF8(str, (byte) => result.push(byte));
  return new Uint8Array(result);
}
function bytesToBase64URL(bytes) {
  const result = [];
  const state = { queue: 0, queuedBits: 0 };
  const onChar = (char) => {
    result.push(char);
  };
  bytes.forEach((byte) => byteToBase64URL(byte, state, onChar));
  byteToBase64URL(null, state, onChar);
  return result.join("");
}
var TO_BASE64URL, IGNORE_BASE64URL, FROM_BASE64URL;
var init_base64url = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/base64url.js"() {
    TO_BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split("");
    IGNORE_BASE64URL = " 	\n\r=".split("");
    FROM_BASE64URL = (() => {
      const charMap = new Array(128);
      for (let i = 0; i < charMap.length; i += 1) {
        charMap[i] = -1;
      }
      for (let i = 0; i < IGNORE_BASE64URL.length; i += 1) {
        charMap[IGNORE_BASE64URL[i].charCodeAt(0)] = -2;
      }
      for (let i = 0; i < TO_BASE64URL.length; i += 1) {
        charMap[TO_BASE64URL[i].charCodeAt(0)] = i;
      }
      return charMap;
    })();
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/helpers.js
function expiresAt(expiresIn) {
  const timeNow = Math.round(Date.now() / 1e3);
  return timeNow + expiresIn;
}
function generateCallbackId() {
  return Symbol("auth-callback");
}
function parseParametersFromURL(href) {
  const result = {};
  const url = new URL(href);
  if (url.hash && url.hash[0] === "#") {
    try {
      const hashSearchParams = new URLSearchParams(url.hash.substring(1));
      hashSearchParams.forEach((value, key) => {
        result[key] = value;
      });
    } catch (e) {
    }
  }
  url.searchParams.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
function decodeJWT(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthInvalidJwtError("Invalid JWT structure");
  }
  for (let i = 0; i < parts.length; i++) {
    if (!BASE64URL_REGEX.test(parts[i])) {
      throw new AuthInvalidJwtError("JWT not in base64url format");
    }
  }
  const data = {
    // using base64url lib
    header: JSON.parse(stringFromBase64URL(parts[0])),
    payload: JSON.parse(stringFromBase64URL(parts[1])),
    signature: base64UrlToUint8Array(parts[2]),
    raw: {
      header: parts[0],
      payload: parts[1]
    }
  };
  return data;
}
async function sleep(time) {
  return await new Promise((accept) => {
    setTimeout(() => accept(null), time);
  });
}
function retryable(fn, isRetryable) {
  const promise = new Promise((accept, reject) => {
    ;
    (async () => {
      for (let attempt = 0; attempt < Infinity; attempt++) {
        try {
          const result = await fn(attempt);
          if (!isRetryable(attempt, null, result)) {
            accept(result);
            return;
          }
        } catch (e) {
          if (!isRetryable(attempt, e)) {
            reject(e);
            return;
          }
        }
      }
    })();
  });
  return promise;
}
function dec2hex(dec) {
  return ("0" + dec.toString(16)).substr(-2);
}
function generatePKCEVerifier() {
  const verifierLength = 56;
  const array = new Uint32Array(verifierLength);
  if (typeof crypto === "undefined") {
    const charSet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const charSetLen = charSet.length;
    let verifier = "";
    for (let i = 0; i < verifierLength; i++) {
      verifier += charSet.charAt(Math.floor(Math.random() * charSetLen));
    }
    return verifier;
  }
  crypto.getRandomValues(array);
  return Array.from(array, dec2hex).join("");
}
async function sha256(randomString) {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(randomString);
  const hash = await crypto.subtle.digest("SHA-256", encodedData);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map((c) => String.fromCharCode(c)).join("");
}
async function generatePKCEChallenge(verifier) {
  const hasCryptoSupport = typeof crypto !== "undefined" && typeof crypto.subtle !== "undefined" && typeof TextEncoder !== "undefined";
  if (!hasCryptoSupport) {
    console.warn("WebCrypto API is not supported. Code challenge method will default to use plain instead of sha256.");
    return verifier;
  }
  const hashed = await sha256(verifier);
  return btoa(hashed).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function getCodeChallengeAndMethod(storage, storageKey, isPasswordRecovery = false) {
  const codeVerifier = generatePKCEVerifier();
  let storedCodeVerifier = codeVerifier;
  if (isPasswordRecovery) {
    storedCodeVerifier += "/PASSWORD_RECOVERY";
  }
  await setItemAsync(storage, `${storageKey}-code-verifier`, storedCodeVerifier);
  const codeChallenge = await generatePKCEChallenge(codeVerifier);
  const codeChallengeMethod = codeVerifier === codeChallenge ? "plain" : "s256";
  return [codeChallenge, codeChallengeMethod];
}
function parseResponseAPIVersion(response) {
  const apiVersion = response.headers.get(API_VERSION_HEADER_NAME);
  if (!apiVersion) {
    return null;
  }
  if (!apiVersion.match(API_VERSION_REGEX)) {
    return null;
  }
  try {
    const date = /* @__PURE__ */ new Date(`${apiVersion}T00:00:00.0Z`);
    return date;
  } catch (e) {
    return null;
  }
}
function validateExp(exp) {
  if (!exp) {
    throw new Error("Missing exp claim");
  }
  const timeNow = Math.floor(Date.now() / 1e3);
  if (exp <= timeNow) {
    throw new Error("JWT has expired");
  }
}
function getAlgorithm(alg) {
  switch (alg) {
    case "RS256":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }
      };
    case "ES256":
      return {
        name: "ECDSA",
        namedCurve: "P-256",
        hash: { name: "SHA-256" }
      };
    default:
      throw new Error("Invalid alg claim");
  }
}
function validateUUID(str) {
  if (!UUID_REGEX.test(str)) {
    throw new Error("@supabase/auth-js: Expected parameter to be UUID but is not");
  }
}
function userNotAvailableProxy() {
  const proxyTarget = {};
  return new Proxy(proxyTarget, {
    get: (target, prop) => {
      if (prop === "__isUserNotAvailableProxy") {
        return true;
      }
      if (typeof prop === "symbol") {
        const sProp = prop.toString();
        if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)") {
          return void 0;
        }
      }
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Accessing the "${prop}" property of the session object is not supported. Please use getUser() instead.`);
    },
    set: (_target, prop) => {
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Setting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
    },
    deleteProperty: (_target, prop) => {
      throw new Error(`@supabase/auth-js: client was created with userStorage option and there was no user stored in the user storage. Deleting the "${prop}" property of the session object is not supported. Please use getUser() to fetch a user object you can manipulate.`);
    }
  });
}
function insecureUserWarningProxy(user, suppressWarningRef) {
  return new Proxy(user, {
    get: (target, prop, receiver) => {
      if (prop === "__isInsecureUserWarningProxy") {
        return true;
      }
      if (typeof prop === "symbol") {
        const sProp = prop.toString();
        if (sProp === "Symbol(Symbol.toPrimitive)" || sProp === "Symbol(Symbol.toStringTag)" || sProp === "Symbol(util.inspect.custom)" || sProp === "Symbol(nodejs.util.inspect.custom)") {
          return Reflect.get(target, prop, receiver);
        }
      }
      if (!suppressWarningRef.value && typeof prop === "string") {
        console.warn("Using the user object as returned from supabase.auth.getSession() or from some supabase.auth.onAuthStateChange() events could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server.");
        suppressWarningRef.value = true;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
var isBrowser, localStorageWriteTests, supportsLocalStorage, resolveFetch3, looksLikeFetchResponse, setItemAsync, getItemAsync, removeItemAsync, Deferred, API_VERSION_REGEX, UUID_REGEX;
var init_helpers = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/helpers.js"() {
    init_constants2();
    init_errors();
    init_base64url();
    isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
    localStorageWriteTests = {
      tested: false,
      writable: false
    };
    supportsLocalStorage = () => {
      if (!isBrowser()) {
        return false;
      }
      try {
        if (typeof globalThis.localStorage !== "object") {
          return false;
        }
      } catch (e) {
        return false;
      }
      if (localStorageWriteTests.tested) {
        return localStorageWriteTests.writable;
      }
      const randomKey = `lswt-${Math.random()}${Math.random()}`;
      try {
        globalThis.localStorage.setItem(randomKey, randomKey);
        globalThis.localStorage.removeItem(randomKey);
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = true;
      } catch (e) {
        localStorageWriteTests.tested = true;
        localStorageWriteTests.writable = false;
      }
      return localStorageWriteTests.writable;
    };
    resolveFetch3 = (customFetch) => {
      if (customFetch) {
        return (...args) => customFetch(...args);
      }
      return (...args) => fetch(...args);
    };
    looksLikeFetchResponse = (maybeResponse) => {
      return typeof maybeResponse === "object" && maybeResponse !== null && "status" in maybeResponse && "ok" in maybeResponse && "json" in maybeResponse && typeof maybeResponse.json === "function";
    };
    setItemAsync = async (storage, key, data) => {
      await storage.setItem(key, JSON.stringify(data));
    };
    getItemAsync = async (storage, key) => {
      const value = await storage.getItem(key);
      if (!value) {
        return null;
      }
      try {
        return JSON.parse(value);
      } catch (_a) {
        return value;
      }
    };
    removeItemAsync = async (storage, key) => {
      await storage.removeItem(key);
    };
    Deferred = class _Deferred {
      constructor() {
        ;
        this.promise = new _Deferred.promiseConstructor((res, rej) => {
          ;
          this.resolve = res;
          this.reject = rej;
        });
      }
    };
    Deferred.promiseConstructor = Promise;
    API_VERSION_REGEX = /^2[0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|1[0-9]|2[0-9]|3[0-1])$/i;
    UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/fetch.js
async function handleError2(error) {
  var _a;
  if (!looksLikeFetchResponse(error)) {
    throw new AuthRetryableFetchError(_getErrorMessage2(error), 0);
  }
  if (NETWORK_ERROR_CODES.includes(error.status)) {
    throw new AuthRetryableFetchError(_getErrorMessage2(error), error.status);
  }
  let data;
  try {
    data = await error.json();
  } catch (e) {
    throw new AuthUnknownError(_getErrorMessage2(e), e);
  }
  let errorCode = void 0;
  const responseAPIVersion = parseResponseAPIVersion(error);
  if (responseAPIVersion && responseAPIVersion.getTime() >= API_VERSIONS["2024-01-01"].timestamp && typeof data === "object" && data && typeof data.code === "string") {
    errorCode = data.code;
  } else if (typeof data === "object" && data && typeof data.error_code === "string") {
    errorCode = data.error_code;
  }
  if (!errorCode) {
    if (typeof data === "object" && data && typeof data.weak_password === "object" && data.weak_password && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
      throw new AuthWeakPasswordError(_getErrorMessage2(data), error.status, data.weak_password.reasons);
    }
  } else if (errorCode === "weak_password") {
    throw new AuthWeakPasswordError(_getErrorMessage2(data), error.status, ((_a = data.weak_password) === null || _a === void 0 ? void 0 : _a.reasons) || []);
  } else if (errorCode === "session_not_found") {
    throw new AuthSessionMissingError();
  }
  throw new AuthApiError(_getErrorMessage2(data), error.status || 500, errorCode);
}
async function _request(fetcher, method, url, options) {
  var _a;
  const headers = Object.assign({}, options === null || options === void 0 ? void 0 : options.headers);
  if (!headers[API_VERSION_HEADER_NAME]) {
    headers[API_VERSION_HEADER_NAME] = API_VERSIONS["2024-01-01"].name;
  }
  if (options === null || options === void 0 ? void 0 : options.jwt) {
    headers["Authorization"] = `Bearer ${options.jwt}`;
  }
  const qs = (_a = options === null || options === void 0 ? void 0 : options.query) !== null && _a !== void 0 ? _a : {};
  if (options === null || options === void 0 ? void 0 : options.redirectTo) {
    qs["redirect_to"] = options.redirectTo;
  }
  const queryString = Object.keys(qs).length ? "?" + new URLSearchParams(qs).toString() : "";
  const data = await _handleRequest2(fetcher, method, url + queryString, {
    headers,
    noResolveJson: options === null || options === void 0 ? void 0 : options.noResolveJson
  }, {}, options === null || options === void 0 ? void 0 : options.body);
  return (options === null || options === void 0 ? void 0 : options.xform) ? options === null || options === void 0 ? void 0 : options.xform(data) : { data: Object.assign({}, data), error: null };
}
async function _handleRequest2(fetcher, method, url, options, parameters, body) {
  const requestParams = _getRequestParams2(method, options, parameters, body);
  let result;
  try {
    result = await fetcher(url, Object.assign({}, requestParams));
  } catch (e) {
    console.error(e);
    throw new AuthRetryableFetchError(_getErrorMessage2(e), 0);
  }
  if (!result.ok) {
    await handleError2(result);
  }
  if (options === null || options === void 0 ? void 0 : options.noResolveJson) {
    return result;
  }
  try {
    return await result.json();
  } catch (e) {
    await handleError2(e);
  }
}
function _sessionResponse(data) {
  var _a;
  let session = null;
  if (hasSession(data)) {
    session = Object.assign({}, data);
    if (!data.expires_at) {
      session.expires_at = expiresAt(data.expires_in);
    }
  }
  const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
  return { data: { session, user }, error: null };
}
function _sessionResponsePassword(data) {
  const response = _sessionResponse(data);
  if (!response.error && data.weak_password && typeof data.weak_password === "object" && Array.isArray(data.weak_password.reasons) && data.weak_password.reasons.length && data.weak_password.message && typeof data.weak_password.message === "string" && data.weak_password.reasons.reduce((a, i) => a && typeof i === "string", true)) {
    response.data.weak_password = data.weak_password;
  }
  return response;
}
function _userResponse(data) {
  var _a;
  const user = (_a = data.user) !== null && _a !== void 0 ? _a : data;
  return { data: { user }, error: null };
}
function _ssoResponse(data) {
  return { data, error: null };
}
function _generateLinkResponse(data) {
  const { action_link, email_otp, hashed_token, redirect_to, verification_type } = data, rest = __rest(data, ["action_link", "email_otp", "hashed_token", "redirect_to", "verification_type"]);
  const properties = {
    action_link,
    email_otp,
    hashed_token,
    redirect_to,
    verification_type
  };
  const user = Object.assign({}, rest);
  return {
    data: {
      properties,
      user
    },
    error: null
  };
}
function _noResolveJsonResponse(data) {
  return data;
}
function hasSession(data) {
  return data.access_token && data.refresh_token && data.expires_in;
}
var _getErrorMessage2, NETWORK_ERROR_CODES, _getRequestParams2;
var init_fetch = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/fetch.js"() {
    init_tslib_es6();
    init_constants2();
    init_helpers();
    init_errors();
    _getErrorMessage2 = (err) => err.msg || err.message || err.error_description || err.error || JSON.stringify(err);
    NETWORK_ERROR_CODES = [502, 503, 504];
    _getRequestParams2 = (method, options, parameters, body) => {
      const params = { method, headers: (options === null || options === void 0 ? void 0 : options.headers) || {} };
      if (method === "GET") {
        return params;
      }
      params.headers = Object.assign({ "Content-Type": "application/json;charset=UTF-8" }, options === null || options === void 0 ? void 0 : options.headers);
      params.body = JSON.stringify(body);
      return Object.assign(Object.assign({}, params), parameters);
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/types.js
var SIGN_OUT_SCOPES;
var init_types2 = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/types.js"() {
    SIGN_OUT_SCOPES = ["global", "local", "others"];
  }
});

// node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.js
var GoTrueAdminApi;
var init_GoTrueAdminApi = __esm({
  "node_modules/@supabase/auth-js/dist/module/GoTrueAdminApi.js"() {
    init_tslib_es6();
    init_fetch();
    init_helpers();
    init_types2();
    init_errors();
    GoTrueAdminApi = class {
      /**
       * Creates an admin API client that can be used to manage users and OAuth clients.
       *
       * @example
       * ```ts
       * import { GoTrueAdminApi } from '@supabase/auth-js'
       *
       * const admin = new GoTrueAdminApi({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
       * })
       * ```
       */
      constructor({ url = "", headers = {}, fetch: fetch2 }) {
        this.url = url;
        this.headers = headers;
        this.fetch = resolveFetch3(fetch2);
        this.mfa = {
          listFactors: this._listFactors.bind(this),
          deleteFactor: this._deleteFactor.bind(this)
        };
        this.oauth = {
          listClients: this._listOAuthClients.bind(this),
          createClient: this._createOAuthClient.bind(this),
          getClient: this._getOAuthClient.bind(this),
          updateClient: this._updateOAuthClient.bind(this),
          deleteClient: this._deleteOAuthClient.bind(this),
          regenerateClientSecret: this._regenerateOAuthClientSecret.bind(this)
        };
        this.customProviders = {
          listProviders: this._listCustomProviders.bind(this),
          createProvider: this._createCustomProvider.bind(this),
          getProvider: this._getCustomProvider.bind(this),
          updateProvider: this._updateCustomProvider.bind(this),
          deleteProvider: this._deleteCustomProvider.bind(this)
        };
      }
      /**
       * Removes a logged-in session.
       * @param jwt A valid, logged-in JWT.
       * @param scope The logout sope.
       */
      async signOut(jwt, scope = SIGN_OUT_SCOPES[0]) {
        if (SIGN_OUT_SCOPES.indexOf(scope) < 0) {
          throw new Error(`@supabase/auth-js: Parameter scope must be one of ${SIGN_OUT_SCOPES.join(", ")}`);
        }
        try {
          await _request(this.fetch, "POST", `${this.url}/logout?scope=${scope}`, {
            headers: this.headers,
            jwt,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Sends an invite link to an email address.
       * @param email The email address of the user.
       * @param options Additional options to be included when inviting.
       */
      async inviteUserByEmail(email, options = {}) {
        try {
          return await _request(this.fetch, "POST", `${this.url}/invite`, {
            body: { email, data: options.data },
            headers: this.headers,
            redirectTo: options.redirectTo,
            xform: _userResponse
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Generates email links and OTPs to be sent via a custom email provider.
       * @param email The user's email.
       * @param options.password User password. For signup only.
       * @param options.data Optional user metadata. For signup only.
       * @param options.redirectTo The redirect url which should be appended to the generated link
       */
      async generateLink(params) {
        try {
          const { options } = params, rest = __rest(params, ["options"]);
          const body = Object.assign(Object.assign({}, rest), options);
          if ("newEmail" in rest) {
            body.new_email = rest === null || rest === void 0 ? void 0 : rest.newEmail;
            delete body["newEmail"];
          }
          return await _request(this.fetch, "POST", `${this.url}/admin/generate_link`, {
            body,
            headers: this.headers,
            xform: _generateLinkResponse,
            redirectTo: options === null || options === void 0 ? void 0 : options.redirectTo
          });
        } catch (error) {
          if (isAuthError(error)) {
            return {
              data: {
                properties: null,
                user: null
              },
              error
            };
          }
          throw error;
        }
      }
      // User Admin API
      /**
       * Creates a new user.
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async createUser(attributes) {
        try {
          return await _request(this.fetch, "POST", `${this.url}/admin/users`, {
            body: attributes,
            headers: this.headers,
            xform: _userResponse
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Get a list of users.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       * @param params An object which supports `page` and `perPage` as numbers, to alter the paginated results.
       */
      async listUsers(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await _request(this.fetch, "GET", `${this.url}/admin/users`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: _noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const users = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, users), pagination), error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { users: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Get user by id.
       *
       * @param uid The user's unique identifier
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async getUserById(uid) {
        validateUUID(uid);
        try {
          return await _request(this.fetch, "GET", `${this.url}/admin/users/${uid}`, {
            headers: this.headers,
            xform: _userResponse
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Updates the user data. Changes are applied directly without confirmation flows.
       *
       * @param uid The user's unique identifier
       * @param attributes The data you want to update.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       *
       * @remarks
       * **Important:** This is a server-side operation and does **not** trigger client-side
       * `onAuthStateChange` listeners. The admin API has no connection to client state.
       *
       * To sync changes to the client after calling this method:
       * 1. On the client, call `supabase.auth.refreshSession()` to fetch the updated user data
       * 2. This will trigger the `TOKEN_REFRESHED` event and notify all listeners
       *
       * @example
       * ```typescript
       * // Server-side (Edge Function)
       * const { data, error } = await supabase.auth.admin.updateUserById(
       *   userId,
       *   { user_metadata: { preferences: { theme: 'dark' } } }
       * )
       *
       * // Client-side (to sync the changes)
       * const { data, error } = await supabase.auth.refreshSession()
       * // onAuthStateChange listeners will now be notified with updated user
       * ```
       *
       * @see {@link GoTrueClient.refreshSession} for syncing admin changes to the client
       * @see {@link GoTrueClient.updateUser} for client-side user updates (triggers listeners automatically)
       */
      async updateUserById(uid, attributes) {
        validateUUID(uid);
        try {
          return await _request(this.fetch, "PUT", `${this.url}/admin/users/${uid}`, {
            body: attributes,
            headers: this.headers,
            xform: _userResponse
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      /**
       * Delete a user. Requires a `service_role` key.
       *
       * @param id The user id you want to remove.
       * @param shouldSoftDelete If true, then the user will be soft-deleted from the auth schema. Soft deletion allows user identification from the hashed user ID but is not reversible.
       * Defaults to false for backward compatibility.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async deleteUser(id, shouldSoftDelete = false) {
        validateUUID(id);
        try {
          return await _request(this.fetch, "DELETE", `${this.url}/admin/users/${id}`, {
            headers: this.headers,
            body: {
              should_soft_delete: shouldSoftDelete
            },
            xform: _userResponse
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { user: null }, error };
          }
          throw error;
        }
      }
      async _listFactors(params) {
        validateUUID(params.userId);
        try {
          const { data, error } = await _request(this.fetch, "GET", `${this.url}/admin/users/${params.userId}/factors`, {
            headers: this.headers,
            xform: (factors) => {
              return { data: { factors }, error: null };
            }
          });
          return { data, error };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      async _deleteFactor(params) {
        validateUUID(params.userId);
        validateUUID(params.id);
        try {
          const data = await _request(this.fetch, "DELETE", `${this.url}/admin/users/${params.userId}/factors/${params.id}`, {
            headers: this.headers
          });
          return { data, error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth clients with optional pagination.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _listOAuthClients(params) {
        var _a, _b, _c, _d, _e, _f, _g;
        try {
          const pagination = { nextPage: null, lastPage: 0, total: 0 };
          const response = await _request(this.fetch, "GET", `${this.url}/admin/oauth/clients`, {
            headers: this.headers,
            noResolveJson: true,
            query: {
              page: (_b = (_a = params === null || params === void 0 ? void 0 : params.page) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : "",
              per_page: (_d = (_c = params === null || params === void 0 ? void 0 : params.perPage) === null || _c === void 0 ? void 0 : _c.toString()) !== null && _d !== void 0 ? _d : ""
            },
            xform: _noResolveJsonResponse
          });
          if (response.error)
            throw response.error;
          const clients = await response.json();
          const total = (_e = response.headers.get("x-total-count")) !== null && _e !== void 0 ? _e : 0;
          const links = (_g = (_f = response.headers.get("link")) === null || _f === void 0 ? void 0 : _f.split(",")) !== null && _g !== void 0 ? _g : [];
          if (links.length > 0) {
            links.forEach((link) => {
              const page = parseInt(link.split(";")[0].split("=")[1].substring(0, 1));
              const rel = JSON.parse(link.split(";")[1].split("=")[1]);
              pagination[`${rel}Page`] = page;
            });
            pagination.total = parseInt(total);
          }
          return { data: Object.assign(Object.assign({}, clients), pagination), error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { clients: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Creates a new OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _createOAuthClient(params) {
        try {
          return await _request(this.fetch, "POST", `${this.url}/admin/oauth/clients`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Gets details of a specific OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _getOAuthClient(clientId) {
        try {
          return await _request(this.fetch, "GET", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Updates an existing OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _updateOAuthClient(clientId, params) {
        try {
          return await _request(this.fetch, "PUT", `${this.url}/admin/oauth/clients/${clientId}`, {
            body: params,
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Deletes an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _deleteOAuthClient(clientId) {
        try {
          await _request(this.fetch, "DELETE", `${this.url}/admin/oauth/clients/${clientId}`, {
            headers: this.headers,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Regenerates the secret for an OAuth client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _regenerateOAuthClientSecret(clientId) {
        try {
          return await _request(this.fetch, "POST", `${this.url}/admin/oauth/clients/${clientId}/regenerate_secret`, {
            headers: this.headers,
            xform: (client) => {
              return { data: client, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Lists all custom providers with optional type filter.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _listCustomProviders(params) {
        try {
          const query = {};
          if (params === null || params === void 0 ? void 0 : params.type) {
            query.type = params.type;
          }
          return await _request(this.fetch, "GET", `${this.url}/admin/custom-providers`, {
            headers: this.headers,
            query,
            xform: (data) => {
              var _a;
              return { data: { providers: (_a = data === null || data === void 0 ? void 0 : data.providers) !== null && _a !== void 0 ? _a : [] }, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: { providers: [] }, error };
          }
          throw error;
        }
      }
      /**
       * Creates a new custom OIDC/OAuth provider.
       *
       * For OIDC providers, the server fetches and validates the OpenID Connect discovery document
       * from the issuer's well-known endpoint (or the provided `discovery_url`) at creation time.
       * This may return a validation error (`error_code: "validation_failed"`) if the discovery
       * document is unreachable, not valid JSON, missing required fields, or if the issuer
       * in the document does not match the expected issuer.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _createCustomProvider(params) {
        try {
          return await _request(this.fetch, "POST", `${this.url}/admin/custom-providers`, {
            body: params,
            headers: this.headers,
            xform: (provider) => {
              return { data: provider, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Gets details of a specific custom provider by identifier.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _getCustomProvider(identifier) {
        try {
          return await _request(this.fetch, "GET", `${this.url}/admin/custom-providers/${identifier}`, {
            headers: this.headers,
            xform: (provider) => {
              return { data: provider, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Updates an existing custom provider.
       *
       * When `issuer` or `discovery_url` is changed on an OIDC provider, the server re-fetches and
       * validates the discovery document before persisting. This may return a validation error
       * (`error_code: "validation_failed"`) if the discovery document is unreachable, invalid, or
       * the issuer does not match.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _updateCustomProvider(identifier, params) {
        try {
          return await _request(this.fetch, "PUT", `${this.url}/admin/custom-providers/${identifier}`, {
            body: params,
            headers: this.headers,
            xform: (provider) => {
              return { data: provider, error: null };
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
      /**
       * Deletes a custom provider.
       *
       * This function should only be called on a server. Never expose your `service_role` key in the browser.
       */
      async _deleteCustomProvider(identifier) {
        try {
          await _request(this.fetch, "DELETE", `${this.url}/admin/custom-providers/${identifier}`, {
            headers: this.headers,
            noResolveJson: true
          });
          return { data: null, error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          throw error;
        }
      }
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/local-storage.js
function memoryLocalStorageAdapter(store = {}) {
  return {
    getItem: (key) => {
      return store[key] || null;
    },
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    }
  };
}
var init_local_storage = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/local-storage.js"() {
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/locks.js
async function navigatorLock(name, acquireTimeout, fn) {
  if (internals.debug) {
    console.log("@supabase/gotrue-js: navigatorLock: acquire lock", name, acquireTimeout);
  }
  const abortController = new globalThis.AbortController();
  if (acquireTimeout > 0) {
    setTimeout(() => {
      abortController.abort();
      if (internals.debug) {
        console.log("@supabase/gotrue-js: navigatorLock acquire timed out", name);
      }
    }, acquireTimeout);
  }
  await Promise.resolve();
  try {
    return await globalThis.navigator.locks.request(name, acquireTimeout === 0 ? {
      mode: "exclusive",
      ifAvailable: true
    } : {
      mode: "exclusive",
      signal: abortController.signal
    }, async (lock) => {
      if (lock) {
        if (internals.debug) {
          console.log("@supabase/gotrue-js: navigatorLock: acquired", name, lock.name);
        }
        try {
          return await fn();
        } finally {
          if (internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: released", name, lock.name);
          }
        }
      } else {
        if (acquireTimeout === 0) {
          if (internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: not immediately available", name);
          }
          throw new NavigatorLockAcquireTimeoutError(`Acquiring an exclusive Navigator LockManager lock "${name}" immediately failed`);
        } else {
          if (internals.debug) {
            try {
              const result = await globalThis.navigator.locks.query();
              console.log("@supabase/gotrue-js: Navigator LockManager state", JSON.stringify(result, null, "  "));
            } catch (e) {
              console.warn("@supabase/gotrue-js: Error when querying Navigator LockManager state", e);
            }
          }
          console.warn("@supabase/gotrue-js: Navigator LockManager returned a null lock when using #request without ifAvailable set to true, it appears this browser is not following the LockManager spec https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request");
          return await fn();
        }
      }
    });
  } catch (e) {
    if ((e === null || e === void 0 ? void 0 : e.name) === "AbortError" && acquireTimeout > 0) {
      if (internals.debug) {
        console.log("@supabase/gotrue-js: navigatorLock: acquire timeout, recovering by stealing lock", name);
      }
      console.warn(`@supabase/gotrue-js: Lock "${name}" was not released within ${acquireTimeout}ms. This may indicate an orphaned lock from a component unmount (e.g., React Strict Mode). Forcefully acquiring the lock to recover.`);
      return await Promise.resolve().then(() => globalThis.navigator.locks.request(name, {
        mode: "exclusive",
        steal: true
      }, async (lock) => {
        if (lock) {
          if (internals.debug) {
            console.log("@supabase/gotrue-js: navigatorLock: recovered (stolen)", name, lock.name);
          }
          try {
            return await fn();
          } finally {
            if (internals.debug) {
              console.log("@supabase/gotrue-js: navigatorLock: released (stolen)", name, lock.name);
            }
          }
        } else {
          console.warn("@supabase/gotrue-js: Navigator LockManager returned null lock even with steal: true");
          return await fn();
        }
      }));
    }
    throw e;
  }
}
var internals, LockAcquireTimeoutError, NavigatorLockAcquireTimeoutError;
var init_locks = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/locks.js"() {
    init_helpers();
    internals = {
      /**
       * @experimental
       */
      debug: !!(globalThis && supportsLocalStorage() && globalThis.localStorage && globalThis.localStorage.getItem("supabase.gotrue-js.locks.debug") === "true")
    };
    LockAcquireTimeoutError = class extends Error {
      constructor(message) {
        super(message);
        this.isAcquireTimeout = true;
      }
    };
    NavigatorLockAcquireTimeoutError = class extends LockAcquireTimeoutError {
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/polyfills.js
function polyfillGlobalThis() {
  if (typeof globalThis === "object")
    return;
  try {
    Object.defineProperty(Object.prototype, "__magic__", {
      get: function() {
        return this;
      },
      configurable: true
    });
    __magic__.globalThis = __magic__;
    delete Object.prototype.__magic__;
  } catch (e) {
    if (typeof self !== "undefined") {
      self.globalThis = self;
    }
  }
}
var init_polyfills = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/polyfills.js"() {
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/web3/ethereum.js
function getAddress(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error(`@supabase/auth-js: Address "${address}" is invalid.`);
  }
  return address.toLowerCase();
}
function fromHex(hex) {
  return parseInt(hex, 16);
}
function toHex(value) {
  const bytes = new TextEncoder().encode(value);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}
function createSiweMessage(parameters) {
  var _a;
  const { chainId, domain, expirationTime, issuedAt = /* @__PURE__ */ new Date(), nonce, notBefore, requestId, resources, scheme, uri, version: version5 } = parameters;
  {
    if (!Number.isInteger(chainId))
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "chainId". Chain ID must be a EIP-155 chain ID. Provided value: ${chainId}`);
    if (!domain)
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "domain". Domain must be provided.`);
    if (nonce && nonce.length < 8)
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "nonce". Nonce must be at least 8 characters. Provided value: ${nonce}`);
    if (!uri)
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "uri". URI must be provided.`);
    if (version5 !== "1")
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "version". Version must be '1'. Provided value: ${version5}`);
    if ((_a = parameters.statement) === null || _a === void 0 ? void 0 : _a.includes("\n"))
      throw new Error(`@supabase/auth-js: Invalid SIWE message field "statement". Statement must not include '\\n'. Provided value: ${parameters.statement}`);
  }
  const address = getAddress(parameters.address);
  const origin = scheme ? `${scheme}://${domain}` : domain;
  const statement = parameters.statement ? `${parameters.statement}
` : "";
  const prefix = `${origin} wants you to sign in with your Ethereum account:
${address}

${statement}`;
  let suffix = `URI: ${uri}
Version: ${version5}
Chain ID: ${chainId}${nonce ? `
Nonce: ${nonce}` : ""}
Issued At: ${issuedAt.toISOString()}`;
  if (expirationTime)
    suffix += `
Expiration Time: ${expirationTime.toISOString()}`;
  if (notBefore)
    suffix += `
Not Before: ${notBefore.toISOString()}`;
  if (requestId)
    suffix += `
Request ID: ${requestId}`;
  if (resources) {
    let content = "\nResources:";
    for (const resource of resources) {
      if (!resource || typeof resource !== "string")
        throw new Error(`@supabase/auth-js: Invalid SIWE message field "resources". Every resource must be a valid string. Provided value: ${resource}`);
      content += `
- ${resource}`;
    }
    suffix += content;
  }
  return `${prefix}
${suffix}`;
}
var init_ethereum = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/web3/ethereum.js"() {
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/webauthn.errors.js
function identifyRegistrationError({ error, options }) {
  var _a, _b, _c;
  const { publicKey } = options;
  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }
  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      return new WebAuthnError({
        message: "Registration ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error
      });
    }
  } else if (error.name === "ConstraintError") {
    if (((_a = publicKey.authenticatorSelection) === null || _a === void 0 ? void 0 : _a.requireResidentKey) === true) {
      return new WebAuthnError({
        message: "Discoverable credentials were required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT",
        cause: error
      });
    } else if (
      // @ts-ignore: `mediation` doesn't yet exist on CredentialCreationOptions but it's possible as of Sept 2024
      options.mediation === "conditional" && ((_b = publicKey.authenticatorSelection) === null || _b === void 0 ? void 0 : _b.userVerification) === "required"
    ) {
      return new WebAuthnError({
        message: "User verification was required during automatic registration but it could not be performed",
        code: "ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE",
        cause: error
      });
    } else if (((_c = publicKey.authenticatorSelection) === null || _c === void 0 ? void 0 : _c.userVerification) === "required") {
      return new WebAuthnError({
        message: "User verification was required but no available authenticator supported it",
        code: "ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT",
        cause: error
      });
    }
  } else if (error.name === "InvalidStateError") {
    return new WebAuthnError({
      message: "The authenticator was previously registered",
      code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      cause: error
    });
  } else if (error.name === "NotAllowedError") {
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error
    });
  } else if (error.name === "NotSupportedError") {
    const validPubKeyCredParams = publicKey.pubKeyCredParams.filter((param) => param.type === "public-key");
    if (validPubKeyCredParams.length === 0) {
      return new WebAuthnError({
        message: 'No entry in pubKeyCredParams was of type "public-key"',
        code: "ERROR_MALFORMED_PUBKEYCREDPARAMS",
        cause: error
      });
    }
    return new WebAuthnError({
      message: "No available authenticator supported any of the specified pubKeyCredParams algorithms",
      code: "ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG",
      cause: error
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = window.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      return new WebAuthnError({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error
      });
    } else if (publicKey.rp.id !== effectiveDomain) {
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rp.id}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error
      });
    }
  } else if (error.name === "TypeError") {
    if (publicKey.user.id.byteLength < 1 || publicKey.user.id.byteLength > 64) {
      return new WebAuthnError({
        message: "User ID was not between 1 and 64 characters",
        code: "ERROR_INVALID_USER_ID_LENGTH",
        cause: error
      });
    }
  } else if (error.name === "UnknownError") {
    return new WebAuthnError({
      message: "The authenticator was unable to process the specified options, or could not create a new credential",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error
    });
  }
  return new WebAuthnError({
    message: "a Non-Webauthn related error has occurred",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    cause: error
  });
}
function identifyAuthenticationError({ error, options }) {
  const { publicKey } = options;
  if (!publicKey) {
    throw Error("options was missing required publicKey property");
  }
  if (error.name === "AbortError") {
    if (options.signal instanceof AbortSignal) {
      return new WebAuthnError({
        message: "Authentication ceremony was sent an abort signal",
        code: "ERROR_CEREMONY_ABORTED",
        cause: error
      });
    }
  } else if (error.name === "NotAllowedError") {
    return new WebAuthnError({
      message: error.message,
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
      cause: error
    });
  } else if (error.name === "SecurityError") {
    const effectiveDomain = window.location.hostname;
    if (!isValidDomain(effectiveDomain)) {
      return new WebAuthnError({
        message: `${window.location.hostname} is an invalid domain`,
        code: "ERROR_INVALID_DOMAIN",
        cause: error
      });
    } else if (publicKey.rpId !== effectiveDomain) {
      return new WebAuthnError({
        message: `The RP ID "${publicKey.rpId}" is invalid for this domain`,
        code: "ERROR_INVALID_RP_ID",
        cause: error
      });
    }
  } else if (error.name === "UnknownError") {
    return new WebAuthnError({
      message: "The authenticator was unable to process the specified options, or could not create a new assertion signature",
      code: "ERROR_AUTHENTICATOR_GENERAL_ERROR",
      cause: error
    });
  }
  return new WebAuthnError({
    message: "a Non-Webauthn related error has occurred",
    code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    cause: error
  });
}
var WebAuthnError, WebAuthnUnknownError;
var init_webauthn_errors = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/webauthn.errors.js"() {
    init_webauthn();
    WebAuthnError = class extends Error {
      constructor({ message, code, cause, name }) {
        var _a;
        super(message, { cause });
        this.__isWebAuthnError = true;
        this.name = (_a = name !== null && name !== void 0 ? name : cause instanceof Error ? cause.name : void 0) !== null && _a !== void 0 ? _a : "Unknown Error";
        this.code = code;
      }
    };
    WebAuthnUnknownError = class extends WebAuthnError {
      constructor(message, originalError) {
        super({
          code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
          cause: originalError,
          message
        });
        this.name = "WebAuthnUnknownError";
        this.originalError = originalError;
      }
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/lib/webauthn.js
function deserializeCredentialCreationOptions(options) {
  if (!options) {
    throw new Error("Credential creation options are required");
  }
  if (typeof PublicKeyCredential !== "undefined" && "parseCreationOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function") {
    return PublicKeyCredential.parseCreationOptionsFromJSON(
      /** we assert the options here as typescript still doesn't know about future webauthn types */
      options
    );
  }
  const { challenge: challengeStr, user: userOpts, excludeCredentials } = options, restOptions = __rest(
    options,
    ["challenge", "user", "excludeCredentials"]
  );
  const challenge = base64UrlToUint8Array(challengeStr).buffer;
  const user = Object.assign(Object.assign({}, userOpts), { id: base64UrlToUint8Array(userOpts.id).buffer });
  const result = Object.assign(Object.assign({}, restOptions), {
    challenge,
    user
  });
  if (excludeCredentials && excludeCredentials.length > 0) {
    result.excludeCredentials = new Array(excludeCredentials.length);
    for (let i = 0; i < excludeCredentials.length; i++) {
      const cred = excludeCredentials[i];
      result.excludeCredentials[i] = Object.assign(Object.assign({}, cred), {
        id: base64UrlToUint8Array(cred.id).buffer,
        type: cred.type || "public-key",
        // Cast transports to handle future transport types like "cable"
        transports: cred.transports
      });
    }
  }
  return result;
}
function deserializeCredentialRequestOptions(options) {
  if (!options) {
    throw new Error("Credential request options are required");
  }
  if (typeof PublicKeyCredential !== "undefined" && "parseRequestOptionsFromJSON" in PublicKeyCredential && typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function") {
    return PublicKeyCredential.parseRequestOptionsFromJSON(options);
  }
  const { challenge: challengeStr, allowCredentials } = options, restOptions = __rest(
    options,
    ["challenge", "allowCredentials"]
  );
  const challenge = base64UrlToUint8Array(challengeStr).buffer;
  const result = Object.assign(Object.assign({}, restOptions), { challenge });
  if (allowCredentials && allowCredentials.length > 0) {
    result.allowCredentials = new Array(allowCredentials.length);
    for (let i = 0; i < allowCredentials.length; i++) {
      const cred = allowCredentials[i];
      result.allowCredentials[i] = Object.assign(Object.assign({}, cred), {
        id: base64UrlToUint8Array(cred.id).buffer,
        type: cred.type || "public-key",
        // Cast transports to handle future transport types like "cable"
        transports: cred.transports
      });
    }
  }
  return result;
}
function serializeCredentialCreationResponse(credential) {
  var _a;
  if ("toJSON" in credential && typeof credential.toJSON === "function") {
    return credential.toJSON();
  }
  const credentialWithAttachment = credential;
  return {
    id: credential.id,
    rawId: credential.id,
    response: {
      attestationObject: bytesToBase64URL(new Uint8Array(credential.response.attestationObject)),
      clientDataJSON: bytesToBase64URL(new Uint8Array(credential.response.clientDataJSON))
    },
    type: "public-key",
    clientExtensionResults: credential.getClientExtensionResults(),
    // Convert null to undefined and cast to AuthenticatorAttachment type
    authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
  };
}
function serializeCredentialRequestResponse(credential) {
  var _a;
  if ("toJSON" in credential && typeof credential.toJSON === "function") {
    return credential.toJSON();
  }
  const credentialWithAttachment = credential;
  const clientExtensionResults = credential.getClientExtensionResults();
  const assertionResponse = credential.response;
  return {
    id: credential.id,
    rawId: credential.id,
    // W3C spec expects rawId to match id for JSON format
    response: {
      authenticatorData: bytesToBase64URL(new Uint8Array(assertionResponse.authenticatorData)),
      clientDataJSON: bytesToBase64URL(new Uint8Array(assertionResponse.clientDataJSON)),
      signature: bytesToBase64URL(new Uint8Array(assertionResponse.signature)),
      userHandle: assertionResponse.userHandle ? bytesToBase64URL(new Uint8Array(assertionResponse.userHandle)) : void 0
    },
    type: "public-key",
    clientExtensionResults,
    // Convert null to undefined and cast to AuthenticatorAttachment type
    authenticatorAttachment: (_a = credentialWithAttachment.authenticatorAttachment) !== null && _a !== void 0 ? _a : void 0
  };
}
function isValidDomain(hostname) {
  return (
    // Consider localhost valid as well since it's okay wrt Secure Contexts
    hostname === "localhost" || /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i.test(hostname)
  );
}
function browserSupportsWebAuthn() {
  var _a, _b;
  return !!(isBrowser() && "PublicKeyCredential" in window && window.PublicKeyCredential && "credentials" in navigator && typeof ((_a = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _a === void 0 ? void 0 : _a.create) === "function" && typeof ((_b = navigator === null || navigator === void 0 ? void 0 : navigator.credentials) === null || _b === void 0 ? void 0 : _b.get) === "function");
}
async function createCredential(options) {
  try {
    const response = await navigator.credentials.create(
      /** we assert the type here until typescript types are updated */
      options
    );
    if (!response) {
      return {
        data: null,
        error: new WebAuthnUnknownError("Empty credential response", response)
      };
    }
    if (!(response instanceof PublicKeyCredential)) {
      return {
        data: null,
        error: new WebAuthnUnknownError("Browser returned unexpected credential type", response)
      };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: identifyRegistrationError({
        error: err,
        options
      })
    };
  }
}
async function getCredential(options) {
  try {
    const response = await navigator.credentials.get(
      /** we assert the type here until typescript types are updated */
      options
    );
    if (!response) {
      return {
        data: null,
        error: new WebAuthnUnknownError("Empty credential response", response)
      };
    }
    if (!(response instanceof PublicKeyCredential)) {
      return {
        data: null,
        error: new WebAuthnUnknownError("Browser returned unexpected credential type", response)
      };
    }
    return { data: response, error: null };
  } catch (err) {
    return {
      data: null,
      error: identifyAuthenticationError({
        error: err,
        options
      })
    };
  }
}
function deepMerge(...sources) {
  const isObject = (val) => val !== null && typeof val === "object" && !Array.isArray(val);
  const isArrayBufferLike = (val) => val instanceof ArrayBuffer || ArrayBuffer.isView(val);
  const result = {};
  for (const source of sources) {
    if (!source)
      continue;
    for (const key in source) {
      const value = source[key];
      if (value === void 0)
        continue;
      if (Array.isArray(value)) {
        result[key] = value;
      } else if (isArrayBufferLike(value)) {
        result[key] = value;
      } else if (isObject(value)) {
        const existing = result[key];
        if (isObject(existing)) {
          result[key] = deepMerge(existing, value);
        } else {
          result[key] = deepMerge(value);
        }
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}
function mergeCredentialCreationOptions(baseOptions, overrides) {
  return deepMerge(DEFAULT_CREATION_OPTIONS, baseOptions, overrides || {});
}
function mergeCredentialRequestOptions(baseOptions, overrides) {
  return deepMerge(DEFAULT_REQUEST_OPTIONS, baseOptions, overrides || {});
}
var WebAuthnAbortService, webAuthnAbortService, DEFAULT_CREATION_OPTIONS, DEFAULT_REQUEST_OPTIONS, WebAuthnApi;
var init_webauthn = __esm({
  "node_modules/@supabase/auth-js/dist/module/lib/webauthn.js"() {
    init_tslib_es6();
    init_base64url();
    init_errors();
    init_helpers();
    init_webauthn_errors();
    WebAuthnAbortService = class {
      /**
       * Create an abort signal for a new WebAuthn operation.
       * Automatically cancels any existing operation.
       *
       * @returns {AbortSignal} Signal to pass to navigator.credentials.create() or .get()
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal MDN - AbortSignal}
       */
      createNewAbortSignal() {
        if (this.controller) {
          const abortError = new Error("Cancelling existing WebAuthn API call for new one");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
        }
        const newController = new AbortController();
        this.controller = newController;
        return newController.signal;
      }
      /**
       * Manually cancel the current WebAuthn operation.
       * Useful for cleaning up when user cancels or navigates away.
       *
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/AbortController/abort MDN - AbortController.abort}
       */
      cancelCeremony() {
        if (this.controller) {
          const abortError = new Error("Manually cancelling existing WebAuthn API call");
          abortError.name = "AbortError";
          this.controller.abort(abortError);
          this.controller = void 0;
        }
      }
    };
    webAuthnAbortService = new WebAuthnAbortService();
    DEFAULT_CREATION_OPTIONS = {
      hints: ["security-key"],
      authenticatorSelection: {
        authenticatorAttachment: "cross-platform",
        requireResidentKey: false,
        /** set to preferred because older yubikeys don't have PIN/Biometric */
        userVerification: "preferred",
        residentKey: "discouraged"
      },
      attestation: "direct"
    };
    DEFAULT_REQUEST_OPTIONS = {
      /** set to preferred because older yubikeys don't have PIN/Biometric */
      userVerification: "preferred",
      hints: ["security-key"],
      attestation: "direct"
    };
    WebAuthnApi = class {
      constructor(client) {
        this.client = client;
        this.enroll = this._enroll.bind(this);
        this.challenge = this._challenge.bind(this);
        this.verify = this._verify.bind(this);
        this.authenticate = this._authenticate.bind(this);
        this.register = this._register.bind(this);
      }
      /**
       * Enroll a new WebAuthn factor.
       * Creates an unverified WebAuthn factor that must be verified with a credential.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Omit<MFAEnrollWebauthnParams, 'factorType'>} params - Enrollment parameters (friendlyName required)
       * @returns {Promise<AuthMFAEnrollWebauthnResponse>} Enrolled factor details or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registering a New Credential}
       */
      async _enroll(params) {
        return this.client.mfa.enroll(Object.assign(Object.assign({}, params), { factorType: "webauthn" }));
      }
      /**
       * Challenge for WebAuthn credential creation or authentication.
       * Combines server challenge with browser credential operations.
       * Handles both registration (create) and authentication (request) flows.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {MFAChallengeWebauthnParams & { friendlyName?: string; signal?: AbortSignal }} params - Challenge parameters including factorId
       * @param {Object} overrides - Allows you to override the parameters passed to navigator.credentials
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides.create - Override options for credential creation
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides.request - Override options for credential request
       * @returns {Promise<RequestResult>} Challenge response with credential or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-credential-creation W3C WebAuthn Spec - Credential Creation}
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying Assertion}
       */
      async _challenge({ factorId, webauthn, friendlyName, signal }, overrides) {
        var _a;
        try {
          const { data: challengeResponse, error: challengeError } = await this.client.mfa.challenge({
            factorId,
            webauthn
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const abortSignal = signal !== null && signal !== void 0 ? signal : webAuthnAbortService.createNewAbortSignal();
          if (challengeResponse.webauthn.type === "create") {
            const { user } = challengeResponse.webauthn.credential_options.publicKey;
            if (!user.name) {
              const nameToUse = friendlyName;
              if (!nameToUse) {
                const currentUser = await this.client.getUser();
                const userData = currentUser.data.user;
                const fallbackName = ((_a = userData === null || userData === void 0 ? void 0 : userData.user_metadata) === null || _a === void 0 ? void 0 : _a.name) || (userData === null || userData === void 0 ? void 0 : userData.email) || (userData === null || userData === void 0 ? void 0 : userData.id) || "User";
                user.name = `${user.id}:${fallbackName}`;
              } else {
                user.name = `${user.id}:${nameToUse}`;
              }
            }
            if (!user.displayName) {
              user.displayName = user.name;
            }
          }
          switch (challengeResponse.webauthn.type) {
            case "create": {
              const options = mergeCredentialCreationOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.create);
              const { data, error } = await createCredential({
                publicKey: options,
                signal: abortSignal
              });
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
            case "request": {
              const options = mergeCredentialRequestOptions(challengeResponse.webauthn.credential_options.publicKey, overrides === null || overrides === void 0 ? void 0 : overrides.request);
              const { data, error } = await getCredential(Object.assign(Object.assign({}, challengeResponse.webauthn.credential_options), { publicKey: options, signal: abortSignal }));
              if (data) {
                return {
                  data: {
                    factorId,
                    challengeId: challengeResponse.id,
                    webauthn: {
                      type: challengeResponse.webauthn.type,
                      credential_response: data
                    }
                  },
                  error: null
                };
              }
              return { data: null, error };
            }
          }
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new AuthUnknownError("Unexpected error in challenge", error)
          };
        }
      }
      /**
       * Verify a WebAuthn credential with the server.
       * Completes the WebAuthn ceremony by sending the credential to the server for verification.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Verification parameters
       * @param {string} params.challengeId - ID of the challenge being verified
       * @param {string} params.factorId - ID of the WebAuthn factor
       * @param {MFAVerifyWebauthnParams<T>['webauthn']} params.webauthn - WebAuthn credential response
       * @returns {Promise<AuthMFAVerifyResponse>} Verification result with session or error
       * @see {@link https://w3c.github.io/webauthn/#sctn-verifying-assertion W3C WebAuthn Spec - Verifying an Authentication Assertion}
       * */
      async _verify({ challengeId, factorId, webauthn }) {
        return this.client.mfa.verify({
          factorId,
          challengeId,
          webauthn
        });
      }
      /**
       * Complete WebAuthn authentication flow.
       * Performs challenge and verification in a single operation for existing credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Authentication parameters
       * @param {string} params.factorId - ID of the WebAuthn factor to authenticate with
       * @param {Object} params.webauthn - WebAuthn configuration
       * @param {string} params.webauthn.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.webauthn.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.webauthn.signal - Optional abort signal
       * @param {PublicKeyCredentialRequestOptionsFuture} overrides - Override options for navigator.credentials.get
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Authentication result
       * @see {@link https://w3c.github.io/webauthn/#sctn-authentication W3C WebAuthn Spec - Authentication Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialRequestOptions MDN - PublicKeyCredentialRequestOptions}
       */
      async _authenticate({ factorId, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new AuthError("rpId is required for WebAuthn authentication")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: challengeResponse, error: challengeError } = await this.challenge({
            factorId,
            webauthn: { rpId, rpOrigins },
            signal
          }, { request: overrides });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          const { webauthn } = challengeResponse;
          return this._verify({
            factorId,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              type: webauthn.type,
              rpId,
              rpOrigins,
              credential_response: webauthn.credential_response
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new AuthUnknownError("Unexpected error in authenticate", error)
          };
        }
      }
      /**
       * Complete WebAuthn registration flow.
       * Performs enrollment, challenge, and verification in a single operation for new credentials.
       *
       * @experimental This method is experimental and may change in future releases
       * @param {Object} params - Registration parameters
       * @param {string} params.friendlyName - User-friendly name for the credential
       * @param {string} params.rpId - Relying Party ID (defaults to current hostname)
       * @param {string[]} params.rpOrigins - Allowed origins (defaults to current origin)
       * @param {AbortSignal} params.signal - Optional abort signal
       * @param {PublicKeyCredentialCreationOptionsFuture} overrides - Override options for navigator.credentials.create
       * @returns {Promise<RequestResult<AuthMFAVerifyResponseData, WebAuthnError | AuthError>>} Registration result
       * @see {@link https://w3c.github.io/webauthn/#sctn-registering-a-new-credential W3C WebAuthn Spec - Registration Ceremony}
       * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/PublicKeyCredentialCreationOptions MDN - PublicKeyCredentialCreationOptions}
       */
      async _register({ friendlyName, webauthn: { rpId = typeof window !== "undefined" ? window.location.hostname : void 0, rpOrigins = typeof window !== "undefined" ? [window.location.origin] : void 0, signal } = {} }, overrides) {
        if (!rpId) {
          return {
            data: null,
            error: new AuthError("rpId is required for WebAuthn registration")
          };
        }
        try {
          if (!browserSupportsWebAuthn()) {
            return {
              data: null,
              error: new AuthUnknownError("Browser does not support WebAuthn", null)
            };
          }
          const { data: factor, error: enrollError } = await this._enroll({
            friendlyName
          });
          if (!factor) {
            await this.client.mfa.listFactors().then((factors) => {
              var _a;
              return (_a = factors.data) === null || _a === void 0 ? void 0 : _a.all.find((v) => v.factor_type === "webauthn" && v.friendly_name === friendlyName && v.status !== "unverified");
            }).then((factor2) => factor2 ? this.client.mfa.unenroll({ factorId: factor2 === null || factor2 === void 0 ? void 0 : factor2.id }) : void 0);
            return { data: null, error: enrollError };
          }
          const { data: challengeResponse, error: challengeError } = await this._challenge({
            factorId: factor.id,
            friendlyName: factor.friendly_name,
            webauthn: { rpId, rpOrigins },
            signal
          }, {
            create: overrides
          });
          if (!challengeResponse) {
            return { data: null, error: challengeError };
          }
          return this._verify({
            factorId: factor.id,
            challengeId: challengeResponse.challengeId,
            webauthn: {
              rpId,
              rpOrigins,
              type: challengeResponse.webauthn.type,
              credential_response: challengeResponse.webauthn.credential_response
            }
          });
        } catch (error) {
          if (isAuthError(error)) {
            return { data: null, error };
          }
          return {
            data: null,
            error: new AuthUnknownError("Unexpected error in register", error)
          };
        }
      }
    };
  }
});

// node_modules/@supabase/auth-js/dist/module/GoTrueClient.js
async function lockNoOp(name, acquireTimeout, fn) {
  return await fn();
}
var DEFAULT_OPTIONS, GLOBAL_JWKS, GoTrueClient, GoTrueClient_default;
var init_GoTrueClient = __esm({
  "node_modules/@supabase/auth-js/dist/module/GoTrueClient.js"() {
    init_GoTrueAdminApi();
    init_constants2();
    init_errors();
    init_fetch();
    init_helpers();
    init_local_storage();
    init_locks();
    init_polyfills();
    init_version2();
    init_base64url();
    init_ethereum();
    init_webauthn();
    polyfillGlobalThis();
    DEFAULT_OPTIONS = {
      url: GOTRUE_URL,
      storageKey: STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      headers: DEFAULT_HEADERS2,
      flowType: "implicit",
      debug: false,
      hasCustomAuthorizationHeader: false,
      throwOnError: false,
      lockAcquireTimeout: 5e3,
      // 5 seconds
      skipAutoInitialize: false
    };
    GLOBAL_JWKS = {};
    GoTrueClient = class _GoTrueClient {
      /**
       * The JWKS used for verifying asymmetric JWTs
       */
      get jwks() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.jwks) !== null && _b !== void 0 ? _b : { keys: [] };
      }
      set jwks(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { jwks: value });
      }
      get jwks_cached_at() {
        var _a, _b;
        return (_b = (_a = GLOBAL_JWKS[this.storageKey]) === null || _a === void 0 ? void 0 : _a.cachedAt) !== null && _b !== void 0 ? _b : Number.MIN_SAFE_INTEGER;
      }
      set jwks_cached_at(value) {
        GLOBAL_JWKS[this.storageKey] = Object.assign(Object.assign({}, GLOBAL_JWKS[this.storageKey]), { cachedAt: value });
      }
      /**
       * Create a new client for use in the browser.
       *
       * @example
       * ```ts
       * import { GoTrueClient } from '@supabase/auth-js'
       *
       * const auth = new GoTrueClient({
       *   url: 'https://xyzcompany.supabase.co/auth/v1',
       *   headers: { apikey: 'public-anon-key' },
       *   storageKey: 'supabase-auth',
       * })
       * ```
       */
      constructor(options) {
        var _a, _b, _c;
        this.userStorage = null;
        this.memoryStorage = null;
        this.stateChangeEmitters = /* @__PURE__ */ new Map();
        this.autoRefreshTicker = null;
        this.autoRefreshTickTimeout = null;
        this.visibilityChangedCallback = null;
        this.refreshingDeferred = null;
        this.initializePromise = null;
        this.detectSessionInUrl = true;
        this.hasCustomAuthorizationHeader = false;
        this.suppressGetSessionWarning = false;
        this.lockAcquired = false;
        this.pendingInLock = [];
        this.broadcastChannel = null;
        this.logger = console.log;
        const settings = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
        this.storageKey = settings.storageKey;
        this.instanceID = (_a = _GoTrueClient.nextInstanceID[this.storageKey]) !== null && _a !== void 0 ? _a : 0;
        _GoTrueClient.nextInstanceID[this.storageKey] = this.instanceID + 1;
        this.logDebugMessages = !!settings.debug;
        if (typeof settings.debug === "function") {
          this.logger = settings.debug;
        }
        if (this.instanceID > 0 && isBrowser()) {
          const message = `${this._logPrefix()} Multiple GoTrueClient instances detected in the same browser context. It is not an error, but this should be avoided as it may produce undefined behavior when used concurrently under the same storage key.`;
          console.warn(message);
          if (this.logDebugMessages) {
            console.trace(message);
          }
        }
        this.persistSession = settings.persistSession;
        this.autoRefreshToken = settings.autoRefreshToken;
        this.admin = new GoTrueAdminApi({
          url: settings.url,
          headers: settings.headers,
          fetch: settings.fetch
        });
        this.url = settings.url;
        this.headers = settings.headers;
        this.fetch = resolveFetch3(settings.fetch);
        this.lock = settings.lock || lockNoOp;
        this.detectSessionInUrl = settings.detectSessionInUrl;
        this.flowType = settings.flowType;
        this.hasCustomAuthorizationHeader = settings.hasCustomAuthorizationHeader;
        this.throwOnError = settings.throwOnError;
        this.lockAcquireTimeout = settings.lockAcquireTimeout;
        if (settings.lock) {
          this.lock = settings.lock;
        } else if (this.persistSession && isBrowser() && ((_b = globalThis === null || globalThis === void 0 ? void 0 : globalThis.navigator) === null || _b === void 0 ? void 0 : _b.locks)) {
          this.lock = navigatorLock;
        } else {
          this.lock = lockNoOp;
        }
        if (!this.jwks) {
          this.jwks = { keys: [] };
          this.jwks_cached_at = Number.MIN_SAFE_INTEGER;
        }
        this.mfa = {
          verify: this._verify.bind(this),
          enroll: this._enroll.bind(this),
          unenroll: this._unenroll.bind(this),
          challenge: this._challenge.bind(this),
          listFactors: this._listFactors.bind(this),
          challengeAndVerify: this._challengeAndVerify.bind(this),
          getAuthenticatorAssuranceLevel: this._getAuthenticatorAssuranceLevel.bind(this),
          webauthn: new WebAuthnApi(this)
        };
        this.oauth = {
          getAuthorizationDetails: this._getAuthorizationDetails.bind(this),
          approveAuthorization: this._approveAuthorization.bind(this),
          denyAuthorization: this._denyAuthorization.bind(this),
          listGrants: this._listOAuthGrants.bind(this),
          revokeGrant: this._revokeOAuthGrant.bind(this)
        };
        if (this.persistSession) {
          if (settings.storage) {
            this.storage = settings.storage;
          } else {
            if (supportsLocalStorage()) {
              this.storage = globalThis.localStorage;
            } else {
              this.memoryStorage = {};
              this.storage = memoryLocalStorageAdapter(this.memoryStorage);
            }
          }
          if (settings.userStorage) {
            this.userStorage = settings.userStorage;
          }
        } else {
          this.memoryStorage = {};
          this.storage = memoryLocalStorageAdapter(this.memoryStorage);
        }
        if (isBrowser() && globalThis.BroadcastChannel && this.persistSession && this.storageKey) {
          try {
            this.broadcastChannel = new globalThis.BroadcastChannel(this.storageKey);
          } catch (e) {
            console.error("Failed to create a new BroadcastChannel, multi-tab state changes will not be available", e);
          }
          (_c = this.broadcastChannel) === null || _c === void 0 ? void 0 : _c.addEventListener("message", async (event) => {
            this._debug("received broadcast notification from other tab or client", event);
            try {
              await this._notifyAllSubscribers(event.data.event, event.data.session, false);
            } catch (error) {
              this._debug("#broadcastChannel", "error", error);
            }
          });
        }
        if (!settings.skipAutoInitialize) {
          this.initialize().catch((error) => {
            this._debug("#initialize()", "error", error);
          });
        }
      }
      /**
       * Returns whether error throwing mode is enabled for this client.
       */
      isThrowOnErrorEnabled() {
        return this.throwOnError;
      }
      /**
       * Centralizes return handling with optional error throwing. When `throwOnError` is enabled
       * and the provided result contains a non-nullish error, the error is thrown instead of
       * being returned. This ensures consistent behavior across all public API methods.
       */
      _returnResult(result) {
        if (this.throwOnError && result && result.error) {
          throw result.error;
        }
        return result;
      }
      _logPrefix() {
        return `GoTrueClient@${this.storageKey}:${this.instanceID} (${version3}) ${(/* @__PURE__ */ new Date()).toISOString()}`;
      }
      _debug(...args) {
        if (this.logDebugMessages) {
          this.logger(this._logPrefix(), ...args);
        }
        return this;
      }
      /**
       * Initializes the client session either from the url or from storage.
       * This method is automatically called when instantiating the client, but should also be called
       * manually when checking for an error from an auth redirect (oauth, magiclink, password recovery, etc).
       */
      async initialize() {
        if (this.initializePromise) {
          return await this.initializePromise;
        }
        this.initializePromise = (async () => {
          return await this._acquireLock(this.lockAcquireTimeout, async () => {
            return await this._initialize();
          });
        })();
        return await this.initializePromise;
      }
      /**
       * IMPORTANT:
       * 1. Never throw in this method, as it is called from the constructor
       * 2. Never return a session from this method as it would be cached over
       *    the whole lifetime of the client
       */
      async _initialize() {
        var _a;
        try {
          let params = {};
          let callbackUrlType = "none";
          if (isBrowser()) {
            params = parseParametersFromURL(window.location.href);
            if (this._isImplicitGrantCallback(params)) {
              callbackUrlType = "implicit";
            } else if (await this._isPKCECallback(params)) {
              callbackUrlType = "pkce";
            }
          }
          if (isBrowser() && this.detectSessionInUrl && callbackUrlType !== "none") {
            const { data, error } = await this._getSessionFromURL(params, callbackUrlType);
            if (error) {
              this._debug("#_initialize()", "error detecting session from URL", error);
              if (isAuthImplicitGrantRedirectError(error)) {
                const errorCode = (_a = error.details) === null || _a === void 0 ? void 0 : _a.code;
                if (errorCode === "identity_already_exists" || errorCode === "identity_not_found" || errorCode === "single_identity_not_deletable") {
                  return { error };
                }
              }
              return { error };
            }
            const { session, redirectType } = data;
            this._debug("#_initialize()", "detected session in URL", session, "redirect type", redirectType);
            await this._saveSession(session);
            setTimeout(async () => {
              if (redirectType === "recovery") {
                await this._notifyAllSubscribers("PASSWORD_RECOVERY", session);
              } else {
                await this._notifyAllSubscribers("SIGNED_IN", session);
              }
            }, 0);
            return { error: null };
          }
          await this._recoverAndRefresh();
          return { error: null };
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ error });
          }
          return this._returnResult({
            error: new AuthUnknownError("Unexpected error during initialization", error)
          });
        } finally {
          await this._handleVisibilityChange();
          this._debug("#_initialize()", "end");
        }
      }
      /**
       * Creates a new anonymous user.
       *
       * @returns A session where the is_anonymous claim in the access token JWT set to true
       */
      async signInAnonymously(credentials) {
        var _a, _b, _c;
        try {
          const res = await _request(this.fetch, "POST", `${this.url}/signup`, {
            headers: this.headers,
            body: {
              data: (_b = (_a = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _a === void 0 ? void 0 : _a.data) !== null && _b !== void 0 ? _b : {},
              gotrue_meta_security: { captcha_token: (_c = credentials === null || credentials === void 0 ? void 0 : credentials.options) === null || _c === void 0 ? void 0 : _c.captchaToken }
            },
            xform: _sessionResponse
          });
          const { data, error } = res;
          if (error || !data) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Creates a new user.
       *
       * Be aware that if a user account exists in the system you may get back an
       * error message that attempts to hide this information from the user.
       * This method has support for PKCE via email signups. The PKCE flow cannot be used when autoconfirm is enabled.
       *
       * @returns A logged-in session if the server has "autoconfirm" ON
       * @returns A user if the server has "autoconfirm" OFF
       *
       * @category Auth
       *
       * @remarks
       * - By default, the user needs to verify their email address before logging in. To turn this off, disable **Confirm email** in [your project](/dashboard/project/_/auth/providers).
       * - **Confirm email** determines if users need to confirm their email address after signing up.
       *   - If **Confirm email** is enabled, a `user` is returned but `session` is null.
       *   - If **Confirm email** is disabled, both a `user` and a `session` are returned.
       * - When the user confirms their email address, they are redirected to the [`SITE_URL`](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) by default. You can modify your `SITE_URL` or add additional redirect URLs in [your project](/dashboard/project/_/auth/url-configuration).
       * - If signUp() is called for an existing confirmed user:
       *   - When both **Confirm email** and **Confirm phone** (even when phone provider is disabled) are enabled in [your project](/dashboard/project/_/auth/providers), an obfuscated/fake user object is returned.
       *   - When either **Confirm email** or **Confirm phone** (even when phone provider is disabled) is disabled, the error message, `User already registered` is returned.
       * - To fetch the currently logged-in user, refer to [`getUser()`](/docs/reference/javascript/auth-getuser).
       *
       * @example Sign up with an email and password
       * ```js
       * const { data, error } = await supabase.auth.signUp({
       *   email: 'example@email.com',
       *   password: 'example-password',
       * })
       * ```
       *
       * @exampleResponse Sign up with an email and password
       * ```json
       * // Some fields may be null if "confirm email" is enabled.
       * {
       *   "data": {
       *     "user": {
       *       "id": "11111111-1111-1111-1111-111111111111",
       *       "aud": "authenticated",
       *       "role": "authenticated",
       *       "email": "example@email.com",
       *       "email_confirmed_at": "2024-01-01T00:00:00Z",
       *       "phone": "",
       *       "last_sign_in_at": "2024-01-01T00:00:00Z",
       *       "app_metadata": {
       *         "provider": "email",
       *         "providers": [
       *           "email"
       *         ]
       *       },
       *       "user_metadata": {},
       *       "identities": [
       *         {
       *           "identity_id": "22222222-2222-2222-2222-222222222222",
       *           "id": "11111111-1111-1111-1111-111111111111",
       *           "user_id": "11111111-1111-1111-1111-111111111111",
       *           "identity_data": {
       *             "email": "example@email.com",
       *             "email_verified": false,
       *             "phone_verified": false,
       *             "sub": "11111111-1111-1111-1111-111111111111"
       *           },
       *           "provider": "email",
       *           "last_sign_in_at": "2024-01-01T00:00:00Z",
       *           "created_at": "2024-01-01T00:00:00Z",
       *           "updated_at": "2024-01-01T00:00:00Z",
       *           "email": "example@email.com"
       *         }
       *       ],
       *       "created_at": "2024-01-01T00:00:00Z",
       *       "updated_at": "2024-01-01T00:00:00Z"
       *     },
       *     "session": {
       *       "access_token": "<ACCESS_TOKEN>",
       *       "token_type": "bearer",
       *       "expires_in": 3600,
       *       "expires_at": 1700000000,
       *       "refresh_token": "<REFRESH_TOKEN>",
       *       "user": {
       *         "id": "11111111-1111-1111-1111-111111111111",
       *         "aud": "authenticated",
       *         "role": "authenticated",
       *         "email": "example@email.com",
       *         "email_confirmed_at": "2024-01-01T00:00:00Z",
       *         "phone": "",
       *         "last_sign_in_at": "2024-01-01T00:00:00Z",
       *         "app_metadata": {
       *           "provider": "email",
       *           "providers": [
       *             "email"
       *           ]
       *         },
       *         "user_metadata": {},
       *         "identities": [
       *           {
       *             "identity_id": "22222222-2222-2222-2222-222222222222",
       *             "id": "11111111-1111-1111-1111-111111111111",
       *             "user_id": "11111111-1111-1111-1111-111111111111",
       *             "identity_data": {
       *               "email": "example@email.com",
       *               "email_verified": false,
       *               "phone_verified": false,
       *               "sub": "11111111-1111-1111-1111-111111111111"
       *             },
       *             "provider": "email",
       *             "last_sign_in_at": "2024-01-01T00:00:00Z",
       *             "created_at": "2024-01-01T00:00:00Z",
       *             "updated_at": "2024-01-01T00:00:00Z",
       *             "email": "example@email.com"
       *           }
       *         ],
       *         "created_at": "2024-01-01T00:00:00Z",
       *         "updated_at": "2024-01-01T00:00:00Z"
       *       }
       *     }
       *   },
       *   "error": null
       * }
       * ```
       *
       * @example Sign up with a phone number and password (SMS)
       * ```js
       * const { data, error } = await supabase.auth.signUp({
       *   phone: '123456789',
       *   password: 'example-password',
       *   options: {
       *     channel: 'sms'
       *   }
       * })
       * ```
       *
       * @exampleDescription Sign up with a phone number and password (whatsapp)
       * The user will be sent a WhatsApp message which contains a OTP. By default, a given user can only request a OTP once every 60 seconds. Note that a user will need to have a valid WhatsApp account that is linked to Twilio in order to use this feature.
       *
       * @example Sign up with a phone number and password (whatsapp)
       * ```js
       * const { data, error } = await supabase.auth.signUp({
       *   phone: '123456789',
       *   password: 'example-password',
       *   options: {
       *     channel: 'whatsapp'
       *   }
       * })
       * ```
       *
       * @example Sign up with additional user metadata
       * ```js
       * const { data, error } = await supabase.auth.signUp(
       *   {
       *     email: 'example@email.com',
       *     password: 'example-password',
       *     options: {
       *       data: {
       *         first_name: 'John',
       *         age: 27,
       *       }
       *     }
       *   }
       * )
       * ```
       *
       * @exampleDescription Sign up with a redirect URL
       * - See [redirect URLs and wildcards](/docs/guides/auth/redirect-urls#use-wildcards-in-redirect-urls) to add additional redirect URLs to your project.
       *
       * @example Sign up with a redirect URL
       * ```js
       * const { data, error } = await supabase.auth.signUp(
       *   {
       *     email: 'example@email.com',
       *     password: 'example-password',
       *     options: {
       *       emailRedirectTo: 'https://example.com/welcome'
       *     }
       *   }
       * )
       * ```
       */
      async signUp(credentials) {
        var _a, _b, _c;
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
            }
            res = await _request(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: {
                email,
                password,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              xform: _sessionResponse
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await _request(this.fetch, "POST", `${this.url}/signup`, {
              headers: this.headers,
              body: {
                phone,
                password,
                data: (_b = options === null || options === void 0 ? void 0 : options.data) !== null && _b !== void 0 ? _b : {},
                channel: (_c = options === null || options === void 0 ? void 0 : options.channel) !== null && _c !== void 0 ? _c : "sms",
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: _sessionResponse
            });
          } else {
            throw new AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error || !data) {
            await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          const session = data.session;
          const user = data.user;
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user with an email and password or phone and password.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or that the
       * email/phone and password combination is wrong or that the account can only
       * be accessed via social login.
       */
      async signInWithPassword(credentials) {
        try {
          let res;
          if ("email" in credentials) {
            const { email, password, options } = credentials;
            res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                email,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: _sessionResponsePassword
            });
          } else if ("phone" in credentials) {
            const { phone, password, options } = credentials;
            res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=password`, {
              headers: this.headers,
              body: {
                phone,
                password,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: _sessionResponsePassword
            });
          } else {
            throw new AuthInvalidCredentialsError("You must provide either an email or phone number and a password");
          }
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({
            data: Object.assign({ user: data.user, session: data.session }, data.weak_password ? { weakPassword: data.weak_password } : null),
            error
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in an existing user via a third-party provider.
       * This method supports the PKCE flow.
       */
      async signInWithOAuth(credentials) {
        var _a, _b, _c, _d;
        return await this._handleProviderSignIn(credentials.provider, {
          redirectTo: (_a = credentials.options) === null || _a === void 0 ? void 0 : _a.redirectTo,
          scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
          queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
          skipBrowserRedirect: (_d = credentials.options) === null || _d === void 0 ? void 0 : _d.skipBrowserRedirect
        });
      }
      /**
       * Log in an existing user by exchanging an Auth Code issued during the PKCE flow.
       */
      async exchangeCodeForSession(authCode) {
        await this.initializePromise;
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._exchangeCodeForSession(authCode);
        });
      }
      /**
       * Signs in a user by verifying a message signed by the user's private key.
       * Supports Ethereum (via Sign-In-With-Ethereum) & Solana (Sign-In-With-Solana) standards,
       * both of which derive from the EIP-4361 standard
       * With slight variation on Solana's side.
       * @reference https://eips.ethereum.org/EIPS/eip-4361
       */
      async signInWithWeb3(credentials) {
        const { chain } = credentials;
        switch (chain) {
          case "ethereum":
            return await this.signInWithEthereum(credentials);
          case "solana":
            return await this.signInWithSolana(credentials);
          default:
            throw new Error(`@supabase/auth-js: Unsupported chain "${chain}"`);
        }
      }
      async signInWithEthereum(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!isBrowser()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("ethereum" in windowAny && typeof windowAny.ethereum === "object" && "request" in windowAny.ethereum && typeof windowAny.ethereum.request === "function") {
              resolvedWallet = windowAny.ethereum;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Ethereum wallet interface on the window object (window.ethereum) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'ethereum', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          const accounts = await resolvedWallet.request({
            method: "eth_requestAccounts"
          }).then((accs) => accs).catch(() => {
            throw new Error(`@supabase/auth-js: Wallet method eth_requestAccounts is missing or invalid`);
          });
          if (!accounts || accounts.length === 0) {
            throw new Error(`@supabase/auth-js: No accounts available. Please ensure the wallet is connected.`);
          }
          const address = getAddress(accounts[0]);
          let chainId = (_b = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _b === void 0 ? void 0 : _b.chainId;
          if (!chainId) {
            const chainIdHex = await resolvedWallet.request({
              method: "eth_chainId"
            });
            chainId = fromHex(chainIdHex);
          }
          const siweMessage = {
            domain: url.host,
            address,
            statement,
            uri: url.href,
            version: "1",
            chainId,
            nonce: (_c = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _c === void 0 ? void 0 : _c.nonce,
            issuedAt: (_e = (_d = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _d === void 0 ? void 0 : _d.issuedAt) !== null && _e !== void 0 ? _e : /* @__PURE__ */ new Date(),
            expirationTime: (_f = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _f === void 0 ? void 0 : _f.expirationTime,
            notBefore: (_g = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _g === void 0 ? void 0 : _g.notBefore,
            requestId: (_h = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _h === void 0 ? void 0 : _h.requestId,
            resources: (_j = options === null || options === void 0 ? void 0 : options.signInWithEthereum) === null || _j === void 0 ? void 0 : _j.resources
          };
          message = createSiweMessage(siweMessage);
          signature = await resolvedWallet.request({
            method: "personal_sign",
            params: [toHex(message), address]
          });
        }
        try {
          const { data, error } = await _request(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({
              chain: "ethereum",
              message,
              signature
            }, ((_k = credentials.options) === null || _k === void 0 ? void 0 : _k.captchaToken) ? { gotrue_meta_security: { captcha_token: (_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken } } : null),
            xform: _sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async signInWithSolana(credentials) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        let message;
        let signature;
        if ("message" in credentials) {
          message = credentials.message;
          signature = credentials.signature;
        } else {
          const { chain, wallet, statement, options } = credentials;
          let resolvedWallet;
          if (!isBrowser()) {
            if (typeof wallet !== "object" || !(options === null || options === void 0 ? void 0 : options.url)) {
              throw new Error("@supabase/auth-js: Both wallet and url must be specified in non-browser environments.");
            }
            resolvedWallet = wallet;
          } else if (typeof wallet === "object") {
            resolvedWallet = wallet;
          } else {
            const windowAny = window;
            if ("solana" in windowAny && typeof windowAny.solana === "object" && ("signIn" in windowAny.solana && typeof windowAny.solana.signIn === "function" || "signMessage" in windowAny.solana && typeof windowAny.solana.signMessage === "function")) {
              resolvedWallet = windowAny.solana;
            } else {
              throw new Error(`@supabase/auth-js: No compatible Solana wallet interface on the window object (window.solana) detected. Make sure the user already has a wallet installed and connected for this app. Prefer passing the wallet interface object directly to signInWithWeb3({ chain: 'solana', wallet: resolvedUserWallet }) instead.`);
            }
          }
          const url = new URL((_a = options === null || options === void 0 ? void 0 : options.url) !== null && _a !== void 0 ? _a : window.location.href);
          if ("signIn" in resolvedWallet && resolvedWallet.signIn) {
            const output = await resolvedWallet.signIn(Object.assign(Object.assign(Object.assign({ issuedAt: (/* @__PURE__ */ new Date()).toISOString() }, options === null || options === void 0 ? void 0 : options.signInWithSolana), {
              // non-overridable properties
              version: "1",
              domain: url.host,
              uri: url.href
            }), statement ? { statement } : null));
            let outputToProcess;
            if (Array.isArray(output) && output[0] && typeof output[0] === "object") {
              outputToProcess = output[0];
            } else if (output && typeof output === "object" && "signedMessage" in output && "signature" in output) {
              outputToProcess = output;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() returned unrecognized value");
            }
            if ("signedMessage" in outputToProcess && "signature" in outputToProcess && (typeof outputToProcess.signedMessage === "string" || outputToProcess.signedMessage instanceof Uint8Array) && outputToProcess.signature instanceof Uint8Array) {
              message = typeof outputToProcess.signedMessage === "string" ? outputToProcess.signedMessage : new TextDecoder().decode(outputToProcess.signedMessage);
              signature = outputToProcess.signature;
            } else {
              throw new Error("@supabase/auth-js: Wallet method signIn() API returned object without signedMessage and signature fields");
            }
          } else {
            if (!("signMessage" in resolvedWallet) || typeof resolvedWallet.signMessage !== "function" || !("publicKey" in resolvedWallet) || typeof resolvedWallet !== "object" || !resolvedWallet.publicKey || !("toBase58" in resolvedWallet.publicKey) || typeof resolvedWallet.publicKey.toBase58 !== "function") {
              throw new Error("@supabase/auth-js: Wallet does not have a compatible signMessage() and publicKey.toBase58() API");
            }
            message = [
              `${url.host} wants you to sign in with your Solana account:`,
              resolvedWallet.publicKey.toBase58(),
              ...statement ? ["", statement, ""] : [""],
              "Version: 1",
              `URI: ${url.href}`,
              `Issued At: ${(_c = (_b = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _b === void 0 ? void 0 : _b.issuedAt) !== null && _c !== void 0 ? _c : (/* @__PURE__ */ new Date()).toISOString()}`,
              ...((_d = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _d === void 0 ? void 0 : _d.notBefore) ? [`Not Before: ${options.signInWithSolana.notBefore}`] : [],
              ...((_e = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _e === void 0 ? void 0 : _e.expirationTime) ? [`Expiration Time: ${options.signInWithSolana.expirationTime}`] : [],
              ...((_f = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _f === void 0 ? void 0 : _f.chainId) ? [`Chain ID: ${options.signInWithSolana.chainId}`] : [],
              ...((_g = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _g === void 0 ? void 0 : _g.nonce) ? [`Nonce: ${options.signInWithSolana.nonce}`] : [],
              ...((_h = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _h === void 0 ? void 0 : _h.requestId) ? [`Request ID: ${options.signInWithSolana.requestId}`] : [],
              ...((_k = (_j = options === null || options === void 0 ? void 0 : options.signInWithSolana) === null || _j === void 0 ? void 0 : _j.resources) === null || _k === void 0 ? void 0 : _k.length) ? [
                "Resources",
                ...options.signInWithSolana.resources.map((resource) => `- ${resource}`)
              ] : []
            ].join("\n");
            const maybeSignature = await resolvedWallet.signMessage(new TextEncoder().encode(message), "utf8");
            if (!maybeSignature || !(maybeSignature instanceof Uint8Array)) {
              throw new Error("@supabase/auth-js: Wallet signMessage() API returned an recognized value");
            }
            signature = maybeSignature;
          }
        }
        try {
          const { data, error } = await _request(this.fetch, "POST", `${this.url}/token?grant_type=web3`, {
            headers: this.headers,
            body: Object.assign({ chain: "solana", message, signature: bytesToBase64URL(signature) }, ((_l = credentials.options) === null || _l === void 0 ? void 0 : _l.captchaToken) ? { gotrue_meta_security: { captcha_token: (_m = credentials.options) === null || _m === void 0 ? void 0 : _m.captchaToken } } : null),
            xform: _sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign({}, data), error });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      async _exchangeCodeForSession(authCode) {
        const storageItem = await getItemAsync(this.storage, `${this.storageKey}-code-verifier`);
        const [codeVerifier, redirectType] = (storageItem !== null && storageItem !== void 0 ? storageItem : "").split("/");
        try {
          if (!codeVerifier && this.flowType === "pkce") {
            throw new AuthPKCECodeVerifierMissingError();
          }
          const { data, error } = await _request(this.fetch, "POST", `${this.url}/token?grant_type=pkce`, {
            headers: this.headers,
            body: {
              auth_code: authCode,
              code_verifier: codeVerifier
            },
            xform: _sessionResponse
          });
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (error) {
            throw error;
          }
          if (!data || !data.session || !data.user) {
            const invalidTokenError = new AuthInvalidTokenResponseError();
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error: invalidTokenError
            });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data: Object.assign(Object.assign({}, data), { redirectType: redirectType !== null && redirectType !== void 0 ? redirectType : null }), error });
        } catch (error) {
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (isAuthError(error)) {
            return this._returnResult({
              data: { user: null, session: null, redirectType: null },
              error
            });
          }
          throw error;
        }
      }
      /**
       * Allows signing in with an OIDC ID token. The authentication provider used
       * should be enabled and configured.
       */
      async signInWithIdToken(credentials) {
        try {
          const { options, provider, token, access_token, nonce } = credentials;
          const res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
            headers: this.headers,
            body: {
              provider,
              id_token: token,
              access_token,
              nonce,
              gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
            },
            xform: _sessionResponse
          });
          const { data, error } = res;
          if (error) {
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if (!data || !data.session || !data.user) {
            const invalidTokenError = new AuthInvalidTokenResponseError();
            return this._returnResult({ data: { user: null, session: null }, error: invalidTokenError });
          }
          if (data.session) {
            await this._saveSession(data.session);
            await this._notifyAllSubscribers("SIGNED_IN", data.session);
          }
          return this._returnResult({ data, error });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user using magiclink or a one-time password (OTP).
       *
       * If the `{{ .ConfirmationURL }}` variable is specified in the email template, a magiclink will be sent.
       * If the `{{ .Token }}` variable is specified in the email template, an OTP will be sent.
       * If you're using phone sign-ins, only an OTP will be sent. You won't be able to send a magiclink for phone sign-ins.
       *
       * Be aware that you may get back an error message that will not distinguish
       * between the cases where the account does not exist or, that the account
       * can only be accessed via social login.
       *
       * Do note that you will need to configure a Whatsapp sender on Twilio
       * if you are using phone sign in with the 'whatsapp' channel. The whatsapp
       * channel is not supported on other providers
       * at this time.
       * This method supports PKCE when an email is passed.
       */
      async signInWithOtp(credentials) {
        var _a, _b, _c, _d, _e;
        try {
          if ("email" in credentials) {
            const { email, options } = credentials;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce") {
              ;
              [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
            }
            const { error } = await _request(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                email,
                data: (_a = options === null || options === void 0 ? void 0 : options.data) !== null && _a !== void 0 ? _a : {},
                create_user: (_b = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _b !== void 0 ? _b : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                code_challenge: codeChallenge,
                code_challenge_method: codeChallengeMethod
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          if ("phone" in credentials) {
            const { phone, options } = credentials;
            const { data, error } = await _request(this.fetch, "POST", `${this.url}/otp`, {
              headers: this.headers,
              body: {
                phone,
                data: (_c = options === null || options === void 0 ? void 0 : options.data) !== null && _c !== void 0 ? _c : {},
                create_user: (_d = options === null || options === void 0 ? void 0 : options.shouldCreateUser) !== null && _d !== void 0 ? _d : true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken },
                channel: (_e = options === null || options === void 0 ? void 0 : options.channel) !== null && _e !== void 0 ? _e : "sms"
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new AuthInvalidCredentialsError("You must provide either an email or phone number.");
        } catch (error) {
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Log in a user given a User supplied OTP or TokenHash received through mobile or email.
       */
      async verifyOtp(params) {
        var _a, _b;
        try {
          let redirectTo = void 0;
          let captchaToken = void 0;
          if ("options" in params) {
            redirectTo = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo;
            captchaToken = (_b = params.options) === null || _b === void 0 ? void 0 : _b.captchaToken;
          }
          const { data, error } = await _request(this.fetch, "POST", `${this.url}/verify`, {
            headers: this.headers,
            body: Object.assign(Object.assign({}, params), { gotrue_meta_security: { captcha_token: captchaToken } }),
            redirectTo,
            xform: _sessionResponse
          });
          if (error) {
            throw error;
          }
          if (!data) {
            const tokenVerificationError = new Error("An error occurred on token verification.");
            throw tokenVerificationError;
          }
          const session = data.session;
          const user = data.user;
          if (session === null || session === void 0 ? void 0 : session.access_token) {
            await this._saveSession(session);
            await this._notifyAllSubscribers(params.type == "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN", session);
          }
          return this._returnResult({ data: { user, session }, error: null });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Attempts a single-sign on using an enterprise Identity Provider. A
       * successful SSO attempt will redirect the current page to the identity
       * provider authorization page. The redirect URL is implementation and SSO
       * protocol specific.
       *
       * You can use it by providing a SSO domain. Typically you can extract this
       * domain by asking users for their email address. If this domain is
       * registered on the Auth instance the redirect will use that organization's
       * currently active SSO Identity Provider for the login.
       *
       * If you have built an organization-specific login page, you can use the
       * organization's SSO Identity Provider UUID directly instead.
       */
      async signInWithSSO(params) {
        var _a, _b, _c, _d, _e;
        try {
          let codeChallenge = null;
          let codeChallengeMethod = null;
          if (this.flowType === "pkce") {
            ;
            [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
          }
          const result = await _request(this.fetch, "POST", `${this.url}/sso`, {
            body: Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, "providerId" in params ? { provider_id: params.providerId } : null), "domain" in params ? { domain: params.domain } : null), { redirect_to: (_b = (_a = params.options) === null || _a === void 0 ? void 0 : _a.redirectTo) !== null && _b !== void 0 ? _b : void 0 }), ((_c = params === null || params === void 0 ? void 0 : params.options) === null || _c === void 0 ? void 0 : _c.captchaToken) ? { gotrue_meta_security: { captcha_token: params.options.captchaToken } } : null), { skip_http_redirect: true, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
            headers: this.headers,
            xform: _ssoResponse
          });
          if (((_d = result.data) === null || _d === void 0 ? void 0 : _d.url) && isBrowser() && !((_e = params.options) === null || _e === void 0 ? void 0 : _e.skipBrowserRedirect)) {
            window.location.assign(result.data.url);
          }
          return this._returnResult(result);
        } catch (error) {
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Sends a reauthentication OTP to the user's email or phone number.
       * Requires the user to be signed-in.
       */
      async reauthenticate() {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._reauthenticate();
        });
      }
      async _reauthenticate() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError)
              throw sessionError;
            if (!session)
              throw new AuthSessionMissingError();
            const { error } = await _request(this.fetch, "GET", `${this.url}/reauthenticate`, {
              headers: this.headers,
              jwt: session.access_token
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Resends an existing signup confirmation email, email change email, SMS OTP or phone change OTP.
       */
      async resend(credentials) {
        try {
          const endpoint = `${this.url}/resend`;
          if ("email" in credentials) {
            const { email, type, options } = credentials;
            const { error } = await _request(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                email,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo
            });
            return this._returnResult({ data: { user: null, session: null }, error });
          } else if ("phone" in credentials) {
            const { phone, type, options } = credentials;
            const { data, error } = await _request(this.fetch, "POST", endpoint, {
              headers: this.headers,
              body: {
                phone,
                type,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              }
            });
            return this._returnResult({
              data: { user: null, session: null, messageId: data === null || data === void 0 ? void 0 : data.message_id },
              error
            });
          }
          throw new AuthInvalidCredentialsError("You must provide either an email or phone number and a type");
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns the session, refreshing it if necessary.
       *
       * The session returned can be null if the session is not detected which can happen in the event a user is not signed-in or has logged out.
       *
       * **IMPORTANT:** This method loads values directly from the storage attached
       * to the client. If that storage is based on request cookies for example,
       * the values in it may not be authentic and therefore it's strongly advised
       * against using this method and its results in such circumstances. A warning
       * will be emitted if this is detected. Use {@link #getUser()} instead.
       */
      async getSession() {
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return this._useSession(async (result2) => {
            return result2;
          });
        });
        return result;
      }
      /**
       * Acquires a global lock based on the storage key.
       */
      async _acquireLock(acquireTimeout, fn) {
        this._debug("#_acquireLock", "begin", acquireTimeout);
        try {
          if (this.lockAcquired) {
            const last = this.pendingInLock.length ? this.pendingInLock[this.pendingInLock.length - 1] : Promise.resolve();
            const result = (async () => {
              await last;
              return await fn();
            })();
            this.pendingInLock.push((async () => {
              try {
                await result;
              } catch (e) {
              }
            })());
            return result;
          }
          return await this.lock(`lock:${this.storageKey}`, acquireTimeout, async () => {
            this._debug("#_acquireLock", "lock acquired for storage key", this.storageKey);
            try {
              this.lockAcquired = true;
              const result = fn();
              this.pendingInLock.push((async () => {
                try {
                  await result;
                } catch (e) {
                }
              })());
              await result;
              while (this.pendingInLock.length) {
                const waitOn = [...this.pendingInLock];
                await Promise.all(waitOn);
                this.pendingInLock.splice(0, waitOn.length);
              }
              return await result;
            } finally {
              this._debug("#_acquireLock", "lock released for storage key", this.storageKey);
              this.lockAcquired = false;
            }
          });
        } finally {
          this._debug("#_acquireLock", "end");
        }
      }
      /**
       * Use instead of {@link #getSession} inside the library. It is
       * semantically usually what you want, as getting a session involves some
       * processing afterwards that requires only one client operating on the
       * session at once across multiple tabs or processes.
       */
      async _useSession(fn) {
        this._debug("#_useSession", "begin");
        try {
          const result = await this.__loadSession();
          return await fn(result);
        } finally {
          this._debug("#_useSession", "end");
        }
      }
      /**
       * NEVER USE DIRECTLY!
       *
       * Always use {@link #_useSession}.
       */
      async __loadSession() {
        this._debug("#__loadSession()", "begin");
        if (!this.lockAcquired) {
          this._debug("#__loadSession()", "used outside of an acquired lock!", new Error().stack);
        }
        try {
          let currentSession = null;
          const maybeSession = await getItemAsync(this.storage, this.storageKey);
          this._debug("#getSession()", "session from storage", maybeSession);
          if (maybeSession !== null) {
            if (this._isValidSession(maybeSession)) {
              currentSession = maybeSession;
            } else {
              this._debug("#getSession()", "session from storage is not valid");
              await this._removeSession();
            }
          }
          if (!currentSession) {
            return { data: { session: null }, error: null };
          }
          const hasExpired = currentSession.expires_at ? currentSession.expires_at * 1e3 - Date.now() < EXPIRY_MARGIN_MS : false;
          this._debug("#__loadSession()", `session has${hasExpired ? "" : " not"} expired`, "expires_at", currentSession.expires_at);
          if (!hasExpired) {
            if (this.userStorage) {
              const maybeUser = await getItemAsync(this.userStorage, this.storageKey + "-user");
              if (maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) {
                currentSession.user = maybeUser.user;
              } else {
                currentSession.user = userNotAvailableProxy();
              }
            }
            if (this.storage.isServer && currentSession.user && !currentSession.user.__isUserNotAvailableProxy) {
              const suppressWarningRef = { value: this.suppressGetSessionWarning };
              currentSession.user = insecureUserWarningProxy(currentSession.user, suppressWarningRef);
              if (suppressWarningRef.value) {
                this.suppressGetSessionWarning = true;
              }
            }
            return { data: { session: currentSession }, error: null };
          }
          const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
          if (error) {
            return this._returnResult({ data: { session: null }, error });
          }
          return this._returnResult({ data: { session }, error: null });
        } finally {
          this._debug("#__loadSession()", "end");
        }
      }
      /**
       * Gets the current user details if there is an existing session. This method
       * performs a network request to the Supabase Auth server, so the returned
       * value is authentic and can be used to base authorization rules on.
       *
       * @param jwt Takes in an optional access token JWT. If no JWT is provided, the JWT from the current session is used.
       */
      async getUser(jwt) {
        if (jwt) {
          return await this._getUser(jwt);
        }
        await this.initializePromise;
        const result = await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._getUser();
        });
        if (result.data.user) {
          this.suppressGetSessionWarning = true;
        }
        return result;
      }
      async _getUser(jwt) {
        try {
          if (jwt) {
            return await _request(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt,
              xform: _userResponse
            });
          }
          return await this._useSession(async (result) => {
            var _a, _b, _c;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            if (!((_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) && !this.hasCustomAuthorizationHeader) {
              return { data: { user: null }, error: new AuthSessionMissingError() };
            }
            return await _request(this.fetch, "GET", `${this.url}/user`, {
              headers: this.headers,
              jwt: (_c = (_b = data.session) === null || _b === void 0 ? void 0 : _b.access_token) !== null && _c !== void 0 ? _c : void 0,
              xform: _userResponse
            });
          });
        } catch (error) {
          if (isAuthError(error)) {
            if (isAuthSessionMissingError(error)) {
              await this._removeSession();
              await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
            }
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Updates user data for a logged in user.
       */
      async updateUser(attributes, options = {}) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._updateUser(attributes, options);
        });
      }
      async _updateUser(attributes, options = {}) {
        try {
          return await this._useSession(async (result) => {
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              throw sessionError;
            }
            if (!sessionData.session) {
              throw new AuthSessionMissingError();
            }
            const session = sessionData.session;
            let codeChallenge = null;
            let codeChallengeMethod = null;
            if (this.flowType === "pkce" && attributes.email != null) {
              ;
              [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
            }
            const { data, error: userError } = await _request(this.fetch, "PUT", `${this.url}/user`, {
              headers: this.headers,
              redirectTo: options === null || options === void 0 ? void 0 : options.emailRedirectTo,
              body: Object.assign(Object.assign({}, attributes), { code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod }),
              jwt: session.access_token,
              xform: _userResponse
            });
            if (userError) {
              throw userError;
            }
            session.user = data.user;
            await this._saveSession(session);
            await this._notifyAllSubscribers("USER_UPDATED", session);
            return this._returnResult({ data: { user: session.user }, error: null });
          });
        } catch (error) {
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Sets the session data from the current session. If the current session is expired, setSession will take care of refreshing it to obtain a new session.
       * If the refresh token or access token in the current session is invalid, an error will be thrown.
       * @param currentSession The current session that minimally contains an access token and refresh token.
       */
      async setSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._setSession(currentSession);
        });
      }
      async _setSession(currentSession) {
        try {
          if (!currentSession.access_token || !currentSession.refresh_token) {
            throw new AuthSessionMissingError();
          }
          const timeNow = Date.now() / 1e3;
          let expiresAt2 = timeNow;
          let hasExpired = true;
          let session = null;
          const { payload } = decodeJWT(currentSession.access_token);
          if (payload.exp) {
            expiresAt2 = payload.exp;
            hasExpired = expiresAt2 <= timeNow;
          }
          if (hasExpired) {
            const { data: refreshedSession, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!refreshedSession) {
              return { data: { user: null, session: null }, error: null };
            }
            session = refreshedSession;
          } else {
            const { data, error } = await this._getUser(currentSession.access_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            session = {
              access_token: currentSession.access_token,
              refresh_token: currentSession.refresh_token,
              user: data.user,
              token_type: "bearer",
              expires_in: expiresAt2 - timeNow,
              expires_at: expiresAt2
            };
            await this._saveSession(session);
            await this._notifyAllSubscribers("SIGNED_IN", session);
          }
          return this._returnResult({ data: { user: session.user, session }, error: null });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        }
      }
      /**
       * Returns a new session, regardless of expiry status.
       * Takes in an optional current session. If not passed in, then refreshSession() will attempt to retrieve it from getSession().
       * If the current session's refresh token is invalid, an error will be thrown.
       * @param currentSession The current session. If passed in, it must contain a refresh token.
       */
      async refreshSession(currentSession) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._refreshSession(currentSession);
        });
      }
      async _refreshSession(currentSession) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            if (!currentSession) {
              const { data, error: error2 } = result;
              if (error2) {
                throw error2;
              }
              currentSession = (_a = data.session) !== null && _a !== void 0 ? _a : void 0;
            }
            if (!(currentSession === null || currentSession === void 0 ? void 0 : currentSession.refresh_token)) {
              throw new AuthSessionMissingError();
            }
            const { data: session, error } = await this._callRefreshToken(currentSession.refresh_token);
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            if (!session) {
              return this._returnResult({ data: { user: null, session: null }, error: null });
            }
            return this._returnResult({ data: { user: session.user, session }, error: null });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { user: null, session: null }, error });
          }
          throw error;
        }
      }
      /**
       * Gets the session data from a URL string
       */
      async _getSessionFromURL(params, callbackUrlType) {
        try {
          if (!isBrowser())
            throw new AuthImplicitGrantRedirectError("No browser detected.");
          if (params.error || params.error_description || params.error_code) {
            throw new AuthImplicitGrantRedirectError(params.error_description || "Error in URL with unspecified error_description", {
              error: params.error || "unspecified_error",
              code: params.error_code || "unspecified_code"
            });
          }
          switch (callbackUrlType) {
            case "implicit":
              if (this.flowType === "pkce") {
                throw new AuthPKCEGrantCodeExchangeError("Not a valid PKCE flow url.");
              }
              break;
            case "pkce":
              if (this.flowType === "implicit") {
                throw new AuthImplicitGrantRedirectError("Not a valid implicit grant flow url.");
              }
              break;
            default:
          }
          if (callbackUrlType === "pkce") {
            this._debug("#_initialize()", "begin", "is PKCE flow", true);
            if (!params.code)
              throw new AuthPKCEGrantCodeExchangeError("No code detected.");
            const { data: data2, error: error2 } = await this._exchangeCodeForSession(params.code);
            if (error2)
              throw error2;
            const url = new URL(window.location.href);
            url.searchParams.delete("code");
            window.history.replaceState(window.history.state, "", url.toString());
            return { data: { session: data2.session, redirectType: null }, error: null };
          }
          const { provider_token, provider_refresh_token, access_token, refresh_token, expires_in, expires_at, token_type } = params;
          if (!access_token || !expires_in || !refresh_token || !token_type) {
            throw new AuthImplicitGrantRedirectError("No session defined in URL");
          }
          const timeNow = Math.round(Date.now() / 1e3);
          const expiresIn = parseInt(expires_in);
          let expiresAt2 = timeNow + expiresIn;
          if (expires_at) {
            expiresAt2 = parseInt(expires_at);
          }
          const actuallyExpiresIn = expiresAt2 - timeNow;
          if (actuallyExpiresIn * 1e3 <= AUTO_REFRESH_TICK_DURATION_MS) {
            console.warn(`@supabase/gotrue-js: Session as retrieved from URL expires in ${actuallyExpiresIn}s, should have been closer to ${expiresIn}s`);
          }
          const issuedAt = expiresAt2 - expiresIn;
          if (timeNow - issuedAt >= 120) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued over 120s ago, URL could be stale", issuedAt, expiresAt2, timeNow);
          } else if (timeNow - issuedAt < 0) {
            console.warn("@supabase/gotrue-js: Session as retrieved from URL was issued in the future? Check the device clock for skew", issuedAt, expiresAt2, timeNow);
          }
          const { data, error } = await this._getUser(access_token);
          if (error)
            throw error;
          const session = {
            provider_token,
            provider_refresh_token,
            access_token,
            expires_in: expiresIn,
            expires_at: expiresAt2,
            refresh_token,
            token_type,
            user: data.user
          };
          window.location.hash = "";
          this._debug("#_getSessionFromURL()", "clearing window.location.hash");
          return this._returnResult({ data: { session, redirectType: params.type }, error: null });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { session: null, redirectType: null }, error });
          }
          throw error;
        }
      }
      /**
       * Checks if the current URL contains parameters given by an implicit oauth grant flow (https://www.rfc-editor.org/rfc/rfc6749.html#section-4.2)
       *
       * If `detectSessionInUrl` is a function, it will be called with the URL and params to determine
       * if the URL should be processed as a Supabase auth callback. This allows users to exclude
       * URLs from other OAuth providers (e.g., Facebook Login) that also return access_token in the fragment.
       */
      _isImplicitGrantCallback(params) {
        if (typeof this.detectSessionInUrl === "function") {
          return this.detectSessionInUrl(new URL(window.location.href), params);
        }
        return Boolean(params.access_token || params.error_description);
      }
      /**
       * Checks if the current URL and backing storage contain parameters given by a PKCE flow
       */
      async _isPKCECallback(params) {
        const currentStorageContent = await getItemAsync(this.storage, `${this.storageKey}-code-verifier`);
        return !!(params.code && currentStorageContent);
      }
      /**
       * Inside a browser context, `signOut()` will remove the logged in user from the browser session and log them out - removing all items from localstorage and then trigger a `"SIGNED_OUT"` event.
       *
       * For server-side management, you can revoke all refresh tokens for a user by passing a user's JWT through to `auth.api.signOut(JWT: string)`.
       * There is no way to revoke a user's access token jwt until it expires. It is recommended to set a shorter expiry on the jwt for this reason.
       *
       * If using `others` scope, no `SIGNED_OUT` event is fired!
       */
      async signOut(options = { scope: "global" }) {
        await this.initializePromise;
        return await this._acquireLock(this.lockAcquireTimeout, async () => {
          return await this._signOut(options);
        });
      }
      async _signOut({ scope } = { scope: "global" }) {
        return await this._useSession(async (result) => {
          var _a;
          const { data, error: sessionError } = result;
          if (sessionError && !isAuthSessionMissingError(sessionError)) {
            return this._returnResult({ error: sessionError });
          }
          const accessToken = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token;
          if (accessToken) {
            const { error } = await this.admin.signOut(accessToken, scope);
            if (error) {
              if (!(isAuthApiError(error) && (error.status === 404 || error.status === 401 || error.status === 403) || isAuthSessionMissingError(error))) {
                return this._returnResult({ error });
              }
            }
          }
          if (scope !== "others") {
            await this._removeSession();
            await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          }
          return this._returnResult({ error: null });
        });
      }
      onAuthStateChange(callback) {
        const id = generateCallbackId();
        const subscription = {
          id,
          callback,
          unsubscribe: () => {
            this._debug("#unsubscribe()", "state change callback with id removed", id);
            this.stateChangeEmitters.delete(id);
          }
        };
        this._debug("#onAuthStateChange()", "registered callback with id", id);
        this.stateChangeEmitters.set(id, subscription);
        (async () => {
          await this.initializePromise;
          await this._acquireLock(this.lockAcquireTimeout, async () => {
            this._emitInitialSession(id);
          });
        })();
        return { data: { subscription } };
      }
      async _emitInitialSession(id) {
        return await this._useSession(async (result) => {
          var _a, _b;
          try {
            const { data: { session }, error } = result;
            if (error)
              throw error;
            await ((_a = this.stateChangeEmitters.get(id)) === null || _a === void 0 ? void 0 : _a.callback("INITIAL_SESSION", session));
            this._debug("INITIAL_SESSION", "callback id", id, "session", session);
          } catch (err) {
            await ((_b = this.stateChangeEmitters.get(id)) === null || _b === void 0 ? void 0 : _b.callback("INITIAL_SESSION", null));
            this._debug("INITIAL_SESSION", "callback id", id, "error", err);
            console.error(err);
          }
        });
      }
      /**
       * Sends a password reset request to an email address. This method supports the PKCE flow.
       *
       * @param email The email address of the user.
       * @param options.redirectTo The URL to send the user to after they click the password reset link.
       * @param options.captchaToken Verification token received when the user completes the captcha on the site.
       */
      async resetPasswordForEmail(email, options = {}) {
        let codeChallenge = null;
        let codeChallengeMethod = null;
        if (this.flowType === "pkce") {
          ;
          [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(
            this.storage,
            this.storageKey,
            true
            // isPasswordRecovery
          );
        }
        try {
          return await _request(this.fetch, "POST", `${this.url}/recover`, {
            body: {
              email,
              code_challenge: codeChallenge,
              code_challenge_method: codeChallengeMethod,
              gotrue_meta_security: { captcha_token: options.captchaToken }
            },
            headers: this.headers,
            redirectTo: options.redirectTo
          });
        } catch (error) {
          await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Gets all the identities linked to a user.
       */
      async getUserIdentities() {
        var _a;
        try {
          const { data, error } = await this.getUser();
          if (error)
            throw error;
          return this._returnResult({ data: { identities: (_a = data.user.identities) !== null && _a !== void 0 ? _a : [] }, error: null });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async linkIdentity(credentials) {
        if ("token" in credentials) {
          return this.linkIdentityIdToken(credentials);
        }
        return this.linkIdentityOAuth(credentials);
      }
      async linkIdentityOAuth(credentials) {
        var _a;
        try {
          const { data, error } = await this._useSession(async (result) => {
            var _a2, _b, _c, _d, _e;
            const { data: data2, error: error2 } = result;
            if (error2)
              throw error2;
            const url = await this._getUrlForProvider(`${this.url}/user/identities/authorize`, credentials.provider, {
              redirectTo: (_a2 = credentials.options) === null || _a2 === void 0 ? void 0 : _a2.redirectTo,
              scopes: (_b = credentials.options) === null || _b === void 0 ? void 0 : _b.scopes,
              queryParams: (_c = credentials.options) === null || _c === void 0 ? void 0 : _c.queryParams,
              skipBrowserRedirect: true
            });
            return await _request(this.fetch, "GET", url, {
              headers: this.headers,
              jwt: (_e = (_d = data2.session) === null || _d === void 0 ? void 0 : _d.access_token) !== null && _e !== void 0 ? _e : void 0
            });
          });
          if (error)
            throw error;
          if (isBrowser() && !((_a = credentials.options) === null || _a === void 0 ? void 0 : _a.skipBrowserRedirect)) {
            window.location.assign(data === null || data === void 0 ? void 0 : data.url);
          }
          return this._returnResult({
            data: { provider: credentials.provider, url: data === null || data === void 0 ? void 0 : data.url },
            error: null
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: { provider: credentials.provider, url: null }, error });
          }
          throw error;
        }
      }
      async linkIdentityIdToken(credentials) {
        return await this._useSession(async (result) => {
          var _a;
          try {
            const { error: sessionError, data: { session } } = result;
            if (sessionError)
              throw sessionError;
            const { options, provider, token, access_token, nonce } = credentials;
            const res = await _request(this.fetch, "POST", `${this.url}/token?grant_type=id_token`, {
              headers: this.headers,
              jwt: (_a = session === null || session === void 0 ? void 0 : session.access_token) !== null && _a !== void 0 ? _a : void 0,
              body: {
                provider,
                id_token: token,
                access_token,
                nonce,
                link_identity: true,
                gotrue_meta_security: { captcha_token: options === null || options === void 0 ? void 0 : options.captchaToken }
              },
              xform: _sessionResponse
            });
            const { data, error } = res;
            if (error) {
              return this._returnResult({ data: { user: null, session: null }, error });
            } else if (!data || !data.session || !data.user) {
              return this._returnResult({
                data: { user: null, session: null },
                error: new AuthInvalidTokenResponseError()
              });
            }
            if (data.session) {
              await this._saveSession(data.session);
              await this._notifyAllSubscribers("USER_UPDATED", data.session);
            }
            return this._returnResult({ data, error });
          } catch (error) {
            await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
            if (isAuthError(error)) {
              return this._returnResult({ data: { user: null, session: null }, error });
            }
            throw error;
          }
        });
      }
      /**
       * Unlinks an identity from a user by deleting it. The user will no longer be able to sign in with that identity once it's unlinked.
       */
      async unlinkIdentity(identity) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data, error } = result;
            if (error) {
              throw error;
            }
            return await _request(this.fetch, "DELETE", `${this.url}/user/identities/${identity.identity_id}`, {
              headers: this.headers,
              jwt: (_b = (_a = data.session) === null || _a === void 0 ? void 0 : _a.access_token) !== null && _b !== void 0 ? _b : void 0
            });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Generates a new JWT.
       * @param refreshToken A valid refresh token that was returned on login.
       */
      async _refreshAccessToken(refreshToken) {
        const debugName = `#_refreshAccessToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          const startedAt = Date.now();
          return await retryable(async (attempt) => {
            if (attempt > 0) {
              await sleep(200 * Math.pow(2, attempt - 1));
            }
            this._debug(debugName, "refreshing attempt", attempt);
            return await _request(this.fetch, "POST", `${this.url}/token?grant_type=refresh_token`, {
              body: { refresh_token: refreshToken },
              headers: this.headers,
              xform: _sessionResponse
            });
          }, (attempt, error) => {
            const nextBackOffInterval = 200 * Math.pow(2, attempt);
            return error && isAuthRetryableFetchError(error) && // retryable only if the request can be sent before the backoff overflows the tick duration
            Date.now() + nextBackOffInterval - startedAt < AUTO_REFRESH_TICK_DURATION_MS;
          });
        } catch (error) {
          this._debug(debugName, "error", error);
          if (isAuthError(error)) {
            return this._returnResult({ data: { session: null, user: null }, error });
          }
          throw error;
        } finally {
          this._debug(debugName, "end");
        }
      }
      _isValidSession(maybeSession) {
        const isValidSession = typeof maybeSession === "object" && maybeSession !== null && "access_token" in maybeSession && "refresh_token" in maybeSession && "expires_at" in maybeSession;
        return isValidSession;
      }
      async _handleProviderSignIn(provider, options) {
        const url = await this._getUrlForProvider(`${this.url}/authorize`, provider, {
          redirectTo: options.redirectTo,
          scopes: options.scopes,
          queryParams: options.queryParams
        });
        this._debug("#_handleProviderSignIn()", "provider", provider, "options", options, "url", url);
        if (isBrowser() && !options.skipBrowserRedirect) {
          window.location.assign(url);
        }
        return { data: { provider, url }, error: null };
      }
      /**
       * Recovers the session from LocalStorage and refreshes the token
       * Note: this method is async to accommodate for AsyncStorage e.g. in React native.
       */
      async _recoverAndRefresh() {
        var _a, _b;
        const debugName = "#_recoverAndRefresh()";
        this._debug(debugName, "begin");
        try {
          const currentSession = await getItemAsync(this.storage, this.storageKey);
          if (currentSession && this.userStorage) {
            let maybeUser = await getItemAsync(this.userStorage, this.storageKey + "-user");
            if (!this.storage.isServer && Object.is(this.storage, this.userStorage) && !maybeUser) {
              maybeUser = { user: currentSession.user };
              await setItemAsync(this.userStorage, this.storageKey + "-user", maybeUser);
            }
            currentSession.user = (_a = maybeUser === null || maybeUser === void 0 ? void 0 : maybeUser.user) !== null && _a !== void 0 ? _a : userNotAvailableProxy();
          } else if (currentSession && !currentSession.user) {
            if (!currentSession.user) {
              const separateUser = await getItemAsync(this.storage, this.storageKey + "-user");
              if (separateUser && (separateUser === null || separateUser === void 0 ? void 0 : separateUser.user)) {
                currentSession.user = separateUser.user;
                await removeItemAsync(this.storage, this.storageKey + "-user");
                await setItemAsync(this.storage, this.storageKey, currentSession);
              } else {
                currentSession.user = userNotAvailableProxy();
              }
            }
          }
          this._debug(debugName, "session from storage", currentSession);
          if (!this._isValidSession(currentSession)) {
            this._debug(debugName, "session is not valid");
            if (currentSession !== null) {
              await this._removeSession();
            }
            return;
          }
          const expiresWithMargin = ((_b = currentSession.expires_at) !== null && _b !== void 0 ? _b : Infinity) * 1e3 - Date.now() < EXPIRY_MARGIN_MS;
          this._debug(debugName, `session has${expiresWithMargin ? "" : " not"} expired with margin of ${EXPIRY_MARGIN_MS}s`);
          if (expiresWithMargin) {
            if (this.autoRefreshToken && currentSession.refresh_token) {
              const { error } = await this._callRefreshToken(currentSession.refresh_token);
              if (error) {
                console.error(error);
                if (!isAuthRetryableFetchError(error)) {
                  this._debug(debugName, "refresh failed with a non-retryable error, removing the session", error);
                  await this._removeSession();
                }
              }
            }
          } else if (currentSession.user && currentSession.user.__isUserNotAvailableProxy === true) {
            try {
              const { data, error: userError } = await this._getUser(currentSession.access_token);
              if (!userError && (data === null || data === void 0 ? void 0 : data.user)) {
                currentSession.user = data.user;
                await this._saveSession(currentSession);
                await this._notifyAllSubscribers("SIGNED_IN", currentSession);
              } else {
                this._debug(debugName, "could not get user data, skipping SIGNED_IN notification");
              }
            } catch (getUserError) {
              console.error("Error getting user data:", getUserError);
              this._debug(debugName, "error getting user data, skipping SIGNED_IN notification", getUserError);
            }
          } else {
            await this._notifyAllSubscribers("SIGNED_IN", currentSession);
          }
        } catch (err) {
          this._debug(debugName, "error", err);
          console.error(err);
          return;
        } finally {
          this._debug(debugName, "end");
        }
      }
      async _callRefreshToken(refreshToken) {
        var _a, _b;
        if (!refreshToken) {
          throw new AuthSessionMissingError();
        }
        if (this.refreshingDeferred) {
          return this.refreshingDeferred.promise;
        }
        const debugName = `#_callRefreshToken(${refreshToken.substring(0, 5)}...)`;
        this._debug(debugName, "begin");
        try {
          this.refreshingDeferred = new Deferred();
          const { data, error } = await this._refreshAccessToken(refreshToken);
          if (error)
            throw error;
          if (!data.session)
            throw new AuthSessionMissingError();
          await this._saveSession(data.session);
          await this._notifyAllSubscribers("TOKEN_REFRESHED", data.session);
          const result = { data: data.session, error: null };
          this.refreshingDeferred.resolve(result);
          return result;
        } catch (error) {
          this._debug(debugName, "error", error);
          if (isAuthError(error)) {
            const result = { data: null, error };
            if (!isAuthRetryableFetchError(error)) {
              await this._removeSession();
            }
            (_a = this.refreshingDeferred) === null || _a === void 0 ? void 0 : _a.resolve(result);
            return result;
          }
          (_b = this.refreshingDeferred) === null || _b === void 0 ? void 0 : _b.reject(error);
          throw error;
        } finally {
          this.refreshingDeferred = null;
          this._debug(debugName, "end");
        }
      }
      async _notifyAllSubscribers(event, session, broadcast = true) {
        const debugName = `#_notifyAllSubscribers(${event})`;
        this._debug(debugName, "begin", session, `broadcast = ${broadcast}`);
        try {
          if (this.broadcastChannel && broadcast) {
            this.broadcastChannel.postMessage({ event, session });
          }
          const errors = [];
          const promises = Array.from(this.stateChangeEmitters.values()).map(async (x) => {
            try {
              await x.callback(event, session);
            } catch (e) {
              errors.push(e);
            }
          });
          await Promise.all(promises);
          if (errors.length > 0) {
            for (let i = 0; i < errors.length; i += 1) {
              console.error(errors[i]);
            }
            throw errors[0];
          }
        } finally {
          this._debug(debugName, "end");
        }
      }
      /**
       * set currentSession and currentUser
       * process to _startAutoRefreshToken if possible
       */
      async _saveSession(session) {
        this._debug("#_saveSession()", session);
        this.suppressGetSessionWarning = true;
        await removeItemAsync(this.storage, `${this.storageKey}-code-verifier`);
        const sessionToProcess = Object.assign({}, session);
        const userIsProxy = sessionToProcess.user && sessionToProcess.user.__isUserNotAvailableProxy === true;
        if (this.userStorage) {
          if (!userIsProxy && sessionToProcess.user) {
            await setItemAsync(this.userStorage, this.storageKey + "-user", {
              user: sessionToProcess.user
            });
          } else if (userIsProxy) {
          }
          const mainSessionData = Object.assign({}, sessionToProcess);
          delete mainSessionData.user;
          const clonedMainSessionData = deepClone(mainSessionData);
          await setItemAsync(this.storage, this.storageKey, clonedMainSessionData);
        } else {
          const clonedSession = deepClone(sessionToProcess);
          await setItemAsync(this.storage, this.storageKey, clonedSession);
        }
      }
      async _removeSession() {
        this._debug("#_removeSession()");
        this.suppressGetSessionWarning = false;
        await removeItemAsync(this.storage, this.storageKey);
        await removeItemAsync(this.storage, this.storageKey + "-code-verifier");
        await removeItemAsync(this.storage, this.storageKey + "-user");
        if (this.userStorage) {
          await removeItemAsync(this.userStorage, this.storageKey + "-user");
        }
        await this._notifyAllSubscribers("SIGNED_OUT", null);
      }
      /**
       * Removes any registered visibilitychange callback.
       *
       * {@see #startAutoRefresh}
       * {@see #stopAutoRefresh}
       */
      _removeVisibilityChangedCallback() {
        this._debug("#_removeVisibilityChangedCallback()");
        const callback = this.visibilityChangedCallback;
        this.visibilityChangedCallback = null;
        try {
          if (callback && isBrowser() && (window === null || window === void 0 ? void 0 : window.removeEventListener)) {
            window.removeEventListener("visibilitychange", callback);
          }
        } catch (e) {
          console.error("removing visibilitychange callback failed", e);
        }
      }
      /**
       * This is the private implementation of {@link #startAutoRefresh}. Use this
       * within the library.
       */
      async _startAutoRefresh() {
        await this._stopAutoRefresh();
        this._debug("#_startAutoRefresh()");
        const ticker = setInterval(() => this._autoRefreshTokenTick(), AUTO_REFRESH_TICK_DURATION_MS);
        this.autoRefreshTicker = ticker;
        if (ticker && typeof ticker === "object" && typeof ticker.unref === "function") {
          ticker.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(ticker);
        }
        const timeout = setTimeout(async () => {
          await this.initializePromise;
          await this._autoRefreshTokenTick();
        }, 0);
        this.autoRefreshTickTimeout = timeout;
        if (timeout && typeof timeout === "object" && typeof timeout.unref === "function") {
          timeout.unref();
        } else if (typeof Deno !== "undefined" && typeof Deno.unrefTimer === "function") {
          Deno.unrefTimer(timeout);
        }
      }
      /**
       * This is the private implementation of {@link #stopAutoRefresh}. Use this
       * within the library.
       */
      async _stopAutoRefresh() {
        this._debug("#_stopAutoRefresh()");
        const ticker = this.autoRefreshTicker;
        this.autoRefreshTicker = null;
        if (ticker) {
          clearInterval(ticker);
        }
        const timeout = this.autoRefreshTickTimeout;
        this.autoRefreshTickTimeout = null;
        if (timeout) {
          clearTimeout(timeout);
        }
      }
      /**
       * Starts an auto-refresh process in the background. The session is checked
       * every few seconds. Close to the time of expiration a process is started to
       * refresh the session. If refreshing fails it will be retried for as long as
       * necessary.
       *
       * If you set the {@link GoTrueClientOptions#autoRefreshToken} you don't need
       * to call this function, it will be called for you.
       *
       * On browsers the refresh process works only when the tab/window is in the
       * foreground to conserve resources as well as prevent race conditions and
       * flooding auth with requests. If you call this method any managed
       * visibility change callback will be removed and you must manage visibility
       * changes on your own.
       *
       * On non-browser platforms the refresh process works *continuously* in the
       * background, which may not be desirable. You should hook into your
       * platform's foreground indication mechanism and call these methods
       * appropriately to conserve resources.
       *
       * {@see #stopAutoRefresh}
       */
      async startAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._startAutoRefresh();
      }
      /**
       * Stops an active auto refresh process running in the background (if any).
       *
       * If you call this method any managed visibility change callback will be
       * removed and you must manage visibility changes on your own.
       *
       * See {@link #startAutoRefresh} for more details.
       */
      async stopAutoRefresh() {
        this._removeVisibilityChangedCallback();
        await this._stopAutoRefresh();
      }
      /**
       * Runs the auto refresh token tick.
       */
      async _autoRefreshTokenTick() {
        this._debug("#_autoRefreshTokenTick()", "begin");
        try {
          await this._acquireLock(0, async () => {
            try {
              const now = Date.now();
              try {
                return await this._useSession(async (result) => {
                  const { data: { session } } = result;
                  if (!session || !session.refresh_token || !session.expires_at) {
                    this._debug("#_autoRefreshTokenTick()", "no session");
                    return;
                  }
                  const expiresInTicks = Math.floor((session.expires_at * 1e3 - now) / AUTO_REFRESH_TICK_DURATION_MS);
                  this._debug("#_autoRefreshTokenTick()", `access token expires in ${expiresInTicks} ticks, a tick lasts ${AUTO_REFRESH_TICK_DURATION_MS}ms, refresh threshold is ${AUTO_REFRESH_TICK_THRESHOLD} ticks`);
                  if (expiresInTicks <= AUTO_REFRESH_TICK_THRESHOLD) {
                    await this._callRefreshToken(session.refresh_token);
                  }
                });
              } catch (e) {
                console.error("Auto refresh tick failed with error. This is likely a transient error.", e);
              }
            } finally {
              this._debug("#_autoRefreshTokenTick()", "end");
            }
          });
        } catch (e) {
          if (e.isAcquireTimeout || e instanceof LockAcquireTimeoutError) {
            this._debug("auto refresh token tick lock not available");
          } else {
            throw e;
          }
        }
      }
      /**
       * Registers callbacks on the browser / platform, which in-turn run
       * algorithms when the browser window/tab are in foreground. On non-browser
       * platforms it assumes always foreground.
       */
      async _handleVisibilityChange() {
        this._debug("#_handleVisibilityChange()");
        if (!isBrowser() || !(window === null || window === void 0 ? void 0 : window.addEventListener)) {
          if (this.autoRefreshToken) {
            this.startAutoRefresh();
          }
          return false;
        }
        try {
          this.visibilityChangedCallback = async () => {
            try {
              await this._onVisibilityChanged(false);
            } catch (error) {
              this._debug("#visibilityChangedCallback", "error", error);
            }
          };
          window === null || window === void 0 ? void 0 : window.addEventListener("visibilitychange", this.visibilityChangedCallback);
          await this._onVisibilityChanged(true);
        } catch (error) {
          console.error("_handleVisibilityChange", error);
        }
      }
      /**
       * Callback registered with `window.addEventListener('visibilitychange')`.
       */
      async _onVisibilityChanged(calledFromInitialize) {
        const methodName = `#_onVisibilityChanged(${calledFromInitialize})`;
        this._debug(methodName, "visibilityState", document.visibilityState);
        if (document.visibilityState === "visible") {
          if (this.autoRefreshToken) {
            this._startAutoRefresh();
          }
          if (!calledFromInitialize) {
            await this.initializePromise;
            await this._acquireLock(this.lockAcquireTimeout, async () => {
              if (document.visibilityState !== "visible") {
                this._debug(methodName, "acquired the lock to recover the session, but the browser visibilityState is no longer visible, aborting");
                return;
              }
              await this._recoverAndRefresh();
            });
          }
        } else if (document.visibilityState === "hidden") {
          if (this.autoRefreshToken) {
            this._stopAutoRefresh();
          }
        }
      }
      /**
       * Generates the relevant login URL for a third-party provider.
       * @param options.redirectTo A URL or mobile address to send the user to after they are confirmed.
       * @param options.scopes A space-separated list of scopes granted to the OAuth application.
       * @param options.queryParams An object of key-value pairs containing query parameters granted to the OAuth application.
       */
      async _getUrlForProvider(url, provider, options) {
        const urlParams = [`provider=${encodeURIComponent(provider)}`];
        if (options === null || options === void 0 ? void 0 : options.redirectTo) {
          urlParams.push(`redirect_to=${encodeURIComponent(options.redirectTo)}`);
        }
        if (options === null || options === void 0 ? void 0 : options.scopes) {
          urlParams.push(`scopes=${encodeURIComponent(options.scopes)}`);
        }
        if (this.flowType === "pkce") {
          const [codeChallenge, codeChallengeMethod] = await getCodeChallengeAndMethod(this.storage, this.storageKey);
          const flowParams = new URLSearchParams({
            code_challenge: `${encodeURIComponent(codeChallenge)}`,
            code_challenge_method: `${encodeURIComponent(codeChallengeMethod)}`
          });
          urlParams.push(flowParams.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.queryParams) {
          const query = new URLSearchParams(options.queryParams);
          urlParams.push(query.toString());
        }
        if (options === null || options === void 0 ? void 0 : options.skipBrowserRedirect) {
          urlParams.push(`skip_http_redirect=${options.skipBrowserRedirect}`);
        }
        return `${url}?${urlParams.join("&")}`;
      }
      async _unenroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            return await _request(this.fetch, "DELETE", `${this.url}/factors/${params.factorId}`, {
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _enroll(params) {
        try {
          return await this._useSession(async (result) => {
            var _a, _b;
            const { data: sessionData, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            const body = Object.assign({ friendly_name: params.friendlyName, factor_type: params.factorType }, params.factorType === "phone" ? { phone: params.phone } : params.factorType === "totp" ? { issuer: params.issuer } : {});
            const { data, error } = await _request(this.fetch, "POST", `${this.url}/factors`, {
              body,
              headers: this.headers,
              jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
            });
            if (error) {
              return this._returnResult({ data: null, error });
            }
            if (params.factorType === "totp" && data.type === "totp" && ((_b = data === null || data === void 0 ? void 0 : data.totp) === null || _b === void 0 ? void 0 : _b.qr_code)) {
              data.totp.qr_code = `data:image/svg+xml;utf-8,${data.totp.qr_code}`;
            }
            return this._returnResult({ data, error: null });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async _verify(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const body = Object.assign({ challenge_id: params.challengeId }, "webauthn" in params ? {
                webauthn: Object.assign(Object.assign({}, params.webauthn), { credential_response: params.webauthn.type === "create" ? serializeCredentialCreationResponse(params.webauthn.credential_response) : serializeCredentialRequestResponse(params.webauthn.credential_response) })
              } : { code: params.code });
              const { data, error } = await _request(this.fetch, "POST", `${this.url}/factors/${params.factorId}/verify`, {
                body,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (error) {
                return this._returnResult({ data: null, error });
              }
              await this._saveSession(Object.assign({ expires_at: Math.round(Date.now() / 1e3) + data.expires_in }, data));
              await this._notifyAllSubscribers("MFA_CHALLENGE_VERIFIED", data);
              return this._returnResult({ data, error });
            });
          } catch (error) {
            if (isAuthError(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      async _challenge(params) {
        return this._acquireLock(this.lockAcquireTimeout, async () => {
          try {
            return await this._useSession(async (result) => {
              var _a;
              const { data: sessionData, error: sessionError } = result;
              if (sessionError) {
                return this._returnResult({ data: null, error: sessionError });
              }
              const response = await _request(this.fetch, "POST", `${this.url}/factors/${params.factorId}/challenge`, {
                body: params,
                headers: this.headers,
                jwt: (_a = sessionData === null || sessionData === void 0 ? void 0 : sessionData.session) === null || _a === void 0 ? void 0 : _a.access_token
              });
              if (response.error) {
                return response;
              }
              const { data } = response;
              if (data.type !== "webauthn") {
                return { data, error: null };
              }
              switch (data.webauthn.type) {
                case "create":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: deserializeCredentialCreationOptions(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
                case "request":
                  return {
                    data: Object.assign(Object.assign({}, data), { webauthn: Object.assign(Object.assign({}, data.webauthn), { credential_options: Object.assign(Object.assign({}, data.webauthn.credential_options), { publicKey: deserializeCredentialRequestOptions(data.webauthn.credential_options.publicKey) }) }) }),
                    error: null
                  };
              }
            });
          } catch (error) {
            if (isAuthError(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        });
      }
      /**
       * {@see GoTrueMFAApi#challengeAndVerify}
       */
      async _challengeAndVerify(params) {
        const { data: challengeData, error: challengeError } = await this._challenge({
          factorId: params.factorId
        });
        if (challengeError) {
          return this._returnResult({ data: null, error: challengeError });
        }
        return await this._verify({
          factorId: params.factorId,
          challengeId: challengeData.id,
          code: params.code
        });
      }
      /**
       * {@see GoTrueMFAApi#listFactors}
       */
      async _listFactors() {
        var _a;
        const { data: { user }, error: userError } = await this.getUser();
        if (userError) {
          return { data: null, error: userError };
        }
        const data = {
          all: [],
          phone: [],
          totp: [],
          webauthn: []
        };
        for (const factor of (_a = user === null || user === void 0 ? void 0 : user.factors) !== null && _a !== void 0 ? _a : []) {
          data.all.push(factor);
          if (factor.status === "verified") {
            ;
            data[factor.factor_type].push(factor);
          }
        }
        return {
          data,
          error: null
        };
      }
      /**
       * {@see GoTrueMFAApi#getAuthenticatorAssuranceLevel}
       */
      async _getAuthenticatorAssuranceLevel(jwt) {
        var _a, _b, _c, _d;
        if (jwt) {
          try {
            const { payload: payload2 } = decodeJWT(jwt);
            let currentLevel2 = null;
            if (payload2.aal) {
              currentLevel2 = payload2.aal;
            }
            let nextLevel2 = currentLevel2;
            const { data: { user }, error: userError } = await this.getUser(jwt);
            if (userError) {
              return this._returnResult({ data: null, error: userError });
            }
            const verifiedFactors2 = (_b = (_a = user === null || user === void 0 ? void 0 : user.factors) === null || _a === void 0 ? void 0 : _a.filter((factor) => factor.status === "verified")) !== null && _b !== void 0 ? _b : [];
            if (verifiedFactors2.length > 0) {
              nextLevel2 = "aal2";
            }
            const currentAuthenticationMethods2 = payload2.amr || [];
            return { data: { currentLevel: currentLevel2, nextLevel: nextLevel2, currentAuthenticationMethods: currentAuthenticationMethods2 }, error: null };
          } catch (error) {
            if (isAuthError(error)) {
              return this._returnResult({ data: null, error });
            }
            throw error;
          }
        }
        const { data: { session }, error: sessionError } = await this.getSession();
        if (sessionError) {
          return this._returnResult({ data: null, error: sessionError });
        }
        if (!session) {
          return {
            data: { currentLevel: null, nextLevel: null, currentAuthenticationMethods: [] },
            error: null
          };
        }
        const { payload } = decodeJWT(session.access_token);
        let currentLevel = null;
        if (payload.aal) {
          currentLevel = payload.aal;
        }
        let nextLevel = currentLevel;
        const verifiedFactors = (_d = (_c = session.user.factors) === null || _c === void 0 ? void 0 : _c.filter((factor) => factor.status === "verified")) !== null && _d !== void 0 ? _d : [];
        if (verifiedFactors.length > 0) {
          nextLevel = "aal2";
        }
        const currentAuthenticationMethods = payload.amr || [];
        return { data: { currentLevel, nextLevel, currentAuthenticationMethods }, error: null };
      }
      /**
       * Retrieves details about an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       *
       * Returns authorization details including client info, scopes, and user information.
       * If the response includes only a redirect_url field, it means consent was already given - the caller
       * should handle the redirect manually if needed.
       */
      async _getAuthorizationDetails(authorizationId) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new AuthSessionMissingError() });
            }
            return await _request(this.fetch, "GET", `${this.url}/oauth/authorizations/${authorizationId}`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Approves an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _approveAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new AuthSessionMissingError() });
            }
            const response = await _request(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "approve" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if (isBrowser() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Denies an OAuth authorization request.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _denyAuthorization(authorizationId, options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new AuthSessionMissingError() });
            }
            const response = await _request(this.fetch, "POST", `${this.url}/oauth/authorizations/${authorizationId}/consent`, {
              headers: this.headers,
              jwt: session.access_token,
              body: { action: "deny" },
              xform: (data) => ({ data, error: null })
            });
            if (response.data && response.data.redirect_url) {
              if (isBrowser() && !(options === null || options === void 0 ? void 0 : options.skipBrowserRedirect)) {
                window.location.assign(response.data.redirect_url);
              }
            }
            return response;
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Lists all OAuth grants that the authenticated user has authorized.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _listOAuthGrants() {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new AuthSessionMissingError() });
            }
            return await _request(this.fetch, "GET", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              xform: (data) => ({ data, error: null })
            });
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      /**
       * Revokes a user's OAuth grant for a specific client.
       * Only relevant when the OAuth 2.1 server is enabled in Supabase Auth.
       */
      async _revokeOAuthGrant(options) {
        try {
          return await this._useSession(async (result) => {
            const { data: { session }, error: sessionError } = result;
            if (sessionError) {
              return this._returnResult({ data: null, error: sessionError });
            }
            if (!session) {
              return this._returnResult({ data: null, error: new AuthSessionMissingError() });
            }
            await _request(this.fetch, "DELETE", `${this.url}/user/oauth/grants`, {
              headers: this.headers,
              jwt: session.access_token,
              query: { client_id: options.clientId },
              noResolveJson: true
            });
            return { data: {}, error: null };
          });
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
      async fetchJwk(kid, jwks = { keys: [] }) {
        let jwk = jwks.keys.find((key) => key.kid === kid);
        if (jwk) {
          return jwk;
        }
        const now = Date.now();
        jwk = this.jwks.keys.find((key) => key.kid === kid);
        if (jwk && this.jwks_cached_at + JWKS_TTL > now) {
          return jwk;
        }
        const { data, error } = await _request(this.fetch, "GET", `${this.url}/.well-known/jwks.json`, {
          headers: this.headers
        });
        if (error) {
          throw error;
        }
        if (!data.keys || data.keys.length === 0) {
          return null;
        }
        this.jwks = data;
        this.jwks_cached_at = now;
        jwk = data.keys.find((key) => key.kid === kid);
        if (!jwk) {
          return null;
        }
        return jwk;
      }
      /**
       * Extracts the JWT claims present in the access token by first verifying the
       * JWT against the server's JSON Web Key Set endpoint
       * `/.well-known/jwks.json` which is often cached, resulting in significantly
       * faster responses. Prefer this method over {@link #getUser} which always
       * sends a request to the Auth server for each JWT.
       *
       * If the project is not using an asymmetric JWT signing key (like ECC or
       * RSA) it always sends a request to the Auth server (similar to {@link
       * #getUser}) to verify the JWT.
       *
       * @param jwt An optional specific JWT you wish to verify, not the one you
       *            can obtain from {@link #getSession}.
       * @param options Various additional options that allow you to customize the
       *                behavior of this method.
       */
      async getClaims(jwt, options = {}) {
        try {
          let token = jwt;
          if (!token) {
            const { data, error } = await this.getSession();
            if (error || !data.session) {
              return this._returnResult({ data: null, error });
            }
            token = data.session.access_token;
          }
          const { header, payload, signature, raw: { header: rawHeader, payload: rawPayload } } = decodeJWT(token);
          if (!(options === null || options === void 0 ? void 0 : options.allowExpired)) {
            validateExp(payload.exp);
          }
          const signingKey = !header.alg || header.alg.startsWith("HS") || !header.kid || !("crypto" in globalThis && "subtle" in globalThis.crypto) ? null : await this.fetchJwk(header.kid, (options === null || options === void 0 ? void 0 : options.keys) ? { keys: options.keys } : options === null || options === void 0 ? void 0 : options.jwks);
          if (!signingKey) {
            const { error } = await this.getUser(token);
            if (error) {
              throw error;
            }
            return {
              data: {
                claims: payload,
                header,
                signature
              },
              error: null
            };
          }
          const algorithm = getAlgorithm(header.alg);
          const publicKey = await crypto.subtle.importKey("jwk", signingKey, algorithm, true, [
            "verify"
          ]);
          const isValid = await crypto.subtle.verify(algorithm, publicKey, signature, stringToUint8Array(`${rawHeader}.${rawPayload}`));
          if (!isValid) {
            throw new AuthInvalidJwtError("Invalid JWT signature");
          }
          return {
            data: {
              claims: payload,
              header,
              signature
            },
            error: null
          };
        } catch (error) {
          if (isAuthError(error)) {
            return this._returnResult({ data: null, error });
          }
          throw error;
        }
      }
    };
    GoTrueClient.nextInstanceID = {};
    GoTrueClient_default = GoTrueClient;
  }
});

// node_modules/@supabase/auth-js/dist/module/AuthAdminApi.js
var init_AuthAdminApi = __esm({
  "node_modules/@supabase/auth-js/dist/module/AuthAdminApi.js"() {
    init_GoTrueAdminApi();
  }
});

// node_modules/@supabase/auth-js/dist/module/AuthClient.js
var AuthClient, AuthClient_default;
var init_AuthClient = __esm({
  "node_modules/@supabase/auth-js/dist/module/AuthClient.js"() {
    init_GoTrueClient();
    AuthClient = GoTrueClient_default;
    AuthClient_default = AuthClient;
  }
});

// node_modules/@supabase/auth-js/dist/module/index.js
var init_module3 = __esm({
  "node_modules/@supabase/auth-js/dist/module/index.js"() {
    init_GoTrueAdminApi();
    init_GoTrueClient();
    init_AuthAdminApi();
    init_AuthClient();
    init_types2();
    init_errors();
    init_locks();
  }
});

// node_modules/@supabase/supabase-js/dist/index.mjs
function _typeof3(o) {
  "@babel/helpers - typeof";
  return _typeof3 = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o$1) {
    return typeof o$1;
  } : function(o$1) {
    return o$1 && "function" == typeof Symbol && o$1.constructor === Symbol && o$1 !== Symbol.prototype ? "symbol" : typeof o$1;
  }, _typeof3(o);
}
function toPrimitive3(t, r) {
  if ("object" != _typeof3(t) || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r || "default");
    if ("object" != _typeof3(i)) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function toPropertyKey3(t) {
  var i = toPrimitive3(t, "string");
  return "symbol" == _typeof3(i) ? i : i + "";
}
function _defineProperty3(e, r, t) {
  return (r = toPropertyKey3(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function ownKeys3(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r$1) {
      return Object.getOwnPropertyDescriptor(e, r$1).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread23(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys3(Object(t), true).forEach(function(r$1) {
      _defineProperty3(e, r$1, t[r$1]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys3(Object(t)).forEach(function(r$1) {
      Object.defineProperty(e, r$1, Object.getOwnPropertyDescriptor(t, r$1));
    });
  }
  return e;
}
function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : url + "/";
}
function applySettingDefaults(options, defaults) {
  var _DEFAULT_GLOBAL_OPTIO, _globalOptions$header;
  const { db: dbOptions, auth: authOptions, realtime: realtimeOptions, global: globalOptions } = options;
  const { db: DEFAULT_DB_OPTIONS$1, auth: DEFAULT_AUTH_OPTIONS$1, realtime: DEFAULT_REALTIME_OPTIONS$1, global: DEFAULT_GLOBAL_OPTIONS$1 } = defaults;
  const result = {
    db: _objectSpread23(_objectSpread23({}, DEFAULT_DB_OPTIONS$1), dbOptions),
    auth: _objectSpread23(_objectSpread23({}, DEFAULT_AUTH_OPTIONS$1), authOptions),
    realtime: _objectSpread23(_objectSpread23({}, DEFAULT_REALTIME_OPTIONS$1), realtimeOptions),
    storage: {},
    global: _objectSpread23(_objectSpread23(_objectSpread23({}, DEFAULT_GLOBAL_OPTIONS$1), globalOptions), {}, { headers: _objectSpread23(_objectSpread23({}, (_DEFAULT_GLOBAL_OPTIO = DEFAULT_GLOBAL_OPTIONS$1 === null || DEFAULT_GLOBAL_OPTIONS$1 === void 0 ? void 0 : DEFAULT_GLOBAL_OPTIONS$1.headers) !== null && _DEFAULT_GLOBAL_OPTIO !== void 0 ? _DEFAULT_GLOBAL_OPTIO : {}), (_globalOptions$header = globalOptions === null || globalOptions === void 0 ? void 0 : globalOptions.headers) !== null && _globalOptions$header !== void 0 ? _globalOptions$header : {}) }),
    accessToken: async () => ""
  };
  if (options.accessToken) result.accessToken = options.accessToken;
  else delete result.accessToken;
  return result;
}
function validateSupabaseUrl(supabaseUrl2) {
  const trimmedUrl = supabaseUrl2 === null || supabaseUrl2 === void 0 ? void 0 : supabaseUrl2.trim();
  if (!trimmedUrl) throw new Error("supabaseUrl is required.");
  if (!trimmedUrl.match(/^https?:\/\//i)) throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  try {
    return new URL(ensureTrailingSlash(trimmedUrl));
  } catch (_unused) {
    throw Error("Invalid supabaseUrl: Provided URL is malformed.");
  }
}
function shouldShowDeprecationWarning() {
  if (typeof window !== "undefined") return false;
  const _process = globalThis["process"];
  if (!_process) return false;
  const processVersion = _process["version"];
  if (processVersion === void 0 || processVersion === null) return false;
  const versionMatch = processVersion.match(/^v(\d+)\./);
  if (!versionMatch) return false;
  return parseInt(versionMatch[1], 10) <= 18;
}
var version4, JS_ENV, DEFAULT_HEADERS3, DEFAULT_GLOBAL_OPTIONS, DEFAULT_DB_OPTIONS, DEFAULT_AUTH_OPTIONS, DEFAULT_REALTIME_OPTIONS, resolveFetch4, resolveHeadersConstructor, fetchWithAuth, SupabaseAuthClient, SupabaseClient, createClient;
var init_dist4 = __esm({
  "node_modules/@supabase/supabase-js/dist/index.mjs"() {
    init_module();
    init_dist();
    init_module2();
    init_dist3();
    init_module3();
    init_module2();
    init_module3();
    version4 = "2.99.1";
    JS_ENV = "";
    if (typeof Deno !== "undefined") JS_ENV = "deno";
    else if (typeof document !== "undefined") JS_ENV = "web";
    else if (typeof navigator !== "undefined" && navigator.product === "ReactNative") JS_ENV = "react-native";
    else JS_ENV = "node";
    DEFAULT_HEADERS3 = { "X-Client-Info": `supabase-js-${JS_ENV}/${version4}` };
    DEFAULT_GLOBAL_OPTIONS = { headers: DEFAULT_HEADERS3 };
    DEFAULT_DB_OPTIONS = { schema: "public" };
    DEFAULT_AUTH_OPTIONS = {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: "implicit"
    };
    DEFAULT_REALTIME_OPTIONS = {};
    resolveFetch4 = (customFetch) => {
      if (customFetch) return (...args) => customFetch(...args);
      return (...args) => fetch(...args);
    };
    resolveHeadersConstructor = () => {
      return Headers;
    };
    fetchWithAuth = (supabaseKey, getAccessToken, customFetch) => {
      const fetch$1 = resolveFetch4(customFetch);
      const HeadersConstructor = resolveHeadersConstructor();
      return async (input, init) => {
        var _await$getAccessToken;
        const accessToken = (_await$getAccessToken = await getAccessToken()) !== null && _await$getAccessToken !== void 0 ? _await$getAccessToken : supabaseKey;
        let headers = new HeadersConstructor(init === null || init === void 0 ? void 0 : init.headers);
        if (!headers.has("apikey")) headers.set("apikey", supabaseKey);
        if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch$1(input, _objectSpread23(_objectSpread23({}, init), {}, { headers }));
      };
    };
    SupabaseAuthClient = class extends AuthClient_default {
      constructor(options) {
        super(options);
      }
    };
    SupabaseClient = class {
      /**
      * Create a new client for use in the browser.
      *
      * @category Initializing
      *
      * @param supabaseUrl The unique Supabase URL which is supplied when you create a new project in your project dashboard.
      * @param supabaseKey The unique Supabase Key which is supplied when you create a new project in your project dashboard.
      * @param options.db.schema You can switch in between schemas. The schema needs to be on the list of exposed schemas inside Supabase.
      * @param options.auth.autoRefreshToken Set to "true" if you want to automatically refresh the token before expiring.
      * @param options.auth.persistSession Set to "true" if you want to automatically save the user session into local storage.
      * @param options.auth.detectSessionInUrl Set to "true" if you want to automatically detects OAuth grants in the URL and signs in the user.
      * @param options.realtime Options passed along to realtime-js constructor.
      * @param options.storage Options passed along to the storage-js constructor.
      * @param options.global.fetch A custom fetch implementation.
      * @param options.global.headers Any additional headers to send with each network request.
      *
      * @example Creating a client
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * // Create a single supabase client for interacting with your database
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key')
      * ```
      *
      * @example With a custom domain
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * // Use a custom domain as the supabase URL
      * const supabase = createClient('https://my-custom-domain.com', 'publishable-or-anon-key')
      * ```
      *
      * @example With additional parameters
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * const options = {
      *   db: {
      *     schema: 'public',
      *   },
      *   auth: {
      *     autoRefreshToken: true,
      *     persistSession: true,
      *     detectSessionInUrl: true
      *   },
      *   global: {
      *     headers: { 'x-my-custom-header': 'my-app-name' },
      *   },
      * }
      * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", options)
      * ```
      *
      * @exampleDescription With custom schemas
      * By default the API server points to the `public` schema. You can enable other database schemas within the Dashboard.
      * Go to [Settings > API > Exposed schemas](/dashboard/project/_/settings/api) and add the schema which you want to expose to the API.
      *
      * Note: each client connection can only access a single schema, so the code above can access the `other_schema` schema but cannot access the `public` schema.
      *
      * @example With custom schemas
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
      *   // Provide a custom schema. Defaults to "public".
      *   db: { schema: 'other_schema' }
      * })
      * ```
      *
      * @exampleDescription Custom fetch implementation
      * `supabase-js` uses the [`cross-fetch`](https://www.npmjs.com/package/cross-fetch) library to make HTTP requests,
      * but an alternative `fetch` implementation can be provided as an option.
      * This is most useful in environments where `cross-fetch` is not compatible (for instance Cloudflare Workers).
      *
      * @example Custom fetch implementation
      * ```js
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'publishable-or-anon-key', {
      *   global: { fetch: fetch.bind(globalThis) }
      * })
      * ```
      *
      * @exampleDescription React Native options with AsyncStorage
      * For React Native we recommend using `AsyncStorage` as the storage implementation for Supabase Auth.
      *
      * @example React Native options with AsyncStorage
      * ```js
      * import 'react-native-url-polyfill/auto'
      * import { createClient } from '@supabase/supabase-js'
      * import AsyncStorage from "@react-native-async-storage/async-storage";
      *
      * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", {
      *   auth: {
      *     storage: AsyncStorage,
      *     autoRefreshToken: true,
      *     persistSession: true,
      *     detectSessionInUrl: false,
      *   },
      * });
      * ```
      *
      * @exampleDescription React Native options with Expo SecureStore
      * If you wish to encrypt the user's session information, you can use `aes-js` and store the encryption key in Expo SecureStore.
      * The `aes-js` library, a reputable JavaScript-only implementation of the AES encryption algorithm in CTR mode.
      * A new 256-bit encryption key is generated using the `react-native-get-random-values` library.
      * This key is stored inside Expo's SecureStore, while the value is encrypted and placed inside AsyncStorage.
      *
      * Please make sure that:
      * - You keep the `expo-secure-store`, `aes-js` and `react-native-get-random-values` libraries up-to-date.
      * - Choose the correct [`SecureStoreOptions`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestoreoptions) for your app's needs.
      *   E.g. [`SecureStore.WHEN_UNLOCKED`](https://docs.expo.dev/versions/latest/sdk/securestore/#securestorewhen_unlocked) regulates when the data can be accessed.
      * - Carefully consider optimizations or other modifications to the above example, as those can lead to introducing subtle security vulnerabilities.
      *
      * @example React Native options with Expo SecureStore
      * ```ts
      * import 'react-native-url-polyfill/auto'
      * import { createClient } from '@supabase/supabase-js'
      * import AsyncStorage from '@react-native-async-storage/async-storage';
      * import * as SecureStore from 'expo-secure-store';
      * import * as aesjs from 'aes-js';
      * import 'react-native-get-random-values';
      *
      * // As Expo's SecureStore does not support values larger than 2048
      * // bytes, an AES-256 key is generated and stored in SecureStore, while
      * // it is used to encrypt/decrypt values stored in AsyncStorage.
      * class LargeSecureStore {
      *   private async _encrypt(key: string, value: string) {
      *     const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
      *
      *     const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
      *     const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
      *
      *     await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
      *
      *     return aesjs.utils.hex.fromBytes(encryptedBytes);
      *   }
      *
      *   private async _decrypt(key: string, value: string) {
      *     const encryptionKeyHex = await SecureStore.getItemAsync(key);
      *     if (!encryptionKeyHex) {
      *       return encryptionKeyHex;
      *     }
      *
      *     const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(encryptionKeyHex), new aesjs.Counter(1));
      *     const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
      *
      *     return aesjs.utils.utf8.fromBytes(decryptedBytes);
      *   }
      *
      *   async getItem(key: string) {
      *     const encrypted = await AsyncStorage.getItem(key);
      *     if (!encrypted) { return encrypted; }
      *
      *     return await this._decrypt(key, encrypted);
      *   }
      *
      *   async removeItem(key: string) {
      *     await AsyncStorage.removeItem(key);
      *     await SecureStore.deleteItemAsync(key);
      *   }
      *
      *   async setItem(key: string, value: string) {
      *     const encrypted = await this._encrypt(key, value);
      *
      *     await AsyncStorage.setItem(key, encrypted);
      *   }
      * }
      *
      * const supabase = createClient("https://xyzcompany.supabase.co", "publishable-or-anon-key", {
      *   auth: {
      *     storage: new LargeSecureStore(),
      *     autoRefreshToken: true,
      *     persistSession: true,
      *     detectSessionInUrl: false,
      *   },
      * });
      * ```
      *
      * @example With a database query
      * ```ts
      * import { createClient } from '@supabase/supabase-js'
      *
      * const supabase = createClient('https://xyzcompany.supabase.co', 'public-anon-key')
      *
      * const { data } = await supabase.from('profiles').select('*')
      * ```
      */
      constructor(supabaseUrl2, supabaseKey, options) {
        var _settings$auth$storag, _settings$global$head;
        this.supabaseUrl = supabaseUrl2;
        this.supabaseKey = supabaseKey;
        const baseUrl = validateSupabaseUrl(supabaseUrl2);
        if (!supabaseKey) throw new Error("supabaseKey is required.");
        this.realtimeUrl = new URL("realtime/v1", baseUrl);
        this.realtimeUrl.protocol = this.realtimeUrl.protocol.replace("http", "ws");
        this.authUrl = new URL("auth/v1", baseUrl);
        this.storageUrl = new URL("storage/v1", baseUrl);
        this.functionsUrl = new URL("functions/v1", baseUrl);
        const defaultStorageKey = `sb-${baseUrl.hostname.split(".")[0]}-auth-token`;
        const DEFAULTS = {
          db: DEFAULT_DB_OPTIONS,
          realtime: DEFAULT_REALTIME_OPTIONS,
          auth: _objectSpread23(_objectSpread23({}, DEFAULT_AUTH_OPTIONS), {}, { storageKey: defaultStorageKey }),
          global: DEFAULT_GLOBAL_OPTIONS
        };
        const settings = applySettingDefaults(options !== null && options !== void 0 ? options : {}, DEFAULTS);
        this.storageKey = (_settings$auth$storag = settings.auth.storageKey) !== null && _settings$auth$storag !== void 0 ? _settings$auth$storag : "";
        this.headers = (_settings$global$head = settings.global.headers) !== null && _settings$global$head !== void 0 ? _settings$global$head : {};
        if (!settings.accessToken) {
          var _settings$auth;
          this.auth = this._initSupabaseAuthClient((_settings$auth = settings.auth) !== null && _settings$auth !== void 0 ? _settings$auth : {}, this.headers, settings.global.fetch);
        } else {
          this.accessToken = settings.accessToken;
          this.auth = new Proxy({}, { get: (_, prop) => {
            throw new Error(`@supabase/supabase-js: Supabase Client is configured with the accessToken option, accessing supabase.auth.${String(prop)} is not possible`);
          } });
        }
        this.fetch = fetchWithAuth(supabaseKey, this._getAccessToken.bind(this), settings.global.fetch);
        this.realtime = this._initRealtimeClient(_objectSpread23({
          headers: this.headers,
          accessToken: this._getAccessToken.bind(this)
        }, settings.realtime));
        if (this.accessToken) Promise.resolve(this.accessToken()).then((token) => this.realtime.setAuth(token)).catch((e) => console.warn("Failed to set initial Realtime auth token:", e));
        this.rest = new PostgrestClient(new URL("rest/v1", baseUrl).href, {
          headers: this.headers,
          schema: settings.db.schema,
          fetch: this.fetch,
          timeout: settings.db.timeout,
          urlLengthLimit: settings.db.urlLengthLimit
        });
        this.storage = new StorageClient(this.storageUrl.href, this.headers, this.fetch, options === null || options === void 0 ? void 0 : options.storage);
        if (!settings.accessToken) this._listenForAuthEvents();
      }
      /**
      * Supabase Functions allows you to deploy and invoke edge functions.
      */
      get functions() {
        return new FunctionsClient(this.functionsUrl.href, {
          headers: this.headers,
          customFetch: this.fetch
        });
      }
      /**
      * Perform a query on a table or a view.
      *
      * @param relation - The table or view name to query
      */
      from(relation) {
        return this.rest.from(relation);
      }
      /**
      * Select a schema to query or perform an function (rpc) call.
      *
      * The schema needs to be on the list of exposed schemas inside Supabase.
      *
      * @param schema - The schema to query
      */
      schema(schema) {
        return this.rest.schema(schema);
      }
      /**
      * Perform a function call.
      *
      * @param fn - The function name to call
      * @param args - The arguments to pass to the function call
      * @param options - Named parameters
      * @param options.head - When set to `true`, `data` will not be returned.
      * Useful if you only need the count.
      * @param options.get - When set to `true`, the function will be called with
      * read-only access mode.
      * @param options.count - Count algorithm to use to count rows returned by the
      * function. Only applicable for [set-returning
      * functions](https://www.postgresql.org/docs/current/functions-srf.html).
      *
      * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
      * hood.
      *
      * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
      * statistics under the hood.
      *
      * `"estimated"`: Uses exact count for low numbers and planned count for high
      * numbers.
      */
      rpc(fn, args = {}, options = {
        head: false,
        get: false,
        count: void 0
      }) {
        return this.rest.rpc(fn, args, options);
      }
      /**
      * Creates a Realtime channel with Broadcast, Presence, and Postgres Changes.
      *
      * @param {string} name - The name of the Realtime channel.
      * @param {Object} opts - The options to pass to the Realtime channel.
      *
      */
      channel(name, opts = { config: {} }) {
        return this.realtime.channel(name, opts);
      }
      /**
      * Returns all Realtime channels.
      */
      getChannels() {
        return this.realtime.getChannels();
      }
      /**
      * Unsubscribes and removes Realtime channel from Realtime client.
      *
      * @param {RealtimeChannel} channel - The name of the Realtime channel.
      *
      */
      removeChannel(channel) {
        return this.realtime.removeChannel(channel);
      }
      /**
      * Unsubscribes and removes all Realtime channels from Realtime client.
      */
      removeAllChannels() {
        return this.realtime.removeAllChannels();
      }
      async _getAccessToken() {
        var _this = this;
        var _data$session$access_, _data$session;
        if (_this.accessToken) return await _this.accessToken();
        const { data } = await _this.auth.getSession();
        return (_data$session$access_ = (_data$session = data.session) === null || _data$session === void 0 ? void 0 : _data$session.access_token) !== null && _data$session$access_ !== void 0 ? _data$session$access_ : _this.supabaseKey;
      }
      _initSupabaseAuthClient({ autoRefreshToken, persistSession, detectSessionInUrl, storage, userStorage, storageKey, flowType, lock, debug, throwOnError }, headers, fetch$1) {
        const authHeaders = {
          Authorization: `Bearer ${this.supabaseKey}`,
          apikey: `${this.supabaseKey}`
        };
        return new SupabaseAuthClient({
          url: this.authUrl.href,
          headers: _objectSpread23(_objectSpread23({}, authHeaders), headers),
          storageKey,
          autoRefreshToken,
          persistSession,
          detectSessionInUrl,
          storage,
          userStorage,
          flowType,
          lock,
          debug,
          throwOnError,
          fetch: fetch$1,
          hasCustomAuthorizationHeader: Object.keys(this.headers).some((key) => key.toLowerCase() === "authorization")
        });
      }
      _initRealtimeClient(options) {
        return new RealtimeClient(this.realtimeUrl.href, _objectSpread23(_objectSpread23({}, options), {}, { params: _objectSpread23(_objectSpread23({}, { apikey: this.supabaseKey }), options === null || options === void 0 ? void 0 : options.params) }));
      }
      _listenForAuthEvents() {
        return this.auth.onAuthStateChange((event, session) => {
          this._handleTokenChanged(event, "CLIENT", session === null || session === void 0 ? void 0 : session.access_token);
        });
      }
      _handleTokenChanged(event, source, token) {
        if ((event === "TOKEN_REFRESHED" || event === "SIGNED_IN") && this.changedAccessToken !== token) {
          this.changedAccessToken = token;
          this.realtime.setAuth(token);
        } else if (event === "SIGNED_OUT") {
          this.realtime.setAuth();
          if (source == "STORAGE") this.auth.signOut();
          this.changedAccessToken = void 0;
        }
      }
    };
    createClient = (supabaseUrl2, supabaseKey, options) => {
      return new SupabaseClient(supabaseUrl2, supabaseKey, options);
    };
    if (shouldShowDeprecationWarning()) console.warn("\u26A0\uFE0F  Node.js 18 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 20 or later. For more information, visit: https://github.com/orgs/supabase/discussions/37217");
  }
});

// src/lib/supabase.ts
var supabaseUrl, supabaseAnonKey, hasSupabaseConfig, supabaseConfigIssue, fallbackSupabaseUrl, fallbackSupabaseAnonKey, supabase;
var init_supabase = __esm({
  "src/lib/supabase.ts"() {
    "use strict";
    init_dist4();
    supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
    supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
    hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
    supabaseConfigIssue = hasSupabaseConfig ? null : "\u7F3A\u5C11 VITE_SUPABASE_URL \u6216 VITE_SUPABASE_ANON_KEY\uFF0C\u8BA4\u8BC1\u4E0E\u4E91\u540C\u6B65\u529F\u80FD\u5C06\u81EA\u52A8\u964D\u7EA7";
    if (!hasSupabaseConfig) {
      console.error("[Supabase] \u914D\u7F6E\u7F3A\u5931\uFF0C\u5DF2\u5207\u6362\u4E3A\u5B89\u5168\u964D\u7EA7\u6A21\u5F0F");
      console.error("[Supabase]", supabaseConfigIssue);
    }
    fallbackSupabaseUrl = "https://placeholder.invalid";
    fallbackSupabaseAnonKey = "placeholder-anon-key";
    supabase = createClient(
      hasSupabaseConfig ? supabaseUrl : fallbackSupabaseUrl,
      hasSupabaseConfig ? supabaseAnonKey : fallbackSupabaseAnonKey,
      {
        db: {
          schema: "public"
        },
        auth: {
          persistSession: hasSupabaseConfig,
          autoRefreshToken: hasSupabaseConfig,
          detectSessionInUrl: hasSupabaseConfig
        },
        global: {
          fetch: (input, init) => {
            return fetch(input, {
              ...init,
              signal: init?.signal || void 0
            });
          }
        }
      }
    );
  }
});

// src/services/api/providerStrategy.ts
function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").trim().replace(/\/+$/, "");
}
function normalizeProviderName(provider) {
  return String(provider || "").trim().toLowerCase();
}
function normalizeFormat(format, fallback = "auto") {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "gemini" || normalized === "auto") {
    return normalized;
  }
  return fallback;
}
function normalizeAuthMethod(authMethod) {
  const normalized = String(authMethod || "").trim().toLowerCase();
  if (normalized === "query" || normalized === "header") {
    return normalized;
  }
  return void 0;
}
function normalizeCompatibilityMode(mode) {
  const normalized = String(mode || "").trim().toLowerCase();
  if (normalized === "standard" || normalized === "chat") {
    return normalized;
  }
  return void 0;
}
function normalizeHost(baseUrl) {
  const raw = normalizeBaseUrl(baseUrl);
  if (!raw) return "";
  const candidates = raw.startsWith("http://") || raw.startsWith("https://") ? [raw] : [`https://${raw}`, `http://${raw}`];
  for (const candidate of candidates) {
    try {
      return new URL(candidate).hostname.toLowerCase();
    } catch {
      continue;
    }
  }
  return raw.toLowerCase();
}
function matchesAny(patterns, value) {
  if (!patterns || !value) return false;
  return patterns.some((pattern) => pattern.test(value));
}
function findStrategyByBase(baseUrl) {
  const normalizedBase = normalizeBaseUrl(baseUrl).toLowerCase();
  const host = normalizeHost(baseUrl);
  if (!normalizedBase && !host) return void 0;
  return PROVIDER_STRATEGIES.find(
    (strategy) => matchesAny(strategy.hostPatterns, host) || matchesAny(strategy.basePatterns, normalizedBase)
  );
}
function findStrategyByProvider(provider) {
  const normalizedProvider = normalizeProviderName(provider);
  if (!normalizedProvider) return void 0;
  return PROVIDER_STRATEGIES.find((strategy) => matchesAny(strategy.providerPatterns, normalizedProvider));
}
function isGeminiFamilyModel(modelId) {
  const lower = String(modelId || "").trim().split("@")[0].toLowerCase();
  return lower.startsWith("gemini-") || lower.startsWith("imagen-") || lower.startsWith("veo-");
}
function resolveProviderStrategy(provider, baseUrl) {
  const baseMatch = findStrategyByBase(baseUrl);
  if (baseMatch) {
    return baseMatch;
  }
  const providerMatch = findStrategyByProvider(provider);
  if (!providerMatch) {
    return FALLBACK_STRATEGY;
  }
  if (normalizeBaseUrl(baseUrl) && providerMatch.respectProviderOnCustomHost === false) {
    return FALLBACK_STRATEGY;
  }
  return providerMatch;
}
function resolveProviderKeyType(provider, baseUrl) {
  const normalizedProvider = normalizeProviderName(provider);
  const strategy = resolveProviderStrategy(provider, baseUrl);
  const host = normalizeHost(baseUrl);
  const googleHost = matchesAny(PROVIDER_STRATEGIES.find((item) => item.id === "google")?.hostPatterns, host) || /googleapis\.com$/i.test(host);
  if (normalizedProvider === "google" && (!normalizeBaseUrl(baseUrl) || googleHost || strategy.id === "google")) {
    return "official";
  }
  if (normalizedProvider === "google") {
    return "proxy";
  }
  return "third-party";
}
function resolveProviderRuntime(input) {
  const strategy = resolveProviderStrategy(input.provider, input.baseUrl);
  const requestedFormat = normalizeFormat(
    input.format,
    strategy.id === "google" ? "gemini" : "auto"
  );
  const fallbackFormat = input.fallbackFormat || (strategy.defaultFormat === "gemini" ? "gemini" : "openai");
  const resolvedFormat = requestedFormat === "auto" ? fallbackFormat : requestedFormat;
  const geminiNative = requestedFormat === "gemini" || requestedFormat !== "openai" && !!strategy.autoGeminiNativeForGeminiModels && isGeminiFamilyModel(input.modelId);
  const authMethod = normalizeAuthMethod(input.authMethod) || (geminiNative ? strategy.geminiAuthMethod || strategy.defaultAuthMethod || "header" : strategy.defaultAuthMethod || "header");
  const headerName = String(input.headerName || "").trim() || (geminiNative && strategy.id === "google" ? GOOGLE_API_HEADER : strategy.defaultHeaderName || AUTHORIZATION_HEADER);
  const authorizationValueFormat = strategy.authorizationValueFormat || "bearer";
  const compatibilityMode = normalizeCompatibilityMode(input.compatibilityMode) || strategy.defaultCompatibilityMode || "standard";
  return {
    strategy,
    strategyId: strategy.id,
    providerName: normalizeProviderName(input.provider),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    host: normalizeHost(input.baseUrl),
    requestedFormat,
    resolvedFormat,
    authMethod,
    headerName,
    authorizationValueFormat,
    compatibilityMode,
    geminiNative,
    imageProfile: strategy.imageProfile || "openai-strict",
    videoApiStyle: strategy.videoApiStyle || "openai-v1-videos",
    isKnownProvider: strategy.known,
    uiProvider: strategy.uiProvider || "OpenAI"
  };
}
var GOOGLE_API_HEADER, AUTHORIZATION_HEADER, FALLBACK_STRATEGY, PROVIDER_STRATEGIES;
var init_providerStrategy = __esm({
  "src/services/api/providerStrategy.ts"() {
    "use strict";
    GOOGLE_API_HEADER = "x-goog-api-key";
    AUTHORIZATION_HEADER = "Authorization";
    FALLBACK_STRATEGY = {
      id: "generic-openai",
      label: "Generic OpenAI-Compatible",
      known: false,
      defaultFormat: "openai",
      defaultAuthMethod: "header",
      geminiAuthMethod: "header",
      defaultHeaderName: AUTHORIZATION_HEADER,
      authorizationValueFormat: "bearer",
      defaultCompatibilityMode: "standard",
      imageProfile: "openai-strict",
      videoApiStyle: "openai-v1-videos",
      autoGeminiNativeForGeminiModels: false,
      respectProviderOnCustomHost: true,
      uiProvider: "OpenAI"
    };
    PROVIDER_STRATEGIES = [
      {
        id: "google",
        label: "Google Gemini",
        known: true,
        providerPatterns: [/^google$/i, /^gemini$/i],
        hostPatterns: [/^generativelanguage\.googleapis\.com$/i],
        basePatterns: [/googleapis\.com/i],
        defaultFormat: "gemini",
        defaultAuthMethod: "query",
        geminiAuthMethod: "query",
        defaultHeaderName: GOOGLE_API_HEADER,
        authorizationValueFormat: "raw",
        defaultCompatibilityMode: "standard",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: true,
        respectProviderOnCustomHost: false,
        uiProvider: "Google"
      },
      {
        id: "12ai",
        label: "12AI",
        known: true,
        providerPatterns: [/^12ai$/i, /^systemproxy$/i],
        hostPatterns: [/^cdn\.12ai\.org$/i, /^new\.12ai\.org$/i, /^hk\.12ai\.org$/i, /(^|\.)12ai\.(org|xyz|io|net)$/i],
        basePatterns: [/12ai\.(org|xyz|io|net)/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "query",
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: "bearer",
        defaultCompatibilityMode: "standard",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: true,
        respectProviderOnCustomHost: true,
        uiProvider: "12AI"
      },
      {
        id: "wuyinkeji",
        label: "Wuyin Keji",
        known: true,
        basePatterns: [/api\.wuyinkeji\.com/i, /wuyinkeji/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "query",
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: "raw",
        defaultCompatibilityMode: "standard",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "newapi",
        label: "NewAPI / OneAPI",
        known: true,
        providerPatterns: [/^newapi$/i, /^oneapi$/i, /^cherry(\s+studio)?$/i],
        hostPatterns: [/^ai\.newapi\.pro$/i, /^docs\.newapi\.pro$/i, /(^|\.)newapi\./i, /(^|\.)oneapi\./i],
        basePatterns: [/newapi/i, /oneapi/i, /vodeshop/i, /future-api/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        authorizationValueFormat: "bearer",
        defaultCompatibilityMode: "standard",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "openrouter",
        label: "OpenRouter",
        known: true,
        providerPatterns: [/^openrouter$/i],
        hostPatterns: [/^openrouter\.ai$/i],
        basePatterns: [/openrouter/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "standard",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "openai",
        label: "OpenAI",
        known: true,
        providerPatterns: [/^openai$/i],
        hostPatterns: [/^api\.openai\.com$/i],
        basePatterns: [/api\.openai\.com/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "standard",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "siliconflow",
        label: "SiliconFlow",
        known: true,
        providerPatterns: [/^siliconflow$/i],
        hostPatterns: [/^api\.siliconflow\.cn$/i],
        basePatterns: [/siliconflow/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "siliconflow",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "SiliconFlow"
      },
      {
        id: "antigravity",
        label: "Antigravity",
        known: true,
        providerPatterns: [/^antigravity$/i],
        basePatterns: [/127\.0\.0\.1:8045/i, /localhost:8045/i, /antigravity/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "antigravity",
        videoApiStyle: "legacy-video-generations",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "gpt-best",
        label: "GPT-Best",
        known: false,
        basePatterns: [/gpt-best/i, /gptbest/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "standard",
        imageProfile: "gpt-best-extended",
        videoApiStyle: "legacy-video-generations",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "suxi",
        label: "Suxi",
        known: false,
        basePatterns: [/suxi\.ai/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "chat-preferred",
        videoApiStyle: "legacy-video-generations",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "deepseek",
        label: "DeepSeek",
        known: true,
        providerPatterns: [/^deepseek$/i],
        hostPatterns: [/^api\.deepseek\.com$/i],
        basePatterns: [/deepseek/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "OpenAI"
      },
      {
        id: "volcengine",
        label: "Volcengine",
        known: true,
        providerPatterns: [/^volcengine$/i],
        basePatterns: [/volces\.com/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "Volcengine"
      },
      {
        id: "aliyun",
        label: "Aliyun",
        known: true,
        providerPatterns: [/^aliyun$/i],
        basePatterns: [/aliyuncs\.com/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "Aliyun"
      },
      {
        id: "tencent",
        label: "Tencent",
        known: true,
        providerPatterns: [/^tencent$/i],
        basePatterns: [/tencent\.com/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "Tencent"
      },
      {
        id: "anthropic",
        label: "Anthropic",
        known: true,
        providerPatterns: [/^anthropic$/i],
        basePatterns: [/anthropic\.com/i],
        defaultFormat: "openai",
        defaultAuthMethod: "header",
        geminiAuthMethod: "header",
        defaultHeaderName: AUTHORIZATION_HEADER,
        defaultCompatibilityMode: "chat",
        imageProfile: "openai-strict",
        videoApiStyle: "openai-v1-videos",
        autoGeminiNativeForGeminiModels: false,
        respectProviderOnCustomHost: true,
        uiProvider: "Anthropic"
      }
    ];
  }
});

// src/services/api/apiConfig.ts
function normalizeApiProtocolFormat(format, fallback = "auto") {
  const normalized = String(format || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "gemini" || normalized === "auto") {
    return normalized;
  }
  return fallback;
}
function resolveApiProtocolFormat(format, baseUrl, fallback = "openai", provider) {
  return resolveProviderRuntime({
    provider,
    baseUrl,
    format,
    fallbackFormat: fallback
  }).resolvedFormat;
}
function getApiKeyToken(apiKey) {
  return String(apiKey || "").replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r?\n|\r|\t/g, "").trim().replace(/^Bearer\s+/i, "").replace(/\s+/g, "").trim();
}
function formatAuthorizationHeaderValue(apiKey, valueFormat = "bearer") {
  const token = getApiKeyToken(apiKey);
  if (valueFormat === "raw") {
    return token;
  }
  return /^Bearer\s+/i.test(apiKey) ? apiKey : `Bearer ${token}`;
}
function normalizeOpenAIBaseUrl(url) {
  if (!url) return "";
  let clean = url.trim().replace(/\/+$/, "");
  clean = clean.replace(/\/(?:chat\/completions|images\/generations|images\/edits|responses|models)$/i, "");
  if (!/\/v\d[\w.-]*$/i.test(clean)) {
    clean = `${clean}/v1`;
  }
  return clean.replace(/\/+$/, "");
}
function buildOpenAIEndpoint(baseUrl, endpoint) {
  const cleanBase = normalizeOpenAIBaseUrl(baseUrl);
  return `${cleanBase}/${endpoint.replace(/^\/+/, "")}`;
}
function normalizeGeminiBaseUrl(url) {
  let clean = (url || GOOGLE_API_BASE).trim().replace(/\/+$/, "");
  clean = clean.replace(/\/v1beta\/models\/[^/?]+:(?:generateContent|streamGenerateContent)$/i, "").replace(/\/v1\/models\/[^/?]+:(?:generateContent|streamGenerateContent)$/i, "").replace(/\/+$/, "");
  const suffixes = [
    "/v1beta/models",
    "/v1/models",
    "/models",
    "/v1beta",
    "/v1"
  ];
  let stripped = true;
  while (stripped) {
    stripped = false;
    const lower = clean.toLowerCase();
    for (const suffix of suffixes) {
      if (lower.endsWith(suffix)) {
        clean = clean.slice(0, -suffix.length).replace(/\/+$/, "");
        stripped = true;
        break;
      }
    }
  }
  return clean || GOOGLE_API_BASE;
}
function resolveGeminiAuthMethod(baseUrl, preferred, provider) {
  return resolveProviderRuntime({
    provider,
    baseUrl,
    format: "gemini",
    authMethod: preferred
  }).authMethod;
}
function buildGeminiModelsEndpoint(baseUrl, apiKey, authMethod, provider) {
  const cleanBase = normalizeGeminiBaseUrl(baseUrl);
  const endpoint = `${cleanBase}/v1beta/models`;
  if (resolveGeminiAuthMethod(baseUrl, authMethod, provider) === "query") {
    const encodedKey = encodeURIComponent(getApiKeyToken(apiKey));
    return `${endpoint}?key=${encodedKey}`;
  }
  return endpoint;
}
function buildGeminiHeaders(authMethod, apiKey, headerName, authorizationValueFormat = "bearer") {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  if (authMethod !== "header") {
    return headers;
  }
  const effectiveHeaderName = headerName || "Authorization";
  headers[effectiveHeaderName] = effectiveHeaderName === "Authorization" ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat) : getApiKeyToken(apiKey);
  return headers;
}
function buildProxyHeaders(authMethod, apiKey, headerName = "Authorization", group, authorizationValueFormat = "bearer") {
  const headers = {
    "Content-Type": "application/json"
  };
  if (authMethod === "header" && apiKey) {
    if (headerName === "Authorization" && !/^Bearer\s+/i.test(apiKey)) {
      headers[headerName] = formatAuthorizationHeaderValue(apiKey, authorizationValueFormat);
    } else {
      headers[headerName] = headerName === "Authorization" ? formatAuthorizationHeaderValue(apiKey, authorizationValueFormat) : apiKey;
    }
  }
  if (apiKey.startsWith("sk-or-") || headerName.toLowerCase() === "authorization") {
    if (typeof window !== "undefined") {
      headers["HTTP-Referer"] = window.location.origin;
      headers["X-Title"] = "KK Studio";
    }
  }
  if (group) {
    headers["X-Group"] = group;
  }
  return headers;
}
function getDefaultAuthMethod(baseUrl, options) {
  return resolveProviderRuntime({
    provider: options?.provider,
    baseUrl,
    format: options?.format,
    modelId: options?.modelId
  }).authMethod;
}
var GOOGLE_API_BASE;
var init_apiConfig = __esm({
  "src/services/api/apiConfig.ts"() {
    "use strict";
    init_providerStrategy();
    GOOGLE_API_BASE = "https://generativelanguage.googleapis.com";
  }
});

// src/services/api/errorClassification.ts
function normalizeText(value) {
  return String(value || "").trim();
}
function extractStatusCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    const candidate = value.status ?? value.statusCode ?? value.code;
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  const text = normalizeText(value);
  const match = text.match(/\b(401|403|408|409|413|422|429|500|502|503|504|524|530)\b/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }
  return void 0;
}
function extractApiErrorDetail(input) {
  const responseText = normalizeText(input.responseText);
  if (!responseText) {
    return normalizeText(input.fallback);
  }
  try {
    const parsed = JSON.parse(responseText);
    const errorObj = parsed?.error || parsed;
    return normalizeText(
      errorObj?.message || errorObj?.error || parsed?.message || input.fallback || responseText
    );
  } catch {
    return responseText || normalizeText(input.fallback);
  }
}
function hasAuthErrorMarkers(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return [
    "401",
    "403",
    "unauthorized",
    "forbidden",
    "invalid token",
    "invalid api key",
    "api key invalid",
    "invalid authentication",
    "authentication failed",
    "authentication error",
    "access token",
    "permission denied",
    "permission_denied",
    "invalid key",
    "token invalid",
    "expired token",
    "invalid credential",
    "invalid credentials",
    "\u65E0\u6548\u7684\u4EE4\u724C",
    "\u4EE4\u724C\u65E0\u6548",
    "\u5BC6\u94A5\u65E0\u6548",
    "api\u5BC6\u94A5\u65E0\u6548",
    "api key \u65E0\u6548",
    "\u8BA4\u8BC1\u5931\u8D25",
    "\u9274\u6743\u5931\u8D25",
    "\u6743\u9650\u4E0D\u8DB3",
    "\u8BBF\u95EE\u4EE4\u724C",
    "\u5DF2\u8FC7\u671F"
  ].some((marker) => text.includes(marker));
}
function hasTimeoutMarkers(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return [
    "timeout",
    "timed out",
    "request timeout",
    "524",
    "etimedout",
    "\u8D85\u65F6",
    "\u8BF7\u6C42\u8D85\u65F6",
    "\u8FDE\u63A5\u8D85\u65F6"
  ].some((marker) => text.includes(marker));
}
function hasNetworkErrorMarkers(value) {
  const text = normalizeText(value).toLowerCase();
  if (!text) return false;
  return [
    "failed to fetch",
    "network error",
    "network request failed",
    "fetch failed",
    "econnreset",
    "enotfound",
    "econnrefused",
    "socket hang up",
    "cors",
    "dns",
    "\u7F51\u7EDC\u9519\u8BEF",
    "\u7F51\u7EDC\u5F02\u5E38",
    "\u7F51\u7EDC\u8FDE\u63A5\u5931\u8D25",
    "\u65E0\u6CD5\u8FDE\u63A5",
    "\u8FDE\u63A5\u5931\u8D25"
  ].some((marker) => text.includes(marker));
}
function classifyApiFailure(input) {
  const errorText = normalizeText(
    input.error instanceof Error ? input.error.message : input.error
  );
  const detail = extractApiErrorDetail({
    responseText: input.responseText,
    fallback: errorText || input.fallbackMessage
  });
  const rawMessage = detail || errorText || normalizeText(input.fallbackMessage);
  const status = input.status ?? extractStatusCode(input.error) ?? extractStatusCode(rawMessage);
  if (status === 401 || status === 403 || hasAuthErrorMarkers(rawMessage)) {
    return { kind: "auth", status, rawMessage, detail };
  }
  if (status === 408 || status === 524 || hasTimeoutMarkers(rawMessage)) {
    return { kind: "timeout", status, rawMessage, detail };
  }
  if (status === 429 || rawMessage.toLowerCase().includes("rate limit")) {
    return { kind: "rate_limit", status, rawMessage, detail };
  }
  if ([500, 502, 503, 504, 530].includes(status || 0)) {
    return { kind: "server", status, rawMessage, detail };
  }
  if ([400, 404, 405, 409, 413, 415, 422].includes(status || 0)) {
    return { kind: "request", status, rawMessage, detail };
  }
  if (hasNetworkErrorMarkers(rawMessage)) {
    return { kind: "network", status, rawMessage, detail };
  }
  return { kind: "unknown", status, rawMessage, detail };
}
function buildUserFacingApiErrorMessage(info) {
  switch (info.kind) {
    case "auth":
      return `\u8BA4\u8BC1\u5931\u8D25${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u68C0\u67E5 API Key / Token \u662F\u5426\u6B63\u786E\u3001\u662F\u5426\u8FC7\u671F\uFF0C\u4EE5\u53CA\u5F53\u524D\u6E20\u9053\u4F7F\u7528\u7684\u9274\u6743\u65B9\u5F0F\u662F\u5426\u5339\u914D\u6587\u6863\u3002"}`;
    case "timeout":
      return `\u8BF7\u6C42\u8D85\u65F6${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u4EE3\u7406\u6216\u76EE\u6807\u670D\u52A1\u72B6\u6001\u3002"}`;
    case "network":
      return `\u7F51\u7EDC\u9519\u8BEF: ${info.detail || "\u65E0\u6CD5\u8FDE\u63A5\u5230\u76EE\u6807\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u3001\u4EE3\u7406\u6216\u57FA\u7840\u5730\u5740\u3002"}`;
    case "rate_limit":
      return `\u8BF7\u6C42\u8FC7\u4E8E\u9891\u7E41${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u7A0D\u540E\u91CD\u8BD5\u6216\u5207\u6362\u6E20\u9053\u3002"}`;
    case "server":
      return `\u670D\u52A1\u7AEF\u9519\u8BEF${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u76EE\u6807\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\u3002"}`;
    case "request":
      return `\u8BF7\u6C42\u9519\u8BEF${info.status ? ` (${info.status})` : ""}: ${info.detail || "\u8BF7\u68C0\u67E5\u63A5\u53E3\u5730\u5740\u3001\u6A21\u578B\u6216\u8BF7\u6C42\u53C2\u6570\u662F\u5426\u7B26\u5408\u6587\u6863\u3002"}`;
    default:
      return info.detail || info.rawMessage || "\u672A\u77E5\u9519\u8BEF";
  }
}
var init_errorClassification = __esm({
  "src/services/api/errorClassification.ts"() {
    "use strict";
  }
});

// src/services/model/modelPresets.ts
var MODEL_PRESETS, CHAT_MODEL_PRESETS;
var init_modelPresets = __esm({
  "src/services/model/modelPresets.ts"() {
    "use strict";
    MODEL_PRESETS = [
      // ============================================
      // Gemini Image 系列
      { id: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image", provider: "Google", type: "image", description: "\u6781\u901F\u751F\u6210\uFF0C\u9002\u5408\u5FEB\u901F\u9A8C\u8BC1\u7075\u611F" },
      { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", provider: "Google", type: "image", description: "\u6700\u65B0\u9884\u89C8\u7248\uFF0C\u6781\u901F\u751F\u6210\u4E14\u652F\u6301\u591A\u8FBE 14 \u5F20\u53C2\u8003\u56FE" },
      { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", provider: "Google", type: "image", description: "\u589E\u5F3A\u7EC6\u8282\u4E0E\u6784\u56FE\uFF0C\u9002\u5408\u9AD8\u8D28\u91CF\u9884\u89C8" },
      // ============================================
      // Google Veo 系列 (视频生成)
      // 参考: https://ai.google.dev/gemini-api/docs/models/video
      // ============================================
      { id: "veo-3.1-generate-preview", label: "Veo 3.1", provider: "Google", type: "video", description: "\u6700\u65B0\u89C6\u9891\u751F\u6210\u6A21\u578B (\u9884\u89C8\u7248)" },
      { id: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast", provider: "Google", type: "video", description: "Veo 3.1 \u5FEB\u901F\u7248" },
      // ============================================
      // Google Audio/Music 音乐生成
      // ============================================
      { id: "lyria-realtime-v1", label: "Lyria Music", provider: "Google", type: "audio", description: "Google \u5B98\u65B9\u97F3\u4E50\u751F\u6210\u6A21\u578B\uFF0C\u652F\u6301\u9AD8\u8D28\u91CF\u97F3\u9891" },
      { id: "gemini-2.0-flash-audio", label: "Gemini 2.0 Audio", provider: "Google", type: "audio", description: "Gemini 2.0 \u591A\u6A21\u6001\u8BED\u97F3\u751F\u6210" },
      // ============================================
      // Suno 音乐生成 (第三方代理)
      // ============================================
      { id: "suno-v4", label: "Suno V4", provider: "Custom", type: "audio", description: "\u6700\u65B0\u7248 Suno\uFF0C\u652F\u6301\u7247\u6BB5\u7EED\u5199\u3001\u98CE\u683C\u8FC1\u79FB\u7B49\u5168\u573A\u666F\uFF0C\u6700\u957F 4 \u5206\u949F" },
      { id: "suno-v3.5", label: "Suno V3.5", provider: "Custom", type: "audio", description: "\u9AD8\u6027\u4EF7\u6BD4\u6D41\u6D3E\u97F3\u4E50\u751F\u6210\uFF0C\u6700\u957F 3 \u5206\u949F" },
      { id: "suno-v3", label: "Suno V3", provider: "Custom", type: "audio", description: "\u5165\u95E8\u7EA7\u97F3\u4E50\u751F\u6210\uFF0C\u6700\u957F 2 \u5206\u949F" },
      // ============================================
      // Udio 音乐生成
      // ============================================
      { id: "udio-v1", label: "Udio V1", provider: "Custom", type: "audio", description: "\u9AD8\u4FDD\u771F\u97F3\u4E50\u751F\u6210\uFF0C\u652F\u6301\u591A\u79CD\u98CE\u683C\uFF0C\u97F3\u8D28\u4F18\u79C0" },
      // ============================================
      // Riffusion 音乐生成
      // ============================================
      { id: "riffusion", label: "Riffusion", provider: "Custom", type: "audio", description: "\u57FA\u4E8E\u6269\u6563\u6A21\u578B\u7684\u97F3\u4E50\u751F\u6210\uFF0C\u9002\u5408\u77ED\u97F3\u9891\u7247\u6BB5" },
      // ============================================
      // MiniMax 语音/音乐
      // ============================================
      { id: "minimax-tts", label: "MiniMax TTS", provider: "Custom", type: "audio", description: "\u591A\u8BED\u79CD\u9AD8\u8D28\u91CF\u4EBA\u58F0\u914D\u97F3\uFF0C\u652F\u6301\u8BED\u901F\u8C03\u8282" },
      { id: "minimax-music", label: "MiniMax Music", provider: "Custom", type: "audio", description: "MiniMax \u97F3\u4E50\u751F\u6210\u6A21\u578B" },
      // ============================================
      // OpenAI (DALL-E) - 需通过第三方 API 代理
      // ============================================
      { id: "dall-e-3", label: "DALL-E 3", provider: "OpenAI", type: "image", description: "OpenAI \u6700\u5F3A\u7ED8\u56FE\u6A21\u578B" },
      // ============================================
      // Flux (需通过代理 API)
      // ============================================
      { id: "flux-pro", label: "FLUX.1 Pro", provider: "Black Forest Labs", type: "image", description: "\u9876\u7EA7\u5F00\u6E90\u6A21\u578B\u5546\u4E1A\u7248" },
      { id: "flux-schnell", label: "FLUX.1 Schnell", provider: "Black Forest Labs", type: "image", description: "FLUX \u6781\u901F\u7248" }
    ];
    CHAT_MODEL_PRESETS = [
      // ============================================
      // Google Gemini 系列 (多模态对话)
      // ============================================
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro \u9884\u89C8", provider: "Google", type: "chat", description: "\u4E16\u754C\u6700\u5F3A\u591A\u6A21\u6001\u6A21\u578B\uFF0C\u9876\u7EA7\u63A8\u7406\u80FD\u529B" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash \u9884\u89C8", provider: "Google", type: "chat", description: "Gemini 3 \u5FEB\u901F\u7248\uFF0C\u65B0\u9C9C\u529B\u517C\u9C9C" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash\uFF08\u6781\u5FEB\u5F0F\uFF09", provider: "Google", type: "chat", description: "\u901F\u5EA6\u4F18\u5148\uFF0C\u4F4E\u6210\u672C\u5BF9\u8BDD\u6A21\u578B" },
      // ============================================
      // DeepSeek 系列
      // ============================================
      { id: "deepseek-chat", label: "DeepSeek V3", provider: "DeepSeek", type: "chat", description: "\u6027\u4EF7\u6BD4\u6781\u9AD8\u7684\u901A\u7528\u5BF9\u8BDD\u6A21\u578B" },
      { id: "deepseek-reasoner", label: "DeepSeek R1", provider: "DeepSeek", type: "chat", description: "DeepSeek \u63A8\u7406\u589E\u5F3A\u6A21\u578B (R1)" },
      // ============================================
      // OpenAI 系列
      // ============================================
      { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", type: "chat", description: "OpenAI \u65D7\u8230\u5168\u80FD\u6A21\u578B" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI", type: "chat", description: "\u5FEB\u901F\u4E14\u4F4E\u6210\u672C\u7684\u8F7B\u91CF\u7EA7\u6A21\u578B" },
      // ============================================
      // Anthropic 系列
      // ============================================
      { id: "claude-3-5-sonnet-20240620", label: "Claude 3.5 Sonnet", provider: "Anthropic", type: "chat", description: "Anthropic \u6700\u5F3A\u5E73\u8861\u6A21\u578B" }
    ];
  }
});

// src/services/system/RegionService.ts
var init_RegionService = __esm({
  "src/services/system/RegionService.ts"() {
    "use strict";
  }
});

// src/services/model/modelRegistry.ts
var MODEL_REGISTRY;
var init_modelRegistry = __esm({
  "src/services/model/modelRegistry.ts"() {
    "use strict";
    MODEL_REGISTRY = {
      // --- Google ---
      "gemini-2.0-flash-exp": { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash", provider: "Google", type: "chat", contextWindow: 1048576, isVision: true },
      "gemini-1.5-pro-latest": { id: "gemini-1.5-pro-latest", name: "Gemini 1.5 Pro", provider: "Google", type: "chat", contextWindow: 2097152, isVision: true },
      "gemini-1.5-flash-latest": { id: "gemini-1.5-flash-latest", name: "Gemini 1.5 Flash", provider: "Google", type: "chat", contextWindow: 1048576, isVision: true },
      "imagen-3.0-generate-001": { id: "imagen-3.0-generate-001", name: "Imagen 3", provider: "Google", type: "image" },
      "imagen-3.0-fast-generate-001": { id: "imagen-3.0-fast-generate-001", name: "Imagen 3 Fast", provider: "Google", type: "image" },
      "imagen-4.0-generate-001": { id: "imagen-4.0-generate-001", name: "Imagen 4", provider: "Google", type: "image" },
      "imagen-4.0-fast-generate-001": { id: "imagen-4.0-fast-generate-001", name: "Imagen 4 Fast", provider: "Google", type: "image" },
      "imagen-4.0-ultra-generate-001": { id: "imagen-4.0-ultra-generate-001", name: "Imagen 4 Ultra", provider: "Google", type: "image" },
      "gemini-3.1-flash-image-preview": { id: "gemini-3.1-flash-image-preview", name: "Nano Banana 2", provider: "Google", type: "image" },
      "gemini-3-pro-image-preview": { id: "gemini-3-pro-image-preview", name: "Nano Banana Pro", provider: "Google", type: "image" },
      "gemini-2.5-flash-image": { id: "gemini-2.5-flash-image", name: "Nano Banana", provider: "Google", type: "image" },
      "veo-2.0-generate-001": { id: "veo-2.0-generate-001", name: "Veo 2.0", provider: "Google", type: "video" },
      "lyria-realtime-v1": { id: "lyria-realtime-v1", name: "Lyria Music", provider: "Google", type: "audio", isSystemInternal: true },
      "gemini-2.0-flash-audio": { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Audio", provider: "Google", type: "audio" },
      // --- Audio/Music Models ---
      "suno-v4": { id: "suno-v4", name: "Suno V4", provider: "Custom", type: "audio" },
      "suno-v3.5": { id: "suno-v3.5", name: "Suno v3.5", provider: "Custom", type: "audio" },
      "suno-v3": { id: "suno-v3", name: "Suno v3", provider: "Custom", type: "audio" },
      "udio-v1": { id: "udio-v1", name: "Udio V1", provider: "Custom", type: "audio" },
      "riffusion": { id: "riffusion", name: "Riffusion", provider: "Custom", type: "audio" },
      "minimax-tts": { id: "minimax-tts", name: "MiniMax TTS", provider: "Custom", type: "audio" },
      "minimax-music": { id: "minimax-music", name: "MiniMax Music", provider: "Custom", type: "audio" },
      // --- OpenAI ---
      "gpt-4o": { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", type: "chat", contextWindow: 128e3, isVision: true },
      "gpt-4o-mini": { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", type: "chat", contextWindow: 128e3, isVision: true },
      "o1-preview": { id: "o1-preview", name: "o1 Preview", provider: "OpenAI", type: "chat", contextWindow: 128e3 },
      "dall-e-3": { id: "dall-e-3", name: "DALL\xB7E 3", provider: "OpenAI", type: "image" },
      // --- Anthropic ---
      "claude-3-5-sonnet-20241022": { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", provider: "Anthropic", type: "chat", contextWindow: 2e5, isVision: true },
      "claude-3-5-haiku-20241022": { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", provider: "Anthropic", type: "chat", contextWindow: 2e5 },
      // --- Volcengine (Doubao) ---
      "doubao-pro-32k": { id: "doubao-pro-32k", name: "Doubao Pro 32k", provider: "Volcengine", type: "chat", contextWindow: 32768 },
      "doubao-lite-32k": { id: "doubao-lite-32k", name: "Doubao Lite 32k", provider: "Volcengine", type: "chat", contextWindow: 32768 },
      "doubao-pro-128k": { id: "doubao-pro-128k", name: "Doubao Pro 128k", provider: "Volcengine", type: "chat", contextWindow: 131072 },
      // --- Aliyun (Qwen) ---
      "qwen-max": { id: "qwen-max", name: "Qwen Max", provider: "Aliyun", type: "chat", contextWindow: 32768 },
      "qwen-plus": { id: "qwen-plus", name: "Qwen Plus", provider: "Aliyun", type: "chat", contextWindow: 131072 },
      "qwen-turbo": { id: "qwen-turbo", name: "Qwen Turbo", provider: "Aliyun", type: "chat", contextWindow: 131072 },
      "wanx-v1": { id: "wanx-v1", name: "Wanx V1", provider: "Aliyun", type: "image" },
      "wanx-v2": { id: "wanx-v2", name: "Wanx V2", provider: "Aliyun", type: "image" },
      // --- Tencent (Hunyuan) ---
      "hunyuan-pro": { id: "hunyuan-pro", name: "Hunyuan Pro", provider: "Tencent", type: "chat" },
      "hunyuan-lite": { id: "hunyuan-lite", name: "Hunyuan Lite", provider: "Tencent", type: "chat" },
      "hunyuan-standard": { id: "hunyuan-standard", name: "Hunyuan Standard", provider: "Tencent", type: "chat" },
      "hunyuan-vision": { id: "hunyuan-vision", name: "Hunyuan Vision", provider: "Tencent", type: "chat", isVision: true },
      // --- SiliconFlow ---
      "deepseek-ai/DeepSeek-V3": { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", provider: "SiliconFlow", type: "chat" },
      "deepseek-ai/DeepSeek-R1": { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1", provider: "SiliconFlow", type: "chat" },
      "black-forest-labs/FLUX.1-schnell": { id: "black-forest-labs/FLUX.1-schnell", name: "FLUX.1 Schnell", provider: "SiliconFlow", type: "image" },
      "black-forest-labs/FLUX.1-dev": { id: "black-forest-labs/FLUX.1-dev", name: "FLUX.1 Dev", provider: "SiliconFlow", type: "image" },
      "stabilityai/stable-diffusion-3-5-large": { id: "stabilityai/stable-diffusion-3-5-large", name: "SD 3.5 Large", provider: "SiliconFlow", type: "image" },
      // --- Proxy / Common ---
      "midjourney": { id: "midjourney", name: "Midjourney V6", provider: "Custom", type: "image" },
      "mj-chat": { id: "mj-chat", name: "Midjourney Chat", provider: "Custom", type: "image" },
      "flux-pro": { id: "flux-pro", name: "FLUX Pro", provider: "Custom", type: "image" },
      "ideogram": { id: "ideogram", name: "Ideogram", provider: "Custom", type: "image" },
      "kling-v1": { id: "kling-v1", name: "Kling Video", provider: "Custom", type: "video" },
      "luma-dream-machine": { id: "luma-dream-machine", name: "Luma Dream Machine", provider: "Custom", type: "video" }
    };
  }
});

// src/services/model/adminModelQuality.ts
var ADMIN_MODEL_QUALITY_KEYS, normalizeAdminQualityKey, createDefaultAdminQualityPricing, normalizeAdminQualityPricing, getAdminQualityRule, getAdminModelCreditCostForSize, isAdminQualityEnabled;
var init_adminModelQuality = __esm({
  "src/services/model/adminModelQuality.ts"() {
    "use strict";
    ADMIN_MODEL_QUALITY_KEYS = ["0.5K", "1K", "2K", "4K"];
    normalizeAdminQualityKey = (value) => {
      const raw = String(value || "1K").toUpperCase();
      if (raw.includes("4K")) return "4K";
      if (raw.includes("2K")) return "2K";
      if (raw.includes("0.5K") || raw.includes("512")) return "0.5K";
      return "1K";
    };
    createDefaultAdminQualityPricing = (baseCost = 1) => ({
      "0.5K": { enabled: true, creditCost: Math.max(1, Math.floor(Number(baseCost || 1) * 0.5)) },
      "1K": { enabled: true, creditCost: Math.max(1, Number(baseCost || 1)) },
      "2K": { enabled: true, creditCost: Math.max(1, Number(baseCost || 1) * 2) },
      "4K": { enabled: true, creditCost: Math.max(1, Number(baseCost || 1) * 4) }
    });
    normalizeAdminQualityPricing = (input, fallbackCost = 1) => {
      const defaults = createDefaultAdminQualityPricing(fallbackCost);
      if (!input || typeof input !== "object") {
        return defaults;
      }
      const source = input;
      const next = { ...defaults };
      ADMIN_MODEL_QUALITY_KEYS.forEach((quality) => {
        const item = source[quality];
        if (!item || typeof item !== "object") return;
        next[quality] = {
          enabled: item.enabled !== false,
          creditCost: Math.max(1, Number(item.creditCost || defaults[quality].creditCost || fallbackCost || 1))
        };
      });
      return next;
    };
    getAdminQualityRule = (advancedEnabled, qualityPricing, imageSize) => {
      const qualityKey = normalizeAdminQualityKey(imageSize);
      const pricing = qualityPricing || createDefaultAdminQualityPricing();
      const rule = pricing[qualityKey] || pricing["1K"];
      if (!advancedEnabled) {
        return {
          enabled: true,
          creditCost: Math.max(1, Number(rule?.creditCost || pricing["1K"]?.creditCost || 1))
        };
      }
      return {
        enabled: rule?.enabled !== false,
        creditCost: Math.max(1, Number(rule?.creditCost || pricing["1K"]?.creditCost || 1))
      };
    };
    getAdminModelCreditCostForSize = (baseCost, advancedEnabled, qualityPricing, imageSize) => {
      if (!advancedEnabled) {
        return Math.max(1, Number(baseCost || 1));
      }
      return getAdminQualityRule(advancedEnabled, qualityPricing, imageSize).creditCost;
    };
    isAdminQualityEnabled = (advancedEnabled, qualityPricing, imageSize) => {
      if (!advancedEnabled) return true;
      return getAdminQualityRule(advancedEnabled, qualityPricing, imageSize).enabled;
    };
  }
});

// src/services/model/adminModelService.ts
function darkenColor(hex, percent) {
  const hslMatch = hex.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/i);
  if (hslMatch) {
    const h = parseInt(hslMatch[1], 10);
    const s = parseInt(hslMatch[2], 10);
    const l = Math.max(0, Math.floor(parseInt(hslMatch[3], 10) * (100 - percent) / 100));
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  if (!hex.startsWith("#")) return hex;
  let color = hex.replace("#", "");
  if (color.length === 3) {
    color = color.split("").map((item) => item + item).join("");
  }
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const factor = (100 - percent) / 100;
  const nr = Math.max(0, Math.floor(r * factor));
  const ng = Math.max(0, Math.floor(g * factor));
  const nb = Math.max(0, Math.floor(b * factor));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}
var AdminModelService, adminModelService;
var init_adminModelService = __esm({
  "src/services/model/adminModelService.ts"() {
    "use strict";
    init_supabase();
    init_adminModelQuality();
    AdminModelService = class _AdminModelService {
      providers = [];
      models = [];
      listeners = [];
      loadingPromise = null;
      lastLoadAttemptAt = 0;
      static LOAD_RETRY_INTERVAL_MS = 15e3;
      async loadAdminModels(force = false) {
        const now = Date.now();
        if (this.loadingPromise) {
          return this.loadingPromise;
        }
        if (!force && now - this.lastLoadAttemptAt < _AdminModelService.LOAD_RETRY_INTERVAL_MS) {
          return;
        }
        this.lastLoadAttemptAt = now;
        return this.doLoad();
      }
      async forceLoadAdminModels() {
        return this.loadAdminModels(true);
      }
      async readFromRpc() {
        const rpcResult = await supabase.rpc("get_active_credit_models");
        if (rpcResult.error) {
          throw rpcResult.error;
        }
        const grouped = rpcResult.data || [];
        return grouped.flatMap(
          (provider) => (provider.models || []).map((model) => ({
            id: model.id,
            provider_id: provider.provider_id,
            provider_name: provider.provider_name,
            model_id: model.model_id,
            display_name: model.display_name,
            description: model.description,
            color: model.color,
            color_secondary: model.color_secondary,
            text_color: model.text_color,
            endpoint_type: model.endpoint_type,
            credit_cost: model.credit_cost,
            priority: model.priority,
            weight: model.weight,
            call_count: model.call_count,
            is_active: true,
            advanced_enabled: model.advanced_enabled,
            mix_with_same_model: model.mix_with_same_model,
            quality_pricing: model.quality_pricing
          }))
        );
      }
      normalizeHexColor(input, fallback = "#3B82F6") {
        let color = (input || fallback).trim();
        if (/^[A-Fa-f0-9]{3,8}$/.test(color)) {
          color = `#${color}`;
        }
        return color;
      }
      normalizeStyle(primary, secondary) {
        const colorStart = this.normalizeHexColor(primary, "#3B82F6");
        const secondaryRaw = secondary ? this.normalizeHexColor(secondary, colorStart) : "";
        const colorEnd = secondaryRaw || darkenColor(colorStart, 20);
        const colorSecondary = secondaryRaw || colorEnd;
        return { colorStart, colorEnd, colorSecondary };
      }
      normalizeTextColor(input) {
        return input === "black" ? "black" : "white";
      }
      async doLoad() {
        this.loadingPromise = (async () => {
          try {
            const rows = await this.readFromRpc();
            const grouped = /* @__PURE__ */ new Map();
            rows.filter((row) => row.is_active !== false).forEach((row) => {
              const providerId = (row.provider_id || "").trim();
              const modelId = (row.model_id || "").trim();
              if (!providerId || !modelId) return;
              if (!grouped.has(providerId)) {
                grouped.set(providerId, {
                  id: providerId,
                  providerId,
                  name: (row.provider_name || providerId).trim(),
                  models: []
                });
              }
              const provider = grouped.get(providerId);
              const style = this.normalizeStyle(row.color, row.color_secondary);
              provider.models.push({
                id: modelId,
                displayName: (row.display_name || modelId).trim(),
                provider: providerId,
                providerId,
                providerName: (row.provider_name || providerId).trim(),
                recordId: row.id?.trim(),
                priority: Number(row.priority || 0),
                weight: Number(row.weight || 0),
                callCount: Number(row.call_count || 0),
                colorStart: style.colorStart,
                colorEnd: style.colorEnd,
                colorSecondary: style.colorSecondary,
                textColor: this.normalizeTextColor(row.text_color),
                creditCost: Number(row.credit_cost || 0),
                advancedEnabled: Boolean(row.advanced_enabled),
                mixWithSameModel: Boolean(row.mix_with_same_model),
                qualityPricing: normalizeAdminQualityPricing(row.quality_pricing, Number(row.credit_cost || 1)),
                billingType: "token",
                endpoint: (row.endpoint_type || "openai").trim(),
                advantages: row.description || "",
                isSystemModel: true,
                isSystemInternal: true
              });
            });
            this.providers = Array.from(grouped.values());
            const dedupe = /* @__PURE__ */ new Map();
            this.providers.forEach((provider) => {
              provider.models.forEach((model) => {
                const key = `${provider.providerId}|${model.id}`;
                if (!dedupe.has(key)) {
                  dedupe.set(key, model);
                }
              });
            });
            this.models = Array.from(dedupe.values());
            const { keyManager: keyManager2 } = await Promise.resolve().then(() => (init_keyManager(), keyManager_exports));
            keyManager2.clearGlobalModelListCache?.();
            keyManager2.forceNotify?.();
            this.notifyListeners();
          } catch (error) {
            console.error("[AdminModelService] \u52A0\u8F7D\u7BA1\u7406\u5458\u6A21\u578B\u5931\u8D25:", error);
          } finally {
            this.loadingPromise = null;
          }
        })();
        return this.loadingPromise;
      }
      getModels() {
        return this.models;
      }
      getModelsByProvider(providerId) {
        return this.models.filter((model) => model.provider === providerId);
      }
      parseRouteSelection(modelId) {
        const rawId = String(modelId || "").trim();
        const parts = rawId.split("@");
        const baseModelId = (parts[0] || rawId).trim();
        const suffix = String(parts[1] || "").trim().toLowerCase();
        const systemMatch = suffix.match(/^system(?:_(.+))?$/);
        if (!systemMatch) {
          return {
            baseModelId,
            routeIndex: null,
            routeKey: null,
            hasSystemRouteSuffix: false
          };
        }
        const rawRouteToken = String(systemMatch[1] || "").trim();
        if (!rawRouteToken) {
          return {
            baseModelId,
            routeIndex: null,
            routeKey: null,
            hasSystemRouteSuffix: true
          };
        }
        if (/^\d+$/.test(rawRouteToken)) {
          const parsedIndex = Number(rawRouteToken) - 1;
          return {
            baseModelId,
            routeIndex: Number.isFinite(parsedIndex) && parsedIndex >= 0 ? parsedIndex : 0,
            routeKey: null,
            hasSystemRouteSuffix: true
          };
        }
        let routeKey = rawRouteToken;
        try {
          routeKey = decodeURIComponent(rawRouteToken);
        } catch {
          routeKey = rawRouteToken;
        }
        return {
          baseModelId,
          routeIndex: null,
          routeKey: routeKey.toLowerCase(),
          hasSystemRouteSuffix: true
        };
      }
      getRouteSelectionContext(modelId, imageSize) {
        const selection = this.parseRouteSelection(modelId);
        const matchedModels = this.getRouteCandidates(selection.baseModelId);
        const mixedModels = matchedModels.filter((model) => model.mixWithSameModel);
        const mixedEligibleModels = mixedModels.filter(
          (model) => isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
        );
        const exactModelByRouteKey = selection.routeKey !== null ? matchedModels.find(
          (model) => String(model.providerId || "").trim().toLowerCase() === selection.routeKey
        ) || null : null;
        const exactModel = exactModelByRouteKey || (selection.routeIndex !== null ? matchedModels[selection.routeIndex] || matchedModels[0] || null : null);
        return {
          ...selection,
          matchedModels,
          mixedModels,
          mixedEligibleModels,
          exactModel,
          useMixedRouting: selection.routeKey === null && (selection.routeIndex === null || selection.routeIndex === 0) && mixedModels.length > 1
        };
      }
      getModel(modelId) {
        const { exactModel, matchedModels } = this.getRouteSelectionContext(modelId);
        if (exactModel) return exactModel;
        const exact = this.models.find((model) => model.id === modelId);
        if (exact) return exact;
        if (matchedModels.length > 0) {
          return matchedModels[0];
        }
        return void 0;
      }
      getProvider(providerId) {
        return this.providers.find((provider) => provider.providerId === providerId);
      }
      getProviders() {
        return this.providers;
      }
      isAdminModel(modelId) {
        return !!this.getModel(modelId);
      }
      sortModelsByRoutePriority(models) {
        return [...models].sort((left, right) => {
          const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;
          const weightDiff = Number(right.weight || 0) - Number(left.weight || 0);
          if (weightDiff !== 0) return weightDiff;
          const providerDiff = String(left.provider || "").localeCompare(String(right.provider || ""));
          if (providerDiff !== 0) return providerDiff;
          return String(left.id || "").localeCompare(String(right.id || ""));
        });
      }
      getRouteCandidates(modelId) {
        const baseId = modelId.split("@")[0];
        return this.sortModelsByRoutePriority(this.models.filter((model) => model.id === baseId));
      }
      pickRandomCandidate(candidates) {
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        const index = Math.floor(Math.random() * candidates.length);
        return candidates[index] ?? candidates[0] ?? null;
      }
      selectCheapestCandidate(candidates, imageSize, options) {
        if (candidates.length === 0) return null;
        const onlyEnabledForRequestedSize = options?.onlyEnabledForRequestedSize !== false;
        const useBaseCreditCost = options?.useBaseCreditCost === true;
        const scopedCandidates = onlyEnabledForRequestedSize ? candidates.filter(
          (model) => isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
        ) : candidates;
        if (scopedCandidates.length === 0) return null;
        const pricedCandidates = scopedCandidates.map((model) => ({
          model,
          creditCost: useBaseCreditCost ? Math.max(1, Number(model.creditCost || 1)) : getAdminModelCreditCostForSize(
            model.creditCost,
            Boolean(model.advancedEnabled),
            model.qualityPricing,
            imageSize
          ),
          usedQualityPricing: !useBaseCreditCost
        }));
        const lowestCost = Math.min(...pricedCandidates.map((item) => item.creditCost));
        const cheapestCandidates = pricedCandidates.filter((item) => item.creditCost === lowestCost);
        return this.pickRandomCandidate(cheapestCandidates);
      }
      getResolvedRoute(modelId, imageSize) {
        const context = this.getRouteSelectionContext(modelId, imageSize);
        if (context.matchedModels.length === 0) return null;
        if (context.routeKey) {
          const selected = context.exactModel;
          if (!selected) return null;
          if (!isAdminQualityEnabled(Boolean(selected.advancedEnabled), selected.qualityPricing, imageSize)) {
            return null;
          }
          return {
            model: selected,
            creditCost: getAdminModelCreditCostForSize(
              selected.creditCost,
              Boolean(selected.advancedEnabled),
              selected.qualityPricing,
              imageSize
            ),
            usedQualityPricing: Boolean(selected.advancedEnabled)
          };
        }
        if (context.useMixedRouting) {
          const fromRequestedSize = this.selectCheapestCandidate(context.mixedModels, imageSize, {
            onlyEnabledForRequestedSize: true,
            useBaseCreditCost: false
          });
          if (fromRequestedSize) return fromRequestedSize;
          return this.selectCheapestCandidate(context.mixedModels, imageSize, {
            onlyEnabledForRequestedSize: false,
            useBaseCreditCost: true
          });
        }
        const selectedModel = context.exactModel || context.matchedModels.find(
          (model) => isAdminQualityEnabled(Boolean(model.advancedEnabled), model.qualityPricing, imageSize)
        ) || context.matchedModels[0];
        return {
          model: selectedModel,
          creditCost: getAdminModelCreditCostForSize(
            selectedModel.creditCost,
            Boolean(selectedModel.advancedEnabled),
            selectedModel.qualityPricing,
            imageSize
          ),
          usedQualityPricing: Boolean(selectedModel.advancedEnabled)
        };
      }
      getModelCreditCost(modelId, imageSize) {
        return this.getResolvedRoute(modelId, imageSize)?.creditCost ?? 0;
      }
      /**
       * 获取混合模式下选择的最佳供应商ID（用于调试和日志）
       */
      getSelectedProviderForModel(modelId, imageSize) {
        return this.getResolvedRoute(modelId, imageSize)?.model.providerId ?? null;
      }
      getModelDisplayInfo(modelId, imageSize) {
        const resolved = this.getResolvedRoute(modelId, imageSize);
        const model = resolved?.model || this.getModel(modelId);
        if (!model) return null;
        return {
          id: model.id,
          name: model.displayName,
          displayName: model.displayName,
          provider: model.provider,
          providerId: model.providerId,
          providerName: model.providerName,
          colorStart: model.colorStart,
          colorEnd: model.colorEnd,
          colorSecondary: model.colorSecondary,
          textColor: model.textColor,
          creditCost: resolved?.creditCost ?? model.creditCost,
          billingType: model.billingType,
          advantages: model.advantages,
          isSystemModel: true
        };
      }
      subscribe(callback) {
        this.listeners.push(callback);
        return () => {
          this.listeners = this.listeners.filter((listener) => listener !== callback);
        };
      }
      notifyListeners() {
        this.listeners.forEach((listener) => listener());
      }
    };
    adminModelService = new AdminModelService();
  }
});

// src/services/auth/providerPricingSnapshot.ts
var toNumber2, normalizeRatioMap, normalizeNestedRatioMap, normalizeGroupModelPriceMap, getDefaultGroupRatio, buildProviderPricingSnapshot, mergeRatioMap, mergeProviderPricingSnapshot;
var init_providerPricingSnapshot = __esm({
  "src/services/auth/providerPricingSnapshot.ts"() {
    "use strict";
    toNumber2 = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return void 0;
    };
    normalizeRatioMap = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
      const normalized = Object.entries(value).reduce((acc, [key, raw]) => {
        const parsed = toNumber2(raw);
        if (parsed !== void 0) {
          acc[String(key)] = parsed;
        }
        return acc;
      }, {});
      return Object.keys(normalized).length > 0 ? normalized : void 0;
    };
    normalizeNestedRatioMap = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
      const normalized = Object.entries(value).reduce(
        (acc, [key, raw]) => {
          const ratioMap = normalizeRatioMap(raw);
          if (ratioMap) {
            acc[String(key)] = ratioMap;
          }
          return acc;
        },
        {}
      );
      return Object.keys(normalized).length > 0 ? normalized : void 0;
    };
    normalizeGroupModelPriceMap = (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
      const normalized = Object.entries(value).reduce((acc, [key, raw]) => {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return acc;
        const item = raw;
        const modelRatio = toNumber2(item.model_ratio ?? item.modelRatio);
        const completionRatio = toNumber2(item.completion_ratio ?? item.completionRatio);
        const modelPrice = toNumber2(item.model_price ?? item.modelPrice ?? item.price);
        if (modelRatio !== void 0 || completionRatio !== void 0 || modelPrice !== void 0) {
          acc[String(key)] = { modelRatio, completionRatio, modelPrice };
        }
        return acc;
      }, {});
      return Object.keys(normalized).length > 0 ? normalized : void 0;
    };
    getDefaultGroupRatio = (groupRatioMap) => {
      if (!groupRatioMap) return 1;
      return groupRatioMap.default ?? groupRatioMap.Default ?? groupRatioMap.DEFAULT ?? Object.values(groupRatioMap).find((value) => Number.isFinite(value)) ?? 1;
    };
    buildProviderPricingSnapshot = (pricingData = [], groupRatioInput, options) => {
      const fetchedAt = options?.fetchedAt ?? Date.now();
      const groupRatioMap = typeof groupRatioInput === "number" ? { default: groupRatioInput } : normalizeRatioMap(groupRatioInput) ?? void 0;
      const snapshot = {
        fetchedAt,
        note: options?.note,
        rows: [],
        groupRatio: getDefaultGroupRatio(groupRatioMap),
        groupRatioMap,
        modelPrices: {},
        modelRatios: {},
        sizeRatios: {},
        groupModelRatios: {},
        groupModelRatioMaps: {},
        groupSizeRatios: {},
        groupModelPrices: {},
        completionRatios: {},
        modelMeta: {},
        _rawData: Array.isArray(pricingData) ? pricingData : []
      };
      for (const item of Array.isArray(pricingData) ? pricingData : []) {
        const model = String(item?.model_name || item?.model || "").trim();
        if (!model) continue;
        const modelPrice = toNumber2(item?.model_price);
        const modelRatio = toNumber2(item?.model_ratio);
        const completionRatio = toNumber2(item?.completion_ratio);
        const quotaType = item?.quota_type;
        const provider = typeof item?.provider === "string" ? item.provider.trim() : void 0;
        const providerLabel = typeof item?.provider_label === "string" ? item.provider_label.trim() : void 0;
        const providerLogo = typeof item?.provider_logo === "string" ? item.provider_logo.trim() : void 0;
        const tags = Array.isArray(item?.tags) ? item.tags.map((value) => String(value || "").trim()).filter(Boolean) : void 0;
        const tokenGroup = typeof item?.token_group === "string" ? item.token_group.trim() : void 0;
        const billingType = typeof item?.billing_type === "string" ? item.billing_type.trim() : void 0;
        const endpointType = typeof item?.endpoint_type === "string" ? item.endpoint_type.trim() : void 0;
        const sizeRatio = normalizeRatioMap(item?.size_ratio);
        const groupModelRatio = normalizeRatioMap(item?.group_model_ratio);
        const groupSizeRatio = normalizeNestedRatioMap(item?.group_size_ratio);
        const groupModelPrice = normalizeGroupModelPriceMap(item?.group_model_price);
        snapshot.rows.push({
          model,
          provider,
          providerLabel,
          providerLogo,
          tags,
          tokenGroup,
          billingType,
          endpointType,
          modelRatio,
          modelPrice,
          completionRatio,
          quotaType,
          sizeRatio,
          groupModelRatio,
          groupSizeRatio,
          groupModelPrice
        });
        if (quotaType === 1 || quotaType === "per_request") {
          if (modelPrice !== void 0) {
            snapshot.modelPrices[model] = modelPrice;
          }
        } else if (modelRatio !== void 0) {
          snapshot.modelRatios[model] = modelRatio;
        } else if (modelPrice !== void 0) {
          snapshot.modelPrices[model] = modelPrice;
        }
        if (completionRatio !== void 0) {
          snapshot.completionRatios[model] = completionRatio;
        }
        if (provider || providerLabel || providerLogo || tags?.length || tokenGroup || billingType || endpointType) {
          snapshot.modelMeta[model] = {
            provider,
            providerLabel,
            providerLogo,
            tags,
            tokenGroup,
            billingType,
            endpointType
          };
        }
        if (sizeRatio) {
          snapshot.sizeRatios[model] = sizeRatio;
        }
        if (groupModelRatio) {
          snapshot.groupModelRatioMaps[model] = groupModelRatio;
          snapshot.groupModelRatios[model] = groupModelRatio.default ?? groupModelRatio.Default ?? groupModelRatio.DEFAULT ?? Object.values(groupModelRatio).find((value) => Number.isFinite(value)) ?? 1;
        }
        if (groupSizeRatio) {
          snapshot.groupSizeRatios[model] = groupSizeRatio;
        }
        if (groupModelPrice) {
          snapshot.groupModelPrices[model] = groupModelPrice;
        }
      }
      if (Object.keys(snapshot.modelPrices).length === 0) delete snapshot.modelPrices;
      if (Object.keys(snapshot.modelRatios).length === 0) delete snapshot.modelRatios;
      if (Object.keys(snapshot.sizeRatios).length === 0) delete snapshot.sizeRatios;
      if (Object.keys(snapshot.groupModelRatios).length === 0) delete snapshot.groupModelRatios;
      if (Object.keys(snapshot.groupModelRatioMaps).length === 0) delete snapshot.groupModelRatioMaps;
      if (Object.keys(snapshot.groupSizeRatios).length === 0) delete snapshot.groupSizeRatios;
      if (Object.keys(snapshot.groupModelPrices).length === 0) delete snapshot.groupModelPrices;
      if (Object.keys(snapshot.completionRatios).length === 0) delete snapshot.completionRatios;
      if (Object.keys(snapshot.modelMeta).length === 0) delete snapshot.modelMeta;
      if (!snapshot.rows?.length) delete snapshot.rows;
      if (!snapshot._rawData?.length) delete snapshot._rawData;
      return snapshot;
    };
    mergeRatioMap = (primary, fallback) => {
      if (!primary && !fallback) return void 0;
      return {
        ...fallback || {},
        ...primary || {}
      };
    };
    mergeProviderPricingSnapshot = (primary, fallback) => {
      if (!primary && !fallback) return void 0;
      if (!primary) return fallback;
      if (!fallback) return primary;
      const rowsByModel = /* @__PURE__ */ new Map();
      for (const row of fallback.rows || []) {
        const model = String(row?.model || "").trim();
        if (!model) continue;
        rowsByModel.set(model.toLowerCase(), { ...row });
      }
      for (const row of primary.rows || []) {
        const model = String(row?.model || "").trim();
        if (!model) continue;
        const key = model.toLowerCase();
        const previous = rowsByModel.get(key);
        rowsByModel.set(key, {
          ...previous || {},
          ...row,
          sizeRatio: mergeRatioMap(row.sizeRatio, previous?.sizeRatio),
          groupModelRatio: mergeRatioMap(row.groupModelRatio, previous?.groupModelRatio),
          groupSizeRatio: mergeRatioMap(row.groupSizeRatio, previous?.groupSizeRatio),
          groupModelPrice: mergeRatioMap(row.groupModelPrice, previous?.groupModelPrice)
        });
      }
      const merged = {
        ...fallback,
        ...primary,
        fetchedAt: Math.max(primary.fetchedAt || 0, fallback.fetchedAt || 0),
        note: primary.note || fallback.note,
        groupRatio: primary.groupRatio ?? fallback.groupRatio,
        groupRatioMap: mergeRatioMap(primary.groupRatioMap, fallback.groupRatioMap),
        modelPrices: mergeRatioMap(primary.modelPrices, fallback.modelPrices),
        modelRatios: mergeRatioMap(primary.modelRatios, fallback.modelRatios),
        sizeRatios: mergeRatioMap(primary.sizeRatios, fallback.sizeRatios),
        groupModelRatios: mergeRatioMap(primary.groupModelRatios, fallback.groupModelRatios),
        groupModelRatioMaps: mergeRatioMap(primary.groupModelRatioMaps, fallback.groupModelRatioMaps),
        groupSizeRatios: mergeRatioMap(primary.groupSizeRatios, fallback.groupSizeRatios),
        groupModelPrices: mergeRatioMap(primary.groupModelPrices, fallback.groupModelPrices),
        completionRatios: mergeRatioMap(primary.completionRatios, fallback.completionRatios),
        rows: Array.from(rowsByModel.values()),
        _rawData: (Array.isArray(primary._rawData) && primary._rawData.length ? primary._rawData : void 0) || (Array.isArray(fallback._rawData) && fallback._rawData.length ? fallback._rawData : void 0)
      };
      if (!merged.rows?.length) delete merged.rows;
      if (!merged._rawData?.length) delete merged._rawData;
      return merged;
    };
  }
});

// src/services/billing/newApiPricingService.ts
function buildPricingEndpointCandidates(baseUrl) {
  const cleanUrl = normalizePricingBaseUrl(baseUrl);
  if (!cleanUrl) return [];
  const rootUrl = cleanUrl.replace(/\/v1$/i, "");
  const candidates = [
    `${cleanUrl}/pricing`,
    `${cleanUrl}/api/pricing`,
    `${cleanUrl}/price`,
    `${cleanUrl}/api/price`,
    cleanUrl !== rootUrl ? `${rootUrl}/pricing` : "",
    cleanUrl !== rootUrl ? `${rootUrl}/api/pricing` : "",
    cleanUrl !== rootUrl ? `${rootUrl}/price` : "",
    cleanUrl !== rootUrl ? `${rootUrl}/api/price` : ""
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}
function extractPricingPayload(payload) {
  const pricingData = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.prices) ? payload.prices : Array.isArray(payload?.models) ? payload.models : Array.isArray(payload?.data?.items) ? payload.data.items : [];
  const groupRatio = payload?.group_ratio || payload?.groupRatio || payload?.data?.group_ratio || {};
  return { pricingData, groupRatio };
}
function buildPricingHeaders(baseUrl, apiKey, format = "auto") {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };
  const token = String(apiKey || "").trim();
  if (!token) return headers;
  const runtime = resolveProviderRuntime({ baseUrl, format });
  if (runtime.authMethod === "query") {
    return headers;
  }
  const headerName = runtime.headerName || "Authorization";
  headers[headerName] = headerName === "Authorization" ? formatAuthorizationHeaderValue(token, runtime.authorizationValueFormat) : getApiKeyToken(token);
  return headers;
}
function buildPricingRequestUrl(endpointUrl, baseUrl, apiKey, format = "auto") {
  const token = String(apiKey || "").trim();
  if (!token) return endpointUrl;
  const runtime = resolveProviderRuntime({ baseUrl, format });
  if (runtime.authMethod !== "query") {
    return endpointUrl;
  }
  const separator = endpointUrl.includes("?") ? "&" : "?";
  return `${endpointUrl}${separator}key=${encodeURIComponent(getApiKeyToken(token))}`;
}
function toWuyinPricingRows(pricingList) {
  return pricingList.map((item) => ({
    model: item.modelId,
    model_name: item.modelName,
    billing_type: "per_request",
    quota_type: "per_request",
    per_request_price: item.inputPrice,
    price_per_image: item.inputPrice,
    currency: item.currency,
    pay_unit: item.billingUnit,
    display_price: item.displayPrice
  }));
}
async function fetchRawPricingCatalog(baseUrl, apiKey, format = "auto") {
  const cleanUrl = normalizePricingBaseUrl(baseUrl);
  if (!cleanUrl) return null;
  const runtime = resolveProviderRuntime({ baseUrl: cleanUrl, format });
  if (runtime.strategyId === "wuyinkeji") {
    const pricingList = await fetchWuyinPricingCatalog(cleanUrl);
    const rootUrl = runtime.host === "api.wuyinkeji.com" ? "https://api.wuyinkeji.com" : cleanUrl;
    return {
      endpointUrl: `${rootUrl}${WUYIN_PRICE_API_PATH}`,
      pricingData: toWuyinPricingRows(pricingList),
      groupRatio: {},
      source: "wuyinkeji",
      supportsGroups: false
    };
  }
  const candidateUrls = buildPricingEndpointCandidates(cleanUrl);
  const headers = buildPricingHeaders(cleanUrl, apiKey, format);
  for (const endpointUrl of candidateUrls) {
    try {
      const response = await fetch(buildPricingRequestUrl(endpointUrl, cleanUrl, apiKey, format), {
        method: "GET",
        headers
      });
      if (!response.ok) {
        console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} returned ${response.status}`);
        continue;
      }
      const text = await response.text();
      if (text.trimStart().startsWith("<!") || text.trimStart().startsWith("<html")) {
        console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} returned HTML`);
        continue;
      }
      const payload = JSON.parse(text);
      const { pricingData, groupRatio } = extractPricingPayload(payload);
      if (!pricingData.length) {
        console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} returned empty pricing data`);
        continue;
      }
      return {
        endpointUrl,
        pricingData,
        groupRatio,
        source: "direct",
        supportsGroups: true
      };
    } catch (error) {
      console.warn(`[NewApiPricing] Pricing endpoint ${endpointUrl} failed:`, error);
    }
  }
  return null;
}
async function fetchWuyinPricingCatalog(baseUrl) {
  const runtime = resolveProviderRuntime({ baseUrl, format: "openai" });
  const rootUrl = runtime.host === "api.wuyinkeji.com" ? "https://api.wuyinkeji.com" : normalizeBaseUrl2(baseUrl);
  const response = await fetch(`${rootUrl}${WUYIN_PRICE_API_PATH}`, {
    method: "GET",
    headers: {
      "Accept": "application/json"
    }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch Wuyin pricing catalog: HTTP ${response.status}`);
  }
  const data = await response.json();
  const apiList = Array.isArray(data?.data?.api_list) ? data.data.api_list : [];
  return apiList.map((item) => {
    const { numeric, unit, displayPrice } = extractWuyinDisplayPrice(item);
    const modelId = String(item?.url || "").trim().split("/").filter(Boolean).pop() || String(item?.name || "").trim() || String(item?.id || "").trim();
    return {
      modelId,
      modelName: String(item?.name || modelId).trim(),
      inputPrice: numeric,
      outputPrice: 0,
      isPerToken: false,
      groupRatio: 1,
      currency: "CNY",
      billingUnit: unit,
      displayPrice,
      supportsGroups: false
    };
  }).filter((item) => item.modelId);
}
var normalizePricingBaseUrl, WUYIN_PRICE_API_PATH, normalizeBaseUrl2, stripHtml, toFiniteNumber, extractWuyinDisplayPrice;
var init_newApiPricingService = __esm({
  "src/services/billing/newApiPricingService.ts"() {
    "use strict";
    init_supabase();
    init_apiConfig();
    init_providerStrategy();
    normalizePricingBaseUrl = (baseUrl) => baseUrl.replace(/\/+$/, "");
    WUYIN_PRICE_API_PATH = "/themes/DigitalBlue/api?action=api_list";
    normalizeBaseUrl2 = (baseUrl) => baseUrl.replace(/\/$/, "");
    stripHtml = (value) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    toFiniteNumber = (value) => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      return void 0;
    };
    extractWuyinDisplayPrice = (item) => {
      const unit = String(item?.pay_unit || "").trim() || "\u6B21";
      const text = stripHtml(String(item?.price || ""));
      const priceMatch = text.match(/([0-9]+(?:\.[0-9]+)?)/);
      const numeric = toFiniteNumber(item?.balance_sum) ?? (priceMatch ? Number(priceMatch[1]) : void 0) ?? 0;
      const displayPrice = numeric > 0 ? `${numeric}\u5143/${unit}` : text || `0\u5143/${unit}`;
      return {
        numeric,
        unit,
        displayPrice
      };
    };
  }
});

// src/types.ts
var init_types3 = __esm({
  "src/types.ts"() {
    "use strict";
  }
});

// src/services/model/modelPricing.ts
var modelPricing_exports = {};
__export(modelPricing_exports, {
  MODEL_PRICING_STORAGE_KEY: () => MODEL_PRICING_STORAGE_KEY,
  getImageTokenEstimate: () => getImageTokenEstimate,
  getModelCredits: () => getModelCredits,
  getModelPricing: () => getModelPricing,
  getRefImageTokenEstimate: () => getRefImageTokenEstimate,
  isCreditBasedModel: () => isCreditBasedModel,
  mergeModelPricingOverrides: () => mergeModelPricingOverrides,
  setModelPricingOverrides: () => setModelPricingOverrides
});
var STORAGE_KEY2, DEFAULT_REF_IMAGE_TOKENS, BUILTIN_PRICING, FALLBACK_IMAGE_TOKENS, normalizeModelId, toNumber3, convertPricing, extractPricingMap, cachedOverrides, loadOverrides, setModelPricingOverrides, mergeModelPricingOverrides, getModelPricing, getRefImageTokenEstimate, getModelCredits, getImageTokenEstimate, isCreditBasedModel, MODEL_PRICING_STORAGE_KEY;
var init_modelPricing = __esm({
  "src/services/model/modelPricing.ts"() {
    "use strict";
    init_types3();
    init_keyManager();
    init_adminModelService();
    STORAGE_KEY2 = "kk_model_pricing_overrides";
    DEFAULT_REF_IMAGE_TOKENS = 560;
    BUILTIN_PRICING = {
      // ============================================
      // OpenAI Models (Official Pricing)
      // https://openai.com/api/pricing/
      // ============================================
      "gpt-4o": {
        inputPerMillionTokens: 2.5,
        outputPerMillionTokens: 10,
        currency: "USD"
      },
      "gpt-4o-mini": {
        inputPerMillionTokens: 0.15,
        outputPerMillionTokens: 0.6,
        currency: "USD"
      },
      "o1-preview": {
        inputPerMillionTokens: 15,
        outputPerMillionTokens: 60,
        currency: "USD"
      },
      "o1-mini": {
        inputPerMillionTokens: 3,
        outputPerMillionTokens: 12,
        currency: "USD"
      },
      "dall-e-3": {
        pricePerImage: 0.04,
        // Standard 1024x1024
        currency: "USD"
      },
      // ============================================
      // Anthropic Models (Official Pricing)
      // https://www.anthropic.com/pricing
      // ============================================
      "claude-3-5-sonnet-20241022": {
        inputPerMillionTokens: 3,
        outputPerMillionTokens: 15,
        currency: "USD"
      },
      "claude-3-5-haiku-20241022": {
        inputPerMillionTokens: 0.25,
        outputPerMillionTokens: 1.25,
        currency: "USD"
      },
      "claude-3-opus-20240229": {
        inputPerMillionTokens: 15,
        outputPerMillionTokens: 75,
        currency: "USD"
      },
      // ============================================
      // DeepSeek Models (Official Pricing)
      // https://api-docs.deepseek.com/quick_start/pricing
      // ============================================
      "deepseek-chat": {
        // DeepSeek-V3
        inputPerMillionTokens: 0.14,
        // ~1 RMB
        outputPerMillionTokens: 0.28,
        // ~2 RMB
        currency: "USD"
        // Converted approx
      },
      "deepseek-reasoner": {
        // DeepSeek-R1
        inputPerMillionTokens: 0.55,
        // ~4 RMB
        outputPerMillionTokens: 2.19,
        // ~16 RMB
        currency: "USD"
      },
      // ============================================
      // Imagen 4 系列 (Google 官方定价)
      // https://ai.google.dev/gemini-api/docs/pricing
      // ============================================
      "imagen-4.0-fast-generate-001": {
        pricePerImage: 0.02,
        currency: "USD"
      },
      "imagen-4.0-generate-001": {
        pricePerImage: 0.04,
        currency: "USD"
      },
      "imagen-4.0-ultra-generate-001": {
        pricePerImage: 0.06,
        currency: "USD"
      },
      // Imagen 3 系列
      "imagen-3.0-generate-002": {
        pricePerImage: 0.04,
        currency: "USD"
      },
      "imagen-3.0-generate-001": {
        pricePerImage: 0.04,
        currency: "USD"
      },
      // ============================================
      // Gemini 文本模型 (Token计费)
      // https://ai.google.dev/gemini-api/docs/pricing
      // ============================================
      // Gemini 3 系列 (Token计费)
      // https://ai.google.dev/gemini-api/docs/pricing
      // ============================================
      // Gemini 3.1 Pro 预览版
      "gemini-3.1-pro-preview": {
        inputPerMillionTokens: 2,
        outputPerMillionTokens: 12,
        currency: "USD"
      },
      // Gemini 3 Pro 预览版
      "gemini-3-pro-preview": {
        inputPerMillionTokens: 2,
        // <= 20万tokens
        outputPerMillionTokens: 12,
        // <= 20万tokens (包括思考token)
        currency: "USD"
      },
      // Gemini 3 Flash 预览版
      "gemini-3-flash-preview": {
        inputPerMillionTokens: 0.5,
        // 文本/图片/视频
        outputPerMillionTokens: 3,
        // 包括思考token
        currency: "USD"
      },
      // Gemini 2.5 Pro
      "gemini-2.5-pro": {
        inputPerMillionTokens: 1.25,
        // <= 20万tokens
        outputPerMillionTokens: 10,
        // <= 20万tokens (包括思考token)
        currency: "USD"
      },
      // Gemini 2.5 Flash
      "gemini-2.5-flash": {
        inputPerMillionTokens: 0.3,
        // 文本/图片/视频
        outputPerMillionTokens: 2.5,
        // 包括思考token
        currency: "USD"
      },
      // Gemini 2.5 Flash-Lite
      "gemini-2.5-flash-lite": {
        inputPerMillionTokens: 0.1,
        // 文本/图片/视频
        outputPerMillionTokens: 0.4,
        // 包括思考token
        currency: "USD"
      },
      // ============================================
      // Gemini 图像模型 (Token计费)
      // ============================================
      // Gemini 3.1 Flash Image Preview (Nano Banana 2)
      // 输出: $0.067/张 = 2233 tokens 按照 $30/1M tokens 计算 (或者如果 3.1 flash 输出依然是 $3 则不同)
      // 官网说是 0.067美刀一张
      "gemini-3.1-flash-image-preview": {
        inputPerMillionTokens: 0.25,
        // Updated from 0.50 based on latest pricing
        pricePerImage: 0.066667,
        // Adjusted to exactly 1 point per image ($1 = 15 points)
        refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
        currency: "USD"
      },
      // Gemini 2.5 Flash Image (Nano Banana)
      // 输出: $30/1M tokens, 1024x1024 = 1290 tokens = $0.039/张
      "gemini-2.5-flash-image": {
        inputPerMillionTokens: 0.3,
        outputPerMillionTokens: 30,
        tokensPerImage: { standard: 1290 },
        refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
        currency: "USD"
      },
      // Gemini 3 Pro Image Preview (Nano Banana Pro)
      // 官网说是 $0.134/张
      "gemini-3-pro-image-preview": {
        inputPerMillionTokens: 2,
        pricePerImage: 0.134,
        // Using exact explicit price matching screenshot instead of tokens math
        refImageTokens: DEFAULT_REF_IMAGE_TOKENS,
        currency: "USD"
      },
      // ============================================
      // Veo 视频生成模型 (按秒计费)
      // https://ai.google.dev/gemini-api/docs/pricing
      // 注意: Veo 模型需要付费层级,无免费额度
      // 价格为每秒价格,需要乘以视频时长
      // ============================================
      // Veo 3.1 系列 (最新)
      "veo-3.1-generate-preview": {
        pricePerImage: 0.4,
        // 720p/1080p:$0.40/秒, 4K:$0.60/秒 (这里使用平均值)
        currency: "USD"
      },
      "veo-3.1-fast-generate-preview": {
        pricePerImage: 0.15,
        // 720p/1080p:$0.15/秒, 4K:$0.35/秒 (这里使用平均值)
        currency: "USD"
      },
      // Veo 3 系列 (稳定版)
      "veo-3.0-generate-001": {
        pricePerImage: 0.4,
        currency: "USD"
      },
      "veo-3.0-fast-generate-001": {
        pricePerImage: 0.15,
        currency: "USD"
      },
      // Veo 2 系列
      "veo-2.0-generate-001": {
        pricePerImage: 0.35,
        currency: "USD"
      },
      // ============================================
      // Flux (Black Forest Labs)
      // ============================================
      "flux-pro": { pricePerImage: 0.055, currency: "USD" },
      "flux-1.1-pro": { pricePerImage: 0.055, currency: "USD" },
      "flux-dev": { pricePerImage: 0.03, currency: "USD" },
      "flux-schnell": { pricePerImage: 3e-3, currency: "USD" },
      // Very cheap usually
      // ============================================
      // Midjourney (Proxy)
      // ============================================
      "mj-chat": { pricePerImage: 0.05, currency: "USD" },
      "midjourney": { pricePerImage: 0.05, currency: "USD" },
      // ============================================
      // Suno (Music)
      // ============================================
      "suno-v3.5": { pricePerImage: 0.1, currency: "USD" },
      // Tasks often cost 5 credits ~ $0.05-$0.10
      "suno-v3": { pricePerImage: 0.05, currency: "USD" },
      // ============================================
      // Video Generation (Runway/Luma/Kling/Pika)
      // ============================================
      "runway-gen3": { pricePerImage: 0.5, currency: "USD" },
      // High cost for video
      "luma-ray": { pricePerImage: 0.5, currency: "USD" },
      "luma-photon": { pricePerImage: 0.05, currency: "USD" },
      // Image model
      "kling-v1": { pricePerImage: 0.5, currency: "USD" },
      "kling-v1-pro": { pricePerImage: 0.8, currency: "USD" },
      "pika-art": { pricePerImage: 0.2, currency: "USD" },
      // ============================================
      // Recraft / SD3
      // ============================================
      "recraft-v3": { pricePerImage: 0.04, currency: "USD" },
      "sd3.5-large": { pricePerImage: 0.065, currency: "USD" },
      "sd3.5-large-turbo": { pricePerImage: 0.035, currency: "USD" },
      // ============================================
      // Alibaba (Wanx/Qwen)
      // ============================================
      "wanx-v1": { pricePerImage: 0.02, currency: "USD" },
      "qwen-vl-max": { inputPerMillionTokens: 3, outputPerMillionTokens: 9, currency: "USD" },
      // Approx
      "qwen-vl-plus": { inputPerMillionTokens: 1.5, outputPerMillionTokens: 4.5, currency: "USD" },
      // ============================================
      // Tencent (Hunyuan)
      // ============================================
      "hunyuan-video": { pricePerImage: 0.3, currency: "USD" },
      "hunyuan-image": { pricePerImage: 0.02, currency: "USD" }
    };
    FALLBACK_IMAGE_TOKENS = {
      "gemini-2.5-flash-image": 1290,
      "gemini-3-pro-image-preview": 1120,
      // Imagen 4: 1K=1120 tokens, 4K=2000 tokens (估算值)
      "imagen-4.0-generate-001": 1120,
      "imagen-4.0-fast-generate-001": 1120,
      "imagen-4.0-ultra-generate-001": 1120,
      "imagen-3.0-generate-001": 1120,
      "imagen-3.0-generate-002": 1120
    };
    normalizeModelId = (modelId) => modelId.trim().toLowerCase();
    toNumber3 = (value) => {
      if (value === null || value === void 0 || value === "") return void 0;
      const num = Number(value);
      return Number.isFinite(num) ? num : void 0;
    };
    convertPricing = (input) => {
      if (!input || typeof input !== "object") return null;
      const pricing = {
        inputPerMillionTokens: toNumber3(input.input_per_million_tokens ?? input.inputPerMillionTokens ?? input.input ?? input.input_price),
        outputPerMillionTokens: toNumber3(input.output_per_million_tokens ?? input.outputPerMillionTokens ?? input.output ?? input.output_price),
        pricePerImage: toNumber3(input.price_per_image ?? input.pricePerImage ?? input.per_image ?? input.per_request_price),
        tokensPerImage: input.tokens_per_image ?? input.tokensPerImage,
        refImageTokens: toNumber3(input.ref_image_tokens ?? input.refImageTokens),
        currency: input.currencySymbol ?? input.currency,
        groupMultiplier: toNumber3(input.group_multiplier ?? input.groupMultiplier ?? input.group_ratio),
        modelMultiplier: toNumber3(input.model_multiplier ?? input.modelMultiplier ?? input.model_ratio),
        completionMultiplier: toNumber3(input.completion_multiplier ?? input.completionMultiplier ?? input.completion_ratio)
      };
      if (pricing.groupMultiplier !== void 0 && pricing.modelMultiplier !== void 0) {
        if (pricing.inputPerMillionTokens === void 0) {
          pricing.inputPerMillionTokens = pricing.groupMultiplier * pricing.modelMultiplier * 2;
        }
        if (pricing.outputPerMillionTokens === void 0) {
          const compMult = pricing.completionMultiplier ?? 1;
          pricing.outputPerMillionTokens = pricing.groupMultiplier * pricing.modelMultiplier * compMult * 2;
        }
      }
      const hasAny = pricing.inputPerMillionTokens !== void 0 || pricing.outputPerMillionTokens !== void 0 || pricing.pricePerImage !== void 0 || pricing.tokensPerImage !== void 0 || pricing.groupMultiplier !== void 0;
      return hasAny ? pricing : null;
    };
    extractPricingMap = (raw) => {
      const map = {};
      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          const id = item?.id ?? item?.model ?? item?.model_name;
          if (!id) return;
          const pricing = convertPricing(item.pricing ?? item);
          if (pricing) map[normalizeModelId(id)] = pricing;
        });
        return map;
      }
      if (raw?.models && Array.isArray(raw.models)) {
        return extractPricingMap(raw.models);
      }
      if (raw?.data && Array.isArray(raw.data)) {
        return extractPricingMap(raw.data);
      }
      if (raw && typeof raw === "object") {
        Object.entries(raw).forEach(([id, value]) => {
          const pricing = convertPricing(value?.pricing ?? value);
          if (pricing) map[normalizeModelId(id)] = pricing;
        });
      }
      return map;
    };
    cachedOverrides = null;
    loadOverrides = () => {
      if (cachedOverrides) return cachedOverrides;
      try {
        const raw = localStorage.getItem(STORAGE_KEY2);
        if (!raw) {
          cachedOverrides = {};
          return cachedOverrides;
        }
        const parsed = JSON.parse(raw);
        cachedOverrides = extractPricingMap(parsed);
      } catch {
        cachedOverrides = {};
      }
      return cachedOverrides;
    };
    setModelPricingOverrides = (input) => {
      const map = extractPricingMap(input);
      cachedOverrides = map;
      localStorage.setItem(STORAGE_KEY2, JSON.stringify(input));
    };
    mergeModelPricingOverrides = (input) => {
      const current = loadOverrides();
      const additional = extractPricingMap(input);
      const merged = { ...current, ...additional };
      cachedOverrides = merged;
      localStorage.setItem(STORAGE_KEY2, JSON.stringify(merged));
    };
    getModelPricing = (modelId) => {
      const normalized = normalizeModelId(modelId);
      const overrides = loadOverrides();
      return overrides[normalized] || BUILTIN_PRICING[normalized] || null;
    };
    getRefImageTokenEstimate = (modelId) => {
      const pricing = getModelPricing(modelId);
      return pricing?.refImageTokens || DEFAULT_REF_IMAGE_TOKENS;
    };
    getModelCredits = (modelId, imageSize) => {
      const baseModelId = modelId.split("@")[0];
      const normalizedImageSize = typeof imageSize === "string" ? imageSize : String(imageSize || "");
      const adminCreditCost = adminModelService.getModelCreditCost(modelId, normalizedImageSize);
      if (adminCreditCost > 0) {
        return adminCreditCost;
      }
      const id = modelId.split("@")[0].toLowerCase();
      if (id.includes("pro") && id.includes("banana") || id.includes("pro") && id.includes("gemini") && (id.includes("image") || id.includes("preview"))) return 2;
      if (id.includes("banana") || id.includes("gemini") && (id.includes("image") || id.includes("preview"))) return 1;
      return 0;
    };
    getImageTokenEstimate = (modelId, size) => {
      const pricing = getModelPricing(modelId);
      const tokens = pricing?.tokensPerImage;
      const isHd = size === "4K" /* SIZE_4K */;
      const is2K = size === "2K" /* SIZE_2K */;
      if (tokens) {
        if (isHd && tokens.hd) return tokens.hd;
        if (is2K && tokens.hd) return tokens.hd;
        return tokens.standard || tokens.hd || 0;
      }
      const fallback = FALLBACK_IMAGE_TOKENS[normalizeModelId(modelId)];
      if ((fallback === 0 || fallback === void 0) && pricing?.pricePerImage) {
        if (isHd) return 2e3;
        if (is2K) return 1560;
        return 1120;
      }
      return fallback || 0;
    };
    isCreditBasedModel = (modelId, _provider, _customAlias, hasCustomUserKey) => {
      const lowerId = modelId.toLowerCase();
      if (hasCustomUserKey) {
        return false;
      }
      const suffix = lowerId.includes("@") ? lowerId.split("@")[1] : "";
      if (suffix.startsWith("system") || suffix === "systemproxy" || suffix === "12ai") {
        return true;
      }
      if (lowerId.includes("@")) {
        return false;
      }
      if (hasCustomUserKey === void 0) {
        try {
          const autoDetected = keyManager.hasCustomKeyForModel(modelId);
          if (autoDetected) {
            return false;
          }
        } catch {
        }
      }
      const globalModels = keyManager.getGlobalModelList();
      const matchedModel = globalModels.find((m) => m.id === modelId);
      return !!matchedModel?.isSystemInternal;
    };
    MODEL_PRICING_STORAGE_KEY = STORAGE_KEY2;
  }
});

// src/services/billing/costService.ts
var costService_exports = {};
__export(costService_exports, {
  calculateCost: () => calculateCost,
  forceSync: () => forceSync,
  getCostsByModel: () => getCostsByModel,
  getCurrentUserId: () => getCurrentUserId,
  getDailyBudget: () => getDailyBudget,
  getHistorySummary: () => getHistorySummary,
  getRecentEntries: () => getRecentEntries,
  getTodayCosts: () => getTodayCosts,
  parseModelSource: () => parseModelSource,
  recordCost: () => recordCost,
  setDailyBudget: () => setDailyBudget,
  setUserId: () => setUserId
});
function getTodayString() {
  const now = /* @__PURE__ */ new Date();
  return now.toISOString().split("T")[0];
}
function loadHistory() {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (!data.daily) data.daily = [];
      if (!data.recent) data.recent = [];
      return data;
    }
  } catch (e) {
    console.warn("[CostService] Failed to load history:", e);
  }
  return { daily: [], recent: [] };
}
function saveHistory(data) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[CostService] Failed to save history:", e);
  }
}
function parseModelSource(fullModelId) {
  if (!fullModelId) return { modelId: "Unknown", source: "Unknown" };
  if (fullModelId.includes("@")) {
    const [model, source] = fullModelId.split("@");
    return {
      modelId: model.split("|")[0].replace(/^models\//, ""),
      source: source || "Custom"
    };
  }
  return { modelId: fullModelId.split("|")[0].replace(/^models\//, ""), source: "Official" };
}
function getSnapshotNumber(source, key) {
  if (!source) return void 0;
  const direct = source[key];
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  if (typeof direct === "string" && direct.trim() !== "") {
    const parsed = Number(direct);
    if (Number.isFinite(parsed)) return parsed;
  }
  const caseInsensitiveKey = Object.keys(source).find((entry) => entry.toLowerCase() === key.toLowerCase());
  if (!caseInsensitiveKey) return void 0;
  const fallback = source[caseInsensitiveKey];
  if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
  if (typeof fallback === "string" && fallback.trim() !== "") {
    const parsed = Number(fallback);
    if (Number.isFinite(parsed)) return parsed;
  }
  return void 0;
}
function resolveSnapshotGroupRatio(groupRatio) {
  if (typeof groupRatio === "number" && Number.isFinite(groupRatio)) return groupRatio;
  if (groupRatio && typeof groupRatio === "object" && !Array.isArray(groupRatio)) {
    const map = groupRatio;
    const direct = map.default ?? map.Default ?? map.DEFAULT ?? Object.values(map).find((value) => typeof value === "number" || typeof value === "string" && value.trim() !== "");
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
    if (typeof direct === "string" && direct.trim() !== "") {
      const parsed = Number(direct);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 1;
}
function resolveSizeRatio(sizeRatioMap, size) {
  if (!sizeRatioMap) return 1;
  const rawSize = typeof size === "object" && size !== null && "width" in size && "height" in size ? `${size.width}x${size.height}` : String(size || "");
  const normalized = rawSize.toLowerCase();
  const candidates = /* @__PURE__ */ new Set([
    rawSize,
    normalized,
    rawSize.replace(/x/gi, "*"),
    normalized.replace(/x/gi, "*")
  ]);
  if (normalized === "1k" || normalized === "1024x1024") {
    candidates.add("1K");
    candidates.add("1024x1024");
    candidates.add("1024*1024");
  } else if (normalized === "2k" || normalized === "2048x2048") {
    candidates.add("2K");
    candidates.add("2048x2048");
    candidates.add("2048*2048");
  } else if (normalized === "4k" || normalized === "4096x4096") {
    candidates.add("4K");
    candidates.add("4096x4096");
    candidates.add("4096*4096");
  }
  for (const candidate of candidates) {
    const ratio = getSnapshotNumber(sizeRatioMap, candidate);
    if (ratio !== void 0) return ratio;
  }
  return 1;
}
function getDefaultGroupEntry(map) {
  if (!map) return void 0;
  return map.default ?? map.Default ?? map.DEFAULT ?? Object.values(map)[0];
}
function getPreferredGroupKey(preferredGroup, map) {
  if (!map) return void 0;
  if (preferredGroup) {
    const exact = Object.keys(map).find((key) => key === preferredGroup);
    if (exact) return exact;
    const normalized = preferredGroup.trim().toLowerCase();
    const insensitive = Object.keys(map).find((key) => key.trim().toLowerCase() === normalized);
    if (insensitive) return insensitive;
  }
  return Object.keys(map).find((key) => ["default", "Default", "DEFAULT"].includes(key)) || Object.keys(map)[0];
}
function recordCost(model, imageSize, count, prompt = "", refImageCount = 0, usage, debugMeta, keySlotId) {
  if (count <= 0) return;
  const history = loadHistory();
  const todayStr = getTodayString();
  let { cost, details, tokens } = calculateCost(model, imageSize, count, prompt.length, refImageCount, keySlotId);
  if (usage) {
    const estimatedDetails = details;
    if (usage.totalTokens !== void 0) {
      tokens = usage.totalTokens;
      details = `Actual: ${tokens} Toks`;
    }
    if (usage.cost !== void 0) {
      cost = usage.cost;
      details += ` | Cost: $${cost.toFixed(6)}`;
      if (estimatedDetails) {
        details += ` | Est: ${estimatedDetails}`;
      }
    } else if (usage.totalTokens !== void 0) {
      const { modelId } = parseModelSource(model);
      const pricing = getModelPricing(modelId);
      if (pricing && (pricing.inputPerMillionTokens || pricing.outputPerMillionTokens)) {
        const pTokens = usage.promptTokens || 0;
        const cTokens = usage.completionTokens || usage.totalTokens - pTokens;
        const iCost = pTokens / 1e6 * (pricing.inputPerMillionTokens || 0);
        const oCost = cTokens / 1e6 * (pricing.outputPerMillionTokens || 0);
        cost = iCost + oCost;
      }
    }
  }
  const newEntry = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
    model,
    imageSize,
    count,
    costUsd: cost,
    timestamp: Date.now(),
    details,
    tokens,
    requestPath: debugMeta?.requestPath,
    requestBodyPreview: debugMeta?.requestBodyPreview,
    pythonSnippet: debugMeta?.pythonSnippet
  };
  history.recent.unshift(newEntry);
  if (history.recent.length > 50) {
    history.recent = history.recent.slice(0, 50);
  }
  let dayStats = history.daily.find((d) => d.date === todayStr);
  if (!dayStats) {
    dayStats = {
      date: todayStr,
      totalCostUsd: 0,
      totalImages: 0,
      totalTokens: 0,
      breakdown: []
    };
    history.daily.unshift(dayStats);
  }
  dayStats.totalCostUsd += cost;
  dayStats.totalImages += count;
  dayStats.totalTokens += tokens;
  const breakdownKey = `${model}_${imageSize}`;
  let breakdownItem = dayStats.breakdown.find((b) => `${b.model}_${b.imageSize}` === breakdownKey);
  if (!breakdownItem) {
    breakdownItem = {
      model,
      imageSize,
      count: 0,
      tokens: 0,
      cost: 0
    };
    dayStats.breakdown.push(breakdownItem);
  }
  breakdownItem.count += count;
  breakdownItem.tokens += tokens;
  breakdownItem.cost += cost;
  if (history.daily.length > 30) {
    history.daily = history.daily.slice(0, 30);
  }
  saveHistory(history);
  console.log(`[CostService] Recorded: $${cost.toFixed(4)} (${details})`);
  scheduleSync();
}
function getTodayCosts() {
  const history = loadHistory();
  const today = getTodayString();
  let stats = history.daily.find((d) => d.date === today);
  if (!stats) {
    try {
      const oldKey = "kk_studio_daily_costs";
      const oldData = localStorage.getItem(oldKey);
      if (oldData) {
        const parsed = JSON.parse(oldData);
        if (parsed.date === today) {
          stats = {
            date: parsed.date,
            totalCostUsd: parsed.totalCostUsd || 0,
            totalImages: parsed.totalImages || 0,
            totalTokens: parsed.totalTokens || 0,
            breakdown: []
            // Reconstruction might be hard, return empty breakdown
          };
        }
      }
    } catch (e) {
      console.warn("[CostService] Failed to parse stats:", e);
    }
  }
  return stats || {
    date: today,
    totalCostUsd: 0,
    totalImages: 0,
    totalTokens: 0,
    breakdown: []
  };
}
function getHistorySummary(days = 30) {
  const history = loadHistory();
  const map = /* @__PURE__ */ new Map();
  const relevantDays = history.daily.slice(0, days);
  relevantDays.forEach((day) => {
    day.breakdown.forEach((item) => {
      const key = `${item.model}_${item.imageSize}`;
      if (!map.has(key)) {
        const clone = JSON.parse(JSON.stringify(item));
        map.set(key, clone);
      } else {
        const existing = map.get(key);
        existing.count += item.count;
        existing.tokens += item.tokens;
        existing.cost += item.cost;
      }
    });
  });
  return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
}
function getRecentEntries(limit = 50) {
  const history = loadHistory();
  return history.recent.slice(0, limit);
}
function getCostsByModel() {
  return getHistorySummary(1);
}
function getDailyBudget() {
  const stored = localStorage.getItem(BUDGET_STORAGE_KEY);
  return stored ? parseFloat(stored) : -1;
}
function setDailyBudget(amount) {
  localStorage.setItem(BUDGET_STORAGE_KEY, amount.toString());
  scheduleSync();
}
async function setUserId(userId) {
  if (currentUserId === userId) return;
  currentUserId = userId;
  if (userId) {
    try {
      await syncWithCloud();
    } catch (e) {
      console.error("[CostService] Initial sync failed:", e);
    }
  }
}
function getCurrentUserId() {
  return currentUserId;
}
async function forceSync() {
  if (!currentUserId) return false;
  await syncWithCloud();
  return true;
}
function scheduleSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncWithCloud();
  }, 2e3);
}
async function syncWithCloud() {
  if (!currentUserId || isSyncing || currentUserId.startsWith("dev-user-")) return;
  isSyncing = true;
  try {
    const { data } = await supabase.from("profiles").select("daily_cost_usd, daily_images, daily_tokens, daily_reset_date").eq("id", currentUserId).maybeSingle();
    let localHistory = loadHistory();
    let todayStats = getTodayCosts();
    if (data && data.daily_reset_date === getTodayString()) {
    }
    const slots = keyManager.getSlots();
    let totalBudget = 0;
    let totalUsed = 0;
    slots.forEach((s) => {
      if (s.budgetLimit > 0) totalBudget += s.budgetLimit;
      totalUsed += s.totalCost || 0;
    });
    const apiBudgets = slots.map((s) => ({
      id: s.id,
      name: s.name,
      budget: s.budgetLimit,
      used: s.totalCost || 0,
      status: s.status
    }));
    const { data: { user } } = await supabase.auth.getUser();
    const profilePayload = {
      id: currentUserId,
      nickname: user?.user_metadata?.full_name || "",
      avatar_url: user?.user_metadata?.avatar_url || "",
      daily_cost_usd: todayStats.totalCostUsd,
      daily_tokens: todayStats.totalTokens,
      daily_reset_date: todayStats.date,
      total_budget: totalBudget || -1,
      total_used: totalUsed,
      user_apis: apiBudgets,
      updated_at: (/* @__PURE__ */ new Date()).toISOString()
    };
    if (data) {
      const { error: updateError } = await supabase.from("profiles").update(profilePayload).eq("id", currentUserId);
      if (updateError) {
        throw updateError;
      }
    } else {
      const { error: insertError } = await supabase.from("profiles").insert(profilePayload);
      if (insertError) {
        throw insertError;
      }
    }
  } catch (e) {
    console.warn("[CostService] Sync error:", e);
  } finally {
    isSyncing = false;
  }
}
var HISTORY_STORAGE_KEY, BUDGET_STORAGE_KEY, currentUserId, isSyncing, syncTimer, calculateCost;
var init_costService = __esm({
  "src/services/billing/costService.ts"() {
    "use strict";
    init_modelPricing();
    init_keyManager();
    init_supabase();
    HISTORY_STORAGE_KEY = "kk_studio_cost_history";
    BUDGET_STORAGE_KEY = "kk_studio_daily_budget";
    currentUserId = null;
    isSyncing = false;
    syncTimer = null;
    calculateCost = (fullModelId, size, count, promptLen = 0, refCount = 0, keySlotId) => {
      let cost = 0;
      let details = "";
      let tokens = 0;
      const { modelId } = parseModelSource(fullModelId);
      const normalizedId = modelId.toLowerCase();
      if (keySlotId) {
        const slot = keyManager.getProviders().find((p) => p.id === keySlotId);
        if (slot && slot.pricingSnapshot) {
          const snap = slot.pricingSnapshot;
          const preferredGroup = slot.group;
          const mPrice = getSnapshotNumber(snap.modelPrices, modelId) ?? getSnapshotNumber(snap.modelPrices, normalizedId);
          let mRatio = getSnapshotNumber(snap.modelRatios, modelId) ?? getSnapshotNumber(snap.modelRatios, normalizedId);
          const groupRatioKey = getPreferredGroupKey(preferredGroup, snap.groupRatioMap);
          const gRatio = (groupRatioKey ? getSnapshotNumber(snap.groupRatioMap, groupRatioKey) : void 0) ?? resolveSnapshotGroupRatio(snap.groupRatio ?? snap.groupRatioMap);
          const groupModelRatioMap = snap.groupModelRatioMaps?.[modelId] || snap.groupModelRatioMaps?.[normalizedId];
          const groupModelRatioKey = getPreferredGroupKey(preferredGroup, groupModelRatioMap);
          const gmRatio = (groupModelRatioKey ? getSnapshotNumber(groupModelRatioMap, groupModelRatioKey) : void 0) ?? getSnapshotNumber(snap.groupModelRatios, modelId) ?? getSnapshotNumber(snap.groupModelRatios, normalizedId) ?? 1;
          const sRatioObj = snap.sizeRatios?.[modelId] || snap.sizeRatios?.[normalizedId];
          const groupSizeMap = snap.groupSizeRatios?.[modelId] || snap.groupSizeRatios?.[normalizedId];
          const groupSizeKey = getPreferredGroupKey(preferredGroup, groupSizeMap);
          const groupSizeObj = (groupSizeKey ? groupSizeMap?.[groupSizeKey] : void 0) || getDefaultGroupEntry(groupSizeMap);
          const sRatio = Math.max(resolveSizeRatio(sRatioObj, size), resolveSizeRatio(groupSizeObj, size));
          if (mPrice !== void 0) {
            cost = mPrice * gRatio * gmRatio * sRatio * count;
            details = `API\u6309\u6B21: $${mPrice}/img | \u7EC4=${preferredGroup || groupRatioKey || "default"} | \u5C3A\u5BF8\xD7${sRatio} | \u5206\u7EC4\xD7${gRatio} | \u6A21\u578B\u7EC4\xD7${gmRatio}`;
            return { cost, details, tokens: 0 };
          }
          if (mRatio !== void 0) {
            const textTokens = Math.ceil(promptLen / 4);
            const refTokens = refCount * 560;
            const inputTokens = textTokens + refTokens;
            const outputTokensPerImage = getImageTokenEstimate(normalizedId, size);
            const outputTokens = count * outputTokensPerImage;
            let cRatio = getSnapshotNumber(snap.completionRatios, modelId) ?? getSnapshotNumber(snap.completionRatios, normalizedId) ?? 1;
            const groupPriceMap = snap.groupModelPrices?.[modelId] || snap.groupModelPrices?.[normalizedId];
            const groupPriceKey = getPreferredGroupKey(preferredGroup, groupPriceMap);
            const groupPriceOverride = (groupPriceKey ? groupPriceMap?.[groupPriceKey] : void 0) || getDefaultGroupEntry(groupPriceMap);
            const overrideModelPrice = getSnapshotNumber(groupPriceOverride, "modelPrice");
            const overrideModelRatio = getSnapshotNumber(groupPriceOverride, "modelRatio");
            const overrideCompletionRatio = getSnapshotNumber(groupPriceOverride, "completionRatio");
            if (overrideModelPrice !== void 0) {
              cost = overrideModelPrice * gRatio * sRatio * count;
              details = `API\u6309\u6B21(\u5206\u7EC4\u8986\u76D6): $${overrideModelPrice}/img | \u7EC4=${preferredGroup || groupPriceKey || "default"} | \u5C3A\u5BF8\xD7${sRatio} | \u5206\u7EC4\xD7${gRatio}`;
              return { cost, details, tokens: 0 };
            }
            if (overrideModelRatio !== void 0) {
              mRatio = overrideModelRatio;
            }
            if (overrideCompletionRatio !== void 0) {
              cRatio = overrideCompletionRatio;
            }
            const baseRate = 2 / 1e6;
            const inputCost = inputTokens * baseRate * mRatio * gRatio * gmRatio;
            const outputCost = outputTokens * baseRate * mRatio * cRatio * sRatio * gRatio * gmRatio;
            cost = Math.max(1e-6, inputCost + outputCost);
            tokens = inputTokens + outputTokens;
            details = `API\u6309\u91CF: ${tokens} Toks | \u7EC4=${preferredGroup || groupRatioKey || "default"} | \u6A21\u578B\xD7${mRatio} | \u8865\u5168\xD7${cRatio} | \u5C3A\u5BF8\xD7${sRatio} | \u5206\u7EC4\xD7${gRatio} | \u6A21\u578B\u7EC4\xD7${gmRatio}`;
            return { cost, details, tokens };
          }
        }
      }
      const pricing = getModelPricing(normalizedId);
      if (pricing) {
        if (pricing.pricePerImage) {
          cost = pricing.pricePerImage * count;
          details = `Fixed: $${pricing.pricePerImage}/img`;
          return { cost, details, tokens: 0 };
        }
        if (pricing.inputPerMillionTokens || pricing.outputPerMillionTokens) {
          const textTokens = Math.ceil(promptLen / 4);
          const refTokens = refCount * (pricing.refImageTokens || 560);
          const inputTokens = textTokens + refTokens;
          const outputTokensPerImage = getImageTokenEstimate(normalizedId, size);
          const outputTokens = count * outputTokensPerImage;
          const inputCost = inputTokens / 1e6 * (pricing.inputPerMillionTokens || 0);
          const outputCost = outputTokens / 1e6 * (pricing.outputPerMillionTokens || 0);
          cost = Math.max(1e-6, inputCost + outputCost);
          tokens = inputTokens + outputTokens;
          details = `Pricing: ${tokens} Toks`;
          return { cost, details, tokens };
        }
      }
      return { cost: 0, details: "Unknown Model", tokens: 0 };
    };
  }
});

// src/services/system/systemLogService.ts
function getTodayString2() {
  return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
}
function loadLogs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY3);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.date === getTodayString2() && Array.isArray(parsed.entries)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("[SystemLog] \u8BFB\u53D6\u65E5\u5FD7\u5931\u8D25:", error);
  }
  return { date: getTodayString2(), entries: [] };
}
function saveLogs(data) {
  try {
    const safeData = {
      date: data.date,
      entries: data.entries.slice(-MAX_ENTRIES)
    };
    localStorage.setItem(STORAGE_KEY3, JSON.stringify(safeData));
  } catch (error) {
    console.warn("[SystemLog] \u4FDD\u5B58\u65E5\u5FD7\u5931\u8D25:", error);
  }
}
function notifyListeners(entries) {
  listeners.forEach((listener) => listener(entries));
}
function addLog(level, source, message, details, stack) {
  const data = loadLogs();
  const entry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    level,
    source,
    message,
    details,
    timestamp: Date.now(),
    stack
  };
  data.entries.push(entry);
  saveLogs(data);
  notifyListeners(data.entries);
  if (level === "ERROR" /* ERROR */ || level === "CRITICAL" /* CRITICAL */) {
    console.error(`[${source}] ${message}`, details);
    return;
  }
  if (level === "WARNING" /* WARNING */) {
    console.warn(`[${source}] ${message}`, details);
    return;
  }
  console.log(`[${source}] ${message}`, details);
}
var STORAGE_KEY3, MAX_ENTRIES, listeners;
var init_systemLogService = __esm({
  "src/services/system/systemLogService.ts"() {
    "use strict";
    STORAGE_KEY3 = "kk_studio_system_logs";
    MAX_ENTRIES = 200;
    listeners = [];
  }
});

// src/services/system/notificationService.ts
var notificationService_exports = {};
__export(notificationService_exports, {
  notificationService: () => notificationService,
  notify: () => notify
});
var NotificationService, notificationService, notify;
var init_notificationService = __esm({
  "src/services/system/notificationService.ts"() {
    "use strict";
    init_systemLogService();
    NotificationService = class {
      notifications = [];
      listeners = /* @__PURE__ */ new Set();
      maxNotifications = 5;
      timers = /* @__PURE__ */ new Map();
      /**
       * Show a notification
       */
      show(type, title, message, options) {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const duration = options?.duration ?? 1e4;
        const notification = {
          id,
          type,
          title,
          message,
          details: options?.details,
          duration,
          timestamp: Date.now()
        };
        this.notifications = [notification, ...this.notifications].slice(0, this.maxNotifications);
        this.notifyListeners();
        if (duration > 0) {
          this.startTimer(id, duration);
        }
        let level = "INFO" /* INFO */;
        if (type === "error") level = "ERROR" /* ERROR */;
        if (type === "warning") level = "WARNING" /* WARNING */;
        addLog(
          level,
          "NotificationSystem",
          `${title}: ${message}`,
          options?.details || (type === "error" ? "No technical details provided" : "User Notification")
        );
        const logPrefix = `[Notification/${type.toUpperCase()}]`;
        const logMessage = `${logPrefix} ${title}: ${message}`;
        if (options?.details) {
          console.log(logMessage, "\n  Details:", options.details);
        } else {
          console.log(logMessage);
        }
        return id;
      }
      startTimer(id, duration) {
        if (this.timers.has(id)) {
          clearTimeout(this.timers.get(id));
        }
        const timer = setTimeout(() => this.dismiss(id), duration);
        this.timers.set(id, timer);
      }
      /**
       * Pause auto-dismiss timer (e.g. on hover)
       */
      pauseTimer(id) {
        if (this.timers.has(id)) {
          clearTimeout(this.timers.get(id));
          this.timers.delete(id);
        }
      }
      /**
       * Resume auto-dismiss timer (e.g. on mouse leave)
       * Resets to full duration for better UX
       */
      resumeTimer(id) {
        const notification = this.notifications.find((n) => n.id === id);
        if (notification && (notification.duration || 0) > 0) {
          this.startTimer(id, notification.duration);
        }
      }
      /**
       * Helper methods for different notification types
       */
      success(title, message, details) {
        return this.show("success", title, message, { details });
      }
      error(title, message, details) {
        return this.show("error", title, message, { details, duration: 1e4 });
      }
      warning(title, message, details) {
        return this.show("warning", title, message, { details });
      }
      info(title, message, details) {
        return this.show("info", title, message, { details });
      }
      /**
       * Payment channel specific notifications
       */
      alipay(title, message, details) {
        return this.show("alipay", title, message, { details });
      }
      wechat(title, message, details) {
        return this.show("wechat", title, message, { details });
      }
      paypal(title, message, details) {
        return this.show("paypal", title, message, { details });
      }
      /**
       * Dismiss a notification
       */
      dismiss(id) {
        if (this.timers.has(id)) {
          clearTimeout(this.timers.get(id));
          this.timers.delete(id);
        }
        this.notifications = this.notifications.filter((n) => n.id !== id);
        this.notifyListeners();
      }
      /**
       * Dismiss all notifications
       */
      dismissAll() {
        this.timers.forEach((timer) => clearTimeout(timer));
        this.timers.clear();
        this.notifications = [];
        this.notifyListeners();
      }
      /**
       * Get current notifications
       */
      getAll() {
        return [...this.notifications];
      }
      /**
       * Subscribe to notification changes
       */
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      notifyListeners() {
        const current = this.getAll();
        this.listeners.forEach((listener) => listener(current));
      }
    };
    notificationService = new NotificationService();
    notify = {
      success: (title, message, details) => notificationService.success(title, message, details),
      error: (title, message, details) => notificationService.error(title, message, details),
      warning: (title, message, details) => notificationService.warning(title, message, details),
      info: (title, message, details) => notificationService.info(title, message, details),
      alipay: (title, message, details) => notificationService.alipay(title, message, details),
      wechat: (title, message, details) => notificationService.wechat(title, message, details),
      paypal: (title, message, details) => notificationService.paypal(title, message, details),
      dismiss: (id) => notificationService.dismiss(id),
      dismissAll: () => notificationService.dismissAll(),
      pause: (id) => notificationService.pauseTimer(id),
      resume: (id) => notificationService.resumeTimer(id)
    };
  }
});

// src/services/auth/keyManager.ts
var keyManager_exports = {};
__export(keyManager_exports, {
  ADVANCED_IMAGE_MODEL_WHITELIST: () => ADVANCED_IMAGE_MODEL_WHITELIST,
  AUDIO_MODEL_WHITELIST: () => AUDIO_MODEL_WHITELIST,
  BLACKLIST_MODELS: () => BLACKLIST_MODELS,
  DEFAULT_GOOGLE_MODELS: () => DEFAULT_GOOGLE_MODELS,
  DEPRECATED_MODELS: () => DEPRECATED_MODELS,
  GOOGLE_IMAGE_WHITELIST: () => GOOGLE_IMAGE_WHITELIST,
  KeyManager: () => KeyManager,
  MODEL_MIGRATION_MAP: () => MODEL_MIGRATION_MAP,
  PROVIDER_PRESETS: () => PROVIDER_PRESETS,
  VIDEO_MODEL_WHITELIST: () => VIDEO_MODEL_WHITELIST,
  appendModelVariantLabel: () => appendModelVariantLabel,
  autoDetectAndConfigureModels: () => autoDetectAndConfigureModels,
  categorizeModels: () => categorizeModels,
  default: () => keyManager_default,
  detectApiType: () => detectApiType,
  determineKeyType: () => determineKeyType,
  fetchGeminiCompatModels: () => fetchGeminiCompatModels,
  fetchGoogleModels: () => fetchGoogleModels,
  fetchOpenAICompatModels: () => fetchOpenAICompatModels,
  getModelMetadata: () => getModelMetadata,
  isDeprecatedModel: () => isDeprecatedModel,
  keyManager: () => keyManager,
  normalizeModelId: () => normalizeModelId2,
  normalizeModelList: () => normalizeModelList,
  parseModelString: () => parseModelString,
  parseModelVariantMeta: () => parseModelVariantMeta
});
function parseModelString(input) {
  if (input.includes("|")) {
    const parts = input.split("|");
    let id2 = parts[0]?.trim() || "";
    let name2 = parts[1]?.trim() || void 0;
    const provider = parts[2]?.trim() || void 0;
    const idLikeRegex2 = /^[a-z0-9-.:/]+$/;
    const firstLooksLikeName = /\s/.test(id2) || !idLikeRegex2.test(id2);
    const secondLooksLikeId = !!name2 && idLikeRegex2.test(name2);
    if (secondLooksLikeId && firstLooksLikeName) {
      const tmp = id2;
      id2 = name2;
      name2 = tmp;
    }
    return {
      id: id2,
      name: name2,
      provider
    };
  }
  const normalized = input.replace(/（/g, "(").replace(/）/g, ")");
  const match = normalized.match(/^([^()]+)(?:\(([^/]+)(?:\/\s*(.+))?\))?$/);
  if (!match) return { id: input.trim() };
  let id = match[1].trim();
  let name = match[2]?.trim();
  const description = match[3]?.trim();
  const idLikeRegex = /^[a-z0-9-.:]+$/;
  const hasSpace = /\s/.test(id);
  if (name && idLikeRegex.test(name) && (hasSpace || !idLikeRegex.test(id))) {
    const temp = id;
    id = name;
    name = temp;
  }
  return {
    id,
    name,
    description
  };
}
function determineKeyType(provider, baseUrl) {
  return resolveProviderKeyType(provider, baseUrl);
}
function extractSlotRouteTarget(suffix) {
  const decodedSuffix = (() => {
    try {
      return decodeURIComponent(String(suffix || "").trim().toLowerCase());
    } catch {
      return String(suffix || "").trim().toLowerCase();
    }
  })();
  if (!decodedSuffix) return null;
  if (decodedSuffix.startsWith("slot_key_")) return decodedSuffix.slice(5);
  if (decodedSuffix.startsWith("slot_")) return decodedSuffix.slice(5);
  if (decodedSuffix.startsWith("provider_")) return decodedSuffix.slice(9);
  return null;
}
function decodeRouteSuffix(suffix) {
  try {
    return decodeURIComponent(String(suffix || "").trim().toLowerCase());
  } catch {
    return String(suffix || "").trim().toLowerCase();
  }
}
function matchesSlotRouteSuffix(slot, suffix) {
  const decodedSuffix = decodeRouteSuffix(suffix);
  if (!decodedSuffix) return false;
  const routeTarget = extractSlotRouteTarget(decodedSuffix);
  const slotIdLower = String(slot.id || "").trim().toLowerCase();
  const slotNameLower = String(slot.name || "").trim().toLowerCase();
  const slotSuffixLower = String(slot.proxyConfig?.serverName || slot.provider || "Custom").trim().toLowerCase();
  const providerLower = String(slot.provider || "").trim().toLowerCase();
  if (routeTarget) {
    return slotIdLower === routeTarget;
  }
  return slotIdLower === decodedSuffix || slotNameLower === decodedSuffix || slotSuffixLower === decodedSuffix || providerLower === decodedSuffix;
}
function matchesProviderRouteSuffix(provider, suffix) {
  const decodedSuffix = decodeRouteSuffix(suffix);
  if (!decodedSuffix) return false;
  const routeTarget = extractSlotRouteTarget(decodedSuffix);
  const providerIdLower = String(provider.id || "").trim().toLowerCase();
  const providerNameLower = String(provider.name || "").trim().toLowerCase();
  if (routeTarget) {
    return providerIdLower === routeTarget;
  }
  return providerIdLower === decodedSuffix || providerNameLower === decodedSuffix;
}
function normalizeProviderLinkValue(value) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}
function normalizeModelId2(modelId) {
  const raw = (modelId || "").trim();
  const normalized = MODEL_MIGRATION_MAP[raw];
  if (normalized) {
    console.log(`[ModelMigration] Auto-correcting "${modelId}" \u95B3?"${normalized}"`);
    return normalized;
  }
  const lowerRaw = raw.toLowerCase();
  const lowerMapped = MODEL_MIGRATION_MAP[lowerRaw];
  if (lowerMapped) {
    console.log(`[ModelMigration] Auto-correcting "${modelId}" \u95B3?"${lowerMapped}"`);
    return lowerMapped;
  }
  const dashed = lowerRaw.replace(/\s+/g, "-");
  const dashedMapped = MODEL_MIGRATION_MAP[dashed];
  if (dashedMapped) {
    console.log(`[ModelMigration] Auto-correcting "${modelId}" \u95B3?"${dashedMapped}"`);
    return dashedMapped;
  }
  return raw;
}
function parseModelVariantMeta(modelId) {
  const raw = (modelId || "").trim();
  let working = raw.replace(/-\*$/i, "").replace(/-\d{8}$/i, "");
  const ratioRegex = /(16[x-]9|9[x-]16|1[x-]1|4[x-]3|3[x-]4|21[x-]9|9[x-]21|3[x-]2|2[x-]3|4[x-]5|5[x-]4)$/i;
  const qualityRegex = /(4k|2k|1k|hd|high|ultra|medium|low|standard)$/i;
  const speedRegex = /(fast|slow)$/i;
  let ratio;
  let quality;
  let speed;
  const ratioMatch = working.match(new RegExp(`-${ratioRegex.source}`, "i"));
  if (ratioMatch) {
    ratio = ratioMatch[1].toLowerCase();
    working = working.replace(new RegExp(`-${ratioRegex.source}$`, "i"), "");
  }
  const qualityMatch = working.match(new RegExp(`-${qualityRegex.source}`, "i"));
  if (qualityMatch) {
    quality = qualityMatch[1].toLowerCase();
    working = working.replace(new RegExp(`-${qualityRegex.source}$`, "i"), "");
  }
  const speedMatch = working.match(new RegExp(`-${speedRegex.source}`, "i"));
  if (speedMatch) {
    speed = speedMatch[1].toLowerCase();
  }
  return {
    baseId: raw,
    canonicalId: working,
    speed,
    quality,
    ratio
  };
}
function appendModelVariantLabel(baseName, modelId) {
  const parsed = parseModelVariantMeta(modelId);
  const tags = [];
  if (parsed.speed) {
    tags.push(parsed.speed === "fast" ? "Fast" : "Slow");
  }
  if (parsed.quality) {
    const qualityMap = {
      "4k": "4K",
      "2k": "2K",
      "1k": "1K",
      high: "High",
      hd: "HD",
      ultra: "Ultra",
      medium: "Medium",
      low: "Low",
      standard: "Standard"
    };
    tags.push(qualityMap[parsed.quality] || parsed.quality);
  }
  if (tags.length === 0) return baseName;
  return `${baseName} (${tags.join(" \u74BA?")})`;
}
function isDeprecatedModel(modelId) {
  return DEPRECATED_MODELS.includes(modelId);
}
function shouldFilterModel(modelId) {
  if (GOOGLE_IMAGE_WHITELIST.includes(modelId)) return false;
  if (/imagen-[34]\.0-.*-preview-\d{2}-\d{2}/.test(modelId)) {
    console.log(`[ModelFilter] Filtering Imagen preview: ${modelId}`);
    return true;
  }
  if (/imagen-[34]\.0-.*generate-001$/.test(modelId)) {
    console.log(`[ModelFilter] Filtering old Imagen: ${modelId}`);
    return true;
  }
  if (modelId === "gemini-2.0-flash-exp-image-generation") {
    console.log(`[ModelFilter] Filtering deprecated model: ${modelId}`);
    return true;
  }
  return false;
}
function normalizeModelList(models, provider) {
  const isOfficialGoogle = provider === "Google";
  const normalized = models.map((id) => {
    const raw = (id || "").trim();
    if (!isOfficialGoogle) {
      return raw;
    }
    const target = MODEL_MIGRATION_MAP[raw];
    if (target) return target;
    return normalizeModelId2(raw);
  });
  const unique = Array.from(new Set(normalized)).filter((id) => {
    if (shouldFilterModel(id)) return false;
    if (isOfficialGoogle) {
      const isGoogleImageLike = id.includes("image") || id.includes("nano") || id.includes("banana") || id.includes("imagen");
      if (isGoogleImageLike && !GOOGLE_IMAGE_WHITELIST.includes(id)) {
        return false;
      }
    }
    if (id === "nano-banana" || id === "nano-banana-pro") return false;
    return true;
  });
  return unique;
}
function buildStableSystemRouteId(baseModelId, providerId, fallbackIndex) {
  const normalizedBaseId = String(baseModelId || "").trim();
  const normalizedProviderId = String(providerId || "").trim();
  if (!normalizedProviderId) {
    return fallbackIndex && fallbackIndex > 1 ? `${normalizedBaseId}@system_${fallbackIndex}` : `${normalizedBaseId}@system`;
  }
  return `${normalizedBaseId}@system_${encodeURIComponent(normalizedProviderId)}`;
}
function buildUserSlotRouteId(baseModelId, slotId) {
  return `${String(baseModelId || "").trim()}@slot_${encodeURIComponent(String(slotId || "").trim())}`;
}
function buildProviderRouteId(baseModelId, providerId) {
  const normalizedProviderId = String(providerId || "").trim();
  const routeProviderId = normalizedProviderId.startsWith("provider_") ? normalizedProviderId : `provider_${normalizedProviderId}`;
  return `${String(baseModelId || "").trim()}@${encodeURIComponent(routeProviderId)}`;
}
function detectApiType(apiKey, baseUrl) {
  if (apiKey.startsWith("AIza") || baseUrl?.includes("googleapis.com") || baseUrl?.includes("generativelanguage.googleapis.com")) {
    return "google-official";
  }
  if (apiKey.startsWith("sk-") && (!baseUrl || baseUrl.includes("api.openai.com"))) {
    return "openai";
  }
  if (baseUrl && !baseUrl.includes("googleapis.com") && baseUrl.length > 0) {
    return "proxy";
  }
  return "unknown";
}
async function fetchGoogleModels(apiKey) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!response.ok) {
      console.error("[KeyManager] Failed to fetch Google models:", response.status);
      const responseText = await response.text().catch(() => "");
      const failure = classifyApiFailure({
        status: response.status,
        responseText,
        fallbackMessage: `HTTP ${response.status}`
      });
      throw new Error(buildUserFacingApiErrorMessage(failure));
    }
    const data = await response.json();
    const models = data.models?.map((m) => m.name.replace("models/", "")).filter((rawModel) => {
      const modelId = rawModel.replace(/^models\//, "");
      const lower = modelId.toLowerCase();
      if (lower.includes("embedding") || lower.includes("audio") || lower.includes("robotics") || lower.includes("code-execution") || lower.includes("computer-use") || lower.includes("aqa")) {
        return false;
      }
      if (lower.includes("tts")) return false;
      const allowedPatterns = [
        ...GOOGLE_IMAGE_WHITELIST.map((id) => new RegExp(`^${id}$`)),
        /^veo-3\.1-generate-preview$/,
        /^veo-3\.1-fast-generate-preview$/,
        /^gemini-2\.5-(flash|pro|flash-lite)$/,
        /^gemini-3-(pro|flash)-preview$/
      ];
      return allowedPatterns.some((pattern) => pattern.test(modelId));
    }) || [];
    console.log(`[KeyManager] Strict whitelist kept ${models.length} models:`, models);
    const finalModels = Array.from(/* @__PURE__ */ new Set([
      ...DEFAULT_GOOGLE_MODELS,
      ...models
    ]));
    console.log("[KeyManager] Merged Google model list:", finalModels);
    return finalModels;
  } catch (error) {
    console.error("[KeyManager] Error fetching Google models:", error);
    const failure = classifyApiFailure({
      error,
      fallbackMessage: error instanceof Error ? error.message : "Google models request failed"
    });
    throw new Error(buildUserFacingApiErrorMessage(failure));
  }
}
async function fetchGeminiCompatModels(apiKey, baseUrl) {
  const lowerBase = String(baseUrl || "").toLowerCase();
  if (!baseUrl || lowerBase.includes("googleapis.com") || lowerBase.includes("generativelanguage.googleapis.com")) {
    return fetchGoogleModels(apiKey);
  }
  try {
    const runtime = resolveProviderRuntime({
      baseUrl,
      format: "gemini"
    });
    const authMethod = runtime.authMethod;
    const response = await fetch(buildGeminiModelsEndpoint(baseUrl, apiKey, authMethod), {
      headers: buildGeminiHeaders(authMethod, apiKey, runtime.headerName, runtime.authorizationValueFormat)
    });
    if (!response.ok) {
      console.error("[KeyManager] Failed to fetch Gemini-compatible models:", response.status, response.statusText);
      const responseText = await response.text().catch(() => "");
      const failure = classifyApiFailure({
        status: response.status,
        responseText,
        fallbackMessage: `HTTP ${response.status}`
      });
      if (response.status === 404) {
        return [];
      }
      throw new Error(buildUserFacingApiErrorMessage(failure));
    }
    const data = await response.json();
    const rawModels = data.models || data.data || [];
    return Array.from(
      new Set(
        rawModels.map((model) => String(model?.name || model?.id || model?.model || "").replace(/^models\//i, "").trim()).filter(Boolean)
      )
    );
  } catch (error) {
    console.error("[KeyManager] Error fetching Gemini-compatible models:", error);
    const failure = classifyApiFailure({
      error,
      fallbackMessage: error instanceof Error ? error.message : "Gemini-compatible models request failed"
    });
    throw new Error(buildUserFacingApiErrorMessage(failure));
  }
}
async function fetchOpenAICompatModels(apiKey, baseUrl) {
  try {
    const runtime = resolveProviderRuntime({
      baseUrl,
      format: "openai"
    });
    const response = await fetch(buildOpenAIEndpoint(baseUrl, "models"), {
      headers: buildProxyHeaders(runtime.authMethod, apiKey, runtime.headerName, void 0, runtime.authorizationValueFormat)
    });
    if (!response.ok) {
      console.error("[KeyManager] Failed to fetch proxy models:", response.status, response.statusText);
      if (response.status === 401) {
        throw new Error("\u8BA4\u8BC1\u5931\u8D25\uFF08401\uFF09\uFF1AAPI Key \u65E0\u6548\u3001\u5DF2\u8FC7\u671F\uFF0C\u6216\u7F3A\u5C11\u8BBF\u95EE\u6743\u9650\u3002");
      }
      if (response.status === 403) {
        throw new Error("\u6743\u9650\u4E0D\u8DB3\uFF08403\uFF09\uFF1A\u5F53\u524D API Key \u65E0\u6743\u8BBF\u95EE\u6A21\u578B\u5217\u8868\u63A5\u53E3\u3002");
      }
      if (response.status === 404) {
        console.warn("[KeyManager] Provider does not expose /v1/models, returning an empty model list.");
        return [];
      }
      throw new Error(`\u83B7\u53D6\u6A21\u578B\u5217\u8868\u5931\u8D25\uFF08${response.status}\uFF09\uFF1A${response.statusText || "\u8BF7\u68C0\u67E5\u63A5\u53E3\u5730\u5740\u548C API Key\u3002"}`);
    }
    const data = await response.json();
    const rawModels = data.data || [];
    console.log("[KeyManager] /v1/models response:", { count: rawModels.length, firstModel: rawModels.length > 0 ? rawModels[0]?.id || rawModels[0] : null, dataType: typeof data.data, hasObjectField: !!data.object });
    const rawSet = new Set(rawModels.map((m) => m.id));
    const deduped = /* @__PURE__ */ new Map();
    rawModels.forEach((m) => {
      const modelId = m.id;
      const modelName = m.name || m.title || m.display_name || "";
      const modelProvider = m.owned_by || m.provider || "";
      const parsed = parseModelVariantMeta(modelId);
      const canonical = parsed.canonicalId || modelId;
      let formattedModel = modelId;
      if (modelName || modelProvider) {
        formattedModel = `${modelId}|${modelName}|${modelProvider}`;
      }
      if (rawSet.has(canonical)) {
        let formattedCanonical = canonical;
        const canonicalObj = rawModels.find((obj) => obj.id === canonical);
        if (canonicalObj) {
          const cName = canonicalObj.name || canonicalObj.title || canonicalObj.display_name || "";
          const cProvider = canonicalObj.owned_by || canonicalObj.provider || "";
          if (cName || cProvider) {
            formattedCanonical = `${canonical}|${cName}|${cProvider}`;
          }
        }
        deduped.set(canonical, formattedCanonical);
        return;
      }
      if (!deduped.has(canonical)) {
        deduped.set(canonical, formattedModel);
      }
    });
    const result = Array.from(new Set(deduped.values()));
    console.log(`[KeyManager] Deduplicated down to ${result.length} unique models:`, result);
    return result;
  } catch (error) {
    console.error("[KeyManager] Error fetching proxy models:", error);
    return [];
  }
}
function categorizeModels(models) {
  const categories = {
    imageModels: [],
    videoModels: [],
    chatModels: [],
    otherModels: []
  };
  models.forEach((model) => {
    const lowerModel = model.toLowerCase();
    if (lowerModel.includes("veo") || lowerModel.includes("runway") || lowerModel.includes("luma") || lowerModel.includes("dream-machine") || lowerModel.includes("kling") || lowerModel.includes("cogvideo") || lowerModel.includes("svd") || lowerModel.includes("video")) {
      categories.videoModels.push(model);
    } else if (lowerModel.includes("imagen") || lowerModel.includes("dall-e") || lowerModel.includes("midjourney") || lowerModel.includes("image") || lowerModel.includes("nano") || lowerModel.includes("banana") || lowerModel.includes("flux") || lowerModel.includes("stable") || lowerModel.includes("diffusion") || lowerModel.includes("painting") || lowerModel.includes("draw") || lowerModel.includes("img")) {
      categories.imageModels.push(model);
    } else if (lowerModel.includes("gemini") || lowerModel.includes("gpt") || lowerModel.includes("claude") || lowerModel.includes("chat")) {
      categories.chatModels.push(model);
    } else {
      categories.otherModels.push(model);
    }
  });
  return categories;
}
async function autoDetectAndConfigureModels(apiKey, baseUrl, preferredFormat) {
  const apiType = detectApiType(apiKey, baseUrl);
  const resolvedFormat = resolveApiProtocolFormat(
    preferredFormat,
    baseUrl,
    apiType === "google-official" ? "gemini" : "openai"
  );
  console.log("[KeyManager] \u6FE1\uE09F\u5053\u6FDE\u6751\u73E8\u9369\u5B49PI\u7F01\uE0A5\uE1E7\u940E?", apiType);
  let models = [];
  if (resolvedFormat === "gemini") {
    models = await fetchGeminiCompatModels(apiKey, baseUrl);
  } else if (apiType === "google-official") {
    models = await fetchGoogleModels(apiKey);
  } else if (apiType === "proxy" && baseUrl) {
    models = await fetchOpenAICompatModels(apiKey, baseUrl);
  } else if (apiType === "openai") {
    models = ["dall-e-3", "dall-e-2", "gpt-4o", "gpt-4o-mini"];
  }
  const normalizedModels = normalizeModelList(models, resolvedFormat === "gemini" ? "Google" : "Proxy");
  const categories = categorizeModels(normalizedModels);
  return {
    success: normalizedModels.length > 0,
    models: normalizedModels,
    categories,
    apiType: preferredFormat && preferredFormat !== "auto" ? preferredFormat : apiType
  };
}
var RATE_LIMIT_COOLDOWN_MS, PROVIDER_PRESETS, STORAGE_KEY4, PROVIDERS_STORAGE_KEY, DEFAULT_MAX_FAILURES, MODEL_MIGRATION_MAP, BLACKLIST_MODELS, DEPRECATED_MODELS, GOOGLE_IMAGE_WHITELIST, VIDEO_MODEL_WHITELIST, ADVANCED_IMAGE_MODEL_WHITELIST, AUDIO_MODEL_WHITELIST, isGoogleOfficialModelId, DEFAULT_GOOGLE_MODELS, GOOGLE_HEADER_NAME, GOOGLE_CHAT_MODELS, GOOGLE_MODEL_METADATA, MODEL_TYPE_MAP, getModelMetadata, inferModelType, KeyManager, keyManager, keyManager_default;
var init_keyManager = __esm({
  "src/services/auth/keyManager.ts"() {
    init_supabase();
    init_apiConfig();
    init_errorClassification();
    init_providerStrategy();
    init_modelPresets();
    init_RegionService();
    init_modelRegistry();
    init_adminModelService();
    init_providerPricingSnapshot();
    init_newApiPricingService();
    RATE_LIMIT_COOLDOWN_MS = 30 * 1e3;
    PROVIDER_PRESETS = {
      "zhipu": {
        name: "\u667A\u8C31 AI",
        baseUrl: "https://open.bigmodel.cn/api/paas/v4",
        models: ["glm-4", "glm-4-flash", "glm-4-plus", "cogview-4"],
        format: "openai",
        icon: "\u{1F9E0}"
      },
      "wanqing": {
        name: "\u4E07\u9752 (\u5FEB\u624B)",
        baseUrl: "https://wanqing.streamlakeapi.com/api/gateway/v1/endpoints",
        models: ["deepseek-reasoner", "deepseek-v3", "qwen-max"],
        format: "openai",
        icon: "\u{1F3AC}"
      },
      "sambanova": {
        name: "SambaNova",
        baseUrl: "https://api.sambanova.ai/v1",
        models: ["Meta-Llama-3.1-405B-Instruct", "Meta-Llama-3.1-70B-Instruct", "Meta-Llama-3.1-8B-Instruct", "Meta-Llama-3.2-90B-Vision-Instruct", "Meta-Llama-3.2-11B-Vision-Instruct", "Meta-Llama-3.2-3B-Instruct", "Meta-Llama-3.2-1B-Instruct", "Qwen2.5-72B-Instruct", "Qwen2.5-Coder-32B-Instruct"],
        format: "openai",
        icon: "\u{1F680}"
      },
      "openclaw": {
        name: "OpenClaw (Zero Token)",
        baseUrl: "http://127.0.0.1:3001/v1",
        models: ["claude-3-5-sonnet-20241022", "doubao-pro-32k", "doubao-pro-128k", "deepseek-chat", "deepseek-reasoner"],
        format: "openai",
        icon: "\u{1F43E}",
        defaultApiKey: "sk-openclaw-zero-token"
      },
      "t8star": {
        name: "T8Star",
        baseUrl: "https://ai.t8star.cn",
        // Conservative defaults; users can auto-detect or customize in UI
        models: ["gemini-3.1-pro-preview", "gemini-3.1-flash-image-preview", "gemini-2.5-flash-image", "gemini-3-pro-image-preview", "gemini-2.5-flash", "gemini-3-flash-preview", "runway-gen3", "luma-video", "kling-v1", "sv3d", "flux-kontext-max", "recraft-v3-svg", "ideogram-v2", "suno-v3.5", "minimax-t2a-01"],
        format: "openai",
        icon: "\u2B50"
      },
      "volcengine": {
        name: "\u706B\u5C71\u5F15\u64CE",
        baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
        models: ["doubao-pro", "doubao-lite"],
        format: "openai",
        icon: "\u{1F30B}"
      },
      "deepseek": {
        name: "DeepSeek",
        baseUrl: "https://api.deepseek.com",
        models: ["deepseek-chat", "deepseek-reasoner"],
        format: "openai",
        icon: "\u{1F52E}"
      },
      "moonshot": {
        name: "Moonshot (Kimi)",
        baseUrl: "https://api.moonshot.cn/v1",
        models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
        format: "openai",
        icon: "\u{1F319}"
      },
      "siliconflow": {
        name: "SiliconFlow",
        baseUrl: "https://api.siliconflow.cn/v1",
        models: ["Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"],
        format: "openai",
        icon: "\u{1F48E}"
      },
      "12ai": {
        name: "12AI",
        baseUrl: "https://cdn.12ai.org",
        models: [
          "gpt-5.1",
          "gemini-2.5-pro",
          "gemini-2.5-pro-c",
          "gemini-2.5-flash",
          "gemini-2.5-flash-c",
          "gemini-3.1-pro-preview",
          "gemini-3.1-pro-preview-c",
          "gemini-2.5-flash-image",
          "gemini-2.5-flash-image-c",
          "gemini-3-pro-image-preview",
          "gemini-3-pro-image-preview-c",
          "claude-4-sonnet",
          "runway-gen3",
          "luma-video",
          "kling-v1",
          "sv3d",
          "flux-kontext-max",
          "recraft-v3-svg",
          "ideogram-v2",
          "suno-v3.5",
          "minimax-t2a-01"
        ],
        format: "gemini",
        // Best for Gemini-compatible routes and reference images
        icon: "\u{1F680}"
      },
      "antigravity": {
        name: "Antigravity (\u672C\u5730)",
        baseUrl: "http://127.0.0.1:8045",
        models: ["gemini-3.1-pro-preview", "gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview", "gemini-3-flash", "gemini-2.5-flash-image", "gemini-2.5-flash", "runway-gen3", "luma-video", "kling-v1", "sv3d", "vidu", "minimax-video", "flux-kontext-max", "recraft-v3-svg", "ideogram-v2", "suno-v3.5", "minimax-t2a-01"],
        format: "openai",
        icon: "\u{1F300}"
      },
      "12ai-nanobanana": {
        name: "12AI NanoBanana",
        baseUrl: "https://cdn.12ai.org",
        models: [
          "gemini-2.5-flash-image",
          "gemini-2.5-flash-image-c",
          "gemini-3-pro-image-preview",
          "gemini-3-pro-image-preview-c"
        ],
        format: "gemini",
        icon: "\u{1F34C}"
      },
      "custom": {
        name: "\u81EA\u5B9A\u4E49\u4F9B\u5E94\u5546",
        baseUrl: "",
        models: [],
        format: "auto",
        icon: "\u2699\uFE0F"
      }
    };
    STORAGE_KEY4 = "kk_studio_key_manager";
    PROVIDERS_STORAGE_KEY = "kk_studio_third_party_providers";
    DEFAULT_MAX_FAILURES = 3;
    MODEL_MIGRATION_MAP = {
      // Gemini 1.5 缁鍨?閳?Gemini 2.5 缁鍨?
      "gemini-1.5-pro": "gemini-2.5-pro",
      "gemini-1.5-pro-latest": "gemini-2.5-pro",
      "gemini-1.5-flash": "gemini-2.5-flash",
      "gemini-1.5-flash-latest": "gemini-2.5-flash",
      // Gemini 2.0 缁鍨?閳?Gemini 2.5 缁鍨?
      "gemini-2.0-flash-exp": "gemini-2.5-flash",
      "gemini-2.0-pro-exp": "gemini-2.5-pro",
      // Gemini 2.0 鐎逛负鐛欓晲褍娴橀晙蹇曟暁閹?閳?Gemini 2.5 Flash Image (Was mapped to Nano Banana)
      "gemini-2.0-flash-exp-image-generation": "gemini-2.5-flash-image",
      // Nano Banana Alias 閳?Gemini 2.5 Flash Image (Official)
      "nano-banana": "gemini-2.5-flash-image",
      "nano banana": "gemini-2.5-flash-image",
      "nano-banana-pro": "gemini-3-pro-image-preview",
      "nano banana pro": "gemini-3-pro-image-preview",
      "nano-banana-2": "gemini-3.1-flash-image-preview",
      "nano banana 2": "gemini-3.1-flash-image-preview",
      // -latest 皤攧顐㈡倳 閳?閸忚渹皤焺閻楀牊婀?
      "gemini-flash-lite-latest": "gemini-2.5-flash-lite",
      "gemini-flash-latest": "gemini-2.5-flash",
      "gemini-pro-latest": "gemini-2.5-pro",
      // Retroactive fixes for old canvas nodes
      "gemini-3-pro-image": "gemini-3-pro-image-preview"
    };
    BLACKLIST_MODELS = [
      // Imagen 妫板嫯顫嶉悧?瀹侊附妫╅摼鐔锋倵缂傗偓)
      /^imagen-[34]\.0-(ultra-)?generate-preview-\d{2}-\d{2}$/,
      /^imagen-[34]\.0-(fast-)?generate-preview-\d{2}-\d{2}$/,
      // Imagen 闀炑呭(generate-001)
      /^imagen-[34]\.0-.*generate-001$/
    ];
    DEPRECATED_MODELS = Object.keys(MODEL_MIGRATION_MAP);
    GOOGLE_IMAGE_WHITELIST = [
      "gemini-2.5-flash-image",
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-image-preview",
      "imagen-4.0-generate-001",
      "imagen-4.0-ultra-generate-001",
      "imagen-4.0-fast-generate-001"
    ];
    VIDEO_MODEL_WHITELIST = [
      "runway-gen3",
      "luma-video",
      "kling-v1",
      "sv3d",
      "vidu",
      "minimax-video",
      "wan-v1"
    ];
    ADVANCED_IMAGE_MODEL_WHITELIST = [
      "flux-kontext-max",
      "recraft-v3-svg",
      "ideogram-v2"
    ];
    AUDIO_MODEL_WHITELIST = [
      "suno-v3.5",
      "minimax-t2a-01"
    ];
    isGoogleOfficialModelId = (modelId) => {
      const id = String(modelId || "").replace(/^models\//, "").toLowerCase();
      return id.startsWith("gemini-") || id.startsWith("imagen-") || id.startsWith("veo-");
    };
    DEFAULT_GOOGLE_MODELS = [
      // Gemini 3.1 缁鍨敍鍫熸付閺備即顣╃憴鍫㈠閿?
      "gemini-3.1-pro-preview",
      // Gemini 3 缁鍨敍鍫ヮ暕鐟欏牏澧楅敍? 闀靛﹤銇?
      "gemini-3-pro-preview",
      "gemini-3-flash-preview",
      // Gemini 2.5 缁鍨敍鍫⑶旂€规氨澧楅敍? 闀靛﹤銇?
      "gemini-2.5-flash",
      // Strict Image Models
      ...GOOGLE_IMAGE_WHITELIST,
      // Veo 鐟欏棝顣堕悽鐔稿灇
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview"
    ];
    GOOGLE_HEADER_NAME = "x-goog-api-key";
    GOOGLE_CHAT_MODELS = [
      // Gemini 2.5 series - best value
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", icon: "\u{1F9E0}", description: "\u6700\u5F3A\u63A8\u7406\u6A21\u578B\uFF0C\u64C5\u957F\u4EE3\u7801\u3001\u6570\u5B66\u3001STEM \u590D\u6742\u4EFB\u52A1" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", icon: "\u26A1", description: "\u901F\u5EA6\u4F18\u5148\uFF0C\u9002\u5408\u9AD8\u5E76\u53D1\u4E0E\u5FEB\u901F\u54CD\u5E94\u573A\u666F" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", icon: "\u{1F539}", description: "\u4F4E\u6210\u672C\u5FEB\u901F\u6A21\u578B\uFF0C\u9002\u5408\u8F7B\u91CF\u4EFB\u52A1" },
      // Gemini 3 / 3.1 series - advanced reasoning
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro \u9884\u89C8", icon: "\u{1F48E}", description: "\u9002\u5408\u9700\u8981\u5E7F\u6CDB\u4E16\u754C\u77E5\u8BC6\u4E0E\u8DE8\u6A21\u6001\u9AD8\u7EA7\u63A8\u7406\u7684\u590D\u6742\u4EFB\u52A1" },
      { id: "gemini-3-pro-preview", name: "Gemini 3 Pro \u9884\u89C8", icon: "\u{1F680}", description: "\u66F4\u5F3A\u63A8\u7406\u4E0E\u590D\u6742\u4EFB\u52A1\u80FD\u529B\uFF0C\u9002\u5408\u4E13\u4E1A\u5DE5\u4F5C\u6D41" },
      { id: "gemini-3-flash-preview", name: "Gemini 3 Flash \u9884\u89C8", icon: "\u26A1", description: "\u65B0\u4E00\u4EE3 Flash\uFF0C\u5E73\u8861\u8D28\u91CF\u4E0E\u901F\u5EA6" },
      // Multimodal models
      { id: "gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Image", icon: "\u{1F5BC}\uFE0F", description: "\u56FE\u50CF\u751F\u6210\u6A21\u578B\uFF0C\u9002\u5408\u901A\u7528\u521B\u4F5C\u573A\u666F" },
      { id: "gemini-3-pro-image-preview", name: "Gemini 3 Pro Image (Preview)", icon: "\u{1F3A8}", description: "\u9AD8\u8D28\u91CF\u56FE\u50CF\u751F\u6210\uFF0C\u9002\u5408\u4E13\u4E1A\u521B\u4F5C" },
      { id: "gemini-2.5-flash-image", name: "Gemini 2.5 Flash Image", icon: "\u{1F34C}", description: "\u5FEB\u901F\u56FE\u50CF\u6A21\u578B\uFF0C\u9002\u5408\u9AD8\u9891\u51FA\u56FE\u573A\u666F" }
    ];
    GOOGLE_MODEL_METADATA = new Map(
      GOOGLE_CHAT_MODELS.map((model) => [model.id, { name: model.name, description: model.description, icon: model.icon }])
    );
    MODEL_TYPE_MAP = /* @__PURE__ */ new Map();
    GOOGLE_CHAT_MODELS.forEach((model) => MODEL_TYPE_MAP.set(model.id, "chat"));
    MODEL_PRESETS.forEach((preset) => MODEL_TYPE_MAP.set(preset.id, preset.type));
    MODEL_TYPE_MAP.set("gemini-2.5-flash-image", "image+chat");
    MODEL_TYPE_MAP.set("gemini-3.1-flash-image-preview", "image+chat");
    MODEL_TYPE_MAP.set("gemini-3-pro-image-preview", "image+chat");
    MODEL_TYPE_MAP.set("imagen-4.0-generate-001", "image");
    MODEL_TYPE_MAP.set("imagen-4.0-ultra-generate-001", "image");
    MODEL_TYPE_MAP.set("imagen-4.0-fast-generate-001", "image");
    MODEL_TYPE_MAP.set("veo-3.1-generate-preview", "video");
    MODEL_TYPE_MAP.set("veo-3.1-fast-generate-preview", "video");
    MODEL_PRESETS.filter((preset) => preset.provider === "Google").forEach((preset) => {
      if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
      }
    });
    GOOGLE_MODEL_METADATA.set("imagen-4.0-generate-001", { name: "Imagen 4.0 \u6807\u51C6\u7248", icon: "\u{1F3A8}", description: "Google \u5B98\u65B9\u56FE\u50CF\u6A21\u578B\uFF08\u6807\u51C6\u7248\uFF09" });
    GOOGLE_MODEL_METADATA.set("imagen-4.0-ultra-generate-001", { name: "Imagen 4.0 Ultra", icon: "\u{1F48E}", description: "Google \u7684\u9AD8\u4FDD\u771F\u56FE\u50CF\u6A21\u578B\uFF08Ultra\uFF09" });
    GOOGLE_MODEL_METADATA.set("imagen-4.0-fast-generate-001", { name: "Imagen 4.0 \u5FEB\u901F\u7248", icon: "\u26A1", description: "Google \u5B98\u65B9\u56FE\u50CF\u6A21\u578B\uFF08\u5FEB\u901F\u7248\uFF09" });
    GOOGLE_MODEL_METADATA.set("veo-3.1-generate-preview", { name: "Veo 3.1", icon: "\u{1F3AC}", description: "\u6700\u65B0\u89C6\u9891\u751F\u6210\u6A21\u578B\uFF08\u9884\u89C8\u7248\uFF09" });
    GOOGLE_MODEL_METADATA.set("veo-3.1-fast-generate-preview", { name: "Veo 3.1 Fast", icon: "\u{1F3AC}", description: "Veo 3.1 \u5FEB\u901F\u7248" });
    GOOGLE_MODEL_METADATA.set("gemini-2.5-flash-image", { name: "Nano Banana", icon: "\u{1F34C}", description: "Gemini 2.5 Flash Image (Custom)" });
    GOOGLE_MODEL_METADATA.set("gemini-3.1-flash-image-preview", { name: "Nano Banana 2", icon: "\u{1F34C}", description: "Gemini 3.1 Flash Image Preview (Custom)" });
    GOOGLE_MODEL_METADATA.set("gemini-3-pro-image-preview", { name: "Nano Banana Pro", icon: "\u{1F34C}", description: "Gemini 3 Pro Image (Custom)" });
    getModelMetadata = (modelId) => {
      const exactId = String(modelId || "").trim();
      if (exactId) {
        const exactModel = keyManager.getGlobalModelList().find((model) => model.id === exactId);
        if (exactModel) {
          return {
            name: exactModel.name,
            icon: exactModel.icon,
            description: exactModel.description
          };
        }
      }
      const baseId = exactId.split("@")[0];
      const exactAdminModel = adminModelService.getModel(exactId);
      if (exactAdminModel) {
        return {
          name: exactAdminModel.displayName,
          description: exactAdminModel.advantages
        };
      }
      return GOOGLE_MODEL_METADATA.get(baseId);
    };
    inferModelType = (modelId) => {
      const id = modelId.toLowerCase();
      const isOpenRouter = id.includes("/") && !id.startsWith("models/");
      const isVideo = id.includes("video") || id.includes("veo") || id.includes("kling") || id.includes("runway") || id.includes("gen-3") || id.includes("gen-2") || id.includes("luma") || id.includes("sora") || id.includes("pika") || id.includes("minimax-video") || id.includes("wan") || id.includes("pixverse") || id.includes("hailuo") || id.includes("seedance") || id.includes("viggle") || id.includes("higgsfield") || id.includes("vidu") || id.includes("ray-") || id.includes("jimeng") || id.includes("cogvideo") || id.includes("hunyuanvideo");
      if (isVideo) return "video";
      const isImage = id.includes("imagen") || id.includes("image") || id.includes("img") || id.includes("dall-e") || id.includes("dalle") || id.includes("midjourney") || id.includes("mj") || id.includes("nano") || id.includes("banana") || id.includes("flux") || id.includes("stable") || id.includes("sd-") || id.includes("stable-diffusion") || id.includes("diffusion") || id.includes("painting") || id.includes("draw") || id.includes("ideogram") || id.includes("recraft") || id.includes("seedream");
      if (isImage) return "image";
      const isAudio = id.includes("lyria") || id.includes("audio") || id.includes("music") || id.includes("suno") || id.includes("voicemod") || id.includes("elevenlabs") || id.includes("fish-audio");
      if (isAudio) return "audio";
      const isChat = id.includes("gemini") || id.includes("gpt") || id.includes("claude") || id.includes("deepseek") || id.includes("qwen") || id.includes("llama") || id.includes("mistral") || id.includes("yi-") || id.includes(":free") || id.includes("moonshot") || id.includes("doubao");
      if (isChat) return "chat";
      if (isOpenRouter) return "chat";
      return "chat";
    };
    CHAT_MODEL_PRESETS.forEach((preset) => {
      if (!GOOGLE_MODEL_METADATA.has(preset.id)) {
        GOOGLE_MODEL_METADATA.set(preset.id, { name: preset.label, description: preset.description });
      }
    });
    KeyManager = class {
      state;
      listeners = /* @__PURE__ */ new Set();
      userId = null;
      isSyncing = false;
      cloudSyncBackoffUntil = 0;
      // 棣冩畬 濡€崇€佛珨勬銆冪紓鎻跨摠
      globalModelListCache = null;
      CACHE_TTL = 5e3;
      // 5缁夋帞绱︾€?
      constructor() {
        this.state = this.loadState();
        if (!this.state.rotationStrategy) {
          this.state.rotationStrategy = "round-robin";
        }
        this.state.slots = this.state.slots.map((s) => ({
          ...s,
          disabled: s.disabled ?? false,
          status: s.status || "valid"
        }));
        this.loadProviders();
        this.providers.forEach((provider) => {
          this.syncLegacySlotsWithProvider(provider);
        });
        adminModelService.subscribe(() => {
          console.log("[KeyManager] Admin models updated, notifying listeners");
          this.notifyListeners();
        });
      }
      getStorageKey() {
        if (!this.userId) return STORAGE_KEY4;
        return `${STORAGE_KEY4}_${this.userId}`;
      }
      /**
       * Add token usage to a key and update cost
       * 妫板嫮鐣婚挜妤€鏁栭暈鎯板殰閿枫劌鐨?key 缁夎鍩岄槖鐔峰灙閾绢偄鐔?
       */
      addUsage(keyId, tokens) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (slot) {
          slot.usedTokens = (slot.usedTokens || 0) + tokens;
          slot.updatedAt = Date.now();
          if (slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) {
            console.log(`[KeyManager] API ${slot.name} \u59AB\u677F\u5AEE\u9423\u8BF2\uE18F\u947C\u579B\u5053\u59A4\u20AC\u93C1?($${slot.totalCost.toFixed(2)}/$${slot.budgetLimit})`);
          }
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Load state from localStorage
       */
      loadState() {
        try {
          const key = this.getStorageKey();
          const stored = localStorage.getItem(key);
          if (stored) {
            const parsed = JSON.parse(stored);
            const slots = (parsed.slots || []).map((s) => {
              const provider = s.provider || "Google";
              const baseUrl = s.baseUrl || "";
              const keyType = determineKeyType(provider, baseUrl);
              const format = normalizeApiProtocolFormat(
                s.format,
                provider === "Google" && keyType === "official" ? "gemini" : "auto"
              );
              const runtime = resolveProviderRuntime({
                provider,
                baseUrl,
                format,
                authMethod: s.authMethod,
                headerName: s.headerName,
                compatibilityMode: s.compatibilityMode
              });
              const authMethod = runtime.authMethod;
              const shouldOverrideHeader = !s.headerName || s.headerName === GOOGLE_HEADER_NAME && provider !== "Google" && !baseUrl.toLowerCase().includes("google");
              const headerName = shouldOverrideHeader ? runtime.headerName : s.headerName;
              const rawModels = Array.isArray(s.supportedModels) ? s.supportedModels : [];
              let supportedModels = provider === "Google" && rawModels.length === 0 ? [...DEFAULT_GOOGLE_MODELS] : rawModels;
              if (provider === "Google") {
                supportedModels = supportedModels.filter((m) => isGoogleOfficialModelId(parseModelString(m).id));
                const missingDefaults = DEFAULT_GOOGLE_MODELS.filter((m) => !supportedModels.includes(m));
                if (missingDefaults.length > 0) {
                  console.log(`[KeyManager] Auto-adding missing official models to key ${s.name}:`, missingDefaults);
                  supportedModels = [...supportedModels, ...missingDefaults];
                }
              }
              supportedModels = normalizeModelList(supportedModels, provider);
              return {
                ...s,
                name: s.name || "Unnamed Channel",
                provider,
                totalCost: s.totalCost || 0,
                budgetLimit: s.budgetLimit !== void 0 ? s.budgetLimit : -1,
                tokenLimit: s.tokenLimit !== void 0 ? s.tokenLimit : -1,
                // Default unlimited
                type: s.type || keyType,
                format,
                baseUrl,
                authMethod,
                headerName,
                compatibilityMode: runtime.compatibilityMode,
                supportedModels,
                disabled: s.disabled ?? false,
                status: s.status || "valid",
                updatedAt: s.updatedAt || s.createdAt || Date.now()
                // Backfill updatedAt
              };
            });
            const state = {
              slots,
              currentIndex: 0,
              maxFailures: DEFAULT_MAX_FAILURES,
              rotationStrategy: parsed.rotationStrategy || this.state?.rotationStrategy || "round-robin"
            };
            return state;
          }
        } catch (e) {
          console.warn("[KeyManager] Load failed:", e);
        }
        return {
          slots: [],
          currentIndex: 0,
          maxFailures: DEFAULT_MAX_FAILURES,
          rotationStrategy: "round-robin"
        };
      }
      migrateFromOldFormat() {
        try {
          const oldKeys = localStorage.getItem("kk-api-keys-local");
          if (oldKeys) {
            const keys = JSON.parse(oldKeys);
            const slots = keys.filter((k) => k && k.trim()).map((key, i) => ({
              id: `key_${Date.now()}_${i}`,
              key: key.trim(),
              name: `Migrated Key ${i + 1}`,
              provider: "Google",
              status: "unknown",
              failCount: 0,
              successCount: 0,
              lastUsed: null,
              lastError: null,
              disabled: false,
              createdAt: Date.now(),
              totalCost: 0,
              budgetLimit: -1,
              tokenLimit: -1,
              supportedModels: [...DEFAULT_GOOGLE_MODELS],
              baseUrl: "",
              authMethod: "query",
              headerName: "x-goog-api-key",
              type: "official",
              // 皎眳?Default to official for old keys
              format: "gemini",
              updatedAt: Date.now()
              // Set initial timestamp
            }));
            if (slots.length > 0) {
              console.log(`[KeyManager] Migrated ${slots.length} keys from old format`);
              const state = {
                slots,
                currentIndex: 0,
                maxFailures: DEFAULT_MAX_FAILURES,
                rotationStrategy: "round-robin"
              };
              this.saveState(state);
              return state;
            }
          }
        } catch (e) {
          console.warn("[KeyManager] Migration failed:", e);
        }
        return {
          slots: [],
          currentIndex: 0,
          maxFailures: DEFAULT_MAX_FAILURES,
          rotationStrategy: "round-robin"
        };
      }
      /**
       * Save state to localStorage (Only for anonymous users) or Cloud (For logged in)
       */
      async saveState(state) {
        const toSave = state || this.state;
        const key = this.getStorageKey();
        try {
          if (this.userId) {
            console.log("[KeyManager] \u7039\u590A\u53CF\u59AF\u2033\u7D21\u951B\u6C31\u6AE5\u8930\u66E0\u6564\u93B4\u5CF0\u5553\u934F\u30E4\u7C2F\u7ED4\uE224\u7D1D\u74BA\u5BA0\u7E43\u93C8\uE100\u6E74\u93C4\u5EA2\u6783\u701B\u6A3A\u504D");
            localStorage.removeItem(key);
            if (!this.isSyncing) {
              await this.saveToCloud(toSave);
            }
          } else {
            localStorage.setItem(key, JSON.stringify(toSave));
            console.log("[KeyManager] Anonymous local state saved:", key);
          }
        } catch (e) {
          console.error("[KeyManager] Failed to save state:", e);
        }
      }
      /**
       * Get current user ID
       */
      getUserId() {
        return this.userId;
      }
      /**
       * Set user ID and sync with cloud
       */
      async setUserId(userId) {
        this.unsubscribeRealtime();
        this.userId = userId;
        if (userId) {
          console.log("[KeyManager] User login:", userId);
          const localState = this.loadState();
          if (localState.slots.length > 0) {
            console.log("[KeyManager] Local cache loaded:", localState.slots.length, "slots");
            this.state = localState;
            this.notifyListeners();
          }
          setTimeout(() => {
            this.loadFromCloud().then(() => {
              this.subscribeRealtime(userId);
            });
          }, 100);
        } else {
          console.log("[KeyManager] User logout");
          this.state = this.loadState();
          this.notifyListeners();
        }
      }
      realtimeChannel = null;
      subscribeRealtime(userId) {
        console.log("[KeyManager] Connecting realtime sync channel...");
        this.realtimeChannel = supabase.channel(`profiles:${userId}`).on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "profiles",
            filter: `id=eq.${userId}`
          },
          async (payload) => {
            console.log("[KeyManager] Cloud update received:", payload);
            if (!this.isSyncing) {
              await this.loadFromCloud();
            }
          }
        ).subscribe();
      }
      unsubscribeRealtime() {
        if (this.realtimeChannel) {
          console.log("[KeyManager] Disconnect realtime sync channel");
          supabase.removeChannel(this.realtimeChannel);
          this.realtimeChannel = null;
        }
      }
      /**
       * Load state from Supabase (Cloud is Source of Truth)
       */
      /**
       * Load state from Supabase (Cloud is Source of Truth)
       */
      async loadFromCloud() {
        if (!this.userId) return;
        if (this.userId.startsWith("dev-user-")) return;
        try {
          this.isSyncing = true;
          console.log("[KeyManager] Loading cloud state...");
          const { data, error } = await supabase.from("profiles").select("user_apis").eq("id", this.userId).single();
          if (error) {
            if (error.code !== "PGRST116") {
              console.warn("[KeyManager] Cloud fetch failed:", error);
            }
            return;
          }
          if (data && data.user_apis) {
            let cloudSlots = data.user_apis;
            if (Array.isArray(cloudSlots)) {
              cloudSlots = cloudSlots.map((s) => {
                const provider = s.provider || "Google";
                const keyType = determineKeyType(provider, s.baseUrl);
                const format = normalizeApiProtocolFormat(
                  s.format,
                  provider === "Google" && keyType === "official" ? "gemini" : "auto"
                );
                const runtime = resolveProviderRuntime({
                  provider,
                  baseUrl: s.baseUrl,
                  format,
                  authMethod: s.authMethod,
                  headerName: s.headerName,
                  compatibilityMode: s.compatibilityMode
                });
                const authMethod = runtime.authMethod;
                return {
                  ...s,
                  name: s.name || "Cloud Key",
                  provider,
                  totalCost: s.totalCost || 0,
                  budgetLimit: s.budgetLimit !== void 0 ? s.budgetLimit : -1,
                  tokenLimit: s.tokenLimit !== void 0 ? s.tokenLimit : -1,
                  disabled: s.disabled || false,
                  createdAt: s.createdAt || Date.now(),
                  failCount: s.failCount || 0,
                  successCount: s.successCount || 0,
                  lastUsed: s.lastUsed || null,
                  lastError: s.lastError || null,
                  status: s.status || "unknown",
                  weight: s.weight || 50,
                  timeout: s.timeout || 3e4,
                  maxRetries: s.maxRetries || 2,
                  retryDelay: s.retryDelay || 1e3,
                  type: keyType,
                  format,
                  authMethod,
                  headerName: s.headerName || runtime.headerName,
                  compatibilityMode: runtime.compatibilityMode
                };
              });
              cloudSlots = cloudSlots.map((s) => {
                const isGoogle = s.provider === "Google" || s.provider === "Gemini";
                let newProvider = s.provider;
                if (s.provider === "Gemini" && !s.baseUrl) newProvider = "Google";
                if (s.provider === "Google" && s.baseUrl && !s.baseUrl.includes("googleapis.com")) newProvider = "Custom";
                if (isGoogle) {
                  const currentModels = (s.supportedModels || []).filter((m) => isGoogleOfficialModelId(parseModelString(m).id));
                  const missingDefaults = DEFAULT_GOOGLE_MODELS.filter((m) => !currentModels.includes(m));
                  if (missingDefaults.length > 0 || newProvider !== s.provider) {
                    console.log(`[KeyManager] Cloud Sync: Auto-adding models/fixing provider for key ${s.name}`);
                    return {
                      ...s,
                      provider: "Google",
                      supportedModels: [...currentModels, ...missingDefaults]
                    };
                  }
                }
                return s;
              });
              this.state.slots = cloudSlots;
              console.log("[KeyManager] Cloud sync completed (overwrite mode). Keys:", this.state.slots.length);
              this.notifyListeners();
            }
          }
        } catch (e) {
          console.error("[KeyManager] Error loading from cloud:", e);
        } finally {
          this.isSyncing = false;
        }
      }
      /**
       * Update budgets and usage from Cloud (called by CostService)
       */
      updateBudgetsFromCloud(budgets) {
        const slots = this.state.slots;
        let changed = false;
        budgets.forEach((b) => {
          const slot = slots.find((s) => s.id === b.id);
          if (slot) {
            if (b.budget !== void 0 && slot.budgetLimit !== b.budget) {
              slot.budgetLimit = b.budget;
              changed = true;
            }
            if (b.used !== void 0 && (slot.totalCost || 0) < b.used) {
              slot.totalCost = b.used;
              changed = true;
            }
          }
        });
        if (changed) {
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Save state to Supabase
       */
      async saveToCloud(state) {
        if (!this.userId || this.userId.startsWith("dev-user-")) {
          console.log("[KeyManager] Skip cloud upload (missing userId or dev user)");
          return;
        }
        if (Date.now() < this.cloudSyncBackoffUntil) {
          return;
        }
        try {
          console.log("[KeyManager] Uploading to Supabase...", {
            userId: this.userId,
            slotCount: state.slots.length
          });
          const { data: { user }, error: authError } = await supabase.auth.getUser();
          if (authError || !user) {
            console.error("[KeyManager] User auth invalid or session expired!", authError);
            return;
          }
          console.log("[KeyManager] User validation succeeded:", user.id);
          if (user.id !== this.userId) {
            console.error("[KeyManager] userId mismatch:", {
              expected: this.userId,
              actual: user.id
            });
            this.userId = user.id;
          }
          const uploadData = {
            id: user.id,
            user_apis: state.slots,
            updated_at: (/* @__PURE__ */ new Date()).toISOString()
          };
          console.log("[KeyManager] Running update...", {
            id: uploadData.id,
            model_count: state.slots[0]?.supportedModels?.length
          });
          const { error } = await supabase.from("profiles").update({
            user_apis: uploadData.user_apis,
            updated_at: uploadData.updated_at
          }).eq("id", user.id);
          if (error) {
            const isNetworkError = error.message?.includes("fetch") || error.message?.includes("Network");
            if (isNetworkError) {
              console.warn("[KeyManager] \u7F51\u7EDC\u5F02\u5E38\uFF0C\u8DF3\u8FC7\u672C\u6B21 Supabase \u66F4\u65B0\uFF0C\u7A0D\u540E\u91CD\u8BD5");
              this.cloudSyncBackoffUntil = Date.now() + 3e4;
              return;
            }
            console.error("[KeyManager] Supabase update failed!", {
              code: error.code,
              message: error.message,
              details: error.details,
              hint: error.hint
            });
            if (error.code === "42501" || error.message.includes("policy")) {
              console.error("[KeyManager] RLS policy blocked update. Check Supabase RLS settings.");
              this.cloudSyncBackoffUntil = Date.now() + 5 * 6e4;
              return;
            }
            throw error;
          }
          console.log("[KeyManager] Supabase upload succeeded!");
          this.cloudSyncBackoffUntil = 0;
          const { forceSync: forceSync2 } = await Promise.resolve().then(() => (init_costService(), costService_exports));
          forceSync2().catch(console.error);
        } catch (e) {
          const isNetworkError = e.message?.includes("fetch") || e.message?.includes("Network");
          if (!isNetworkError) {
            console.error("[KeyManager] saveToCloud failed:", e);
          }
        }
      }
      /**
       * Notify all listeners of state change
       */
      notifyListeners() {
        this.globalModelListCache = null;
        this.listeners.forEach((fn) => fn());
      }
      /**
       * Subscribe to state changes
       */
      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      /**
       * 棣冩畬 濞撳懘娅庨崗銊ョ湰濡€崇€佛珨勬銆冪紓鎻跨摠閿涘煔皤焺 adminModelService 閺佺増宓佹棆瀛樻煀闀炴儼黏線閻㈩煉绾?
       */
      clearGlobalModelListCache() {
        this.globalModelListCache = null;
        console.log("[KeyManager] Global model list cache cleared");
      }
      /**
       * 棣冩畬 瀵搫鍩楅槂姘辩叀闀撯偓閾惧顓归槖鍛扳偓鍜冪焊瑜?adminModelService 閺佺増宓佹棆瀛樻煀闀炴儼黏線閻㈩煉绾?
       */
      forceNotify() {
        console.log("[KeyManager] Force notifying all listeners");
        this.notifyListeners();
      }
      /**
       * Test a potential channel connection
       */
      async testChannel(url, key, provider, authMethod, headerName, format) {
        try {
          const cleanKey = key.replace(/[^\x00-\x7F]/g, "").trim();
          if (!cleanKey) return { success: false, message: "API Key \u65E0\u6548\uFF08\u4EC5\u652F\u6301 ASCII / \u82F1\u6587\u5B57\u7B26\uFF09" };
          let targetUrl = url;
          const headers = {};
          const cleanUrl = url.replace(/\/chat\/completions$/, "").replace(/\/$/, "");
          const runtime = resolveProviderRuntime({
            provider,
            baseUrl: cleanUrl,
            format,
            authMethod,
            headerName
          });
          const resolvedAuthMethod = runtime.authMethod;
          const resolvedHeader = runtime.headerName;
          if (runtime.geminiNative || runtime.resolvedFormat === "gemini") {
            if (cleanUrl === "https://generativelanguage.googleapis.com") {
              targetUrl = `${cleanUrl}/v1beta/models`;
            } else if (!cleanUrl.endsWith("/models")) {
              targetUrl = `${cleanUrl}/models`;
            }
            if (resolvedAuthMethod === "query") {
              targetUrl = `${targetUrl}?key=${cleanKey}`;
            } else {
              headers[resolvedHeader] = cleanKey;
            }
          } else {
            const cleanBaseUrl = cleanUrl.replace(/\/v1$/, "").replace(/\/v1\/models$/, "").replace(/\/models$/, "");
            targetUrl = `${cleanBaseUrl}/v1/models`;
            const headerValue = resolvedHeader.toLowerCase() === "authorization" ? formatAuthorizationHeaderValue(cleanKey, runtime.authorizationValueFormat) : cleanKey;
            headers[resolvedHeader] = headerValue;
          }
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort("Request Timed Out"), 15e3);
          try {
            const response = await fetch(targetUrl, {
              method: "GET",
              headers,
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (response.ok) {
              return { success: true };
            }
            let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
            try {
              const errorData = await response.json();
              if (errorData.error && errorData.error.message) {
                errorMsg = errorData.error.message;
              }
            } catch (e) {
            }
            return { success: false, message: errorMsg };
          } catch (e) {
            clearTimeout(timeoutId);
            const isAbort = e.name === "AbortError" || e.message?.includes("aborted");
            return {
              success: false,
              message: isAbort ? "Request Timed Out (Check Network/Proxy)" : e.message || "Connection failed"
            };
          }
        } catch (e) {
          return { success: false, message: e.message || "Connection failed" };
        }
      }
      /**
       * Fetch available models from a remote API
       * Returns a list of model IDs or empty array on failure
       * SIDE EFFECT: Updates GOOGLE_MODEL_METADATA with rich info if available
       */
      async fetchRemoteModels(baseUrl, key, authMethod, headerName, provider, format) {
        try {
          const cleanUrl = baseUrl.replace(/\/chat\/completions$/, "").replace(/\/$/, "");
          const runtime = resolveProviderRuntime({
            provider,
            baseUrl: cleanUrl,
            format,
            authMethod,
            headerName
          });
          const resolvedAuthMethod = runtime.authMethod;
          const resolvedHeader = runtime.headerName;
          const headers = {
            "Content-Type": "application/json"
          };
          if (resolvedAuthMethod !== "query") {
            headers[resolvedHeader] = resolvedHeader.toLowerCase() === "authorization" ? formatAuthorizationHeaderValue(key, runtime.authorizationValueFormat) : key;
          }
          if (cleanUrl.includes("openrouter.ai")) {
            headers["HTTP-Referer"] = window.location.origin;
            headers["X-Title"] = "KK Studio";
          }
          if (runtime.geminiNative || runtime.resolvedFormat === "gemini") {
            const response = await fetch(
              buildGeminiModelsEndpoint(cleanUrl, key, resolvedAuthMethod, typeof provider === "string" ? provider : void 0),
              {
                method: "GET",
                headers: buildGeminiHeaders(resolvedAuthMethod, key, resolvedHeader, runtime.authorizationValueFormat)
              }
            );
            if (!response.ok) {
              return [];
            }
            const data = await response.json();
            const geminiModels = data.models || data.data || [];
            return geminiModels.map((model) => String(model?.name || model?.id || model?.model || "").replace(/^models\//i, "")).filter(Boolean);
          }
          let targetUrls = [
            cleanUrl.endsWith("/models") ? cleanUrl : `${cleanUrl}/models`
          ];
          if (!cleanUrl.match(/\/v1\/?$/) && !cleanUrl.match(/\/v1beta\/?$/)) {
            targetUrls.push(`${cleanUrl}/v1/models`);
            targetUrls.push(`${cleanUrl}/v1beta/models`);
          }
          targetUrls = [...new Set(targetUrls)];
          for (const url of targetUrls) {
            try {
              const fullUrl = resolvedAuthMethod === "query" ? `${url}?key=${key}` : url;
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort("Request Timed Out"), 8e3);
              const response = await fetch(fullUrl, {
                method: "GET",
                headers,
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (response.ok) {
                const data = await response.json();
                const list = data.data || data.models || [];
                if (Array.isArray(list)) {
                  list.forEach((m) => {
                    const id = m.id || m.name;
                    if (!id) return;
                    const existing = GOOGLE_MODEL_METADATA.get(id);
                    const metadata = {
                      name: m.name || existing?.name || id,
                      description: m.description || existing?.description,
                      // OpenRouter specific fields
                      contextLength: m.context_length || m.context_window,
                      pricing: m.pricing
                      // { prompt: "0.000001", completion: "0.000002" } check API docs
                    };
                    if (id.endsWith(":free")) {
                      metadata.pricing = { prompt: "0", completion: "0" };
                    }
                    GOOGLE_MODEL_METADATA.set(id, { ...existing, ...metadata });
                  });
                  let models = list.map((m) => {
                    const id = m.id || m.name;
                    return id ? id.replace(/^models\//, "") : null;
                  }).filter(Boolean);
                  if (provider === "Google") {
                    const googleModelIds = GOOGLE_CHAT_MODELS.map((m) => m.id);
                    googleModelIds.forEach((modelId) => {
                      if (!models.includes(modelId)) {
                        models.push(modelId);
                      }
                    });
                  }
                  Object.entries(MODEL_REGISTRY).forEach(([id, m]) => {
                    const isTargetBanana = id === "gemini-3.1-flash-image-preview" || id === "gemini-3-pro-image-preview";
                    if (m.isSystemInternal && isTargetBanana) {
                      const modelIdWithSuffix = `${id}@system`;
                      if (!models.includes(modelIdWithSuffix)) {
                        models.push(modelIdWithSuffix);
                      }
                    }
                  });
                  try {
                    const pricingUrl = cleanUrl.endsWith("/v1") ? cleanUrl.replace(/\/v1$/, "") + "/pricing" : cleanUrl + "/pricing";
                    fetch(pricingUrl, {
                      method: "GET",
                      headers
                    }).then(async (pricingRes) => {
                      if (pricingRes.ok) {
                        const pricingData = await pricingRes.json();
                        if (pricingData && (pricingData.data || Array.isArray(pricingData))) {
                          const { mergeModelPricingOverrides: mergeModelPricingOverrides2 } = await Promise.resolve().then(() => (init_modelPricing(), modelPricing_exports));
                          mergeModelPricingOverrides2(pricingData);
                        }
                      }
                    }).catch((e) => {
                      console.log("[KeyManager] Silent pricing fetch failed or unsupported:", e);
                    });
                  } catch (e) {
                    console.log("[KeyManager] Silent pricing fetch setup failed:", e);
                  }
                  return models;
                }
              }
            } catch {
            }
          }
          return [];
        } catch (e) {
          console.error("Fetch models failed", e);
          return [];
        }
      }
      /**
       * Set rotation strategy
       */
      setStrategy(strategy) {
        this.state.rotationStrategy = strategy;
        this.saveState();
        this.notifyListeners();
      }
      /**
       * Get the current rotation strategy
       */
      getStrategy() {
        return this.state.rotationStrategy || "round-robin";
      }
      /**
       * Get the best available channel for a specific model
       * Strategy:
       * 1. Filter channels that support the model
       * 2. Filter healthy channels (Active, Valid, Budget OK)
       * 3. Apply Rotation Strategy (Round Robin vs Sequential)
       */
      getNextKey(modelId, preferredKeyId) {
        const [baseIdPart, suffix] = modelId.split("@");
        let normalizedModelId = baseIdPart.replace(/^models\//, "");
        const lowerRequested = normalizedModelId.toLowerCase();
        if (lowerRequested === "nano banana pro") {
          normalizedModelId = "gemini-3-pro-image-preview";
        } else if (lowerRequested === "nano banana") {
          normalizedModelId = "gemini-2.5-flash-image";
        } else if (lowerRequested === "nano banana 2") {
          normalizedModelId = "gemini-3.1-flash-image-preview";
        }
        if (!suffix && MODEL_MIGRATION_MAP[normalizedModelId]) {
          normalizedModelId = MODEL_MIGRATION_MAP[normalizedModelId];
        }
        const isCreditModel = normalizedModelId.includes("nano-banana") || normalizedModelId.includes("gemini-3.1-flash-image") || normalizedModelId.includes("gemini-3-pro-image") || normalizedModelId === "gemini-2.5-flash-image" || normalizedModelId.includes("lyria");
        this.loadProviders();
        const providerSlots = this.providers.filter((p) => p.isActive).map((p) => {
          const provider = ["Google", "OpenAI", "Anthropic", "Volcengine", "Aliyun", "Tencent", "SiliconFlow", "12AI"].includes(p.name) ? p.name : "Custom";
          const format = normalizeApiProtocolFormat(p.format, "auto");
          const runtime = resolveProviderRuntime({
            provider,
            baseUrl: p.baseUrl,
            format
          });
          const authMethod = runtime.authMethod;
          return {
            id: p.id,
            key: p.apiKey,
            name: p.name,
            provider,
            baseUrl: p.baseUrl,
            format,
            authMethod,
            headerName: runtime.headerName,
            group: p.group,
            status: "valid",
            budgetLimit: -1,
            totalCost: 0,
            successCount: 0,
            failCount: 0,
            supportedModels: p.models,
            type: "third-party",
            lastUsed: 0,
            lastError: null,
            disabled: false,
            createdAt: 0,
            proxyConfig: {
              serverUrl: p.baseUrl,
              serverName: p.name,
              isEnabled: true
            }
          };
        });
        const effectiveUserSlots = this.state.slots.map((slot) => {
          const linkedProvider = this.findLinkedProviderForSlot(slot);
          if (!linkedProvider) return slot;
          const effectiveSlot = this.buildEffectiveSlotFromProvider(slot, linkedProvider);
          if (String(effectiveSlot.key || "").trim() !== String(slot.key || "").trim()) {
            console.log(
              `[KeyManager] Overriding legacy slot at runtime from provider ${linkedProvider.name}: ${slot.name}[${slot.id}] -> ${linkedProvider.id}`
            );
          }
          return effectiveSlot;
        });
        const allSlots = [...effectiveUserSlots, ...providerSlots];
        const modelSupportedBySlot = (slot) => {
          const supported = slot.supportedModels || [];
          if (supported.includes("*")) return true;
          return supported.some((m) => {
            const parts = parseModelString(m);
            const id = parts.id.replace(/^models\//, "");
            return id === normalizedModelId;
          });
        };
        const isSlotHealthy = (slot) => {
          if (slot.disabled) return false;
          if (slot.budgetLimit > 0 && slot.totalCost >= slot.budgetLimit) return false;
          return true;
        };
        const matchesRequestedRoute = (slot) => {
          if (!suffix) {
            return slot.provider === "Google";
          }
          return matchesSlotRouteSuffix(slot, suffix);
        };
        if (preferredKeyId) {
          const normalizedPreferredKeyId = String(preferredKeyId).trim().toLowerCase();
          const preferredRouteTarget = extractSlotRouteTarget(normalizedPreferredKeyId);
          const preferred = allSlots.find((s) => {
            const slotIdLower = String(s.id || "").trim().toLowerCase();
            return slotIdLower === normalizedPreferredKeyId || !!preferredRouteTarget && slotIdLower === preferredRouteTarget;
          });
          if (preferred && isSlotHealthy(preferred) && modelSupportedBySlot(preferred) && matchesRequestedRoute(preferred)) {
            return this.prepareKeyResult(preferred);
          }
          if (!suffix) {
            console.warn(`[KeyManager] Preferred key unavailable for model=${normalizedModelId}, fallback to normal routing. preferredKeyId=${preferredKeyId}`);
          }
        }
        let candidates = [];
        if (!suffix) {
          candidates = allSlots.filter((s) => s.provider === "Google" || s.provider === "Gemini");
          let strictCandidates = candidates.filter((s) => modelSupportedBySlot(s));
          if (strictCandidates.length > 0) {
            candidates = strictCandidates;
          } else {
            console.warn(`[KeyManager] \u93B5\u53E5\u7B09\u9352\u677F\u757C\u93C2?Key: ${normalizedModelId}`);
          }
        } else {
          const normalizedSuffix = String(suffix || "").trim().toLowerCase();
          const isSystemRoute = normalizedSuffix.startsWith("system") || normalizedSuffix === "systemproxy";
          const proxyAliasSet = /* @__PURE__ */ new Set(["custom", "proxy", "proxied", "system", "builtin"]);
          if (isSystemRoute) {
            return this.prepareKeyResult({
              id: `backend_proxy_${normalizedModelId}`,
              key: "system-proxy-managed-key",
              name: "System Internal",
              provider: "SystemProxy",
              status: "valid",
              budgetLimit: -1,
              totalCost: 0,
              successCount: 0,
              failCount: 0,
              supportedModels: [normalizedModelId],
              type: "proxy",
              lastUsed: Date.now(),
              lastError: null,
              disabled: false,
              createdAt: Date.now()
            });
          } else {
            const routeTarget = extractSlotRouteTarget(normalizedSuffix);
            const nameMatchedCandidates = allSlots.filter((s) => {
              if (routeTarget) {
                return String(s.id || "").trim().toLowerCase() === routeTarget;
              }
              return matchesSlotRouteSuffix(s, normalizedSuffix);
            });
            let modelFilteredCandidates = nameMatchedCandidates.filter((s) => modelSupportedBySlot(s));
            if (nameMatchedCandidates.length > 0 && modelFilteredCandidates.length === 0) {
              console.log(`[KeyManager] Name-matched candidates for suffix '${normalizedSuffix}' but model filter rejected '${normalizedModelId}', fallback to name matches.`);
              candidates = nameMatchedCandidates;
            } else if (modelFilteredCandidates.length > 0) {
              candidates = modelFilteredCandidates;
            } else {
              candidates = [];
            }
            if (candidates.length === 0 && proxyAliasSet.has(normalizedSuffix)) {
              candidates = allSlots.filter((s) => {
                if (s.provider === "Google") return false;
                return modelSupportedBySlot(s);
              });
            }
            console.log(
              `[KeyManager] Suffix='${normalizedSuffix}', routeTarget='${routeTarget || ""}', NameMatched=${nameMatchedCandidates.length}, ModelFiltered=${modelFilteredCandidates.length}, FinalCandidates=${candidates.length}` + (candidates.length > 0 ? ` -> ${candidates.map((c) => `${c.name}[${c.id}]@${String(c.baseUrl || "").trim() || "no-base-url"}`).join(", ")}` : "")
            );
          }
        }
        const validCandidates = [];
        const budgetExhausted = [];
        const disabled = [];
        for (const s of candidates) {
          if (s.disabled) {
            disabled.push(s);
            continue;
          }
          if (s.budgetLimit > 0 && (s.totalCost || 0) >= s.budgetLimit) {
            budgetExhausted.push(s);
            continue;
          }
          validCandidates.push(s);
        }
        if (validCandidates.length === 0) {
          if (!suffix && (normalizedModelId.startsWith("gemini-") || normalizedModelId.startsWith("imagen-") || normalizedModelId.startsWith("veo-"))) {
            const healingCandidates = this.state.slots.filter(
              (s) => (s.provider === "Google" || s.provider === "Gemini") && !s.disabled && (s.budgetLimit < 0 || (s.totalCost || 0) < s.budgetLimit)
            );
            if (healingCandidates.length > 0) {
              console.log(`[KeyManager] JIT Healing: Valid Google key found, auto-authorizing ${normalizedModelId}`);
              const selected = healingCandidates[0];
              if (!selected.supportedModels) selected.supportedModels = [];
              if (!selected.supportedModels.includes(normalizedModelId)) {
                selected.supportedModels.push(normalizedModelId);
                this.saveState();
              }
              return this.prepareKeyResult(selected);
            }
          }
          return null;
        }
        const now = Date.now();
        const cooldownFiltered = validCandidates.filter((s) => {
          if (s.provider === "SystemProxy" || s.id?.startsWith("backend_proxy")) return true;
          if (s.cooldownUntil && now < s.cooldownUntil) return false;
          if (s.status !== "rate_limited") return true;
          if (!s.lastUsed) return false;
          return now - s.lastUsed >= RATE_LIMIT_COOLDOWN_MS;
        });
        const healthy = cooldownFiltered.filter((s) => s.status !== "invalid" && s.status !== "rate_limited");
        let usable = healthy.length > 0 ? healthy : cooldownFiltered;
        if (usable.length === 0) {
          const blocked = validCandidates.filter(
            (s) => s.status === "rate_limited" && s.lastUsed && now - s.lastUsed < RATE_LIMIT_COOLDOWN_MS || !!s.cooldownUntil && now < s.cooldownUntil
          );
          if (blocked.length > 0) {
            const shortestWaitMs = Math.min(...blocked.map((s) => {
              const rateLimitWait = s.lastUsed ? Math.max(0, RATE_LIMIT_COOLDOWN_MS - (now - s.lastUsed)) : RATE_LIMIT_COOLDOWN_MS;
              const explicitWait = s.cooldownUntil ? Math.max(0, s.cooldownUntil - now) : 0;
              return Math.max(rateLimitWait, explicitWait);
            }));
            console.warn(`[KeyManager] All matching keys are in rate-limit cooldown. Fallback enabled. Earliest retry in ~${Math.ceil(shortestWaitMs / 1e3)}s`);
          }
          usable = validCandidates;
        }
        if (usable.length === 0) return null;
        usable.sort((a, b) => {
          if (a.status === "valid" && b.status !== "valid") return -1;
          if (a.status !== "valid" && b.status === "valid") return 1;
          return 0;
        });
        const strategy = this.state.rotationStrategy || "round-robin";
        let winner;
        if (strategy === "sequential") {
          winner = usable[0];
        } else {
          const topStatus = usable[0].status;
          const topTier = usable.filter((s) => s.status === topStatus);
          winner = topTier[Math.floor(Math.random() * topTier.length)];
        }
        return this.prepareKeyResult(winner);
      }
      /**
       * Get available proxy models with default capabilities
       * Used by modelCapabilities.ts
       */
      getAvailableProxyModels() {
        const models = /* @__PURE__ */ new Map();
        const defaultRatios = ["1:1", "3:4", "4:3", "9:16", "16:9", "21:9", "2:3", "3:2"];
        const defaultSizes = ["1024x1024", "1344x768", "768x1344"];
        this.state.slots.forEach((s) => {
          if (s.baseUrl && !s.disabled && s.status !== "invalid") {
            (s.supportedModels || []).forEach((m) => {
              if (!models.has(m)) {
                models.set(m, {
                  id: m,
                  supportedAspectRatios: defaultRatios,
                  supportedSizes: defaultSizes,
                  supportsGrounding: false
                });
              }
            });
          }
        });
        return Array.from(models.values());
      }
      /**
       * Helper to format the key result and update metadata
       */
      prepareKeyResult(slot) {
        if (slot.provider !== "SystemProxy" && !slot.id?.startsWith("backend_proxy")) {
          const actualSlot = this.state.slots.find((s) => s.id === slot.id);
          if (actualSlot) {
            actualSlot.lastUsed = Date.now();
            this.saveState();
          }
        }
        return {
          id: slot.id,
          key: slot.key,
          name: slot.name || slot.provider || "Unnamed Channel",
          baseUrl: slot.baseUrl || GOOGLE_API_BASE,
          authMethod: slot.authMethod || getDefaultAuthMethod(slot.baseUrl || GOOGLE_API_BASE, {
            provider: slot.provider,
            format: slot.format
          }),
          headerName: slot.headerName || resolveProviderRuntime({
            provider: slot.provider,
            baseUrl: slot.baseUrl || GOOGLE_API_BASE,
            format: slot.format,
            authMethod: slot.authMethod || getDefaultAuthMethod(slot.baseUrl || GOOGLE_API_BASE, {
              provider: slot.provider,
              format: slot.format
            }),
            compatibilityMode: slot.compatibilityMode
          }).headerName,
          compatibilityMode: resolveProviderRuntime({
            provider: slot.provider,
            baseUrl: slot.baseUrl || GOOGLE_API_BASE,
            format: slot.format,
            authMethod: slot.authMethod,
            headerName: slot.headerName,
            compatibilityMode: slot.compatibilityMode
          }).compatibilityMode,
          group: slot.group,
          provider: slot.provider || "Google",
          timeout: slot.timeout,
          customHeaders: slot.customHeaders,
          customBody: slot.customBody,
          cooldownUntil: slot.cooldownUntil
        };
      }
      /**
       * Report successful API call
       */
      reportSuccess(keyId) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (slot) {
          slot.status = "valid";
          slot.successCount++;
          slot.failCount = 0;
          slot.lastError = null;
          slot.cooldownUntil = void 0;
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Report failed API call
       */
      reportFailure(keyId, error) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (slot) {
          slot.failCount++;
          slot.lastError = error;
          slot.lastUsed = Date.now();
          const lowerError = String(error || "").toLowerCase();
          const isRateLimit = lowerError.includes("429") || lowerError.includes("rate limit") || lowerError.includes("too many requests") || lowerError.includes("quota exceeded");
          const isAuthError2 = hasAuthErrorMarkers(error) || lowerError.includes("authentication") || lowerError.includes("permission denied") || lowerError.includes("permission_denied");
          if (slot.provider === "SystemProxy" || slot.id?.startsWith("backend_proxy")) {
            console.warn(`[KeyManager] SystemProxy error reported but not changing cooldown state: ${error}`);
          } else if (isRateLimit) {
            slot.status = "rate_limited";
            slot.cooldownUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          } else if (isAuthError2) {
            slot.status = "invalid";
            slot.cooldownUntil = void 0;
          } else {
            slot.status = "unknown";
            const transientBackoff = Math.min(15e3, 2e3 * Math.max(1, slot.failCount));
            slot.cooldownUntil = Date.now() + transientBackoff;
          }
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Toggle disabled state for manual pause/resume
       * 皎睂鍌氫粻闀?key 娴兼氨些皤攧浼淬€庢惔蹇涙Е皤攧妤佹堡鐏?
       */
      toggleKey(keyId) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (slot) {
          slot.disabled = !slot.disabled;
          if (!slot.disabled) {
            slot.status = "valid";
            slot.failCount = 0;
            slot.lastError = null;
            slot.cooldownUntil = void 0;
          }
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Update quota information for a key
       */
      updateQuota(keyId, quota) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (slot && quota) {
          slot.quota = quota;
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Add exact cost usage to a key (syncs with CostService)
       */
      addCost(keyId, cost) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (!slot) return;
        const previousCost = slot.totalCost || 0;
        slot.totalCost = previousCost + cost;
        if (slot.budgetLimit > 0) {
          const usageRatio = slot.totalCost / slot.budgetLimit;
          const previousRatio = previousCost / slot.budgetLimit;
          if (usageRatio >= 0.9 && previousRatio < 0.9) {
            Promise.resolve().then(() => (init_notificationService(), notificationService_exports)).then(({ notify: notify2 }) => {
              notify2.warning(
                "Budget warning",
                `API Key "${slot.name}" is using ${(usageRatio * 100).toFixed(0)}% of its budget ($${slot.totalCost.toFixed(2)} / $${slot.budgetLimit}).`
              );
            });
          }
          if (usageRatio >= 1 && previousRatio < 1) {
            Promise.resolve().then(() => (init_notificationService(), notificationService_exports)).then(({ notify: notify2 }) => {
              notify2.error(
                "Budget exhausted",
                `API Key "${slot.name}" reached its budget limit. Recharge or increase the budget to continue.`
              );
            });
          }
        }
        this.saveState();
        this.notifyListeners();
      }
      /**
       * Reset usage statistics for a key.
       */
      resetUsage(keyId) {
        const slot = this.state.slots.find((s) => s.id === keyId);
        if (!slot) return;
        slot.totalCost = 0;
        slot.failCount = 0;
        slot.successCount = 0;
        slot.status = "unknown";
        this.saveState();
        this.notifyListeners();
        console.log(`[KeyManager] Usage reset for key ${slot.name} (${keyId})`);
      }
      /**
       * Clear all keys (for example on user switch).
       */
      clearAll() {
        this.state.slots = [];
        this.state.currentIndex = 0;
        this.saveState();
        this.notifyListeners();
      }
      /**
       * Reorder slots for manual sorting.
       */
      reorderSlots(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.state.slots.length || toIndex < 0 || toIndex >= this.state.slots.length) {
          return;
        }
        const slots = [...this.state.slots];
        const [moved] = slots.splice(fromIndex, 1);
        slots.splice(toIndex, 0, moved);
        this.state.slots = slots;
        this.saveState();
        this.notifyListeners();
      }
      async addKey(key, options) {
        const trimmedKey = key.replace(/[^\x00-\x7F]/g, "").trim();
        if (!trimmedKey) {
          return { success: false, error: "\u8BF7\u8F93\u5165\u6709\u6548\u7684 API Key\uFF08\u4EC5\u4FDD\u7559 ASCII \u5B57\u7B26\uFF09\u3002" };
        }
        if (this.state.slots.some((s) => s.key === trimmedKey && s.baseUrl === options?.baseUrl)) {
          return { success: false, error: "\u8BE5 API Key \u5DF2\u5B58\u5728\uFF0C\u8BF7\u52FF\u91CD\u590D\u6DFB\u52A0\u3002" };
        }
        const baseUrl = options?.baseUrl || "";
        const keyType = determineKeyType(options?.provider || "Custom", baseUrl);
        const format = normalizeApiProtocolFormat(
          options?.format,
          options?.provider === "Google" && keyType === "official" ? "gemini" : "auto"
        );
        const runtime = resolveProviderRuntime({
          provider: options?.provider || "Custom",
          baseUrl,
          format,
          authMethod: options?.authMethod,
          headerName: options?.headerName,
          compatibilityMode: options?.compatibilityMode
        });
        const authMethod = runtime.authMethod;
        const headerName = runtime.headerName;
        let supportedModels = options?.supportedModels || [];
        if (options?.provider === "Google") {
          const googleModelIds = GOOGLE_CHAT_MODELS.map((m) => m.id);
          googleModelIds.forEach((modelId) => {
            if (!supportedModels.includes(modelId)) {
              supportedModels.push(modelId);
            }
          });
        }
        supportedModels = normalizeModelList(supportedModels, options?.provider);
        const newSlot = {
          id: `key_${Date.now()}`,
          key: trimmedKey,
          name: options?.name || "My Channel",
          // Default provider logic
          provider: options?.provider || "Custom",
          // Default type logic using helper
          type: options?.type || keyType,
          format,
          baseUrl,
          authMethod,
          headerName,
          compatibilityMode: runtime.compatibilityMode,
          supportedModels,
          status: "unknown",
          failCount: 0,
          successCount: 0,
          lastUsed: null,
          lastError: null,
          disabled: false,
          createdAt: Date.now(),
          totalCost: 0,
          budgetLimit: options?.budgetLimit ?? -1,
          tokenLimit: options?.tokenLimit ?? -1,
          creditCost: options?.creditCost,
          proxyConfig: options?.proxyConfig,
          customHeaders: options?.customHeaders,
          customBody: options?.customBody,
          updatedAt: Date.now()
          // Initial timestamp
        };
        this.state.slots.push(newSlot);
        this.saveState();
        this.notifyListeners();
        return {
          success: true,
          id: newSlot.id
        };
      }
      /**
       * Remove an API key
       */
      removeKey(keyId) {
        this.state.slots = this.state.slots.filter((s) => s.id !== keyId);
        this.saveState();
        this.notifyListeners();
      }
      /**
      * Update an existing API key
      */
      async updateKey(id, updates) {
        console.log("[KeyManager] updateKey invoked:", {
          id,
          updates,
          supportedModelsBefore: this.state.slots.find((s) => s.id === id)?.supportedModels
        });
        const slot = this.state.slots.find((s) => s.id === id);
        if (slot) {
          Object.assign(slot, updates);
          if ((updates.provider || updates.baseUrl !== void 0) && !updates.type) {
            slot.type = determineKeyType(slot.provider, slot.baseUrl);
          }
          if (updates.format !== void 0 || updates.provider !== void 0 || updates.baseUrl !== void 0 || updates.authMethod !== void 0 || updates.headerName !== void 0 || updates.compatibilityMode !== void 0) {
            slot.format = normalizeApiProtocolFormat(
              updates.format ?? slot.format,
              slot.provider === "Google" && determineKeyType(slot.provider, slot.baseUrl) === "official" ? "gemini" : "auto"
            );
            const runtime = resolveProviderRuntime({
              provider: slot.provider,
              baseUrl: slot.baseUrl,
              format: slot.format,
              authMethod: updates.authMethod || slot.authMethod,
              headerName: updates.headerName || slot.headerName,
              compatibilityMode: updates.compatibilityMode || slot.compatibilityMode
            });
            slot.authMethod = runtime.authMethod;
            slot.headerName = runtime.headerName;
            slot.compatibilityMode = runtime.compatibilityMode;
          }
          if (updates.supportedModels) {
            slot.supportedModels = normalizeModelList(updates.supportedModels, slot.provider);
          }
          slot.updatedAt = Date.now();
          await this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Validate an API key by making a test request
       */
      /**
       * Validate an API key by making a test request.
       * @param syncModels If true, also fetches and returns the latest model list from the API.
       */
      async validateKey(key, provider = "Gemini", syncModels = false) {
        if (provider !== "Gemini" && provider !== "Google" && provider !== "Custom" && provider !== "OpenAI") {
          return { valid: true };
        }
        try {
          let isValid = false;
          let errorMsg = void 0;
          let fetchedModels = void 0;
          if (provider === "Gemini" || provider === "Google") {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
              { method: "GET" }
            );
            const limitRequests = response.headers.get("x-ratelimit-limit-requests");
            const remainingRequests = response.headers.get("x-ratelimit-remaining-requests");
            const resetRequests = response.headers.get("x-ratelimit-reset-requests");
            const existingSlot = this.state.slots.find((s) => s.key === key);
            if (existingSlot && (limitRequests || remainingRequests)) {
              const resetSeconds = resetRequests ? parseInt(resetRequests) || 0 : 0;
              this.updateQuota(existingSlot.id, {
                limitRequests: parseInt(limitRequests || "0"),
                remainingRequests: parseInt(remainingRequests || "0"),
                resetConstant: resetRequests || "",
                resetTime: Date.now() + resetSeconds * 1e3,
                updatedAt: Date.now()
              });
            }
            if (response.ok) {
              isValid = true;
            } else if (response.status === 429) {
              isValid = true;
              errorMsg = "\u6709\u6548\u4F46\u5DF2\u9650\u6D41";
            } else if (response.status === 401 || response.status === 403) {
              isValid = false;
              errorMsg = "API Key \u65E0\u6548";
            } else {
              isValid = false;
              errorMsg = `HTTP ${response.status}`;
            }
            if (isValid && syncModels) {
              fetchedModels = await fetchGoogleModels(key);
            }
          } else {
            return { valid: true };
          }
          return { valid: isValid, error: errorMsg, models: fetchedModels };
        } catch (e) {
          return { valid: false, error: e.message || "\u7F51\u7EDC\u9519\u8BEF" };
        }
      }
      /**
       * Update compatibility mode for a specific key (Persistence)
       * Used by GeminiService to remember working API format
       */
      setKeyCompatibilityMode(keyId, mode) {
        const slotIndex = this.state.slots.findIndex((s) => s.id === keyId);
        if (slotIndex === -1) return;
        console.log(`[KeyManager] Persisting compatibility mode for key ${keyId}: ${mode}`);
        this.state.slots[slotIndex].compatibilityMode = mode;
        this.saveState();
        this.notifyListeners();
      }
      getKey(id) {
        return this.state.slots.find((s) => s.id === id);
      }
      /**
       * Refresh a single key
       * 棣冩畬 Now also synchronizes model list!
       */
      async refreshKey(id) {
        const slot = this.state.slots.find((s) => s.id === id);
        if (slot) {
          console.log(`[KeyManager] Refreshing key ${id} (Syncing models: YES)`);
          const result = await this.validateKey(slot.key, slot.provider, true);
          slot.status = result.valid ? "valid" : "invalid";
          slot.lastError = result.error || null;
          if (result.valid) {
            slot.disabled = false;
            slot.failCount = 0;
            const resolvedFormat = resolveApiProtocolFormat(slot.format, slot.baseUrl);
            let newModels = result.models || [];
            if (!newModels.length && slot.baseUrl) {
              if (resolvedFormat === "gemini" || slot.provider === "Google") {
                newModels = await fetchGeminiCompatModels(slot.key, slot.baseUrl);
              } else {
                newModels = await fetchOpenAICompatModels(slot.key, slot.baseUrl);
              }
            }
            if (newModels.length > 0) {
              console.log(`[KeyManager] Sync success for ${id}. Overwriting models.`, {
                old: slot.supportedModels?.length,
                new: newModels.length
              });
              if (slot.provider === "Google") {
                slot.supportedModels = normalizeModelList(newModels, "Google").filter((m) => isGoogleOfficialModelId(parseModelString(m).id));
              } else {
                slot.supportedModels = normalizeModelList(newModels, slot.provider);
              }
            } else {
              console.warn(`[KeyManager] Refresh valid but no models found for ${id}. Keeping old list.`);
            }
          }
          this.saveState();
          this.notifyListeners();
        }
      }
      /**
       * Re-validate all keys
       */
      async revalidateAll() {
        for (const slot of this.state.slots) {
          const result = await this.validateKey(slot.key, slot.provider, false);
          slot.status = result.valid ? "valid" : "invalid";
          slot.lastError = result.error || null;
          if (result.valid) {
            slot.disabled = false;
            slot.failCount = 0;
          }
        }
        this.saveState();
        this.notifyListeners();
      }
      /**
       * 棣冩畬 [New] 閿枫劍鈧椒绗傞繑銉у殠鐠侯垵黏線閻劎绮ㄩ弸?
       * 閻㈤亶鈧倿鍘嗛崳銊ユ躬鐠囬攱鐪扮紒鎾存将閽栧氦黏線閻㈩煉绾撮悽銊ょ艾鐎圭偞妞傛棆瀛樻煀閸忋劑鍣虹痪鑳熅闀勫嫬浠存惔椋庡Ц闀?
       */
      reportCallResult(id, success, error) {
        const slot = this.state.slots.find((s) => s.id === id);
        if (!slot) return;
        slot.lastUsed = Date.now();
        if (success) {
          slot.failCount = 0;
          slot.successCount++;
          slot.status = "valid";
          slot.lastError = null;
        } else {
          slot.failCount++;
          slot.lastError = error || "Unknown error";
          if (slot.failCount >= (this.state.maxFailures || 5)) {
            slot.status = "invalid";
            console.warn(`[KeyManager] Channel ${slot.name} (${id}) failed repeatedly and was marked invalid.`);
          }
        }
        this.saveState();
        this.notifyListeners();
      }
      /**
       * Get validated global model list from all channels (Standard + Custom)
       */
      /**
       * Get validated global model list from all channels (Standard + Custom)
       * SORTING ORDER: User Custom Models (Top) -> Standard Google Models (Bottom)
       */
      getGlobalModelList() {
        const activeSlots = this.state.slots.filter((s) => !s.disabled && s.status !== "invalid");
        const slotsHash = `${activeSlots.length}-${activeSlots.map((s) => s.id).join(",")}`;
        const adminModels = [...adminModelService.getModels()].sort((left, right) => {
          const modelDiff = String(left.id || "").localeCompare(String(right.id || ""));
          if (modelDiff !== 0) return modelDiff;
          const priorityDiff = Number(right.priority || 0) - Number(left.priority || 0);
          if (priorityDiff !== 0) return priorityDiff;
          const weightDiff = Number(right.weight || 0) - Number(left.weight || 0);
          if (weightDiff !== 0) return weightDiff;
          return String(left.providerId || left.provider || "").localeCompare(
            String(right.providerId || right.provider || "")
          );
        });
        const adminHash = `${adminModels.length}-${adminModels.map((m) => `${m.id}:${m.providerId || ""}:${m.providerName || ""}:${m.displayName}:${m.priority || 0}:${m.weight || 0}:${m.mixWithSameModel ? "1" : "0"}:${m.colorStart}:${m.colorEnd}:${m.colorSecondary || ""}:${m.textColor || ""}:${m.creditCost}`).join(",")}`;
        this.loadProviders();
        const providerHash = `${this.providers.length}-${this.providers.map((p) => `${p.id}:${p.isActive ? "1" : "0"}:${p.models.length}:${p.updatedAt}`).join(",")}`;
        const combinedHash = `${slotsHash}|${adminHash}|${providerHash}`;
        const now = Date.now();
        if (this.globalModelListCache && this.globalModelListCache.slotsHash === combinedHash && now - this.globalModelListCache.timestamp < this.CACHE_TTL) {
          return this.globalModelListCache.models;
        }
        const uniqueModels = /* @__PURE__ */ new Map();
        const chatModelIds = new Set(GOOGLE_CHAT_MODELS.map((model) => model.id));
        const normalizeUserSourceSignaturePart = (value) => String(value || "").trim().replace(/\/+$/, "").toLowerCase();
        const userSlotSourceSignatures = new Set(
          this.state.slots.filter((slot) => !slot.disabled && slot.status !== "invalid" && !!slot.key).map((slot) => [
            normalizeUserSourceSignaturePart(slot.name || slot.proxyConfig?.serverName || slot.provider),
            normalizeUserSourceSignaturePart(slot.baseUrl),
            String(slot.key || "").trim()
          ].join("|")).filter((signature) => signature !== "||")
        );
        this.state.slots.forEach((slot) => {
          if (slot.disabled || slot.status === "invalid" || !slot.key) return;
          if (slot.supportedModels && slot.supportedModels.length > 0) {
            let cleanModels = normalizeModelList(slot.supportedModels, slot.provider);
            cleanModels.forEach((rawModelStr) => {
              const { id, name, description } = parseModelString(rawModelStr);
              if (id === "nano-banana" || id === "nano-banana-pro") return;
              let distinctId = id;
              const suffix = slot.name || slot.proxyConfig?.serverName || slot.provider || "Custom";
              if (slot.provider !== "Google") {
                distinctId = buildUserSlotRouteId(id, slot.id || suffix);
              }
              if (!uniqueModels.has(distinctId)) {
                const meta = GOOGLE_MODEL_METADATA.get(id);
                const registryInfo = MODEL_REGISTRY[id];
                const displayProvider = slot.provider === "Google" ? "Google" : suffix;
                uniqueModels.set(distinctId, {
                  id: distinctId,
                  name: name || registryInfo?.name || (meta ? meta.name : id),
                  provider: displayProvider,
                  providerLabel: slot.name || displayProvider,
                  isCustom: false,
                  isSystemInternal: false,
                  type: MODEL_TYPE_MAP.get(id) || inferModelType(id),
                  icon: registryInfo?.icon || meta?.icon,
                  description: description || registryInfo?.description || meta?.description || ""
                });
              }
            });
          }
        });
        this.providers.filter((provider) => provider.isActive && provider.apiKey && provider.baseUrl).forEach((provider) => {
          const providerSourceSignature = [
            normalizeUserSourceSignaturePart(provider.name),
            normalizeUserSourceSignaturePart(provider.baseUrl),
            String(provider.apiKey || "").trim()
          ].join("|");
          if (userSlotSourceSignatures.has(providerSourceSignature)) {
            return;
          }
          const cleanModels = normalizeModelList(provider.models || [], "Custom");
          cleanModels.forEach((rawModelStr) => {
            const { id, name, description } = parseModelString(rawModelStr);
            if (!id || id === "nano-banana" || id === "nano-banana-pro") return;
            const distinctId = buildProviderRouteId(id, provider.id || provider.name);
            if (uniqueModels.has(distinctId)) return;
            const meta = GOOGLE_MODEL_METADATA.get(id);
            const registryInfo = MODEL_REGISTRY[id];
            const pricingMeta = provider.pricingSnapshot?.modelMeta?.[id] || provider.pricingSnapshot?.modelMeta?.[String(id || "").toLowerCase()] || provider.pricingSnapshot?.rows?.find((row) => String(row?.model || "").trim().toLowerCase() === String(id || "").trim().toLowerCase());
            uniqueModels.set(distinctId, {
              id: distinctId,
              name: name || registryInfo?.name || (meta ? meta.name : id),
              provider: provider.name,
              providerLabel: pricingMeta?.providerLabel || pricingMeta?.provider || provider.name,
              providerLogo: pricingMeta?.providerLogo,
              isCustom: false,
              isSystemInternal: false,
              type: MODEL_TYPE_MAP.get(id) || inferModelType(id),
              icon: provider.icon || registryInfo?.icon || meta?.icon,
              description: description || registryInfo?.description || meta?.description || "",
              tags: Array.isArray(pricingMeta?.tags) ? pricingMeta.tags : void 0,
              tokenGroup: pricingMeta?.tokenGroup,
              billingType: pricingMeta?.billingType,
              endpointType: pricingMeta?.endpointType
            });
          });
        });
        const googleSlots = this.state.slots.filter((s) => s.provider === "Google" && !s.disabled && s.status !== "invalid" && !!s.key);
        if (googleSlots.length > 0) {
          GOOGLE_CHAT_MODELS.forEach((model) => {
            if (!uniqueModels.has(model.id) && this.hasCustomKeyForModel(model.id)) {
              uniqueModels.set(model.id, {
                ...model,
                provider: "Google",
                isCustom: false,
                isSystemInternal: false,
                type: MODEL_TYPE_MAP.get(model.id) || "chat"
              });
            }
          });
        }
        const adminModelsByBaseId = /* @__PURE__ */ new Map();
        adminModels.forEach((adminModel) => {
          const baseId = String(adminModel.id || "").trim();
          if (!baseId) return;
          if (!adminModelsByBaseId.has(baseId)) {
            adminModelsByBaseId.set(baseId, []);
          }
          adminModelsByBaseId.get(baseId).push(adminModel);
        });
        adminModelsByBaseId.forEach((routes, baseId) => {
          const hasMultipleRoutes = routes.length > 1;
          const mixedRoutes = routes.filter((route) => route.mixWithSameModel);
          const shouldExposeMixedOnly = mixedRoutes.length > 1;
          const primaryRoute = shouldExposeMixedOnly ? mixedRoutes[mixedRoutes.length - 1] : routes[0];
          const modelType = MODEL_TYPE_MAP.get(baseId) || (() => {
            const inferred = inferModelType(baseId);
            return inferred === "video" || inferred === "audio" ? inferred : "image";
          })();
          if (shouldExposeMixedOnly) {
            const mixedRouteId = `${baseId}@system`;
            if (!uniqueModels.has(mixedRouteId)) {
              const mixedColorStart = primaryRoute.colorStart || "#475569";
              const mixedColorEnd = primaryRoute.colorEnd || "#334155";
              const mixedColorSecondary = primaryRoute.colorSecondary || mixedColorEnd;
              const mixedTextColor = primaryRoute.textColor || "white";
              uniqueModels.set(mixedRouteId, {
                id: mixedRouteId,
                name: primaryRoute.displayName || baseId,
                provider: "SystemProxy",
                providerLogo: void 0,
                providerLabel: "Mixed Route",
                isCustom: false,
                isSystemInternal: true,
                type: modelType,
                icon: void 0,
                description: primaryRoute.advantages || `Mixed routing enabled across ${mixedRoutes.length} matching routes`,
                colorStart: mixedColorStart,
                colorEnd: mixedColorEnd,
                colorSecondary: mixedColorSecondary,
                textColor: mixedTextColor,
                creditCost: primaryRoute.creditCost
              });
            }
            for (const [modelId, modelData] of uniqueModels.entries()) {
              const modelBaseId = String(modelData.id || "").split("@")[0];
              const isSameBaseModel = modelBaseId === baseId;
              const isOtherSystemRoute = modelData.isSystemInternal === true && modelData.id !== mixedRouteId;
              if (isSameBaseModel && isOtherSystemRoute) {
                uniqueModels.delete(modelId);
              }
            }
            return;
          }
          routes.forEach((adminModel, index) => {
            const systemId = hasMultipleRoutes ? buildStableSystemRouteId(baseId, adminModel.providerId, index + 1) : `${baseId}@system`;
            if (!uniqueModels.has(systemId)) {
              const routeProviderLabel = adminModel.providerName || adminModel.providerId || adminModel.provider || "SystemProxy";
              uniqueModels.set(systemId, {
                id: systemId,
                name: adminModel.displayName || adminModel.id,
                provider: routeProviderLabel,
                providerLabel: routeProviderLabel,
                isCustom: false,
                isSystemInternal: true,
                type: modelType,
                icon: void 0,
                description: adminModel.advantages || "System credit model route",
                colorStart: adminModel.colorStart,
                colorEnd: adminModel.colorEnd,
                colorSecondary: adminModel.colorSecondary,
                textColor: adminModel.textColor,
                creditCost: adminModel.creditCost
              });
            }
          });
        });
        const result = Array.from(uniqueModels.values()).map((model) => {
          const baseId = String(model.id || "").split("@")[0];
          const relatedAdminRoutes = adminModelsByBaseId.get(baseId) || [];
          const isMixedRoute = model.provider === "SystemProxy" && model.id === `${baseId}@system` && relatedAdminRoutes.length > 1;
          if (!isMixedRoute) {
            return model;
          }
          return {
            ...model,
            name: relatedAdminRoutes.filter((route) => route.mixWithSameModel).slice(-1)[0]?.displayName || relatedAdminRoutes[0]?.displayName || baseId,
            providerLabel: "Mixed Route",
            description: relatedAdminRoutes.filter((route) => route.mixWithSameModel).slice(-1)[0]?.advantages || relatedAdminRoutes[0]?.advantages || `Mixed routing enabled across ${relatedAdminRoutes.length} matching routes`
          };
        });
        this.globalModelListCache = {
          models: result,
          slotsHash: combinedHash,
          timestamp: Date.now()
        };
        console.log("[keyManager.getGlobalModelList] Final model count:", result.length);
        return result;
      }
      /**
       * Get all key slots
       */
      getSlots() {
        return [...this.state.slots];
      }
      /**
       * Get statistics
       */
      getStats() {
        const slots = this.state.slots;
        return {
          total: slots.length,
          valid: slots.filter((s) => s.status === "valid" && !s.disabled).length,
          invalid: slots.filter((s) => s.status === "invalid").length,
          disabled: slots.filter((s) => s.disabled).length,
          rateLimited: slots.filter((s) => s.status === "rate_limited").length
        };
      }
      /**
       * Check if any valid keys are available
       */
      hasValidKeys() {
        return this.state.slots.some((s) => !s.disabled && s.status !== "invalid");
      }
      /**
       * 棣冩畬 [閺傛澘濮涢懗绲?濡偓闀嗐儲妲搁挅锕€鐡ㄩ崷銊ф暏閹寸柉鍤滅€规阿绠熼晞鍕箒閺佸牏娈?API Key 閺€顖涘瘮鐠囥儲膩閸?
       * 娑撳秴瀵橉ò绢剛閮寸紒鐔峰敶缂冾喚娈戦敺銊︹偓?PROXY 鐎靛棝鎸?
       */
      hasCustomKeyForModel(modelIdFull) {
        const parts = (modelIdFull || "").split("@");
        const normalizedModelId = parts[0].toLowerCase().trim();
        const suffix = parts.length > 1 ? parts[1].toLowerCase().trim() : null;
        if (suffix?.startsWith("system") || suffix === "12ai" || suffix === "systemproxy") {
          return false;
        }
        const hasValidSlot = this.state.slots.some((s) => {
          if (s.disabled || s.status === "invalid") return false;
          if (s.budgetLimit > 0 && s.totalCost >= s.budgetLimit) return false;
          const supported = s.supportedModels || [];
          if (supported.includes("*") || supported.includes(normalizedModelId)) return true;
          if (suffix) {
            if (matchesSlotRouteSuffix(s, suffix)) {
              return true;
            }
          }
          return false;
        });
        if (hasValidSlot) return true;
        this.loadProviders();
        return this.providers.some((p) => {
          if (!p.isActive) return false;
          if (p.models.includes("*") || p.models.includes(normalizedModelId)) return true;
          if (suffix) {
            if (matchesProviderRouteSuffix(p, suffix)) return true;
          }
          return false;
        });
      }
      /**
       * Set max failures threshold
       */
      setMaxFailures(count) {
        this.state.maxFailures = Math.max(1, count);
        this.saveState();
      }
      // =========================================================================
      // 棣冨晭 缁楊兛绗侀弬?API 閾惧秴濮熼崯鍡欘吀閻炲棙鏌熷▔?
      // =========================================================================
      providers = [];
      /**
       * 閵嘲褰囬晸鈧摼澶岊儑娑撳鏌熼摼宥呭閸?
       */
      getProviders() {
        this.loadProviders();
        return [...this.providers];
      }
      /**
       * 閵嘲褰囬崡鏇氶嚋閾惧秴濮熼崯?
       */
      getProvider(id) {
        this.loadProviders();
        return this.providers.find((p) => p.id === id);
      }
      /**
       * 濞ｈ濮為弬鎵畱缁楊兛绗侀弬瑙勬箛閿封€虫櫌
       */
      addProvider(config) {
        this.loadProviders();
        const now = Date.now();
        const provider = {
          ...config,
          format: normalizeApiProtocolFormat(config.format, "auto"),
          id: `provider_${now}_${Math.random().toString(36).substr(2, 9)}`,
          usage: {
            totalTokens: 0,
            totalCost: 0,
            dailyTokens: 0,
            dailyCost: 0,
            lastReset: now
          },
          status: "checking",
          createdAt: now,
          updatedAt: now
        };
        this.providers.push(provider);
        this.saveProviders();
        this.syncLegacySlotsWithProvider(provider);
        this.globalModelListCache = null;
        this.notifyListeners();
        if (!provider.pricingSnapshot) {
          this.syncProviderPricing(provider.id);
        }
        return provider;
      }
      /**
       * 鏃嬪瓨鏌婇摼宥呭閸熷棝鍘嗙純?
       */
      updateProvider(id, updates) {
        this.loadProviders();
        const index = this.providers.findIndex((p) => p.id === id);
        if (index === -1) return false;
        const previousProvider = { ...this.providers[index] };
        this.providers[index] = {
          ...this.providers[index],
          ...updates,
          format: normalizeApiProtocolFormat(updates.format ?? this.providers[index].format, "auto"),
          updatedAt: Date.now()
        };
        this.saveProviders();
        this.syncLegacySlotsWithProvider(this.providers[index], previousProvider);
        this.globalModelListCache = null;
        this.notifyListeners();
        if ((updates.baseUrl !== void 0 || updates.apiKey !== void 0 || updates.format !== void 0) && !updates.pricingSnapshot) {
          this.syncProviderPricing(id);
        }
        return true;
      }
      syncLegacySlotsWithProvider(provider, previousProvider) {
        const candidateProviders = [provider, previousProvider].filter((item) => !!item && !!item.baseUrl).map((item) => ({
          baseUrl: normalizeProviderLinkValue(item.baseUrl),
          apiKey: String(item.apiKey || "").trim(),
          name: normalizeProviderLinkValue(item.name)
        })).filter((item) => !!item.baseUrl);
        if (candidateProviders.length === 0) return;
        const matchedSlots = this.state.slots.filter((slot) => {
          const slotBaseUrl = normalizeProviderLinkValue(slot.baseUrl);
          if (!slotBaseUrl) return false;
          return candidateProviders.some((candidate) => {
            if (slotBaseUrl !== candidate.baseUrl) return false;
            const slotKey = String(slot.key || "").trim();
            const slotName = normalizeProviderLinkValue(slot.name);
            if (candidate.apiKey && slotKey && slotKey === candidate.apiKey) return true;
            if (candidate.name && slotName && slotName === candidate.name) return true;
            return false;
          });
        });
        if (matchedSlots.length === 0) {
          const currentBaseUrl = normalizeProviderLinkValue(provider.baseUrl);
          if (currentBaseUrl) {
            const sameBaseUrlSlots = this.state.slots.filter((slot) => normalizeProviderLinkValue(slot.baseUrl) === currentBaseUrl);
            if (sameBaseUrlSlots.length === 1) {
              matchedSlots.push(sameBaseUrlSlots[0]);
            }
          }
        }
        if (matchedSlots.length === 0) return;
        matchedSlots.forEach((slot) => {
          slot.key = String(provider.apiKey || "").trim();
          slot.name = provider.name;
          slot.baseUrl = provider.baseUrl;
          slot.group = provider.group;
          slot.disabled = !provider.isActive;
          slot.format = normalizeApiProtocolFormat(provider.format, slot.format || "auto");
          if (provider.models?.length) {
            slot.supportedModels = normalizeModelList(provider.models, slot.provider);
          }
          slot.type = determineKeyType(slot.provider, slot.baseUrl);
          const runtime = resolveProviderRuntime({
            provider: slot.provider,
            baseUrl: slot.baseUrl,
            format: slot.format,
            authMethod: slot.authMethod,
            headerName: slot.headerName,
            compatibilityMode: slot.compatibilityMode
          });
          slot.authMethod = runtime.authMethod;
          slot.headerName = runtime.headerName;
          slot.compatibilityMode = runtime.compatibilityMode;
          slot.updatedAt = Date.now();
        });
        this.saveState();
        console.log(
          `[KeyManager] Synced ${matchedSlots.length} legacy slot(s) from provider ${provider.name}: ${matchedSlots.map((slot) => `${slot.name}[${slot.id}]`).join(", ")}`
        );
      }
      findLinkedProviderForSlot(slot) {
        const slotBaseUrl = normalizeProviderLinkValue(slot.baseUrl);
        if (!slotBaseUrl) return null;
        const sameBaseProviders = this.providers.filter((provider) => {
          if (!provider.isActive) return false;
          return normalizeProviderLinkValue(provider.baseUrl) === slotBaseUrl;
        });
        if (sameBaseProviders.length === 0) return null;
        if (sameBaseProviders.length === 1) return sameBaseProviders[0];
        const slotName = normalizeProviderLinkValue(slot.name);
        const slotKey = String(slot.key || "").trim();
        return sameBaseProviders.find((provider) => {
          const providerName = normalizeProviderLinkValue(provider.name);
          const providerKey = String(provider.apiKey || "").trim();
          return slotName && slotName === providerName || slotKey && slotKey === providerKey;
        }) || null;
      }
      buildEffectiveSlotFromProvider(slot, provider) {
        const format = normalizeApiProtocolFormat(provider.format, slot.format || "auto");
        const runtime = resolveProviderRuntime({
          provider: slot.provider,
          baseUrl: provider.baseUrl,
          format,
          authMethod: slot.authMethod,
          headerName: slot.headerName,
          compatibilityMode: slot.compatibilityMode
        });
        return {
          ...slot,
          key: String(provider.apiKey || "").trim(),
          name: provider.name || slot.name,
          baseUrl: provider.baseUrl || slot.baseUrl,
          group: provider.group,
          disabled: !provider.isActive,
          format,
          supportedModels: provider.models?.length ? normalizeModelList(provider.models, slot.provider) : slot.supportedModels,
          type: determineKeyType(slot.provider, provider.baseUrl || slot.baseUrl),
          authMethod: runtime.authMethod,
          headerName: runtime.headerName,
          compatibilityMode: runtime.compatibilityMode
        };
      }
      /**
       * 皤攧鐘绘珟閾惧秴濮熼崯?
       */
      removeProvider(id) {
        this.loadProviders();
        const index = this.providers.findIndex((p) => p.id === id);
        if (index === -1) return false;
        this.providers.splice(index, 1);
        this.saveProviders();
        this.globalModelListCache = null;
        this.notifyListeners();
        return true;
      }
      /**
       * 鐠佹澘缍嶉摼宥呭閸熷棔濞囬悽銊╁櫤
       */
      addProviderUsage(providerId, tokens, cost) {
        this.loadProviders();
        const provider = this.providers.find((p) => p.id === providerId);
        if (!provider) return;
        const now = Date.now();
        const lastResetDate = new Date(provider.usage.lastReset);
        const today = new Date(now);
        if (lastResetDate.toDateString() !== today.toDateString()) {
          provider.usage.dailyTokens = 0;
          provider.usage.dailyCost = 0;
          provider.usage.lastReset = now;
        }
        provider.usage.totalTokens += tokens;
        provider.usage.totalCost += cost;
        provider.usage.dailyTokens += tokens;
        provider.usage.dailyCost += cost;
        provider.updatedAt = now;
        this.saveProviders();
        this.notifyListeners();
      }
      /**
       * 閵嘲褰囬摼宥呭閸熷棛绮虹拋鈥蹭繆闀?
       */
      getProviderStats() {
        this.loadProviders();
        return {
          total: this.providers.length,
          active: this.providers.filter((p) => p.isActive && p.status === "active").length,
          totalCost: this.providers.reduce((sum, p) => sum + p.usage.totalCost, 0),
          dailyCost: this.providers.reduce((sum, p) => sum + p.usage.dailyCost, 0)
        };
      }
      /**
       * 浠庨璁惧垱寤烘湇鍔″晢
       */
      createProviderFromPreset(presetKey, apiKey, customModels) {
        const preset = PROVIDER_PRESETS[presetKey];
        if (!preset) return null;
        const provider = this.addProvider({
          name: preset.name,
          baseUrl: preset.baseUrl,
          apiKey,
          models: customModels || preset.models,
          format: preset.format,
          icon: preset.icon,
          isActive: true
        });
        this.syncProviderPricing(provider.id);
        return provider;
      }
      /**
       * 鑷姩浠庝緵搴斿晢鐨?/api/pricing 鎺ュ彛鎷夊彇浠锋牸琛ㄥ苟淇濆瓨蹇収
       */
      async syncProviderPricing(providerId) {
        this.loadProviders();
        const provider = this.providers.find((p) => p.id === providerId);
        if (!provider || !provider.baseUrl) return false;
        try {
          const result = await fetchRawPricingCatalog(
            provider.baseUrl,
            provider.apiKey,
            normalizeApiProtocolFormat(provider.format, "auto")
          );
          if (!result?.pricingData?.length) {
            console.warn(`[KeyManager] Pricing API not available for ${provider.name}`);
            return false;
          }
          console.log(`[KeyManager] Syncing pricing for ${provider.name} from ${result.endpointUrl}...`);
          const fetchedSnapshot = buildProviderPricingSnapshot(result.pricingData, result.groupRatio, {
            fetchedAt: Date.now(),
            note: `Synced from ${result.endpointUrl}`
          });
          provider.pricingSnapshot = mergeProviderPricingSnapshot(fetchedSnapshot, provider.pricingSnapshot);
          this.saveProviders();
          this.notifyListeners();
          console.log(`[KeyManager] Successfully synced pricing for ${provider.name}. Models found: ${result.pricingData.length}`);
          return true;
        } catch (e) {
          console.warn(`[KeyManager] Failed or timed out syncing pricing for ${provider.name}:`, e);
          return false;
        }
      }
      /**
       * 閿风姾娴囬摼宥呭閸熷棗鍨悰?
       */
      loadProviders() {
        if (this.providers.length > 0) return;
        try {
          const stored = localStorage.getItem(PROVIDERS_STORAGE_KEY);
          if (stored) {
            this.providers = JSON.parse(stored).map((provider) => ({
              ...provider,
              format: normalizeApiProtocolFormat(provider.format, "auto")
            }));
          }
        } catch (e) {
          console.error("[KeyManager] Failed to load providers:", e);
          this.providers = [];
        }
      }
      /**
       * 娣囸８ｇ摠閾惧秴濮熼崯鍡楀灙鐞?
       */
      saveProviders() {
        try {
          localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(this.providers));
        } catch (e) {
          console.error("[KeyManager] Failed to save providers:", e);
        }
      }
    };
    keyManager = new KeyManager();
    keyManager_default = keyManager;
  }
});
init_keyManager();
export {
  ADVANCED_IMAGE_MODEL_WHITELIST,
  AUDIO_MODEL_WHITELIST,
  BLACKLIST_MODELS,
  DEFAULT_GOOGLE_MODELS,
  DEPRECATED_MODELS,
  GOOGLE_IMAGE_WHITELIST,
  KeyManager,
  MODEL_MIGRATION_MAP,
  PROVIDER_PRESETS,
  VIDEO_MODEL_WHITELIST,
  appendModelVariantLabel,
  autoDetectAndConfigureModels,
  categorizeModels,
  keyManager_default as default,
  detectApiType,
  determineKeyType,
  fetchGeminiCompatModels,
  fetchGoogleModels,
  fetchOpenAICompatModels,
  getModelMetadata,
  isDeprecatedModel,
  keyManager,
  normalizeModelId2 as normalizeModelId,
  normalizeModelList,
  parseModelString,
  parseModelVariantMeta
};
