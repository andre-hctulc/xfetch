export function jsonDateReviver(key: string, value: any) {
    if (typeof value === "string" && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.\d+Z$/.test(value)) {
        return new Date(value);
    }
    return value;
}
