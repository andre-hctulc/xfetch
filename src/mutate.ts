import { xfetch, XRequestInit } from "./fetch.js";

export type XMutationInit = Omit<XRequestInit, "body">;

/**
 * @param urlLike The URL to fetch. Can be a path or a full URL. Use path variables like _/api/:id_.
 */
export async function xmutate<R, B>(
    method: string,
    urlLike: string,
    body: B,
    mutationInit: XMutationInit = {}
): Promise<R> {
    const response = await xfetch<R>(urlLike, { ...mutationInit, body, method });
    return response;
}

xmutate.post = <R, B>(path: string, body: B, mutationInit: Omit<XMutationInit, "method"> = {}) =>
    xmutate<R, B>("POST", path, body, mutationInit);
xmutate.put = <R, B>(path: string, body: B, mutationInit: Omit<XMutationInit, "method"> = {}) =>
    xmutate<R, B>("PUT", path, body, mutationInit);
xmutate.del = <R, B>(path: string, body: B, mutationInit: Omit<XMutationInit, "method"> = {}) =>
    xmutate<R, B>("DELETE", path, body, mutationInit);
