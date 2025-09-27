import type { XRequestInit } from "./fetch.js";

export function normalizePath(path: string) {
    if (!path || path === "/") {
        return "";
    }
    if (!path.startsWith("/")) {
        return `/${path}`;
    }
    if (path.length > 1 && path.endsWith("/")) {
        return path.slice(0, -1);
    }
    return path;
}

function normalizeUrl(url: string) {
    if (url.length > 1 && url.endsWith("/")) {
        return url.slice(0, -1);
    }
    return url;
}

/**
 * Creates the full URL.
 */
export function createUrl(path: string, requestInit: XRequestInit = {}) {
    const params = queryParams(requestInit.queryParams || {});
    const queryStr = params.size ? `?${params.toString()}` : "";
    const baseUrl = requestInit.baseUrl ? normalizeUrl(requestInit.baseUrl) : "";
    let _path = `${requestInit.pathPrefix ? normalizePath(requestInit.pathPrefix) : ""}${normalizePath(
        path
    )}`;

    if (requestInit.pathVariables) {
        _path = replacePathVariables(_path, requestInit.pathVariables);
    }

    return `${baseUrl}${_path}${queryStr}`;
}

/**
 * Creates the query string. Object values are stringified, undefined values are ignored.
 */
export function queryParams(queryParams: Record<string, any> | URLSearchParams) {
    if (queryParams instanceof URLSearchParams) {
        return queryParams;
    }

    const params = new URLSearchParams();

    for (const key in queryParams) {
        const value = queryParams[key];

        if (queryParams[key] !== undefined) {
            if (Array.isArray(value)) {
                value.forEach((v) => params.append(key, v));
            } else {
                params.set(key, queryParams[key]);
            }
        }
    }

    return params;
}

/**
 * Replaces path variables in the path with the values from the pathVariables object.
 *
 * Path variables are defined as `:variable`.
 *
 * If the value for a path variable is not found, the variable is left as a placeholder.
 */
function replacePathVariables(path: string, pathVariables: Record<string, string | undefined>) {
    return path.replace(/:([a-zA-Z0-9_]+)/g, (_, variable) => {
        const value = pathVariables[variable];
        // If the value is falsy, return the variable as a placeholder
        if (value === undefined) return `:${variable}`;
        // stringify the value
        return value + "";
    });
}
