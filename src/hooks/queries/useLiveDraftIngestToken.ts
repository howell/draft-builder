import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { useStorageAdapter } from '@/lib/storage/hooks';
import {
    INGEST_SETTING_KEY,
    INGEST_SETTING_TYPE,
    IngestSettingData,
    formatIngestToken,
    mintIngestSecret,
} from '@/lib/live-draft/ingestToken';
import { cacheKeys } from './cache-keys';

/**
 * Read the user's live-draft ingest token (null when none has been minted or
 * the user is anonymous). The full token is composed client-side from the
 * stored secret; see src/lib/live-draft/ingestToken.ts.
 */
export function useLiveDraftIngestTokenQuery() {
    const { user, loading: authLoading } = useAuth();
    const storageAdapter = useStorageAdapter();

    return useQuery<string | null>({
        queryKey: cacheKeys.liveDraftIngestToken(user?.id),
        queryFn: async () => {
            if (!user) return null;
            const stored = await storageAdapter.getUserSetting<IngestSettingData>(
                INGEST_SETTING_TYPE,
                INGEST_SETTING_KEY
            );
            return stored?.secret ? formatIngestToken(user.id, stored.secret) : null;
        },
        enabled: !authLoading,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Mint (or rotate) the ingest secret. Rotating invalidates the previous token
 * immediately — the ingest route compares against the stored secret only.
 */
export function useMintLiveDraftIngestTokenMutation() {
    const { user } = useAuth();
    const storageAdapter = useStorageAdapter();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async () => {
            if (!user) throw new Error('Sign in to generate an ingest token');
            const data: IngestSettingData = {
                secret: mintIngestSecret(),
                createdAt: new Date().toISOString(),
            };
            await storageAdapter.setUserSetting(INGEST_SETTING_TYPE, INGEST_SETTING_KEY, data);
            return formatIngestToken(user.id, data.secret);
        },
        onSuccess: (token) => {
            queryClient.setQueryData(cacheKeys.liveDraftIngestToken(user?.id), token);
        },
        onError: (error) => {
            console.error('[useMintLiveDraftIngestTokenMutation] Mint failed:', error);
        },
    });
}
