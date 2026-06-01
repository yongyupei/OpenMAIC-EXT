import type { NextRequest } from 'next/server';
import { parseModelString } from '@/lib/ai/providers';
import {
  resolveModel,
  resolveModelFromRequest,
  type ResolvedModel,
} from '@/lib/server/resolve-model';
import type { CourseChapter, CourseProject } from '@/lib/teacher/course-types';
import type { ProviderType } from '@/lib/types/provider';

type PersistedGenerationModel = {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerType?: ProviderType;
};

function isCustomProviderId(providerId: string): boolean {
  return providerId.startsWith('custom-');
}

function requestHeadersMatchModel(
  fromRequest: ResolvedModel,
  providerId: string,
  modelId: string,
): boolean {
  if (!fromRequest.modelString) return false;
  const parsed = parseModelString(fromRequest.modelString);
  return parsed.providerId === providerId && parsed.modelId === modelId;
}

function requestHeadersMatchProvider(fromRequest: ResolvedModel, providerId: string): boolean {
  if (!fromRequest.modelString) return false;
  const parsed = parseModelString(fromRequest.modelString);
  return parsed.providerId === providerId;
}

function shouldMergeClientCredentials(
  fromRequest: ResolvedModel,
  providerId: string,
  modelId: string,
): boolean {
  if (requestHeadersMatchModel(fromRequest, providerId, modelId)) {
    return true;
  }
  // Custom providers only exist in the browser settings store — server must use client headers.
  return isCustomProviderId(providerId) && requestHeadersMatchProvider(fromRequest, providerId);
}

function resolveProviderType(
  request: NextRequest,
  mergeClientCredentials: boolean,
  persistedProviderType?: ProviderType,
): ProviderType | undefined {
  const headerProviderType = request.headers.get('x-provider-type') || undefined;
  if (mergeClientCredentials) {
    return (headerProviderType ?? persistedProviderType) as ProviderType | undefined;
  }
  return persistedProviderType;
}

async function resolvePersistedProfileModel(
  request: NextRequest,
  fromRequest: ResolvedModel,
  profile: PersistedGenerationModel,
): Promise<ResolvedModel> {
  const { providerId, modelId, providerType: persistedProviderType } = profile;
  const mergeClientCredentials = shouldMergeClientCredentials(fromRequest, providerId, modelId);
  const providerType = resolveProviderType(
    request,
    mergeClientCredentials,
    persistedProviderType,
  );

  const resolved = await resolveModel({
    modelString: `${providerId}:${modelId}`,
    ...(mergeClientCredentials
      ? {
          apiKey: fromRequest.apiKey,
          baseUrl: fromRequest.baseUrl,
        }
      : {}),
    providerType,
  });
  return {
    ...resolved,
    thinkingConfig: fromRequest.thinkingConfig ?? resolved.thinkingConfig,
  };
}

export async function resolveModelForChapterGeneration(
  request: NextRequest,
  body: unknown,
  chapter: CourseChapter,
  project?: Pick<CourseProject, 'generationProfile'>,
): Promise<ResolvedModel> {
  const fromRequest = await resolveModelFromRequest(request, body);

  const override = chapter.generationProfileOverride;
  if (override?.providerId && override?.modelId) {
    return resolvePersistedProfileModel(request, fromRequest, {
      providerId: override.providerId,
      modelId: override.modelId,
      providerType: override.providerType,
    });
  }

  const courseProfile = project?.generationProfile;
  if (courseProfile?.providerId && courseProfile?.modelId) {
    return resolvePersistedProfileModel(request, fromRequest, {
      providerId: courseProfile.providerId,
      modelId: courseProfile.modelId,
      providerType: courseProfile.providerType,
    });
  }

  return fromRequest;
}
