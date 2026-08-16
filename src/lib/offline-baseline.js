/**
 * Validate that the loaded object matches the expected baseline structure.
 */
export function isValidBaseline(data) {
    if (!data || typeof data !== "object")
        return false;
    if (typeof data.version !== "number")
        return false;
    if (!data.collections || typeof data.collections !== "object")
        return false;
    const c = data.collections;
    return (Array.isArray(c.games) &&
        Array.isArray(c.stories) &&
        Array.isArray(c.story_scenes) &&
        Array.isArray(c.story_media));
}
