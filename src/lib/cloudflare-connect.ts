import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';

export async function startCloudflareConnect(returnUrl?: string): Promise<void> {
	try {
		const response = await apiClient.connectCloudflare(returnUrl);
		const authUrl = response.data?.authUrl;
		if (!authUrl) throw new Error('Cloudflare authorization URL was not returned');

		const parsedUrl = new URL(authUrl, window.location.origin);
		const isSameOriginReturn = parsedUrl.origin === window.location.origin;
		const isCloudflareOAuth =
			parsedUrl.protocol === 'https:' &&
			parsedUrl.hostname === 'dash.cloudflare.com' &&
			parsedUrl.pathname === '/oauth2/authorize';
		if (!isSameOriginReturn && !isCloudflareOAuth) {
			throw new Error('Invalid Cloudflare authorization URL');
		}
		window.location.assign(parsedUrl.toString());
	} catch (error) {
		console.error('Failed to start Cloudflare connection:', error);
		toast.error(error instanceof Error ? error.message : 'Failed to connect Cloudflare');
	}
}
