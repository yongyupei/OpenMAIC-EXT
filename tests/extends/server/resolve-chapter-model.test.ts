import { describe, expect, test, vi } from 'vitest';

import { NextRequest } from 'next/server';

import type { CourseChapter } from '@/lib/teacher/course-types';



vi.mock('@/lib/server/resolve-model', () => ({

  resolveModel: vi.fn(async (params: {

    modelString?: string;

    apiKey?: string;

    baseUrl?: string;

  }) => ({

    model: {},

    modelInfo: {},

    modelString: params.modelString ?? 'default',

    providerId: params.modelString?.split(':')[0] ?? 'mock',

    modelId: params.modelString?.split(':')[1] ?? 'mock',

    apiKey: params.apiKey ?? '',

    baseUrl: params.baseUrl,

  })),

  resolveModelFromRequest: vi.fn(async (req: NextRequest) => ({

    model: {},

    modelInfo: {},

    modelString: req.headers.get('x-model') ?? 'from-headers',

    providerId: req.headers.get('x-model')?.split(':')[0] ?? 'header-provider',

    modelId: req.headers.get('x-model')?.split(':')[1] ?? 'header-model',

    apiKey: req.headers.get('x-api-key') ?? '',

    baseUrl: req.headers.get('x-base-url') ?? undefined,

    thinkingConfig: { enabled: true },

  })),

}));



import { resolveModel, resolveModelFromRequest } from '@/lib/server/resolve-model';

import { resolveModelForChapterGeneration } from '@/lib/extends/server/resolve-chapter-model';



describe('resolveModelForChapterGeneration', () => {

  test('uses chapter override when both providerId and modelId present', async () => {

    const chapter = {

      generationProfileOverride: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },

    } as CourseChapter;

    const req = new NextRequest('http://localhost/api/test');

    const result = await resolveModelForChapterGeneration(req, {}, chapter);

    expect(resolveModel).toHaveBeenCalledWith(

      expect.objectContaining({ modelString: 'anthropic:claude-sonnet-4' }),

    );

    expect(result.modelString).toBe('anthropic:claude-sonnet-4');

  });



  test('merges client credentials when request headers match override provider', async () => {

    const chapter = {

      generationProfileOverride: { providerId: 'deepseek', modelId: 'deepseek-v4-flash' },

    } as CourseChapter;

    const req = new NextRequest('http://localhost/api/test', {

      headers: {

        'x-model': 'deepseek:deepseek-v4-flash',

        'x-api-key': 'client-deepseek-key',

        'x-base-url': 'https://api.deepseek.com',

      },

    });

    await resolveModelForChapterGeneration(req, {}, chapter);

    expect(resolveModel).toHaveBeenCalledWith(

      expect.objectContaining({

        modelString: 'deepseek:deepseek-v4-flash',

        apiKey: 'client-deepseek-key',

        baseUrl: 'https://api.deepseek.com',

      }),

    );

  });



  test('merges client credentials for custom provider when header provider matches', async () => {

    const chapter = {

      generationProfileOverride: {

        providerId: 'custom-1778578099147',

        modelId: 'my-model',

        providerType: 'openai',

      },

    } as CourseChapter;

    const req = new NextRequest('http://localhost/api/test', {

      headers: {

        'x-model': 'custom-1778578099147:my-model',

        'x-api-key': 'client-custom-key',

        'x-base-url': 'https://custom.example/v1',

        'x-provider-type': 'openai',

      },

    });

    await resolveModelForChapterGeneration(req, {}, chapter);

    expect(resolveModel).toHaveBeenCalledWith(

      expect.objectContaining({

        modelString: 'custom-1778578099147:my-model',

        apiKey: 'client-custom-key',

        baseUrl: 'https://custom.example/v1',

        providerType: 'openai',

      }),

    );

  });



  test('uses persisted providerType for custom provider when header omits provider type', async () => {

    const chapter = {

      generationProfileOverride: {

        providerId: 'custom-1778578099147',

        modelId: 'my-model',

        providerType: 'openai',

      },

    } as CourseChapter;

    const req = new NextRequest('http://localhost/api/test', {

      headers: {

        'x-model': 'custom-1778578099147:my-model',

        'x-api-key': 'client-custom-key',

        'x-base-url': 'https://custom.example/v1',

      },

    });

    await resolveModelForChapterGeneration(req, {}, chapter);

    expect(resolveModel).toHaveBeenCalledWith(

      expect.objectContaining({

        modelString: 'custom-1778578099147:my-model',

        providerType: 'openai',

      }),

    );

  });



  test('does not merge client credentials when header model differs from override', async () => {

    const chapter = {

      generationProfileOverride: { providerId: 'deepseek', modelId: 'deepseek-v4-flash' },

    } as CourseChapter;

    const req = new NextRequest('http://localhost/api/test', {

      headers: {

        'x-model': 'xiaomi:mimo-v2.5-pro',

        'x-api-key': 'client-xiaomi-key',

      },

    });

    await resolveModelForChapterGeneration(req, {}, chapter);

    const lastCall = vi.mocked(resolveModel).mock.lastCall?.[0];
    expect(lastCall?.modelString).toBe('deepseek:deepseek-v4-flash');
    expect(lastCall?.apiKey).not.toBe('client-xiaomi-key');

  });



  test('uses course profile when chapter has no override', async () => {

    const chapter = {} as CourseChapter;

    const project = {

      generationProfile: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },

    };

    const req = new NextRequest('http://localhost/api/test');

    const result = await resolveModelForChapterGeneration(req, {}, chapter, project);

    expect(resolveModel).toHaveBeenCalledWith(

      expect.objectContaining({ modelString: 'anthropic:claude-sonnet-4' }),

    );

    expect(result.modelString).toBe('anthropic:claude-sonnet-4');

  });



  test('falls back to request headers when no override', async () => {

    const chapter = {} as CourseChapter;

    const req = new NextRequest('http://localhost/api/test');

    await resolveModelForChapterGeneration(req, {}, chapter);

    expect(resolveModelFromRequest).toHaveBeenCalled();

  });



  test('merges thinkingConfig from request when using override', async () => {

    const chapter = {

      generationProfileOverride: { providerId: 'anthropic', modelId: 'claude-sonnet-4' },

    } as CourseChapter;

    const req = new NextRequest('http://localhost/api/test');

    const result = await resolveModelForChapterGeneration(req, {}, chapter);

    expect(result.thinkingConfig).toEqual({ enabled: true });

  });

});

