import { XFetchError } from "./error.js";
import { contentDispositionToFileName, createUrl } from "./system.js";

/**
 * `response` - Use the {@link Response} object as result
 *
 * `raw` - Use the raw response body as result
 *
 * `auto` - Automatically parse the response body based on the content type of the response
 *
 * `void` - Return undefined as result. Skips response body parsing.
 *
 * `blob` - Use the response body as a Blob object
 */
export type XResponseResolution = "response" | "raw" | "auto" | "void" | "blob" | "file";

export type ParamFormatter = (key: string, value: any) => any;

export interface XRequestInit {
    /**
     * The HTTP method to use.
     */
    method?: string;
    /**
     * The base URL to prepend to the path.
     */
    baseUrl?: string;
    pathPrefix?: string;
    /**
     * Response json reviver
     */
    jsonReviver?: (key: string, value: any) => any;
    /**
     * Path variables to replace in the URL.
     * Path variables are defined as `:variable`.
     * @example "/api/user/:userId"
     */
    pathVariables?: Record<string, string>;
    formatPathVariables?: ParamFormatter;
    /**
     * Object values are stringified (undefined values are ignored).
     */
    queryParams?: Record<string, any> | URLSearchParams;
    formatQueryParams?: ParamFormatter;
    /**
     * Setting the _Content-Type_ header will disable default body parsing.
     */
    headers?: HeadersInit;
    onError?: (error: XFetchError) => void;
    body?: any;
    /** Control cookies and Authorization headers */
    credentials?: RequestCredentials;
    /** Control cache behavior */
    cache?: RequestCache;
    /** Control CORS */
    cors?: RequestMode;
    priority?: RequestPriority;
    /**
     * In some cases browsers might block redirects. For example after form submission.
     * Set this option to true, to follow every redirect response.
     *  */
    forceFollowRedirects?: boolean;
    /**
     * Treat opaque responses as ok and produce undefined as response data.
     */
    opaqueOk?: boolean;
    /**
     * Include a CSRF token in the request.
     * */
    csrf?: {
        /** The token value */
        token?: string;
        /** The cookie to extract the token value from */
        fromCookie?: string;
        /**
         * The header name to set the token to. Defaults to "X-CSRF-TOKEN".
         *  */
        headerName?: string;
        /**
         * If true, the token only will be included for POST, PUT, DELETE, PATCH.
         */
        defaultMatcher?: boolean;
    };
    /**
     * The signal to abort the request.
     */
    abortSignal?: AbortSignal;
    /**
     * How to resolve the response data.
     * @default "auto"
     */
    responseResolution?: XResponseResolution;
}

/**
 * @param urlLike The URL to fetch. Can be a path or a full URL.
 * @returns Parsed response data: JSON, Blob, string, raw body, ... or undefined
 */
