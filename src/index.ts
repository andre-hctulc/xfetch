export interface XRequestInit<B = unknown> {
    /**
     * The HTTP method to use.
     */
    method?: string;
    /**
     * The base URL to prepend to the path.
     */
    baseUrl?: string;
    /**
     * Object values are stringified (undefined values are ignored).
     */
    queryParams?: Record<string, any> | URLSearchParams;
    /**
     * Setting the _Content-Type_ header will disable default body parsing.
     */
    headers?: HeadersInit;
    onError?: (error: XFetchError) => void;
    body?: B;
    /** Control cookies and Authorization headers */
    credentials?: RequestCredentials;
    /** Control cache behavior */
    cache?: RequestCache;
    /** Control CORS */
    cors?: RequestMode;
    priority?: RequestPriority;
    /**
     * If true, the response will be returned as is, without parsing it.
     */
    raw?: boolean;
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
}

export class XFetchError extends Error {
    constructor(
        method: string,
        message: string,
        readonly response: Response | null,
        readonly cause: unknown
    ) {
        super(
            `HTTP Error ${response?.status ? "(" + response.status + ")" : ""}${
                response ? " at " + method.toUpperCase() + " " + response.url : ""
            } - ${message}`
        );
    }

    static is(err: unknown, status?: number): err is XFetchError {
        return err instanceof XFetchError && (status == undefined || err.response?.status === status);
    }
}

/**
 * @param urlLike The URL to fetch. Can be a path or a full URL. Use path variables like _/api/:id_.
 * @returns Parsed response data: JSON, Blob, string, raw body, ... or undefined
 */
export async function xfetch<R = unknown, B = unknown>(
    urlLike: string,
    requestInit: XRequestInit<B> = {}
): Promise<R> {
    // -- Prepare request

    const throwErr: (error: XFetchError) => never = (error: XFetchError) => {
        if (requestInit.onError) requestInit.onError(error);
        throw error;
    };
    const method = (requestInit.method || "GET").toUpperCase();
    const url = xfetch.url(urlLike, { ...requestInit, method });
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

    if (requestInit.raw) return response as unknown as R;

    let data: any;
    const resContentType = response.headers.get("content-type");

    try {
        if (!resContentType) data = undefined;
        else {
            if (resContentType.includes("application/json")) {
                data = await response.json();
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

xfetch.url = (path: string, requestInit: XRequestInit<any> = {}) => {
    const params = xfetch.queryParams(requestInit.queryParams || {});
    const queryStr = params.toString();
    return `${requestInit.baseUrl || ""}${path}${queryStr ? `?${queryStr}` : ""}`;
};

/**
 * Creates the query string. Object values are stringified (undefined values are ignored).
 */
xfetch.queryParams = (queryParams: Record<string, any> | URLSearchParams) => {
    if (queryParams instanceof URLSearchParams) return queryParams;
    const params = new URLSearchParams();
    for (const key in queryParams) {
        if (queryParams[key] !== undefined) params.append(key, queryParams[key]);
    }
    return params;
};

export interface MutationInit extends Omit<XRequestInit, "body"> {}

/**
 * @param urlLike The URL to fetch. Can be a path or a full URL. Use path variables like _/api/:id_.
 */
export async function xmutate<R, B>(
    method: string,
    urlLike: string,
    body: B,
    mutationInit: MutationInit = {}
): Promise<R> {
    const response = await xfetch<R, B>(urlLike, { ...mutationInit, body, method });
    return response;
}

xmutate.post = <R, B>(path: string, body: B, mutationInit: Omit<MutationInit, "method"> = {}) =>
    xmutate<R, B>("POST", path, body, mutationInit);
xmutate.put = <R, B>(path: string, body: B, mutationInit: Omit<MutationInit, "method"> = {}) =>
    xmutate<R, B>("PUT", path, body, mutationInit);
xmutate.del = <R, B>(path: string, body: B, mutationInit: Omit<MutationInit, "method"> = {}) =>
    xmutate<R, B>("DELETE", path, body, mutationInit);
