import { xfetch, XRequestInit } from "./fetch.js";

export type XMutationInit = Omit<XRequestInit, "body">;

/**
 * @param urlLike The URL to fetch. Can be a path or a full URL. Use path variables like _/api/:id_.
 */
export async function xmutate<B, R>(
    method: string,
    urlLike: string,
    body: B,
    mutationInit: XMutationInit = {}
): Promise<R> {
    const response = await xfetch<R>(urlLike, { ...mutationInit, body, method });
    return response;
}

xmutate.post = <B, R>(path: string, body: B, mutationInit: Omit<XMutationInit, "method"> = {}) =>
    xmutate<B, R>("POST", path, body, mutationInit);
xmutate.put = <B, R>(path: string, body: B, mutationInit: Omit<XMutationInit, "method"> = {}) =>
    xmutate<B, R>("PUT", path, body, mutationInit);
xmutate.del = <R>(path: string, mutationInit: Omit<XMutationInit, "method"> = {}) =>
    xmutate<undefined, R>("DELETE", path, undefined, mutationInit);
