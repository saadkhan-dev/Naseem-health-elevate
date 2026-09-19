/**
 * Timing bounds for Azure AI Speech access tokens (shared by server minting and
 * the client engine's refresh loop). Azure-issued tokens live 10 minutes, so
 * the client refreshes well inside that window and the server reports an honest
 * expiry every time it mints.
 */

/** Server-reported token lifetime in seconds (Azure default: 600). */
export const AZURE_SPEECH_TOKEN_TTL_SECONDS = 600;

/** Client refreshes after this many seconds of using a minted token. */
export const AZURE_SPEECH_TOKEN_REFRESH_SECONDS = 8 * 60;
