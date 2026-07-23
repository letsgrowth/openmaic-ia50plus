import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  const ia50Internal = process.env.IA50_INTERNAL_MODE === 'true';
  return apiSuccess({
    status: 'ok',
    version,
    mode: ia50Internal ? 'ia50-internal' : 'standalone',
    capabilities: ia50Internal
      ? {
          webSearch: false,
          imageGeneration: false,
          videoGeneration: false,
          tts: false,
        }
      : {
          webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
          imageGeneration: Object.keys(getServerImageProviders()).length > 0,
          videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
          tts: Object.values(getServerTTSProviders()).some((info) => !info.disabled),
        },
  });
}
