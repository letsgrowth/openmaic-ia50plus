import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';
import { getIa50ContentFeatureGates, isIa50InternalMode } from '@/lib/ia50/mode';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  const ia50Internal = isIa50InternalMode();
  const gates = getIa50ContentFeatureGates();
  const hasWebSearch = Object.keys(getServerWebSearchProviders()).length > 0;
  const hasImageGeneration = Object.keys(getServerImageProviders()).length > 0;
  const hasVideoGeneration = Object.keys(getServerVideoProviders()).length > 0;
  const hasTts = Object.values(getServerTTSProviders()).some((info) => !info.disabled);
  return apiSuccess({
    status: 'ok',
    version,
    mode: ia50Internal ? 'ia50-internal' : 'standalone',
    capabilities: ia50Internal
      ? {
          tutorRuntime: true,
          webSearch: gates.webSearch && hasWebSearch,
          imageGeneration: gates.imageGeneration && hasImageGeneration,
          videoGeneration: gates.videoGeneration && hasVideoGeneration,
          tts: gates.tts && hasTts,
        }
      : {
          webSearch: hasWebSearch,
          imageGeneration: hasImageGeneration,
          videoGeneration: hasVideoGeneration,
          tts: hasTts,
        },
  });
}