export async function xfetch<R = unknown>(urlLike: string, requestInit: XRequestInit = {}): Promise<R> {
    // -- Prepare request

    const throwErr: (error: XFetchError) => never = (error: XFetchError) => {
        if (requestInit.onError) requestInit.onError(error);
        throw error;
    };
    const method = (requestInit.method || "GET").toUpperCase();
    const url = createUrl(urlLike, { ...requestInit, method });
    const headers = new Headers(requestInit.headers || {});

    // -- Prepare body

    let contentType = headers.get("Content-Type");
    let body: any;

    if (requestInit.body === undefined) {
        body = undefined;
    } else {
        // Set user content type and use requestInit.body as raw body
        // This way the user can set the content type and body manually
        if (contentType !== null) {
            body = requestInit.body;
        }
        // auto body parsing
        else {
            try {
                if (requestInit.body instanceof FormData) {
                    // browser sets the content type - "multipart/form-data...";
                    body = requestInit.body;
                } else if (requestInit.body instanceof Blob) {
                    contentType = "application/octet-stream";
                    body = requestInit.body;
                } else if (requestInit.body instanceof URLSearchParams) {
                    contentType = "application/x-www-form-urlencoded";
                    body = requestInit.body;
                } else if (typeof requestInit.body === "string") {
                    contentType = "text/plain";
                    body = requestInit.body;
                } else {
                    contentType = "application/json";
                    body = JSON.stringify(requestInit.body);
                }
            } catch (err) {
                throwErr(new XFetchError(method, "Failed to serialize body", null, err));
            }
        }
    }

    // -- csrf

    if (contentType) headers.set("Content-Type", contentType);

    if (
        requestInit.csrf &&
        (!requestInit.csrf.defaultMatcher || ["POST", "PUT", "DELETE", "PATCH"].includes(method))
    ) {
        let csrfTokenValue: string = "";

        if (requestInit.csrf.token) {
            csrfTokenValue = requestInit.csrf.token;
        } else {
            const cookieName = requestInit.csrf.fromCookie;

            if (cookieName) {
                csrfTokenValue =
                    document.cookie
                        .split(";")
                        .find((cookie) => cookie.trim().startsWith(cookieName))
                        ?.split("=")[1] ?? "";
            }
        }

        headers.set(requestInit.csrf.headerName || "X-CSRF-TOKEN", csrfTokenValue);
    }

    // -- Fetch

    let response: Response;

    try {
        response = await fetch(url, {
            signal: requestInit.abortSignal,
            method: requestInit.method,
            headers: headers,
            body,
            credentials: requestInit.credentials,
            cache: requestInit.cache,
            mode: requestInit.cors,
            priority: requestInit.priority,
        });
    } catch (err) {
        throwErr(new XFetchError(method, "Fetch failed", null, err));
    }

    if (!response.ok) {
        // opaque responses will have response.ok = false!
        if (requestInit.opaqueOk && response.type === "opaque") {
            return undefined as R;
        }

        throwErr(new XFetchError(method, "Response not ok", response, undefined));
    }

    // -- Force redirect

    // Browsers will sometimes not follow redirects
    // Form submissions:
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/form-action

    if (requestInit.forceFollowRedirects && response.redirected) {
        const location = response.headers.get("Location") ?? response.url;
        // force reroute in browser
        if (typeof window !== "undefined") window.location.href = location;
        throwErr(new XFetchError(method, "Redirected", response, location));
    }

    // -- Parse response

    let data: any;
    const resContentType = response.headers.get("content-type");

    try {
        if (requestInit.responseResolution === "raw") {
            data = response.body;
        } else if (requestInit.responseResolution === "void") {
            data = undefined;
        } else if (requestInit.responseResolution === "response") {
            data = response;
        } else if (requestInit.responseResolution === "blob") {
            data = await response.blob();
        } else if (requestInit.responseResolution === "file") {
            const blob = await response.blob();
            data = new File(
                [blob],
                contentDispositionToFileName(response.headers.get("Content-Disposition")) || "unnamed",
                { type: blob.type }
            );
        }
        // default to "auto"
        else {
            if (!resContentType) {
                data = response.body;
            } else if (resContentType.includes("application/json")) {
                if (requestInit.jsonReviver) {
                    const text = await response.text();
                    data = JSON.parse(text, requestInit.jsonReviver);
                } else {
                    data = await response.json();
                }
            } else if (resContentType.includes("application/octet-stream")) {
                data = await response.blob();
            } else if (resContentType.includes("text/plain")) {
                data = await response.text();
            } else {
                data = response.body;
            }
        }
    } catch (err) {
        throwErr(new XFetchError(method, "Failed to parse response", response, err));
    }

    return data;
}

/**
 * Reviver for JSON.parse to convert date strings to Date objects.
 * Use it for {@link XRequestInit.jsonReviver}.
 */
xfetch.jsonDateReviver = (key: string, value: any) => {
    if (typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d+Z$/.test(value)) {
        return new Date(value);
    }
    return value;
};
