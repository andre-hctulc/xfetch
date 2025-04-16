export class XFetchError extends Error {
    constructor(
        method: string,
        message: string,
        readonly response: Response | null,
        readonly cause: unknown = undefined
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

    /**
     * Creates an {@link XFetchError} for the use outside of a fetch scope.
     */
    static offside(message: string, cause: unknown = undefined): XFetchError {
        return new XFetchError("offside", message, null, cause);
    }
}
